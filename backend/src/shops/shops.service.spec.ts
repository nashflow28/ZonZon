import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ShopsService } from './shops.service';
import { Shop, ShopCategory, ShopStatus } from '../entities/shop.entity';
import { Product } from '../entities/product.entity';
import { UserRole } from '../entities/user.entity';

const mockShopsRepo = (): Partial<Repository<Shop>> => ({
  find: jest.fn(),
  findOne: jest.fn(),
  save: jest.fn(),
  create: jest.fn((fn: any) => fn),
  remove: jest.fn(),
});

const mockProductsRepo = (): Partial<Repository<Product>> => ({
  find: jest.fn(),
  findOne: jest.fn(),
  save: jest.fn(),
  create: jest.fn((fn: any) => fn),
  remove: jest.fn(),
});

const merchantActor = {
  id: 'merchant-1',
  role: UserRole.COMMERCANT,
};
const clientActor = {
  id: 'client-1',
  role: UserRole.CLIENT,
};

describe('ShopsService', () => {
  let service: ShopsService;
  let shopsRepo: any;
  let productsRepo: any;

  beforeEach(async () => {
    shopsRepo = mockShopsRepo();
    productsRepo = mockProductsRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShopsService,
        { provide: getRepositoryToken(Shop), useValue: shopsRepo },
        { provide: getRepositoryToken(Product), useValue: productsRepo },
      ],
    }).compile();

    service = module.get<ShopsService>(ShopsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── createMyShop ────────────────────────────────────────────────────────
  describe('createMyShop', () => {
    const dto = {
      name: ' Boutique Demo ',
      category: ShopCategory.RESTAURANT,
      address: ' Rue Demo 1 ',
      lat: 6.13,
      lng: 1.22,
      description: '  ',
      phone: ' +228 90 00 00 00 ',
      hours: ' Lun-Sam 8h-20h ',
    };

    it('crée la boutique d’un commerçant sans boutique → status PENDING', async () => {
      shopsRepo.findOne.mockResolvedValue(null);
      shopsRepo.save.mockImplementation(async (s: any) => ({
        id: 'shop-1',
        ...s,
      }));

      const result = await service.createMyShop(merchantActor, dto);

      expect(shopsRepo.findOne).toHaveBeenCalledWith({
        where: { ownerId: merchantActor.id },
      });
      expect(shopsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerId: merchantActor.id,
          name: 'Boutique Demo',
          status: ShopStatus.PENDING,
          category: ShopCategory.RESTAURANT,
          address: 'Rue Demo 1',
          lat: 6.13,
          lng: 1.22,
        }),
      );
      expect(result.status).toBe(ShopStatus.PENDING);
    });

    it('throw ConflictException si le commerçant a déjà une boutique', async () => {
      shopsRepo.findOne.mockResolvedValue({ id: 'shop-existing' });

      await expect(
        service.createMyShop(merchantActor, dto as any),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(shopsRepo.save).not.toHaveBeenCalled();
    });

    it('throw ForbiddenException si l’utilisateur n’est pas COMMERCANT', async () => {
      await expect(
        service.createMyShop(clientActor, dto as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(shopsRepo.findOne).not.toHaveBeenCalled();
    });
  });

  // ── adminApprove / adminReject / adminSuspend ──────────────────────────
  describe('adminApprove', () => {
    it('passe le status à APPROVED et reset rejectionReason', async () => {
      const shop = {
        id: 'shop-1',
        status: ShopStatus.PENDING,
        rejectionReason: 'previous reason',
      };
      shopsRepo.findOne.mockResolvedValue(shop);
      shopsRepo.save.mockImplementation(async (s: any) => s);

      const res = await service.adminApprove('shop-1');
      expect(res.status).toBe(ShopStatus.APPROVED);
      expect(res.rejectionReason).toBeNull();
    });

    it('throw NotFoundException si la boutique est introuvable', async () => {
      shopsRepo.findOne.mockResolvedValue(null);
      await expect(service.adminApprove('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('adminReject', () => {
    it('passe REJECTED et stocke la raison', async () => {
      shopsRepo.findOne.mockResolvedValue({
        id: 'shop-1',
        status: ShopStatus.PENDING,
        rejectionReason: null,
      });
      shopsRepo.save.mockImplementation(async (s: any) => s);

      const res = await service.adminReject('shop-1', 'docs invalides');
      expect(res.status).toBe(ShopStatus.REJECTED);
      expect(res.rejectionReason).toBe('docs invalides');
    });

    it('reject sans reason → rejectionReason = null', async () => {
      shopsRepo.findOne.mockResolvedValue({
        id: 'shop-1',
        status: ShopStatus.PENDING,
        rejectionReason: null,
      });
      shopsRepo.save.mockImplementation(async (s: any) => s);

      const res = await service.adminReject('shop-1');
      expect(res.status).toBe(ShopStatus.REJECTED);
      expect(res.rejectionReason).toBeNull();
    });

    it('throw NotFoundException si la boutique est introuvable', async () => {
      shopsRepo.findOne.mockResolvedValue(null);
      await expect(service.adminReject('missing', 'r')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('adminSuspend', () => {
    it('passe SUSPENDED', async () => {
      shopsRepo.findOne.mockResolvedValue({
        id: 'shop-1',
        status: ShopStatus.APPROVED,
      });
      shopsRepo.save.mockImplementation(async (s: any) => s);

      const res = await service.adminSuspend('shop-1');
      expect(res.status).toBe(ShopStatus.SUSPENDED);
    });

    it('throw NotFoundException si la boutique est introuvable', async () => {
      shopsRepo.findOne.mockResolvedValue(null);
      await expect(service.adminSuspend('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ── updateMyShop ───────────────────────────────────────────────────────
  describe('updateMyShop', () => {
    it('shop APPROVED + modification → status repasse à PENDING', async () => {
      const shop = {
        id: 'shop-1',
        ownerId: merchantActor.id,
        name: 'Old',
        category: ShopCategory.OTHER,
        address: 'Old addr',
        lat: 0,
        lng: 0,
        description: null,
        phone: null,
        hours: null,
        status: ShopStatus.APPROVED,
      };
      shopsRepo.findOne.mockResolvedValue(shop);
      shopsRepo.save.mockImplementation(async (s: any) => s);

      const res = await service.updateMyShop(merchantActor, {
        name: 'New name',
      });

      expect(res.status).toBe(ShopStatus.PENDING);
      expect(res.name).toBe('New name');
    });

    it('shop REJECTED + modification → status reste REJECTED', async () => {
      const shop = {
        id: 'shop-2',
        ownerId: merchantActor.id,
        name: 'Old',
        category: ShopCategory.OTHER,
        address: 'Old addr',
        lat: 0,
        lng: 0,
        description: null,
        phone: null,
        hours: null,
        status: ShopStatus.REJECTED,
      };
      shopsRepo.findOne.mockResolvedValue(shop);
      shopsRepo.save.mockImplementation(async (s: any) => s);

      const res = await service.updateMyShop(merchantActor, {
        name: 'Updated',
      });

      expect(res.status).toBe(ShopStatus.REJECTED);
      expect(res.name).toBe('Updated');
    });

    it('shop introuvable → NotFoundException', async () => {
      shopsRepo.findOne.mockResolvedValue(null);
      await expect(
        service.updateMyShop(merchantActor, { name: 'x' } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
