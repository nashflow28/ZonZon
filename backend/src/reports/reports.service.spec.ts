import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { ReportsService } from './reports.service';
import { DeliveryOrder, OrderStatus } from '../entities/delivery-order.entity';
import { Commission, CommissionStatus } from '../entities/commission.entity';
import { User } from '../entities/user.entity';

const mockRepo = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  save: jest.fn(),
  create: jest.fn((fn: any) => fn),
  update: jest.fn(),
});

describe('ReportsService', () => {
  let service: ReportsService;
  let ordersRepo: ReturnType<typeof mockRepo>;
  let commissionsRepo: ReturnType<typeof mockRepo>;
  let usersRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    ordersRepo = mockRepo();
    commissionsRepo = mockRepo();
    usersRepo = mockRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: getRepositoryToken(DeliveryOrder), useValue: ordersRepo },
        { provide: getRepositoryToken(Commission), useValue: commissionsRepo },
        { provide: getRepositoryToken(User), useValue: usersRepo },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  describe('weeklyReport', () => {
    it('agrège par livreur et calcule la commission = revenu × 0.35 arrondi', async () => {
      const livreurA = { id: 'L1', firstName: 'Bob', lastName: 'A' };
      const livreurB = { id: 'L2', firstName: 'Joe', lastName: 'B' };

      ordersRepo.find.mockResolvedValue([
        { id: 'o1', status: OrderStatus.COMPLETED, priceFcfa: 1000, livreur: livreurA },
        { id: 'o2', status: OrderStatus.COMPLETED, priceFcfa: 500, livreur: livreurA },
        { id: 'o3', status: OrderStatus.COMPLETED, priceFcfa: 2000, livreur: livreurB },
      ]);
      commissionsRepo.find.mockResolvedValue([]);

      const report = await service.weeklyReport('2026-01-01', '2026-01-07');

      expect(report.activeDrivers).toBe(2);
      expect(report.totalRevenue).toBe(3500);
      // 1500 * 0.35 = 525, 2000 * 0.35 = 700
      expect(report.totalCommission).toBe(1225);

      const a = report.rows.find((r) => r.livreurId === 'L1')!;
      const b = report.rows.find((r) => r.livreurId === 'L2')!;
      expect(a.completedCount).toBe(2);
      expect(a.totalRevenue).toBe(1500);
      expect(a.commissionDue).toBe(525);
      expect(a.status).toBe(CommissionStatus.DUE);
      expect(b.completedCount).toBe(1);
      expect(b.commissionDue).toBe(700);
    });

    it('ignore les commandes sans livreur', async () => {
      ordersRepo.find.mockResolvedValue([
        { id: 'o1', status: OrderStatus.COMPLETED, priceFcfa: 1000, livreur: null },
      ]);
      commissionsRepo.find.mockResolvedValue([]);

      const report = await service.weeklyReport('2026-01-01', '2026-01-07');
      expect(report.activeDrivers).toBe(0);
      expect(report.totalRevenue).toBe(0);
      expect(report.rows).toEqual([]);
    });

    it('filtre sur COMPLETED via le where passé à find()', async () => {
      ordersRepo.find.mockResolvedValue([]);
      commissionsRepo.find.mockResolvedValue([]);
      await service.weeklyReport('2026-01-01', '2026-01-07');
      expect(ordersRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: OrderStatus.COMPLETED }),
        }),
      );
    });
  });
});
