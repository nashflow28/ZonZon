import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';

import { MerchantDriversService } from './merchant-drivers.service';
import { MerchantDriver } from '../entities/merchant-driver.entity';
import { UsersService } from '../users/users.service';
import { UserRole } from '../entities/user.entity';

const mockRepo = () => ({
  create: jest.fn((v: any) => v),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  count: jest.fn(),
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

  describe('addAffiliation', () => {
    it('affilie un livreur avec succès', async () => {
      usersService.findOne.mockResolvedValue(driverUser);
      repo.save.mockResolvedValue({ id: 'aff-1', merchantId, driverId });

      const result = await service.addAffiliation(merchantId, driverId);

      expect(usersService.findOne).toHaveBeenCalledWith(driverId);
      expect(repo.create).toHaveBeenCalledWith({ merchantId, driverId });
      expect(repo.save).toHaveBeenCalled();
      expect(result).toEqual({ id: 'aff-1', merchantId, driverId });
    });

    it('rejette si la cible n’est pas un livreur → BadRequestException', async () => {
      usersService.findOne.mockResolvedValue(clientUser);

      await expect(
        service.addAffiliation(merchantId, clientUser.id),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('doublon (ER_DUP_ENTRY) → idempotent, renvoie l’affiliation existante', async () => {
      usersService.findOne.mockResolvedValue(driverUser);
      const dupError: any = new Error('Duplicate entry');
      dupError.code = 'ER_DUP_ENTRY';
      repo.save.mockRejectedValue(dupError);
      const existing = { id: 'existing-aff', merchantId, driverId };
      repo.findOne.mockResolvedValue(existing);

      const result = await service.addAffiliation(merchantId, driverId);

      expect(result).toEqual(existing);
    });

    it('doublon détecté via errno 1062 → idempotent', async () => {
      usersService.findOne.mockResolvedValue(driverUser);
      const dupError: any = new Error('duplicate key');
      dupError.errno = 1062;
      repo.save.mockRejectedValue(dupError);
      const existing = { id: 'existing-aff-2', merchantId, driverId };
      repo.findOne.mockResolvedValue(existing);

      const result = await service.addAffiliation(merchantId, driverId);

      expect(result).toEqual(existing);
    });

    it('propage les autres erreurs SQL (non-duplicate)', async () => {
      usersService.findOne.mockResolvedValue(driverUser);
      const otherError = new Error('connection lost');
      repo.save.mockRejectedValue(otherError);

      await expect(
        service.addAffiliation(merchantId, driverId),
      ).rejects.toThrow('connection lost');
    });
  });

  describe('removeAffiliation', () => {
    it('supprime l’affiliation', async () => {
      await service.removeAffiliation(merchantId, driverId);
      expect(repo.delete).toHaveBeenCalledWith({ merchantId, driverId });
    });
  });

  describe('listDriversForMerchant', () => {
    it('renvoie les Users livreurs affiliés (avec vehicle)', async () => {
      const affiliations = [
        { id: 'a1', merchantId, driverId, driver: driverUser },
      ];
      repo.find.mockResolvedValue(affiliations);

      const result = await service.listDriversForMerchant(merchantId);

      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { merchantId },
          relations: ['driver', 'driver.vehicle'],
        }),
      );
      expect(result).toEqual([driverUser]);
    });
  });

  describe('isAffiliated', () => {
    it('true si une affiliation existe', async () => {
      repo.count.mockResolvedValue(1);
      const result = await service.isAffiliated(merchantId, driverId);
      expect(result).toBe(true);
    });

    it('false si aucune affiliation', async () => {
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
});
