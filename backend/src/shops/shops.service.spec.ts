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
import { FavoriteShop } from '../entities/favorite-shop.entity';
import { UserRole } from '../entities/user.entity';
import { AuditLogService } from '../audit-log/audit-log.service';
import { ObjectStorageService } from '../storage/object-storage.service';

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

const mockFavoritesRepo = () => {
  const qb: any = {
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };
  return {
    insert: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(() => qb),
    __qb: qb,
  };
};

const mockAuditLogService = () => ({
  log: jest.fn().mockResolvedValue(undefined),
  list: jest.fn(),
});

const mockObjectStorage = () => ({
  store: jest.fn(
    async (_file: any, _prefix: string, localUrl: string) => localUrl,
  ),
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
  let favoritesRepo: ReturnType<typeof mockFavoritesRepo>;
  let auditLog: ReturnType<typeof mockAuditLogService>;
  let objectStorage: ReturnType<typeof mockObjectStorage>;

  beforeEach(async () => {
    shopsRepo = mockShopsRepo();
    productsRepo = mockProductsRepo();
    favoritesRepo = mockFavoritesRepo();
    auditLog = mockAuditLogService();
    objectStorage = mockObjectStorage();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShopsService,
        { provide: getRepositoryToken(Shop), useValue: shopsRepo },
        { provide: getRepositoryToken(Product), useValue: productsRepo },
        {
          provide: getRepositoryToken(FavoriteShop),
          useValue: favoritesRepo,
        },
        { provide: AuditLogService, useValue: auditLog },
        { provide: ObjectStorageService, useValue: objectStorage },
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

      const res = await service.adminApprove('shop-1', 'admin-1');
      expect(res.status).toBe(ShopStatus.APPROVED);
      expect(res.rejectionReason).toBeNull();
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          adminId: 'admin-1',
          action: 'SHOP_APPROVE',
          targetType: 'Shop',
          targetId: 'shop-1',
        }),
      );
    });

    it('throw NotFoundException si la boutique est introuvable', async () => {
      shopsRepo.findOne.mockResolvedValue(null);
      await expect(
        service.adminApprove('missing', 'admin-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
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

      const res = await service.adminReject(
        'shop-1',
        'admin-1',
        'docs invalides',
      );
      expect(res.status).toBe(ShopStatus.REJECTED);
      expect(res.rejectionReason).toBe('docs invalides');
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          adminId: 'admin-1',
          action: 'SHOP_REJECT',
          targetType: 'Shop',
          targetId: 'shop-1',
          metadata: { reason: 'docs invalides' },
        }),
      );
    });

    it('reject sans reason → rejectionReason = null', async () => {
      shopsRepo.findOne.mockResolvedValue({
        id: 'shop-1',
        status: ShopStatus.PENDING,
        rejectionReason: null,
      });
      shopsRepo.save.mockImplementation(async (s: any) => s);

      const res = await service.adminReject('shop-1', 'admin-1');
      expect(res.status).toBe(ShopStatus.REJECTED);
      expect(res.rejectionReason).toBeNull();
    });

    it('throw NotFoundException si la boutique est introuvable', async () => {
      shopsRepo.findOne.mockResolvedValue(null);
      await expect(
        service.adminReject('missing', 'admin-1', 'r'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('adminSuspend', () => {
    it('passe SUSPENDED', async () => {
      shopsRepo.findOne.mockResolvedValue({
        id: 'shop-1',
        status: ShopStatus.APPROVED,
      });
      shopsRepo.save.mockImplementation(async (s: any) => s);

      const res = await service.adminSuspend('shop-1', 'admin-1');
      expect(res.status).toBe(ShopStatus.SUSPENDED);
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          adminId: 'admin-1',
          action: 'SHOP_SUSPEND',
          targetType: 'Shop',
          targetId: 'shop-1',
        }),
      );
    });

    it('throw NotFoundException si la boutique est introuvable', async () => {
      shopsRepo.findOne.mockResolvedValue(null);
      await expect(
        service.adminSuspend('missing', 'admin-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
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

  // ── Favoris ───────────────────────────────────────────────────────────
  describe('addFavorite', () => {
    it('insère un favori si la boutique existe et est APPROVED', async () => {
      shopsRepo.findOne.mockResolvedValue({
        id: 'shop-1',
        status: ShopStatus.APPROVED,
      });
      favoritesRepo.insert.mockResolvedValue({ identifiers: [{ id: 'f-1' }] });

      const res = await service.addFavorite('user-1', 'shop-1');
      expect(res).toEqual({ ok: true });
      expect(shopsRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'shop-1', status: ShopStatus.APPROVED },
      });
      expect(favoritesRepo.insert).toHaveBeenCalledWith({
        userId: 'user-1',
        shopId: 'shop-1',
      });
    });

    it('idempotent : un duplicate ER_DUP_ENTRY ne lève pas, retourne ok', async () => {
      shopsRepo.findOne.mockResolvedValue({
        id: 'shop-1',
        status: ShopStatus.APPROVED,
      });
      favoritesRepo.insert.mockRejectedValue(
        Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' }),
      );

      const res = await service.addFavorite('user-1', 'shop-1');
      expect(res).toEqual({ ok: true });
    });

    it('throw NotFoundException si la boutique est introuvable ou non approuvée', async () => {
      shopsRepo.findOne.mockResolvedValue(null);
      await expect(
        service.addFavorite('user-1', 'shop-missing'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(favoritesRepo.insert).not.toHaveBeenCalled();
    });
  });

  describe('removeFavorite', () => {
    it('delete et retourne ok=true', async () => {
      favoritesRepo.delete.mockResolvedValue({ affected: 1 });
      const res = await service.removeFavorite('user-1', 'shop-1');
      expect(res).toEqual({ ok: true });
      expect(favoritesRepo.delete).toHaveBeenCalledWith({
        userId: 'user-1',
        shopId: 'shop-1',
      });
    });

    it('no-op : delete sur un favori inexistant retourne ok quand même', async () => {
      favoritesRepo.delete.mockResolvedValue({ affected: 0 });
      const res = await service.removeFavorite('user-1', 'shop-x');
      expect(res).toEqual({ ok: true });
    });
  });

  describe('listFavorites', () => {
    it('ne retourne que les shops APPROVED ordonnées par createdAt DESC', async () => {
      const shopApproved = {
        id: 'shop-a',
        name: 'A',
        status: ShopStatus.APPROVED,
      };
      favoritesRepo.__qb.getMany.mockResolvedValue([
        { id: 'fav-1', shop: shopApproved },
      ]);

      const res = await service.listFavorites('user-1');

      expect(favoritesRepo.__qb.where).toHaveBeenCalledWith(
        'f.userId = :userId',
        { userId: 'user-1' },
      );
      expect(favoritesRepo.__qb.andWhere).toHaveBeenCalledWith(
        'shop.status = :status',
        { status: ShopStatus.APPROVED },
      );
      expect(favoritesRepo.__qb.orderBy).toHaveBeenCalledWith(
        'f.createdAt',
        'DESC',
      );
      expect(res).toEqual([shopApproved]);
    });
  });

  describe('isFavorite', () => {
    it('true si count > 0', async () => {
      favoritesRepo.count.mockResolvedValue(1);
      await expect(service.isFavorite('u', 's')).resolves.toBe(true);
    });

    it('false si count = 0', async () => {
      favoritesRepo.count.mockResolvedValue(0);
      await expect(service.isFavorite('u', 's')).resolves.toBe(false);
    });
  });
});
