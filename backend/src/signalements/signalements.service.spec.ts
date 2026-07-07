import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';

import { SignalementsService } from './signalements.service';
import {
  Signalement,
  SignalementStatus,
  SignalementTargetType,
} from '../entities/signalement.entity';

const mockRepo = () => ({
  findAndCount: jest.fn(),
  findOne: jest.fn(),
  save: jest.fn(),
  create: jest.fn((data: any) => data),
});

describe('SignalementsService', () => {
  let service: SignalementsService;
  let repo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    repo = mockRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SignalementsService,
        { provide: getRepositoryToken(Signalement), useValue: repo },
      ],
    }).compile();

    service = module.get<SignalementsService>(SignalementsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('create()', () => {
    it('crée un signalement OPEN avec reporterId, targetType, targetId, reason', async () => {
      repo.save.mockImplementation(async (entity: any) => ({
        id: 'sig-1',
        ...entity,
      }));

      const result = await service.create('user-1', {
        targetType: SignalementTargetType.DELIVERY,
        targetId: 'delivery-1',
        reason: 'Colis non livré',
      });

      expect(repo.create).toHaveBeenCalledWith({
        reporterId: 'user-1',
        targetType: SignalementTargetType.DELIVERY,
        targetId: 'delivery-1',
        reason: 'Colis non livré',
        status: SignalementStatus.OPEN,
        reviewedBy: null,
        reviewedAt: null,
      });
      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(result.id).toBe('sig-1');
    });
  });

  describe('list()', () => {
    it('retourne items, total, page, limit, hasMore avec valeurs par défaut', async () => {
      const items = [
        { id: 'sig-1', status: SignalementStatus.OPEN },
        { id: 'sig-2', status: SignalementStatus.OPEN },
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
      repo.findAndCount.mockResolvedValue([[{ id: 'sig-x' }], 21]);

      const result = await service.list({ page: 2, limit: 20 });

      expect(result.page).toBe(2);
      expect(result.total).toBe(21);
      expect(result.hasMore).toBe(false);
    });

    it('applique les filtres status / targetType dans le where', async () => {
      repo.findAndCount.mockResolvedValue([[], 0]);

      await service.list({
        status: SignalementStatus.REVIEWED,
        targetType: SignalementTargetType.DRIVER,
      });

      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: SignalementStatus.REVIEWED,
            targetType: SignalementTargetType.DRIVER,
          }),
        }),
      );
    });

    it('pagination : applique take/skip pour page = 3, limit = 10', async () => {
      repo.findAndCount.mockResolvedValue([[], 0]);

      await service.list({ page: 3, limit: 10 });

      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10, skip: 20 }),
      );
    });
  });

  describe('updateStatus()', () => {
    it('positionne status, reviewedBy, reviewedAt', async () => {
      const existing = {
        id: 'sig-1',
        status: SignalementStatus.OPEN,
        reviewedBy: null,
        reviewedAt: null,
      };
      repo.findOne.mockResolvedValue(existing);
      repo.save.mockImplementation(async (entity: any) => entity);

      const result = await service.updateStatus('sig-1', 'admin-1', {
        status: SignalementStatus.RESOLVED,
      });

      expect(result.status).toBe(SignalementStatus.RESOLVED);
      expect(result.reviewedBy).toBe('admin-1');
      expect(result.reviewedAt).toBeInstanceOf(Date);
      expect(repo.save).toHaveBeenCalledTimes(1);
    });

    it('lève NotFoundException si le signalement n’existe pas', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.updateStatus('unknown', 'admin-1', {
          status: SignalementStatus.DISMISSED,
        }),
      ).rejects.toThrow(NotFoundException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('accepte une note optionnelle sans échouer', async () => {
      const existing = {
        id: 'sig-2',
        status: SignalementStatus.OPEN,
        reviewedBy: null,
        reviewedAt: null,
      };
      repo.findOne.mockResolvedValue(existing);
      repo.save.mockImplementation(async (entity: any) => entity);

      const result = await service.updateStatus('sig-2', 'admin-2', {
        status: SignalementStatus.DISMISSED,
        note: 'Signalement non fondé',
      });

      expect(result.status).toBe(SignalementStatus.DISMISSED);
    });
  });
});
