import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AffiliationStatus,
  MerchantDriver,
} from '../entities/merchant-driver.entity';
import { UsersService } from '../users/users.service';
import { UserRole } from '../entities/user.entity';

/**
 * Gère l'affiliation M:N entre un COMMERCANT et ses LIVREUR(s) de confiance
 * (Priorité 3, Lot 3, item 2 ; flux invite/accept §9.2). Un commerçant peut
 * affilier plusieurs livreurs, un livreur peut être affilié à plusieurs
 * commerçants.
 *
 * Cycle de vie (§9.2) : le commerçant invite (`addAffiliation` → PENDING),
 * le livreur accepte (→ ACTIVE) ou refuse (→ REJECTED) via
 * `respondToInvitation`. Le commerçant peut retirer une affiliation ACTIVE
 * (`removeAffiliation` → REMOVED, soft — la ligne n'est jamais supprimée
 * physiquement pour conserver l'historique). Ré-inviter un livreur
 * REJECTED/REMOVED le repasse en PENDING.
 */
@Injectable()
export class MerchantDriversService {
  constructor(
    @InjectRepository(MerchantDriver)
    private repo: Repository<MerchantDriver>,
    private usersService: UsersService,
  ) {}

  /**
   * Invite `driverId` à s'affilier à `merchantId`. Vérifie que `driverId`
   * est bien un LIVREUR (sinon BadRequest). L'affiliation démarre en
   * `PENDING` — elle ne devient `ACTIVE` qu'après acceptation par le
   * livreur (`respondToInvitation`).
   *
   * Idempotent : si une ligne existe déjà pour ce couple (merchantId,
   * driverId), on la ré-utilise plutôt que d'échouer sur la contrainte
   * UNIQUE :
   * - PENDING/ACTIVE → on la renvoie telle quelle (déjà invité/affilié) ;
   * - REJECTED/REMOVED → on la repasse en PENDING (ré-invitation).
   */
  async addAffiliation(
    merchantId: string,
    driverId: string,
  ): Promise<MerchantDriver> {
    const driver = await this.usersService.findOne(driverId);
    if (driver.role !== UserRole.LIVREUR) {
      throw new BadRequestException(
        "L'utilisateur affilié doit être un livreur",
      );
    }

    const existing = await this.repo.findOne({
      where: { merchantId, driverId },
    });
    if (existing) {
      if (
        existing.status === AffiliationStatus.REJECTED ||
        existing.status === AffiliationStatus.REMOVED
      ) {
        existing.status = AffiliationStatus.PENDING;
        existing.acceptedAt = null;
        existing.removedAt = null;
        return this.repo.save(existing);
      }
      // PENDING ou ACTIVE : déjà invité/affilié, rien à faire.
      return existing;
    }

    try {
      const affiliation = this.repo.create({
        merchantId,
        driverId,
        status: AffiliationStatus.PENDING,
      });
      return await this.repo.save(affiliation);
    } catch (err: any) {
      // Doublon concurrent (contrainte UNIQUE merchantId+driverId) →
      // idempotent, on renvoie l'affiliation existante au lieu de
      // propager l'erreur SQL.
      if (
        err?.code === 'ER_DUP_ENTRY' ||
        err?.errno === 1062 ||
        /duplicate/i.test(err?.message ?? '')
      ) {
        const found = await this.repo.findOne({
          where: { merchantId, driverId },
        });
        if (found) return found;
      }
      throw err;
    }
  }

  /**
   * Retrait d'une affiliation par le commerçant (§9.2) : soft-remove — la
   * ligne est conservée (historique), `status` passe à `REMOVED` et
   * `removedAt` est horodaté. Idempotent (no-op si aucune ligne).
   */
  async removeAffiliation(merchantId: string, driverId: string): Promise<void> {
    await this.repo.update(
      { merchantId, driverId },
      { status: AffiliationStatus.REMOVED, removedAt: new Date() },
    );
  }

  /**
   * Livreurs affiliés à un commerçant (tous statuts confondus, chacun avec
   * son `status`), avec leur véhicule (utile pour l'écran de gestion "mes
   * livreurs" côté commerçant).
   */
  async listDriversForMerchant(merchantId: string) {
    const affiliations = await this.repo.find({
      where: { merchantId },
      relations: ['driver', 'driver.vehicle'],
    });
    return affiliations.map((a) => ({ ...a.driver, status: a.status }));
  }

  /** Vrai uniquement si l'affiliation est ACTIVE (invitation acceptée). */
  async isAffiliated(merchantId: string, driverId: string): Promise<boolean> {
    const count = await this.repo.count({
      where: { merchantId, driverId, status: AffiliationStatus.ACTIVE },
    });
    return count > 0;
  }

  async listMerchantIdsForDriver(driverId: string): Promise<string[]> {
    const affiliations = await this.repo.find({
      where: { driverId },
      select: ['merchantId'],
    });
    return affiliations.map((a) => a.merchantId);
  }

  /**
   * Liste les invitations/affiliations du livreur courant (§9.2) —
   * `GET /drivers/me/affiliations` — avec les infos du commerçant.
   */
  async listAffiliationsForDriver(driverId: string) {
    const affiliations = await this.repo.find({
      where: { driverId },
      relations: ['merchant'],
      order: { createdAt: 'DESC' },
    });
    return affiliations.map((a) => ({
      merchantId: a.merchantId,
      status: a.status,
      acceptedAt: a.acceptedAt,
      removedAt: a.removedAt,
      createdAt: a.createdAt,
      merchant: a.merchant
        ? {
            id: a.merchant.id,
            firstName: a.merchant.firstName,
            lastName: a.merchant.lastName,
            phone: a.merchant.phone,
          }
        : null,
    }));
  }

  /**
   * Le livreur répond à une invitation d'affiliation (§9.2) —
   * `PATCH /drivers/me/affiliations/:merchantId`. Seule une affiliation
   * `PENDING` peut être acceptée/refusée.
   */
  async respondToInvitation(
    merchantId: string,
    driverId: string,
    action: 'accept' | 'reject',
  ): Promise<MerchantDriver> {
    const affiliation = await this.repo.findOne({
      where: { merchantId, driverId },
    });
    if (!affiliation) {
      throw new NotFoundException('Invitation introuvable');
    }
    if (affiliation.status !== AffiliationStatus.PENDING) {
      throw new BadRequestException(
        'Cette invitation ne peut plus être acceptée ou refusée',
      );
    }

    if (action === 'accept') {
      affiliation.status = AffiliationStatus.ACTIVE;
      affiliation.acceptedAt = new Date();
    } else {
      affiliation.status = AffiliationStatus.REJECTED;
    }
    return this.repo.save(affiliation);
  }
}
