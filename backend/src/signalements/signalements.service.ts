import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { Signalement, SignalementStatus } from '../entities/signalement.entity';
import { CreateSignalementDto } from './dto/create-signalement.dto';
import { ListSignalementsDto } from './dto/list-signalements.dto';
import { UpdateSignalementDto } from './dto/update-signalement.dto';

@Injectable()
export class SignalementsService {
  private readonly logger = new Logger(SignalementsService.name);

  constructor(
    @InjectRepository(Signalement)
    private readonly repo: Repository<Signalement>,
  ) {}

  async create(
    reporterId: string,
    dto: CreateSignalementDto,
  ): Promise<Signalement> {
    const entity = this.repo.create({
      reporterId,
      targetType: dto.targetType,
      targetId: dto.targetId,
      reason: dto.reason,
      status: SignalementStatus.OPEN,
      reviewedBy: null,
      reviewedAt: null,
    });
    return this.repo.save(entity);
  }

  /**
   * Liste paginée des signalements avec filtres optionnels.
   * Retourne `{ items, total, page, limit, hasMore }` (même convention que
   * `ListOrdersDto`/`audit-logs`).
   */
  async list(query: ListSignalementsDto = {}) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit =
      query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 20;

    const where: FindOptionsWhere<Signalement> = {};
    if (query.status) where.status = query.status;
    if (query.targetType) where.targetType = query.targetType;

    const [items, total] = await this.repo.findAndCount({
      where,
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

  /**
   * Met à jour le statut d'un signalement (traitement admin). `note` n'est
   * actuellement pas persisté (pas de colonne dédiée dans le CDC §17.1) mais
   * est loggé pour traçabilité applicative.
   */
  async updateStatus(
    id: string,
    adminId: string,
    payload: { status: SignalementStatus; note?: string },
  ): Promise<Signalement> {
    const signalement = await this.repo.findOne({ where: { id } });
    if (!signalement) {
      throw new NotFoundException('Signalement introuvable');
    }

    signalement.status = payload.status;
    signalement.reviewedBy = adminId;
    signalement.reviewedAt = new Date();

    const saved = await this.repo.save(signalement);

    if (payload.note) {
      this.logger.log(
        `Signalement ${id} traité par ${adminId} (status=${payload.status}) : ${payload.note}`,
      );
    }

    return saved;
  }
}
