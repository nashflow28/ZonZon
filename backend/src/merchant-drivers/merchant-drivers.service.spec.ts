import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';

import { MerchantDriversService } from './merchant-drivers.service';
import {
  AffiliationStatus,
  MerchantDriver,
} from '../entities/merchant-driver.entity';
import { UsersService } from '../users/users.service';
import { UserRole } from '../entities/user.entity';

const mockRepo = () => ({
  create: jest.fn((v: any) => v),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  count: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
});

const merchantId = 'merchant-1';
const driverId = 'driver-1';

const driverUser = {
  id: driverId,
  role: UserRole.LIVREUR,
  firstName: 'Bob',
  lastName: 'Livreur',
};
const clientUser = {
  id: 'client-1',
  role: UserRole.CLIENT,
  firstName: 'Alice',
  lastName: 'Client',
};

describe('MerchantDriversService', () => {
  let service: MerchantDriversService;
  let repo: ReturnType<typeof mockRepo>;
  let usersService: { findOne: jest.Mock };

  beforeEach(async () => {
    repo = mockRepo();
    usersService = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerchantDriversService,
        { provide: getRepositoryToken(MerchantDriver), useValue: repo },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();

    service = module.get<MerchantDriversService>(MerchantDriversService);
  });

  describe('addAffiliation (invitation §9.2)', () => {
    it('crée une invitation en PENDING (pas de ligne existante)', async () => {
      usersService.findOne.mockResolvedValue(driverUser);
      repo.findOne.mockResolvedValue(undefined);
      repo.save.mockResolvedValue({
        id: 'aff-1',
        merchantId,
        driverId,
        status: AffiliationStatus.PENDING,
      });

      const result = await service.addAffiliation(merchantId, driverId);

      expect(usersService.findOne).toHaveBeenCalledWith(driverId);
      expect(repo.create).toHaveBeenCalledWith({
        merchantId,
        driverId,
        status: AffiliationStatus.PENDING,
      });
      expect(repo.save).toHaveBeenCalled();
      expect(result.status).toBe(AffiliationStatus.PENDING);
    });

    it('rejette si la cible n’est pas un livreur → BadRequestException', async () => {
      usersService.findOne.mockResolvedValue(clientUser);

      await expect(
        service.addAffiliation(merchantId, clientUser.id),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('idempotent : ré-invitation d’une affiliation PENDING existante renvoie la même ligne', async () => {
      usersService.findOne.mockResolvedValue(driverUser);
      const existing = {
        id: 'aff-1',
        merchantId,
        driverId,
        status: AffiliationStatus.PENDING,
      };
      repo.findOne.mockResolvedValue(existing);

      const result = await service.addAffiliation(merchantId, driverId);

      expect(repo.save).not.toHaveBeenCalled();
      expect(result).toBe(existing);
    });

    it('idempotent : ré-invitation d’une affiliation ACTIVE existante renvoie la même ligne', async () => {
      usersService.findOne.mockResolvedValue(driverUser);
      const existing = {
        id: 'aff-1',
        merchantId,
        driverId,
        status: AffiliationStatus.ACTIVE,
      };
      repo.findOne.mockResolvedValue(existing);

      const result = await service.addAffiliation(merchantId, driverId);

      expect(repo.save).not.toHaveBeenCalled();
      expect(result).toBe(existing);
    });

    it('ré-invitation d’une affiliation REJECTED → repasse en PENDING', async () => {
      usersService.findOne.mockResolvedValue(driverUser);
      const existing = {
        id: 'aff-1',
        merchantId,
        driverId,
        status: AffiliationStatus.REJECTED,
        acceptedAt: null,
        removedAt: null,
      };
      repo.findOne.mockResolvedValue(existing);
      repo.save.mockImplementation(async (v: any) => v);

      const result = await service.addAffiliation(merchantId, driverId);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: AffiliationStatus.PENDING }),
      );
      expect(result.status).toBe(AffiliationStatus.PENDING);
    });

    it('ré-invitation d’une affiliation REMOVED → repasse en PENDING', async () => {
      usersService.findOne.mockResolvedValue(driverUser);
      const existing = {
        id: 'aff-1',
        merchantId,
        driverId,
        status: AffiliationStatus.REMOVED,
        acceptedAt: new Date(),
        removedAt: new Date(),
      };
      repo.findOne.mockResolvedValue(existing);
      repo.save.mockImplementation(async (v: any) => v);

      const result = await service.addAffiliation(merchantId, driverId);

      expect(result.status).toBe(AffiliationStatus.PENDING);
      expect(result.acceptedAt).toBeNull();
      expect(result.removedAt).toBeNull();
    });

    it('doublon concurrent (ER_DUP_ENTRY) → idempotent, renvoie l’affiliation existante', async () => {
      usersService.findOne.mockResolvedValue(driverUser);
      // Pas de ligne trouvée au premier findOne (course concurrente), puis
      // save échoue avec ER_DUP_ENTRY → on relit la ligne créée entre-temps.
      const existing = { id: 'existing-aff', merchantId, driverId };
      repo.findOne
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(existing);
      const dupError: any = new Error('Duplicate entry');
      dupError.code = 'ER_DUP_ENTRY';
      repo.save.mockRejectedValue(dupError);

      const result = await service.addAffiliation(merchantId, driverId);

      expect(result).toEqual(existing);
    });

    it('doublon concurrent détecté via errno 1062 → idempotent', async () => {
      usersService.findOne.mockResolvedValue(driverUser);
      const existing = { id: 'existing-aff-2', merchantId, driverId };
      repo.findOne
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(existing);
      const dupError: any = new Error('duplicate key');
      dupError.errno = 1062;
      repo.save.mockRejectedValue(dupError);

      const result = await service.addAffiliation(merchantId, driverId);

      expect(result).toEqual(existing);
    });

    it('propage les autres erreurs SQL (non-duplicate)', async () => {
      usersService.findOne.mockResolvedValue(driverUser);
      repo.findOne.mockResolvedValue(undefined);
      const otherError = new Error('connection lost');
      repo.save.mockRejectedValue(otherError);

      await expect(
        service.addAffiliation(merchantId, driverId),
      ).rejects.toThrow('connection lost');
    });
  });

  describe('removeAffiliation (soft-remove §9.2)', () => {
    it('positionne status=REMOVED + removedAt (ne supprime pas la ligne)', async () => {
      await service.removeAffiliation(merchantId, driverId);

      expect(repo.delete).not.toHaveBeenCalled();
      expect(repo.update).toHaveBeenCalledWith(
        { merchantId, driverId },
        expect.objectContaining({ status: AffiliationStatus.REMOVED }),
      );
      const [, patch] = repo.update.mock.calls[0];
      expect(patch.removedAt).toBeInstanceOf(Date);
    });
  });

  describe('listDriversForMerchant', () => {
    it('renvoie les Users livreurs affiliés avec leur status', async () => {
      const affiliations = [
        {
          id: 'a1',
          merchantId,
          driverId,
          driver: driverUser,
          status: AffiliationStatus.ACTIVE,
        },
      ];
      repo.find.mockResolvedValue(affiliations);

      const result = await service.listDriversForMerchant(merchantId);

      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { merchantId },
          relations: ['driver', 'driver.vehicle'],
        }),
      );
      expect(result).toEqual([
        { ...driverUser, status: AffiliationStatus.ACTIVE },
      ]);
    });
  });

  describe('isAffiliated (ACTIVE uniquement)', () => {
    it('true si une affiliation ACTIVE existe', async () => {
      repo.count.mockResolvedValue(1);
      const result = await service.isAffiliated(merchantId, driverId);
      expect(result).toBe(true);
      expect(repo.count).toHaveBeenCalledWith({
        where: { merchantId, driverId, status: AffiliationStatus.ACTIVE },
      });
    });

    it('false si aucune affiliation ACTIVE (ex : encore PENDING)', async () => {
      repo.count.mockResolvedValue(0);
      const result = await service.isAffiliated(merchantId, driverId);
      expect(result).toBe(false);
    });
  });

  describe('listMerchantIdsForDriver', () => {
    it('renvoie les ids des commerçants affiliés à un livreur', async () => {
      repo.find.mockResolvedValue([
        { merchantId: 'm1' },
        { merchantId: 'm2' },
      ]);

      const result = await service.listMerchantIdsForDriver(driverId);

      expect(result).toEqual(['m1', 'm2']);
    });
  });

  describe('listAffiliationsForDriver (§9.2, côté livreur)', () => {
    it('renvoie les invitations/affiliations du livreur avec infos commerçant', async () => {
      const merchant = {
        id: merchantId,
        firstName: 'Marc',
        lastName: 'Commercant',
        phone: '+22890000005',
      };
      repo.find.mockResolvedValue([
        {
          merchantId,
          driverId,
          status: AffiliationStatus.PENDING,
          acceptedAt: null,
          removedAt: null,
          createdAt: new Date('2026-01-01'),
          merchant,
        },
      ]);

      const result = await service.listAffiliationsForDriver(driverId);

      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { driverId },
          relations: ['merchant'],
        }),
      );
      expect(result).toEqual([
        expect.objectContaining({
          merchantId,
          status: AffiliationStatus.PENDING,
          merchant: expect.objectContaining({ id: merchantId }),
        }),
      ]);
    });
  });

  describe('respondToInvitation (§9.2)', () => {
    it('accept : PENDING → ACTIVE + acceptedAt', async () => {
      const affiliation = {
        merchantId,
        driverId,
        status: AffiliationStatus.PENDING,
        acceptedAt: null,
      };
      repo.findOne.mockResolvedValue(affiliation);
      repo.save.mockImplementation(async (v: any) => v);

      const result = await service.respondToInvitation(
        merchantId,
        driverId,
        'accept',
      );

      expect(result.status).toBe(AffiliationStatus.ACTIVE);
      expect(result.acceptedAt).toBeInstanceOf(Date);
    });

    it('reject : PENDING → REJECTED', async () => {
      const affiliation = {
        merchantId,
        driverId,
        status: AffiliationStatus.PENDING,
      };
      repo.findOne.mockResolvedValue(affiliation);
      repo.save.mockImplementation(async (v: any) => v);

      const result = await service.respondToInvitation(
        merchantId,
        driverId,
        'reject',
      );

      expect(result.status).toBe(AffiliationStatus.REJECTED);
    });

    it('invitation introuvable → NotFoundException', async () => {
      repo.findOne.mockResolvedValue(undefined);

      await expect(
        service.respondToInvitation(merchantId, driverId, 'accept'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('affiliation déjà ACTIVE → BadRequestException', async () => {
      repo.findOne.mockResolvedValue({
        merchantId,
        driverId,
        status: AffiliationStatus.ACTIVE,
      });

      await expect(
        service.respondToInvitation(merchantId, driverId, 'accept'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
    });
  });
});
