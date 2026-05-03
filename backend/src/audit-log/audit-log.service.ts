import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import {
  AdminAuditLog,
  AuditAction,
} from '../entities/admin-audit-log.entity';
import { ListAuditLogsDto } from './dto/list-audit-logs.dto';

export interface AuditLogPayload {
  adminId: string | null;
  action: AuditAction;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    @InjectRepository(AdminAuditLog)
    private readonly repo: Repository<AdminAuditLog>,
  ) {}

  /**
   * Persiste une entrée d'audit. **Ne JAMAIS bloquer l'action métier** :
   * en cas d'échec DB, on log un warning mais on n'émet pas d'exception.
   */
  async log(params: AuditLogPayload): Promise<void> {
    try {
      await this.repo.save(
        this.repo.create({
          adminId: params.adminId,
          action: params.action,
          targetType: params.targetType,
          targetId: params.targetId,
          metadata: params.metadata ?? null,
        }),
      );
    } catch (err) {
      this.logger.warn(
        `Échec d'enregistrement audit log (${params.action} ${params.targetType}:${params.targetId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Liste paginée des audit logs avec filtres optionnels.
   * Retourne `{ items, total, page, limit, hasMore }`.
   */
  async list(query: ListAuditLogsDto = {}) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit =
      query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 20;

    const where: FindOptionsWhere<AdminAuditLog> = {};
    if (query.adminId) where.adminId = query.adminId;
    if (query.targetType) where.targetType = query.targetType;
    if (query.action) where.action = query.action;

    if (query.from && query.to) {
      where.createdAt = Between(new Date(query.from), new Date(query.to));
    } else if (query.from) {
      where.createdAt = MoreThanOrEqual(new Date(query.from));
    } else if (query.to) {
      where.createdAt = LessThanOrEqual(new Date(query.to));
    }

    const [items, total] = await this.repo.findAndCount({
      where,
      relations: ['admin'],
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
}
