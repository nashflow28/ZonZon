import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { DeviceTokensService } from './device-tokens.service';
import { DeviceToken } from '../entities/device-token.entity';

describe('DeviceTokensService', () => {
  let service: DeviceTokensService;
  let repo: {
    find: jest.Mock;
    delete: jest.Mock;
    createQueryBuilder: jest.Mock;
    __insertBuilder: any;
    __selectBuilder: any;
  };

  beforeEach(async () => {
    const insertExecute = jest.fn();
    const insertBuilder: any = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orUpdate: jest.fn().mockReturnThis(),
      execute: insertExecute,
    };
    const selectBuilder: any = {
      select: jest.fn().mockReturnThis(),
      getRawMany: jest.fn(),
    };
    repo = {
      find: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn((alias?: string) => {
        // Le call dans `findUserIdsWithToken` passe un alias 'dt' et appelle
        // .select(...).getRawMany(); les autres calls sont pour l'INSERT.
        if (alias === 'dt') return selectBuilder;
        return insertBuilder;
      }),
      __insertBuilder: insertBuilder,
      __selectBuilder: selectBuilder,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceTokensService,
        { provide: getRepositoryToken(DeviceToken), useValue: repo },
      ],
    }).compile();

    service = module.get<DeviceTokensService>(DeviceTokensService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('upsert', () => {
    it('appelle un INSERT ... ON DUPLICATE KEY UPDATE sur la colonne token', async () => {
      repo.__insertBuilder.execute.mockResolvedValue({});

      await service.upsert('user-1', 'tok-abc', 'android');

      expect(repo.__insertBuilder.values).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          token: 'tok-abc',
          platform: 'android',
        }),
      );
      expect(repo.__insertBuilder.orUpdate).toHaveBeenCalledWith(
        ['userId', 'platform'],
        ['token'],
      );
      expect(repo.__insertBuilder.execute).toHaveBeenCalled();
    });

    it('default platform = android', async () => {
      repo.__insertBuilder.execute.mockResolvedValue({});
      await service.upsert('user-2', 'tok-xyz');
      expect(repo.__insertBuilder.values).toHaveBeenCalledWith(
        expect.objectContaining({ platform: 'android' }),
      );
    });

    it('swallow les erreurs (warn, ne propage pas)', async () => {
      repo.__insertBuilder.execute.mockRejectedValue(new Error('DB down'));
      await expect(
        service.upsert('user-3', 'tok-fail'),
      ).resolves.toBeUndefined();
    });
  });

  describe('listForUser', () => {
    it('retourne les tokens du user', async () => {
      const tokens = [
        { id: 't1', userId: 'u1', token: 'a' },
        { id: 't2', userId: 'u1', token: 'b' },
      ];
      repo.find.mockResolvedValue(tokens);

      const result = await service.listForUser('u1');

      expect(repo.find).toHaveBeenCalledWith({ where: { userId: 'u1' } });
      expect(result).toEqual(tokens);
    });
  });

  describe('deleteByToken', () => {
    it('appelle delete avec la bonne clé', async () => {
      repo.delete.mockResolvedValue({ affected: 1 });
      await service.deleteByToken('tok-z');
      expect(repo.delete).toHaveBeenCalledWith({ token: 'tok-z' });
    });

    it("no-op si le token est vide (évite un DELETE sans where)", async () => {
      await service.deleteByToken('');
      expect(repo.delete).not.toHaveBeenCalled();
    });
  });

  describe('deleteAllForUser', () => {
    it('supprime tous les tokens du user', async () => {
      repo.delete.mockResolvedValue({ affected: 2 });
      await service.deleteAllForUser('u1');
      expect(repo.delete).toHaveBeenCalledWith({ userId: 'u1' });
    });
  });

  describe('findUserIdsWithToken', () => {
    it('retourne la liste des userIds distincts', async () => {
      repo.__selectBuilder.getRawMany.mockResolvedValue([
        { userId: 'u1' },
        { userId: 'u2' },
      ]);

      const result = await service.findUserIdsWithToken();

      expect(repo.__selectBuilder.select).toHaveBeenCalledWith(
        'DISTINCT dt.userId',
        'userId',
      );
      expect(result).toEqual(['u1', 'u2']);
    });

    it('retourne [] si aucun token enregistré', async () => {
      repo.__selectBuilder.getRawMany.mockResolvedValue([]);
      const result = await service.findUserIdsWithToken();
      expect(result).toEqual([]);
    });
  });
});
