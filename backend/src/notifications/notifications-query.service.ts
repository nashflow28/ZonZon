import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Notification } from '../entities/notification.entity';
import { ListNotificationsDto } from './dto/list-notifications.dto';

/**
 * Lecture/gestion du centre de notifications persistées (CDC V1 §18.12).
 * Séparé de `NotificationsService` (qui gère l'envoi FCM) pour ne pas
 * mélanger les responsabilités "émission push" et "consultation par le
 * client".
 */
@Injectable()
export class NotificationsQueryService {
  constructor(
    @InjectRepository(Notification)
    private readonly repo: Repository<Notification>,
  ) {}

  /**
   * Liste paginée des notifications de l'utilisateur courant, triée par
   * `createdAt DESC`. Retourne `{ items, total, page, limit, hasMore }`
   * (même convention que `ListOrdersDto`/audit-logs).
   */
  async list(userId: string, query: ListNotificationsDto = {}) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit =
      query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 20;

    const [items, total] = await this.repo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: (page - 1) * limit,
    });

    return {
      items,
      total,
      page,
      limit,
      hasMore: page * limit < total,
    };
  }

  findById(id: string): Promise<Notification | null> {
    return this.repo.findOne({ where: { id } });
  }

  async markRead(id: string): Promise<Notification | null> {
    await this.repo.update(id, { readAt: new Date() });
    return this.findById(id);
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.repo.update(
      { userId, readAt: IsNull() },
      { readAt: new Date() },
    );
    return { updated: result.affected ?? 0 };
  }
}
