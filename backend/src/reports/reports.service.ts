import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DeliveryOrder, OrderStatus } from '../entities/delivery-order.entity';
import { Commission, CommissionStatus } from '../entities/commission.entity';
import { User, UserRole } from '../entities/user.entity';
import { AuditLogService } from '../audit-log/audit-log.service';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @InjectRepository(DeliveryOrder)
    private ordersRepo: Repository<DeliveryOrder>,
    @InjectRepository(Commission)
    private commissionsRepo: Repository<Commission>,
    @InjectRepository(User)
    private usersRepo: Repository<User>,
    private readonly auditLog: AuditLogService,
  ) {}

  private get commissionRate(): number {
    const raw = parseFloat(process.env.COMMISSION_RATE || '0.35');
    if (isNaN(raw) || raw < 0 || raw > 1) return 0.35;
    return raw;
  }

  private toIsoDate(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  private startOfWeek(d: Date): Date {
    const out = new Date(d);
    const day = out.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    out.setDate(out.getDate() + diff);
    out.setHours(0, 0, 0, 0);
    return out;
  }

  private endOfWeek(d: Date): Date {
    const start = this.startOfWeek(d);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return end;
  }

  async weeklyReport(fromStr?: string, toStr?: string) {
    const now = new Date();
    const from = fromStr ? new Date(fromStr) : this.startOfWeek(now);
    const to = toStr ? new Date(toStr) : this.endOfWeek(now);

    const orders = await this.ordersRepo.find({
      where: {
        status: OrderStatus.COMPLETED,
        createdAt: Between(from, to),
      },
      relations: ['livreur'],
    });

    const rate = this.commissionRate;
    const perLivreur = new Map<
      string,
      {
        livreurId: string;
        livreurName: string;
        completedCount: number;
        totalRevenue: number;
      }
    >();

    for (const o of orders) {
      if (!o.livreur) continue;
      const entry = perLivreur.get(o.livreur.id) || {
        livreurId: o.livreur.id,
        livreurName: `${o.livreur.firstName} ${o.livreur.lastName}`,
        completedCount: 0,
        totalRevenue: 0,
      };
      entry.completedCount += 1;
      entry.totalRevenue += Number(o.priceFcfa);
      perLivreur.set(o.livreur.id, entry);
    }

    const persistedCommissions = await this.commissionsRepo.find({
      where: { weekStart: this.toIsoDate(from) },
    });
    const byLivreur = new Map(
      persistedCommissions.map((c) => [c.livreur.id, c]),
    );

    const rows = Array.from(perLivreur.values()).map((r) => {
      const commissionDue = Math.round(r.totalRevenue * rate);
      const persisted = byLivreur.get(r.livreurId);
      return {
        ...r,
        commissionRate: rate,
        commissionDue,
        commissionId: persisted?.id ?? null,
        status: persisted?.status ?? CommissionStatus.DUE,
      };
    });

    return {
      periodStart: this.toIsoDate(from),
      periodEnd: this.toIsoDate(to),
      commissionRate: rate,
      totalRevenue: rows.reduce((s, r) => s + r.totalRevenue, 0),
      totalCommission: rows.reduce((s, r) => s + r.commissionDue, 0),
      activeDrivers: rows.length,
      rows,
    };
  }

  async snapshotWeek(start: Date): Promise<Commission[]> {
    const end = this.endOfWeek(start);
    const s = this.startOfWeek(start);

    const report = await this.weeklyReport(
      this.toIsoDate(s),
      this.toIsoDate(end),
    );
    const saved: Commission[] = [];

    for (const r of report.rows) {
      const existing = await this.commissionsRepo.findOne({
        where: { livreur: { id: r.livreurId }, weekStart: this.toIsoDate(s) },
      });
      if (existing) {
        existing.completedCount = r.completedCount;
        existing.totalRevenue = r.totalRevenue;
        existing.commissionRate = r.commissionRate;
        existing.commissionDue = r.commissionDue;
        saved.push(await this.commissionsRepo.save(existing));
      } else {
        const c = this.commissionsRepo.create({
          livreur: { id: r.livreurId } as User,
          weekStart: this.toIsoDate(s),
          weekEnd: this.toIsoDate(end),
          completedCount: r.completedCount,
          totalRevenue: r.totalRevenue,
          commissionRate: r.commissionRate,
          commissionDue: r.commissionDue,
          status: CommissionStatus.DUE,
        });
        saved.push(await this.commissionsRepo.save(c));
      }
    }

    this.logger.log(
      `Snapshot hebdo : ${saved.length} commissions pour semaine ${this.toIsoDate(s)}`,
    );
    return saved;
  }

  async markPaid(commissionId: string, adminId: string) {
    const c = await this.commissionsRepo.findOne({
      where: { id: commissionId },
    });
    if (!c) throw new NotFoundException('Commission introuvable');
    c.status = CommissionStatus.PAID;
    c.paidAt = new Date();
    const saved = await this.commissionsRepo.save(c);
    void this.auditLog.log({
      adminId,
      action: 'COMMISSION_MARK_PAID',
      targetType: 'Commission',
      targetId: commissionId,
      metadata: { commissionDue: Number(saved.commissionDue) },
    });
    return saved;
  }

  @Cron(CronExpression.EVERY_WEEK, { name: 'weekly-commission-snapshot' })
  async weeklyCronJob() {
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    this.logger.log('Cron hebdomadaire : génération des commissions');
    await this.snapshotWeek(lastWeek);
  }
}
