import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DeliveryOrder,
  OrderStatus,
} from '../entities/delivery-order.entity';
import { Rating } from '../entities/rating.entity';
import { SubmitRatingDto } from './dto/submit-rating.dto';

export interface RatingStats {
  average: number;
  count: number;
  /** Moyenne des sous-notes ponctualité ; null si aucune note de catégorie. */
  punctualityAverage: number | null;
  /** Moyenne des sous-notes communication ; null si aucune note de catégorie. */
  communicationAverage: number | null;
  /** Moyenne des sous-notes courtoisie ; null si aucune note de catégorie. */
  courtesyAverage: number | null;
}

export interface ExtendedUserStats {
  ratingAverage: number;
  ratingCount: number;
  completedCount: number;
  averageDurationMinutes: number | null;
  cancellationRate: number;
}

@Injectable()
export class RatingsService {
  constructor(
    @InjectRepository(Rating)
    private ratingsRepository: Repository<Rating>,
    @InjectRepository(DeliveryOrder)
    private ordersRepository: Repository<DeliveryOrder>,
  ) {}

  async submitRating(
    orderId: string,
    fromUserId: string,
    dto: SubmitRatingDto,
  ): Promise<Rating> {
    if (!Number.isInteger(dto.score) || dto.score < 1 || dto.score > 5) {
      throw new BadRequestException('Le score doit être un entier entre 1 et 5');
    }

    const order = await this.ordersRepository.findOne({
      where: { id: orderId },
      relations: ['client', 'livreur'],
    });
    if (!order) throw new NotFoundException('Commande introuvable');

    if (order.status !== OrderStatus.COMPLETED) {
      throw new BadRequestException(
        'Seules les courses terminées peuvent être notées',
      );
    }

    const clientId = order.client?.id;
    const livreurId = order.livreur?.id;
    if (!clientId || !livreurId) {
      throw new BadRequestException(
        'Course incomplète : client ou livreur manquant',
      );
    }

    let toUserId: string;
    if (fromUserId === clientId) {
      toUserId = livreurId;
    } else if (fromUserId === livreurId) {
      toUserId = clientId;
    } else {
      throw new ForbiddenException(
        'Seuls le client et le livreur de la course peuvent la noter',
      );
    }

    const existing = await this.ratingsRepository.findOne({
      where: { orderId, fromUserId, toUserId },
    });
    if (existing) {
      throw new ConflictException('Vous avez déjà noté cette course');
    }

    const rating = this.ratingsRepository.create({
      orderId,
      fromUserId,
      toUserId,
      score: dto.score,
      comment: dto.comment?.trim() ? dto.comment.trim() : null,
      punctualityScore: dto.punctualityScore ?? null,
      communicationScore: dto.communicationScore ?? null,
      courtesyScore: dto.courtesyScore ?? null,
    });
    return this.ratingsRepository.save(rating);
  }

  async getUserStats(userId: string): Promise<RatingStats> {
    const row = await this.ratingsRepository
      .createQueryBuilder('r')
      .select('AVG(r.score)', 'avg')
      .addSelect('COUNT(r.id)', 'count')
      .addSelect('AVG(r.punctualityScore)', 'punctualityAvg')
      .addSelect('COUNT(r.punctualityScore)', 'punctualityCount')
      .addSelect('AVG(r.communicationScore)', 'communicationAvg')
      .addSelect('COUNT(r.communicationScore)', 'communicationCount')
      .addSelect('AVG(r.courtesyScore)', 'courtesyAvg')
      .addSelect('COUNT(r.courtesyScore)', 'courtesyCount')
      .where('r.toUserId = :userId', { userId })
      .getRawOne<{
        avg: string | null;
        count: string;
        punctualityAvg: string | null;
        punctualityCount: string;
        communicationAvg: string | null;
        communicationCount: string;
        courtesyAvg: string | null;
        courtesyCount: string;
      }>();

    const avg = row?.avg ? parseFloat(row.avg) : 0;
    const count = row?.count ? parseInt(row.count, 10) : 0;

    // Helper : moyenne arrondie à 0.01, ou null si aucune note pour cette catégorie.
    const categoryAvg = (
      rawAvg: string | null | undefined,
      rawCount: string | undefined,
    ): number | null => {
      const c = rawCount ? parseInt(rawCount, 10) : 0;
      if (!c || rawAvg === null || rawAvg === undefined) return null;
      const v = parseFloat(rawAvg);
      return Number.isFinite(v) ? parseFloat(v.toFixed(2)) : null;
    };

    return {
      average: count > 0 ? parseFloat(avg.toFixed(2)) : 0,
      count,
      punctualityAverage: categoryAvg(row?.punctualityAvg, row?.punctualityCount),
      communicationAverage: categoryAvg(
        row?.communicationAvg,
        row?.communicationCount,
      ),
      courtesyAverage: categoryAvg(row?.courtesyAvg, row?.courtesyCount),
    };
  }

  /**
   * Stats étendues d'un user vu comme livreur :
   *  - Note moyenne et count (via getUserStats)
   *  - Nombre de courses COMPLETED comme livreur
   *  - Durée moyenne d'une course en minutes (acceptedAt → completedAt)
   *  - Taux d'annulation imputable au livreur :
   *      cancelledByLivreurCount / totalAssigned
   *      où totalAssigned = courses dans (ACCEPTED, IN_PROGRESS, COMPLETED, CANCELLED)
   *      pour ce livreur. 0 si totalAssigned = 0.
   */
  async getExtendedStats(userId: string): Promise<ExtendedUserStats> {
    const ratings = await this.getUserStats(userId);

    // Agrégat 1 : completed count + duration moyenne
    const completedRow = await this.ordersRepository
      .createQueryBuilder('o')
      .select('COUNT(*)', 'cnt')
      .addSelect(
        'AVG(TIMESTAMPDIFF(MINUTE, o.acceptedAt, o.completedAt))',
        'avgMin',
      )
      .where('o.livreurId = :userId', { userId })
      .andWhere('o.status = :completed', { completed: OrderStatus.COMPLETED })
      .andWhere('o.acceptedAt IS NOT NULL')
      .getRawOne<{ cnt: string; avgMin: string | null }>();

    const completedCount = completedRow?.cnt
      ? parseInt(completedRow.cnt, 10)
      : 0;
    const avgMinRaw =
      completedRow?.avgMin !== null && completedRow?.avgMin !== undefined
        ? parseFloat(completedRow.avgMin)
        : NaN;
    const averageDurationMinutes =
      Number.isFinite(avgMinRaw) && completedCount > 0
        ? parseFloat(avgMinRaw.toFixed(2))
        : null;

    // Agrégat 2 : total assigné + annulé par le livreur
    const cancelRow = await this.ordersRepository
      .createQueryBuilder('o')
      .select(
        `SUM(CASE WHEN o.status = 'CANCELLED' AND o.cancelledBy = 'LIVREUR' THEN 1 ELSE 0 END)`,
        'cancelled',
      )
      .addSelect(
        `SUM(CASE WHEN o.status IN ('ACCEPTED','IN_PROGRESS','COMPLETED','CANCELLED') THEN 1 ELSE 0 END)`,
        'assigned',
      )
      .where('o.livreurId = :userId', { userId })
      .getRawOne<{ cancelled: string | null; assigned: string | null }>();

    const cancelledByLivreurCount = cancelRow?.cancelled
      ? parseInt(cancelRow.cancelled, 10)
      : 0;
    const totalAssigned = cancelRow?.assigned
      ? parseInt(cancelRow.assigned, 10)
      : 0;
    const cancellationRate =
      totalAssigned > 0
        ? parseFloat((cancelledByLivreurCount / totalAssigned).toFixed(4))
        : 0;

    return {
      ratingAverage: ratings.average,
      ratingCount: ratings.count,
      completedCount,
      averageDurationMinutes,
      cancellationRate,
    };
  }

  async listForUser(userId: string, opts: { take?: number } = {}) {
    const take = Math.min(Math.max(opts.take ?? 20, 1), 100);
    const rows = await this.ratingsRepository.find({
      where: { toUserId: userId },
      relations: ['fromUser'],
      order: { createdAt: 'DESC' },
      take,
    });
    return rows.map((r) => ({
      id: r.id,
      orderId: r.orderId,
      score: r.score,
      comment: r.comment,
      createdAt: r.createdAt,
      fromUser: r.fromUser
        ? {
            id: r.fromUser.id,
            firstName: r.fromUser.firstName,
            lastName: r.fromUser.lastName,
          }
        : null,
    }));
  }
}
