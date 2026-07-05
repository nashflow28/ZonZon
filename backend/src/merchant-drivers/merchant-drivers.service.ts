import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MerchantDriver } from '../entities/merchant-driver.entity';
import { UsersService } from '../users/users.service';
import { UserRole } from '../entities/user.entity';

/**
 * Gère l'affiliation M:N entre un COMMERCANT et ses LIVREUR(s) de confiance
 * (Priorité 3, Lot 3, item 2). Un commerçant peut affilier plusieurs
 * livreurs, un livreur peut être affilié à plusieurs commerçants.
 */
@Injectable()
export class MerchantDriversService {
  constructor(
    @InjectRepository(MerchantDriver)
    private repo: Repository<MerchantDriver>,
    private usersService: UsersService,
  ) {}

  /**
   * Affilie `driverId` à `merchantId`. Vérifie que `driverId` est bien un
   * LIVREUR (sinon BadRequest). Idempotent : si l'affiliation existe déjà
   * (violation de la contrainte UNIQUE), on l'ignore silencieusement au
   * lieu de propager l'erreur SQL.
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

    try {
      const affiliation = this.repo.create({ merchantId, driverId });
      return await this.repo.save(affiliation);
    } catch (err: any) {
      // Doublon (contrainte UNIQUE merchantId+driverId) → idempotent, on
      // renvoie l'affiliation existante au lieu de faire échouer l'appel.
      if (
        err?.code === 'ER_DUP_ENTRY' ||
        err?.errno === 1062 ||
        /duplicate/i.test(err?.message ?? '')
      ) {
        const existing = await this.repo.findOne({
          where: { merchantId, driverId },
        });
        if (existing) return existing;
      }
      throw err;
    }
  }

  async removeAffiliation(merchantId: string, driverId: string): Promise<void> {
    await this.repo.delete({ merchantId, driverId });
  }

  /**
   * Livreurs affiliés à un commerçant, avec leur véhicule (utile pour
   * l'écran de gestion "mes livreurs" côté commerçant).
   */
  async listDriversForMerchant(merchantId: string) {
    const affiliations = await this.repo.find({
      where: { merchantId },
      relations: ['driver', 'driver.vehicle'],
    });
    return affiliations.map((a) => a.driver);
  }

  async isAffiliated(merchantId: string, driverId: string): Promise<boolean> {
    const count = await this.repo.count({ where: { merchantId, driverId } });
    return count > 0;
  }

  async listMerchantIdsForDriver(driverId: string): Promise<string[]> {
    const affiliations = await this.repo.find({
      where: { driverId },
      select: ['merchantId'],
    });
    return affiliations.map((a) => a.merchantId);
  }
}
