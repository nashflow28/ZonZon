import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { AuditLogService } from './audit-log.service';
import { AdminAuditLog } from '../entities/admin-audit-log.entity';

const mockRepo = () => ({
  findAndCount: jest.fn(),
  save: jest.fn(),
  create: jest.fn((fn: any) => fn),
});

describe('AuditLogService', () => {
  let service: AuditLogService;
  let repo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    repo = mockRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: getRepositoryToken(AdminAuditLog), useValue: repo },
      ],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('log()', () => {
    it('persiste une entrée avec adminId, action, target, metadata', async () => {
      repo.save.mockResolvedValue({ id: 'log-1' });

      await service.log({
        adminId: 'admin-1',
        action: 'SHOP_APPROVE',
        targetType: 'Shop',
        targetId: 'shop-1',
        metadata: { foo: 'bar' },
      });

      expect(repo.create).toHaveBeenCalledWith({
        adminId: 'admin-1',
        action: 'SHOP_APPROVE',
        targetType: 'Shop',
        targetId: 'shop-1',
        metadata: { foo: 'bar' },
      });
      expect(repo.save).toHaveBeenCalledTimes(1);
    });

    it('passe metadata = null si non fourni', async () => {
      repo.save.mockResolvedValue({ id: 'log-2' });

      await service.log({
        adminId: 'admin-1',
        action: 'SHOP_SUSPEND',
        targetType: 'Shop',
        targetId: 'shop-2',
      });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: null }),
      );
    });

    it('ne propage pas d’exception si repo.save échoue (audit ne bloque jamais le métier)', async () => {
      repo.save.mockRejectedValue(new Error('DB down'));

      await expect(
        service.log({
          adminId: 'admin-1',
          action: 'SHOP_APPROVE',
          targetType: 'Shop',
          targetId: 'shop-1',
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('list()', () => {
    it('retourne items, total, page, limit, hasMore avec valeurs par défaut', async () => {
      const items = [
        { id: 'log-1', action: 'SHOP_APPROVE' },
        { id: 'log-2', action: 'SHOP_REJECT' },
      ];
      repo.findAndCount.mockResolvedValue([items, 25]);

      const result = await service.list({});

      expect(result.items).toBe(items);
      expect(result.total).toBe(25);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.hasMore).toBe(true);
      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 20,
          skip: 0,
          order: { createdAt: 'DESC' },
        }),
      );
    });

    it('hasMore = false sur la dernière page', async () => {
      repo.findAndCount.mockResolvedValue([[{ id: 'log-x' }], 21]);

      const result = await service.list({ page: 2, limit: 20 });

      expect(result.page).toBe(2);
      expect(result.limit).toBe(20);
      expect(result.total).toBe(21);
      expect(result.hasMore).toBe(false);
    });

    it('applique les filtres adminId / targetType / action dans le where', async () => {
      repo.findAndCount.mockResolvedValue([[], 0]);

      await service.list({
        adminId: 'admin-1',
        targetType: 'Shop',
        action: 'SHOP_APPROVE',
      });

      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            adminId: 'admin-1',
            targetType: 'Shop',
            action: 'SHOP_APPROVE',
          }),
        }),
      );
    });
  });
});
