import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { DriverPosition } from '../entities/driver-position.entity';

/**
 * Service de persistance des positions livreur.
 *
 * Les positions sont émises depuis le mobile (`driver:location` WS) et
 * upsertées ici (1 ligne par livreur, mise à jour à chaque émission).
 * Sert au fallback FCM (filtrage géo) et aux requêtes type "qui est dispo près d'ici".
 */
@Injectable()
export class PositionsService {
  private readonly logger = new Logger(PositionsService.name);

  constructor(
    @InjectRepository(DriverPosition)
    private repo: Repository<DriverPosition>,
  ) {}

  /**
   * Crée ou met à jour la position d'un livreur.
   * Utilise INSERT ... ON DUPLICATE KEY UPDATE sur la contrainte unique `livreurId`
   * pour rester atomique sans avoir à faire un find+save.
   */
  async upsertPosition(
    livreurId: string,
    lat: number,
    lng: number,
    orderId: string | null = null,
  ): Promise<void> {
    try {
      await this.repo
        .createQueryBuilder()
        .insert()
        .into(DriverPosition)
        .values({ livreurId, lat, lng, orderId })
        .orUpdate(['lat', 'lng', 'orderId'], ['livreurId'])
        .execute();
    } catch (err) {
      // Fire-and-forget côté gateway : on warn mais on ne propage pas
      this.logger.warn(
        `upsertPosition échoué pour livreur ${livreurId}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Retourne les positions des livreurs vues récemment (par défaut 5 min).
   * Joint la relation `livreur` pour avoir directement le User attaché
   * (utile au fallback FCM qui doit filtrer par fcmToken / device tokens).
   *
   * Les livreurs offline depuis longtemps sont peu susceptibles de prendre
   * la course, ne pas les notifier évite du bruit.
   */
  async findRecentLivreurPositions(
    maxAgeMinutes = 5,
  ): Promise<DriverPosition[]> {
    const since = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
    return this.repo.find({
      where: { updatedAt: MoreThanOrEqual(since) },
      relations: ['livreur'],
      order: { updatedAt: 'DESC' },
    });
  }

  /**
   * Retourne la dernière position connue d'un livreur (1 ligne par livreur en
   * base, mise à jour à chaque émission `driver:location`). Utilisée par le
   * calcul d'ETA côté client : on regarde si la position est suffisamment
   * fraîche avant de l'utiliser.
   */
  async findLatestForLivreur(
    livreurId: string,
  ): Promise<DriverPosition | null> {
    return this.repo.findOne({
      where: { livreurId },
    });
  }
}
