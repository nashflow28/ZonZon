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
    });
    return this.ratingsRepository.save(rating);
  }

  async getUserStats(userId: string): Promise<RatingStats> {
    const row = await this.ratingsRepository
      .createQueryBuilder('r')
      .select('AVG(r.score)', 'avg')
      .addSelect('COUNT(r.id)', 'count')
      .where('r.toUserId = :userId', { userId })
      .getRawOne<{ avg: string | null; count: string }>();

    const avg = row?.avg ? parseFloat(row.avg) : 0;
    const count = row?.count ? parseInt(row.count, 10) : 0;
    return {
      average: count > 0 ? parseFloat(avg.toFixed(2)) : 0,
      count,
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
