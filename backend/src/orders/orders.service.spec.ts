import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import axios from 'axios';

import { OrdersService } from './orders.service';
import { OrdersGateway } from './orders.gateway';
import { PositionsService } from './positions.service';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PricingService } from '../pricing/pricing.service';
import { MerchantDriversService } from '../merchant-drivers/merchant-drivers.service';
import {
  DeliveryOrder,
  OrderStatus,
  PaymentStatus,
} from '../entities/delivery-order.entity';
import { DeliveryStatusHistory } from '../entities/delivery-status-history.entity';
import { PriceChange } from '../entities/price-change.entity';
import { PaymentStatusHistory } from '../entities/payment-status-history.entity';
import {
  DeliveryRun,
  DeliveryRunStatus,
} from '../entities/delivery-run.entity';
import { Zone } from '../entities/zone.entity';
import { User, UserRole, UserStatus } from '../entities/user.entity';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const mockRepo = () => {
  const updateExecute = jest.fn();
  const getRawMany = jest.fn().mockResolvedValue([]);
  const qb: any = {
    select: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    execute: updateExecute,
    getRawMany,
  };
  // Repo User minimal utilisé UNIQUEMENT pour le verrou pessimiste pris par
  // `acceptOrder` dans sa transaction (em.getRepository(User).findOne).
  const userLockRepo = {
    findOne: jest.fn().mockResolvedValue({ id: 'locked-user' }),
  };
  const repo: any = {
    find: jest.fn(),
    findAndCount: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn((fn: any) => fn),
    update: jest.fn(),
    createQueryBuilder: jest.fn(() => qb),
    __qb: qb,
    __updateExecute: updateExecute,
    __getRawMany: getRawMany,
    __userLockRepo: userLockRepo,
  };
  // `acceptOrder` exécute son UPDATE atomique dans
  // `ordersRepository.manager.transaction` : on fournit une transaction
  // passthrough dont l'EntityManager route User → userLockRepo et toute
  // autre entité → ce repo mock (les qb/findOne existants continuent de
  // fonctionner à l'identique).
  repo.manager = {
    transaction: jest.fn(async (cb: any) =>
      cb({
        getRepository: (entity: any) => (entity === User ? userLockRepo : repo),
      }),
    ),
  };
  return repo;
};

/**
 * Mock minimal pour les repos d'historique (DeliveryStatusHistory,
 * PriceChange, PaymentStatusHistory) : `create` + `save` (fire-and-forget),
 * `find` pour les endpoints de lecture d'historique.
 */
const mockHistoryRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  save: jest.fn(async (entity: any) => entity),
  create: jest.fn((data: any) => ({ ...data })),
});

const mockDeliveryRunsRepo = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  save: jest.fn(async (entity: any) => entity),
  create: jest.fn((data: any) => ({ ...data })),
});

const clientUser = {
  id: 'client-1',
  role: UserRole.CLIENT,
  firstName: 'Alice',
  lastName: 'Client',
  phone: '+22890000001',
  status: UserStatus.ACTIVE,
};
const livreurUser = {
  id: 'livreur-1',
  role: UserRole.LIVREUR,
  firstName: 'Bob',
  lastName: 'Livreur',
  phone: '+22890000002',
  profilePhotoUrl: '/uploads/livreur.jpg',
  driverApprovalStatus: 'APPROVED',
  isAvailable: true,
  status: UserStatus.ACTIVE,
  isPublic: true,
};
const adminUser = {
  id: 'admin-1',
  role: UserRole.ADMIN,
  firstName: 'Admin',
  lastName: 'Root',
  phone: '+22890000003',
  status: UserStatus.ACTIVE,
};
const merchantUser = {
  id: 'merchant-1',
  role: UserRole.COMMERCANT,
  firstName: 'Marc',
  lastName: 'Commercant',
  phone: '+22890000005',
  status: UserStatus.ACTIVE,
};

describe('OrdersService', () => {
  let service: OrdersService;
  let ordersRepository: ReturnType<typeof mockRepo>;
  let statusHistoryRepository: ReturnType<typeof mockHistoryRepo>;
  let priceChangeRepository: ReturnType<typeof mockHistoryRepo>;
  let paymentHistoryRepository: ReturnType<typeof mockHistoryRepo>;
  let deliveryRunsRepository: ReturnType<typeof mockDeliveryRunsRepo>;
  let usersService: {
    findOne: jest.Mock;
    findByPhone: jest.Mock;
    findLivreursWithFcmToken: jest.Mock;
    findEligibleLivreurIds: jest.Mock;
    findAvailableDrivers: jest.Mock;
    searchClients: jest.Mock;
  };
  let gateway: {
    broadcastNewOrder: jest.Mock;
    broadcastOrderAccepted: jest.Mock;
    broadcastStatusUpdate: jest.Mock;
    broadcastPaymentUpdate: jest.Mock;
    isUserConnected: jest.Mock;
  };
  let notifications: { sendToUser: jest.Mock };
  let positionsService: {
    upsertPosition: jest.Mock;
    findRecentLivreurPositions: jest.Mock;
    findLatestForLivreur: jest.Mock;
  };
  let pricingService: {
    getPricePerKm: jest.Mock;
    getMinPriceFcfa: jest.Mock;
    getConfig: jest.Mock;
    updateConfig: jest.Mock;
  };
  let merchantDriversService: {
    isAffiliated: jest.Mock;
    listDriversForMerchant: jest.Mock;
    addAffiliation: jest.Mock;
    removeAffiliation: jest.Mock;
    listMerchantIdsForDriver: jest.Mock;
  };
  let zonesRepository: { findOne: jest.Mock };
  let originalOrsKey: string | undefined;

  beforeAll(() => {
    originalOrsKey = process.env.ORS_API_KEY;
    process.env.ORS_API_KEY = 'test-ors-key';
  });

  afterAll(() => {
    if (originalOrsKey === undefined) {
      delete process.env.ORS_API_KEY;
    } else {
      process.env.ORS_API_KEY = originalOrsKey;
    }
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    // Make setTimeout instant so retries do not slow the tests
    jest.spyOn(global, 'setTimeout').mockImplementation(((fn: any) => {
      fn();
      return 0 as any;
    }) as any);

    ordersRepository = mockRepo();
    statusHistoryRepository = mockHistoryRepo();
    priceChangeRepository = mockHistoryRepo();
    paymentHistoryRepository = mockHistoryRepo();
    deliveryRunsRepository = mockDeliveryRunsRepo();
    usersService = {
      findOne: jest.fn(),
      findByPhone: jest.fn(),
      findLivreursWithFcmToken: jest.fn().mockResolvedValue([]),
      findEligibleLivreurIds: jest.fn().mockResolvedValue([]),
      findAvailableDrivers: jest.fn().mockResolvedValue([]),
      searchClients: jest.fn().mockResolvedValue([]),
    } as any;
    gateway = {
      broadcastNewOrder: jest.fn(),
      broadcastOrderAccepted: jest.fn(),
      broadcastStatusUpdate: jest.fn(),
      broadcastPaymentUpdate: jest.fn(),
      isUserConnected: jest.fn().mockReturnValue(true),
    };
    notifications = { sendToUser: jest.fn().mockResolvedValue(undefined) };
    positionsService = {
      upsertPosition: jest.fn().mockResolvedValue(undefined),
      // Default : aucune position récente → fallback "global" (rétro-compat
      // avec les tests pré-persistance qui s'attendent au comportement
      // "tous les livreurs offline avec un fcmToken sont notifiés").
      findRecentLivreurPositions: jest.fn().mockResolvedValue([]),
      findLatestForLivreur: jest.fn().mockResolvedValue(null),
    };
    pricingService = {
      getPricePerKm: jest.fn().mockResolvedValue(200),
      getMinPriceFcfa: jest.fn().mockResolvedValue(null),
      getConfig: jest.fn(),
      updateConfig: jest.fn(),
    };
    merchantDriversService = {
      isAffiliated: jest.fn().mockResolvedValue(false),
      listDriversForMerchant: jest.fn().mockResolvedValue([]),
      addAffiliation: jest.fn(),
      removeAffiliation: jest.fn(),
      listMerchantIdsForDriver: jest.fn().mockResolvedValue([]),
    };
    zonesRepository = {
      // Par défaut, aucune zone trouvée → comportement global inchangé.
      findOne: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: getRepositoryToken(DeliveryOrder),
          useValue: ordersRepository,
        },
        {
          provide: getRepositoryToken(DeliveryStatusHistory),
          useValue: statusHistoryRepository,
        },
        {
          provide: getRepositoryToken(PriceChange),
          useValue: priceChangeRepository,
        },
        {
          provide: getRepositoryToken(PaymentStatusHistory),
          useValue: paymentHistoryRepository,
        },
        {
          provide: getRepositoryToken(DeliveryRun),
          useValue: deliveryRunsRepository,
        },
        {
          provide: getRepositoryToken(Zone),
          useValue: zonesRepository,
        },
        { provide: UsersService, useValue: usersService },
        { provide: OrdersGateway, useValue: gateway },
        { provide: NotificationsService, useValue: notifications },
        { provide: PositionsService, useValue: positionsService },
        { provide: PricingService, useValue: pricingService },
        { provide: MerchantDriversService, useValue: merchantDriversService },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createOrder', () => {
    const dto = {
      pickupAddress: 'A',
      pickupLat: 6.1319,
      pickupLng: 1.2228,
      deliveryAddress: 'B',
      deliveryLat: 6.1725,
      deliveryLng: 1.2314,
      description: 'colis',
    };

    it('calcule un prix = distance × pricePerKm (200) arrondi, sauvegarde et broadcast', async () => {
      usersService.findOne.mockResolvedValue(clientUser);
      mockedAxios.get.mockResolvedValue({
        data: {
          features: [{ properties: { summary: { distance: 3000 } } }],
        },
      });
      ordersRepository.save.mockImplementation(async (o: any) => ({
        id: 'ord-1',
        ...o,
      }));

      const result = await service.createOrder(clientUser.id, dto);

      // distance 3km → price = 3 * 200 = 600
      expect(ordersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          priceFcfa: 600,
          distanceKm: 3,
          status: OrderStatus.PENDING,
        }),
      );
      expect(ordersRepository.save).toHaveBeenCalled();
      expect(gateway.broadcastNewOrder).toHaveBeenCalledWith(result, new Set());
    });

    it('appelle broadcastNewOrder avec le Set des livreurs éligibles (approuvés + disponibles)', async () => {
      usersService.findOne.mockResolvedValue(clientUser);
      usersService.findEligibleLivreurIds.mockResolvedValue([
        'livreur-a',
        'livreur-b',
      ]);
      mockedAxios.get.mockResolvedValue({
        data: {
          features: [{ properties: { summary: { distance: 3000 } } }],
        },
      });
      ordersRepository.save.mockImplementation(async (o: any) => ({
        id: 'ord-eligible',
        ...o,
      }));

      await service.createOrder(clientUser.id, dto);

      expect(usersService.findEligibleLivreurIds).toHaveBeenCalled();
      expect(gateway.broadcastNewOrder).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'ord-eligible' }),
        new Set(['livreur-a', 'livreur-b']),
      );
    });

    it('applique la distance minimale 0.5 km', async () => {
      usersService.findOne.mockResolvedValue(clientUser);
      // 100 m → 0.1 km → force 0.5
      mockedAxios.get.mockResolvedValue({
        data: {
          features: [{ properties: { summary: { distance: 100 } } }],
        },
      });
      ordersRepository.save.mockImplementation(async (o: any) => ({
        id: 'ord-2',
        ...o,
      }));

      await service.createOrder(clientUser.id, dto);

      expect(ordersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          distanceKm: 0.5,
          priceFcfa: 100, // 0.5 * 200
        }),
      );
    });

    // ── P2 (CDC V1 §7) : liaison livraison ↔ zone ────────────────────────────

    it('stocke pickupZoneId/destinationZoneId quand fournis', async () => {
      usersService.findOne.mockResolvedValue(clientUser);
      mockedAxios.get.mockResolvedValue({
        data: {
          features: [{ properties: { summary: { distance: 3000 } } }],
        },
      });
      ordersRepository.save.mockImplementation(async (o: any) => ({
        id: 'ord-zones',
        ...o,
      }));

      await service.createOrder(clientUser.id, {
        ...dto,
        pickupZoneId: 'zone-pickup-1',
        destinationZoneId: 'zone-dest-1',
      } as any);

      expect(ordersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          pickupZone: { id: 'zone-pickup-1' },
          destinationZone: { id: 'zone-dest-1' },
        }),
      );
    });

    it('pickupZone/destinationZone restent null si non fournis (rétro-compat)', async () => {
      usersService.findOne.mockResolvedValue(clientUser);
      mockedAxios.get.mockResolvedValue({
        data: {
          features: [{ properties: { summary: { distance: 3000 } } }],
        },
      });
      ordersRepository.save.mockImplementation(async (o: any) => ({
        id: 'ord-no-zones',
        ...o,
      }));

      await service.createOrder(clientUser.id, dto);

      expect(ordersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          pickupZone: null,
          destinationZone: null,
        }),
      );
    });

    // ── §7.3 : tarif effectif par zone ───────────────────────────────────────

    it('applique pricePerKmOverride + basePrice de la zone de retrait', async () => {
      usersService.findOne.mockResolvedValue(clientUser);
      // 3 km, override 300 FCFA/km + basePrice 500 → 500 + round(3*300) = 1400
      mockedAxios.get.mockResolvedValue({
        data: {
          features: [{ properties: { summary: { distance: 3000 } } }],
        },
      });
      zonesRepository.findOne.mockResolvedValue({
        id: 'zone-pickup-1',
        basePrice: 500,
        pricePerKmOverride: 300,
      });
      ordersRepository.save.mockImplementation(async (o: any) => ({
        id: 'ord-zone-price',
        ...o,
      }));

      await service.createOrder(clientUser.id, {
        ...dto,
        pickupZoneId: 'zone-pickup-1',
      } as any);

      expect(zonesRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'zone-pickup-1' },
      });
      expect(ordersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          priceFcfa: 1400,
          estimatedPrice: 1400,
        }),
      );
    });

    it('sans pricePerKmOverride, applique seulement basePrice + tarif global', async () => {
      usersService.findOne.mockResolvedValue(clientUser);
      // 3 km × 200 (global) + basePrice 100 = 700
      mockedAxios.get.mockResolvedValue({
        data: {
          features: [{ properties: { summary: { distance: 3000 } } }],
        },
      });
      zonesRepository.findOne.mockResolvedValue({
        id: 'zone-pickup-1',
        basePrice: 100,
        pricePerKmOverride: null,
      });
      ordersRepository.save.mockImplementation(async (o: any) => ({
        id: 'ord-zone-baseprice-only',
        ...o,
      }));

      await service.createOrder(clientUser.id, {
        ...dto,
        pickupZoneId: 'zone-pickup-1',
      } as any);

      expect(ordersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ priceFcfa: 700 }),
      );
    });

    it('zone sans overrides (basePrice/pricePerKmOverride null) → tarif global inchangé', async () => {
      usersService.findOne.mockResolvedValue(clientUser);
      mockedAxios.get.mockResolvedValue({
        data: {
          features: [{ properties: { summary: { distance: 3000 } } }],
        },
      });
      zonesRepository.findOne.mockResolvedValue({
        id: 'zone-pickup-1',
        basePrice: null,
        pricePerKmOverride: null,
      });
      ordersRepository.save.mockImplementation(async (o: any) => ({
        id: 'ord-zone-no-override',
        ...o,
      }));

      await service.createOrder(clientUser.id, {
        ...dto,
        pickupZoneId: 'zone-pickup-1',
      } as any);

      // 3 km × 200 (global, aucun override) = 600, comme sans zone
      expect(ordersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ priceFcfa: 600 }),
      );
    });

    it('zone introuvable (findOne renvoie null) → fallback tarif global, pas de crash', async () => {
      usersService.findOne.mockResolvedValue(clientUser);
      mockedAxios.get.mockResolvedValue({
        data: {
          features: [{ properties: { summary: { distance: 3000 } } }],
        },
      });
      zonesRepository.findOne.mockResolvedValue(null);
      ordersRepository.save.mockImplementation(async (o: any) => ({
        id: 'ord-zone-not-found',
        ...o,
      }));

      await service.createOrder(clientUser.id, {
        ...dto,
        pickupZoneId: 'zone-inconnue',
      } as any);

      expect(ordersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ priceFcfa: 600 }),
      );
    });

    it('sans pickupZoneId → comportement global inchangé, pas d’appel au repo Zone', async () => {
      usersService.findOne.mockResolvedValue(clientUser);
      mockedAxios.get.mockResolvedValue({
        data: {
          features: [{ properties: { summary: { distance: 3000 } } }],
        },
      });
      ordersRepository.save.mockImplementation(async (o: any) => ({
        id: 'ord-no-zoneid',
        ...o,
      }));

      await service.createOrder(clientUser.id, dto);

      expect(zonesRepository.findOne).not.toHaveBeenCalled();
      expect(ordersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ priceFcfa: 600 }),
      );
    });

    it('le plancher minPriceFcfa global s’applique même avec un tarif par zone', async () => {
      usersService.findOne.mockResolvedValue(clientUser);
      // 3 km × 50 (override très bas) + basePrice 0 = 150, mais plancher 1000
      mockedAxios.get.mockResolvedValue({
        data: {
          features: [{ properties: { summary: { distance: 3000 } } }],
        },
      });
      zonesRepository.findOne.mockResolvedValue({
        id: 'zone-pickup-1',
        basePrice: 0,
        pricePerKmOverride: 50,
      });
      pricingService.getMinPriceFcfa.mockResolvedValue(1000);
      ordersRepository.save.mockImplementation(async (o: any) => ({
        id: 'ord-zone-floor',
        ...o,
      }));

      await service.createOrder(clientUser.id, {
        ...dto,
        pickupZoneId: 'zone-pickup-1',
      } as any);

      expect(ordersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ priceFcfa: 1000 }),
      );
    });

    it('rejette si l’utilisateur n’est pas un client', async () => {
      usersService.findOne.mockResolvedValue(livreurUser);
      await expect(
        service.createOrder(livreurUser.id, dto as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    // ── P0 sécurité (CDC V1) : suspension de compte ─────────────────────────

    it('rejette si le client est SUSPENDED (défense en profondeur)', async () => {
      usersService.findOne.mockResolvedValue({
        ...clientUser,
        status: UserStatus.SUSPENDED,
      });
      await expect(
        service.createOrder(clientUser.id, dto as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejette si les coordonnées sont manquantes', async () => {
      usersService.findOne.mockResolvedValue(clientUser);
      const badDto = { ...dto, pickupLat: undefined };
      await expect(
        service.createOrder(clientUser.id, badDto as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('cache ORS : le 2e appel avec les mêmes coords n’appelle pas axios', async () => {
      usersService.findOne.mockResolvedValue(clientUser);
      mockedAxios.get.mockResolvedValue({
        data: {
          features: [{ properties: { summary: { distance: 3000 } } }],
        },
      });
      ordersRepository.save.mockImplementation(async (o: any) => ({
        id: 'o',
        ...o,
      }));

      await service.createOrder(clientUser.id, dto);
      await service.createOrder(clientUser.id, dto);

      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });

    it('FCM fallback: envoie une push aux livreurs avec token mais offline', async () => {
      usersService.findOne.mockResolvedValue(clientUser);
      mockedAxios.get.mockResolvedValue({
        data: {
          features: [{ properties: { summary: { distance: 3000 } } }],
        },
      });
      ordersRepository.save.mockImplementation(async (o: any) => ({
        id: 'ord-fcm',
        pickupAddress: 'Marché de Lomé',
        ...o,
      }));

      const livreurOffline = {
        id: 'livreur-off',
        firstName: 'Bob',
        fcmToken: 'tok-off',
      };
      const livreurOnline = {
        id: 'livreur-on',
        firstName: 'Alice',
        fcmToken: 'tok-on',
      };
      usersService.findLivreursWithFcmToken.mockResolvedValue([
        livreurOffline,
        livreurOnline,
      ]);
      // livreurOnline est connecté au WS, livreurOffline non
      gateway.isUserConnected.mockImplementation(
        (id: string) => id === livreurOnline.id,
      );

      await service.createOrder(clientUser.id, dto);
      // Le notifyOfflineLivreurs est fire-and-forget : on flush la microtask queue
      await new Promise((r) => setImmediate(r));

      const calls = (notifications.sendToUser as jest.Mock).mock.calls;
      const ids = calls.map((c) => c[0]);
      expect(ids).toContain('livreur-off');
      expect(ids).not.toContain('livreur-on');
      const off = calls.find((c) => c[0] === 'livreur-off');
      expect(off[1].title).toBe('Nouvelle course disponible');
      expect(off[1].data.kind).toBe('new_order');
      expect(off[1].data.orderId).toBe('ord-fcm');
    });

    it('FCM fallback: aucun envoi si tous les livreurs sont connectés', async () => {
      usersService.findOne.mockResolvedValue(clientUser);
      mockedAxios.get.mockResolvedValue({
        data: {
          features: [{ properties: { summary: { distance: 3000 } } }],
        },
      });
      ordersRepository.save.mockImplementation(async (o: any) => ({
        id: 'ord-fcm-2',
        pickupAddress: 'X',
        ...o,
      }));
      usersService.findLivreursWithFcmToken.mockResolvedValue([
        { id: 'l1', firstName: 'A', fcmToken: 't1' },
      ]);
      gateway.isUserConnected.mockReturnValue(true); // tous online

      await service.createOrder(clientUser.id, dto);
      await new Promise((r) => setImmediate(r));

      expect(notifications.sendToUser).not.toHaveBeenCalled();
    });

    it('FCM fallback géo: filtre par rayon NOTIFY_RADIUS_KM quand des positions récentes existent', async () => {
      const oldRadius = process.env.NOTIFY_RADIUS_KM;
      process.env.NOTIFY_RADIUS_KM = '5';
      try {
        usersService.findOne.mockResolvedValue(clientUser);
        mockedAxios.get.mockResolvedValue({
          data: {
            features: [{ properties: { summary: { distance: 3000 } } }],
          },
        });
        const orderDto = {
          ...dto,
          pickupLat: 6.13,
          pickupLng: 1.22,
          deliveryLat: 6.18,
          deliveryLng: 1.23,
        };
        ordersRepository.save.mockImplementation(async (o: any) => ({
          id: 'ord-geo',
          pickupAddress: 'Marché de Lomé',
          pickupLat: 6.13,
          pickupLng: 1.22,
          ...o,
        }));

        // 3 livreurs avec positions récentes :
        //   - near : ~1km du pickup → in radius
        //   - far : ~50km → out of radius
        //   - online : in radius mais connecté au WS → exclu
        positionsService.findRecentLivreurPositions.mockResolvedValue([
          { livreurId: 'driver-near', lat: 6.135, lng: 1.225 },
          { livreurId: 'driver-far', lat: 6.6, lng: 1.22 },
          { livreurId: 'driver-online', lat: 6.131, lng: 1.221 },
        ]);
        usersService.findEligibleLivreurIds.mockResolvedValue([
          'driver-near',
          'driver-far',
          'driver-online',
        ]);
        gateway.isUserConnected.mockImplementation(
          (id: string) => id === 'driver-online',
        );

        await service.createOrder(clientUser.id, orderDto);
        await new Promise((r) => setImmediate(r));

        const calls = (notifications.sendToUser as jest.Mock).mock.calls;
        const ids = calls.map((c) => c[0]);
        expect(ids).toContain('driver-near');
        expect(ids).not.toContain('driver-far');
        expect(ids).not.toContain('driver-online');
        // Le fallback "global" via findLivreursWithFcmToken ne doit PAS être
        // utilisé puisqu'on a des positions récentes.
        expect(usersService.findLivreursWithFcmToken).not.toHaveBeenCalled();
      } finally {
        if (oldRadius === undefined) delete process.env.NOTIFY_RADIUS_KM;
        else process.env.NOTIFY_RADIUS_KM = oldRadius;
      }
    });

    it('fallback Haversine si axios throw 3 fois', async () => {
      usersService.findOne.mockResolvedValue(clientUser);
      mockedAxios.get.mockRejectedValue(new Error('network down'));
      ordersRepository.save.mockImplementation(async (o: any) => ({
        id: 'o',
        ...o,
      }));

      // Use fresh coordinates to bypass the cache populated by previous tests.
      // ~1 degree of latitude ≈ 111 km → haversine * 1.3 ≈ 144.5 km
      const freshDto = {
        ...dto,
        pickupLat: 10,
        pickupLng: 10,
        deliveryLat: 11,
        deliveryLng: 10,
      };
      await service.createOrder(clientUser.id, freshDto);

      expect(mockedAxios.get).toHaveBeenCalledTimes(3);
      const createdArg = ordersRepository.create.mock.calls.at(-1)![0];
      // Haversine × 1.3 for 1° lat at equator ≈ 144 km — check it's in a sane range
      expect(createdArg.distanceKm).toBeGreaterThan(140);
      expect(createdArg.distanceKm).toBeLessThan(150);
      // price = distance brute (non arrondie) * 200, rounded. On tolère un
      // écart de ±1 FCFA vs. le calcul sur `distanceKm` déjà arrondi à 2
      // décimales (le prix réel est calculé avant cet arrondi).
      expect(
        Math.abs(createdArg.priceFcfa - createdArg.distanceKm * 200),
      ).toBeLessThanOrEqual(1);
    });
  });

  describe('acceptOrder', () => {
    // `findOne` est appelé à 2 ou 3 endroits distincts d'`acceptOrder` :
    //   1) recherche d'une course active du livreur (where.livreur défini)
    //   2) recherche de la commande à accepter par id (where.id défini)
    //   3) reload après l'UPDATE atomique (where.id défini, appelé une 2e fois)
    // Ce helper route chaque appel selon la forme du `where` pour ne pas
    // dépendre d'un ordre séquentiel fragile (mockResolvedValueOnce en chaîne).
    const routeFindOne = (opts: {
      activeOrder?: any; // résultat pour la recherche "course active" (par défaut: aucune)
      byId: Record<string, any[]>; // orderId -> [existenceCheckResult, reloadResult]
    }) => {
      const reloadCallCount: Record<string, number> = {};
      ordersRepository.findOne.mockImplementation(async (query: any) => {
        if (query?.where?.livreur) {
          return opts.activeOrder ?? null;
        }
        const id = query?.where?.id;
        const results = opts.byId[id] ?? [];
        const count = reloadCallCount[id] ?? 0;
        reloadCallCount[id] = count + 1;
        return results[count] ?? null;
      });
    };

    it('passe PENDING → ACCEPTED via UPDATE atomique', async () => {
      routeFindOne({
        byId: {
          'ord-1': [
            {
              id: 'ord-1',
              status: OrderStatus.PENDING,
              client: { id: clientUser.id },
            },
            {
              id: 'ord-1',
              status: OrderStatus.ACCEPTED,
              client: { id: clientUser.id },
              livreur: livreurUser,
            },
          ],
        },
      });
      ordersRepository.__updateExecute.mockResolvedValue({ affected: 1 });
      usersService.findOne.mockResolvedValue(livreurUser);

      const result = await service.acceptOrder('ord-1', livreurUser.id);
      expect(result.status).toBe(OrderStatus.ACCEPTED);
      expect(result.livreur).toEqual(livreurUser);
      expect(ordersRepository.__updateExecute).toHaveBeenCalledTimes(1);
      expect(gateway.broadcastOrderAccepted).toHaveBeenCalledWith(
        'ord-1',
        livreurUser.id,
        clientUser.id,
        undefined,
        expect.objectContaining({
          id: livreurUser.id,
          firstName: livreurUser.firstName,
        }),
      );
    });

    // ── P2 (CDC V1 §11.2) : GPS strict + accès commerçant ───────────────────

    it('passe le merchantId au gateway quand la course a un commerçant créateur (Type 1)', async () => {
      routeFindOne({
        byId: {
          'ord-merchant': [
            {
              id: 'ord-merchant',
              status: OrderStatus.PENDING,
              client: { id: clientUser.id },
            },
            {
              id: 'ord-merchant',
              status: OrderStatus.ACCEPTED,
              client: { id: clientUser.id },
              merchant: { id: merchantUser.id },
              livreur: livreurUser,
            },
          ],
        },
      });
      ordersRepository.__updateExecute.mockResolvedValue({ affected: 1 });
      usersService.findOne.mockResolvedValue(livreurUser);

      await service.acceptOrder('ord-merchant', livreurUser.id);

      expect(gateway.broadcastOrderAccepted).toHaveBeenCalledWith(
        'ord-merchant',
        livreurUser.id,
        clientUser.id,
        merchantUser.id,
        expect.objectContaining({
          id: livreurUser.id,
          firstName: livreurUser.firstName,
        }),
      );
    });

    it('throw ConflictException si UPDATE n’affecte aucune ligne (déjà prise)', async () => {
      usersService.findOne.mockResolvedValue(livreurUser);
      routeFindOne({
        byId: {
          o: [
            {
              id: 'o',
              status: OrderStatus.ACCEPTED,
              client: { id: clientUser.id },
            },
          ],
        },
      });
      ordersRepository.__updateExecute.mockResolvedValue({ affected: 0 });
      await expect(
        service.acceptOrder('o', livreurUser.id),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(ordersRepository.save).not.toHaveBeenCalled();
    });

    it('throw NotFoundException si introuvable', async () => {
      usersService.findOne.mockResolvedValue(livreurUser);
      routeFindOne({ byId: {} });
      await expect(
        service.acceptOrder('o', livreurUser.id),
      ).rejects.toBeInstanceOf(NotFoundException);
      // L'UPDATE ne doit pas être tenté si l'order n'existe pas
      expect(ordersRepository.__updateExecute).not.toHaveBeenCalled();
    });

    it('throw ForbiddenException si le livreur n’est pas validé (driverApprovalStatus !== APPROVED)', async () => {
      usersService.findOne.mockResolvedValue({
        ...livreurUser,
        driverApprovalStatus: 'PENDING',
      });
      await expect(
        service.acceptOrder('o', livreurUser.id),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(ordersRepository.findOne).not.toHaveBeenCalled();
      expect(ordersRepository.__updateExecute).not.toHaveBeenCalled();
    });

    it('throw ForbiddenException si le livreur est indisponible (isAvailable=false)', async () => {
      usersService.findOne.mockResolvedValue({
        ...livreurUser,
        isAvailable: false,
      });
      await expect(
        service.acceptOrder('o', livreurUser.id),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(ordersRepository.findOne).not.toHaveBeenCalled();
      expect(ordersRepository.__updateExecute).not.toHaveBeenCalled();
    });

    // ── P0 sécurité (CDC V1) : suspension de compte ─────────────────────────

    it('throw ForbiddenException si le livreur est suspendu (status=SUSPENDED)', async () => {
      usersService.findOne.mockResolvedValue({
        ...livreurUser,
        status: UserStatus.SUSPENDED,
      });
      await expect(
        service.acceptOrder('o', livreurUser.id),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(ordersRepository.findOne).not.toHaveBeenCalled();
      expect(ordersRepository.__updateExecute).not.toHaveBeenCalled();
    });

    // ── P0 sécurité (CDC V1) : une seule course active ──────────────────────

    it('throw ConflictException si le livreur a déjà une course active', async () => {
      usersService.findOne.mockResolvedValue(livreurUser);
      // La recherche "course active" (where.livreur) renvoie une course en
      // cours → le flow doit s'arrêter avant même de chercher la commande
      // visée par son id.
      routeFindOne({
        activeOrder: {
          id: 'ord-already-active',
          status: OrderStatus.IN_PROGRESS,
          livreur: { id: livreurUser.id },
        },
        byId: {
          'ord-new': [
            {
              id: 'ord-new',
              status: OrderStatus.PENDING,
              client: { id: clientUser.id },
            },
          ],
        },
      });

      await expect(
        service.acceptOrder('ord-new', livreurUser.id),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(ordersRepository.__updateExecute).not.toHaveBeenCalled();
    });

    it('autorise plusieurs acceptations actives si toutes appartiennent à la même tournée', async () => {
      usersService.findOne.mockResolvedValue(livreurUser);
      deliveryRunsRepository.findOne.mockResolvedValue({
        id: 'run-1',
        status: DeliveryRunStatus.IN_PROGRESS,
      });
      routeFindOne({
        activeOrder: {
          id: 'ord-run-a',
          status: OrderStatus.IN_PROGRESS,
          livreur: { id: livreurUser.id },
          run: { id: 'run-1' },
        },
        byId: {
          'ord-run-b': [
            {
              id: 'ord-run-b',
              status: OrderStatus.PENDING,
              client: { id: clientUser.id },
              run: { id: 'run-1', livreur: { id: livreurUser.id } },
            },
            {
              id: 'ord-run-b',
              status: OrderStatus.ACCEPTED,
              client: { id: clientUser.id },
              livreur: livreurUser,
              run: { id: 'run-1' },
            },
          ],
        },
      });
      ordersRepository.__updateExecute.mockResolvedValue({ affected: 1 });
      ordersRepository.find.mockResolvedValue([
        { id: 'ord-run-a', status: OrderStatus.IN_PROGRESS },
        { id: 'ord-run-b', status: OrderStatus.ACCEPTED },
      ]);

      const result = await service.acceptOrder('ord-run-b', livreurUser.id);

      expect(result.status).toBe(OrderStatus.ACCEPTED);
      expect(ordersRepository.__updateExecute).toHaveBeenCalledTimes(1);
    });

    it('refuse une 2e acceptation active si elle appartient à une autre tournée', async () => {
      usersService.findOne.mockResolvedValue(livreurUser);
      routeFindOne({
        activeOrder: {
          id: 'ord-run-a',
          status: OrderStatus.IN_PROGRESS,
          livreur: { id: livreurUser.id },
          run: { id: 'run-1' },
        },
        byId: {
          'ord-run-b': [
            {
              id: 'ord-run-b',
              status: OrderStatus.PENDING,
              client: { id: clientUser.id },
              run: { id: 'run-2', livreur: { id: livreurUser.id } },
            },
          ],
        },
      });

      await expect(
        service.acceptOrder('ord-run-b', livreurUser.id),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(ordersRepository.__updateExecute).not.toHaveBeenCalled();
    });

    it('refuse si la tournée de la commande est assignée à un autre livreur', async () => {
      usersService.findOne.mockResolvedValue(livreurUser);
      routeFindOne({
        byId: {
          'ord-run-owned': [
            {
              id: 'ord-run-owned',
              status: OrderStatus.PENDING,
              client: { id: clientUser.id },
              run: { id: 'run-1', livreur: { id: 'other-driver' } },
            },
          ],
        },
      });

      await expect(
        service.acceptOrder('ord-run-owned', livreurUser.id),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(ordersRepository.__updateExecute).not.toHaveBeenCalled();
    });

    it('atomicité : 2 livreurs en concurrence → 1 seul gagne, l’autre reçoit ConflictException', async () => {
      const livreur2 = {
        id: 'livreur-2',
        role: UserRole.LIVREUR,
        firstName: 'Carl',
        lastName: 'Livreur2',
        phone: '+22890000004',
        profilePhotoUrl: '/uploads/livreur2.jpg',
        driverApprovalStatus: 'APPROVED',
        isAvailable: true,
        status: UserStatus.ACTIVE,
      };

      routeFindOne({
        byId: {
          'ord-concurrent': [
            // 1er appel (livreurUser) : check d'existence → PENDING
            {
              id: 'ord-concurrent',
              status: OrderStatus.PENDING,
              client: { id: clientUser.id },
            },
            // 1er appel (livreurUser) : reload après UPDATE gagnant → ACCEPTED
            {
              id: 'ord-concurrent',
              status: OrderStatus.ACCEPTED,
              client: { id: clientUser.id },
              livreur: livreurUser,
            },
            // 2e appel (livreur2) : check d'existence → déjà ACCEPTED (perdant)
            {
              id: 'ord-concurrent',
              status: OrderStatus.ACCEPTED,
              client: { id: clientUser.id },
              livreur: livreurUser,
            },
          ],
        },
      });

      // 1er UPDATE : 1 ligne affectée (gagne) ; 2e : 0 ligne (perd)
      ordersRepository.__updateExecute
        .mockResolvedValueOnce({ affected: 1 })
        .mockResolvedValueOnce({ affected: 0 });

      usersService.findOne.mockImplementation(async (id: string) => {
        if (id === livreurUser.id) return livreurUser;
        if (id === livreur2.id) return livreur2;
        return null;
      });

      const winner = await service.acceptOrder(
        'ord-concurrent',
        livreurUser.id,
      );
      expect(winner.status).toBe(OrderStatus.ACCEPTED);
      expect(winner.livreur).toEqual(livreurUser);

      await expect(
        service.acceptOrder('ord-concurrent', livreur2.id),
      ).rejects.toBeInstanceOf(ConflictException);

      // broadcastOrderAccepted n'est appelé que par le gagnant
      expect(gateway.broadcastOrderAccepted).toHaveBeenCalledTimes(1);
      expect(gateway.broadcastOrderAccepted).toHaveBeenCalledWith(
        'ord-concurrent',
        livreurUser.id,
        clientUser.id,
        undefined,
        expect.objectContaining({
          id: livreurUser.id,
          firstName: livreurUser.firstName,
        }),
      );
    });

    it('P0 atomicité : le re-contrôle SOUS VERROU rejette une 2e commande acceptée en parallèle par le même livreur', async () => {
      usersService.findOne.mockResolvedValue(livreurUser);

      // Simule la course : le fast-path hors transaction (1er appel
      // where.livreur) ne voit rien, mais au moment du re-contrôle sous
      // verrou (2e appel), une acceptation concurrente vient de commiter.
      let livreurChecks = 0;
      ordersRepository.findOne.mockImplementation(async (query: any) => {
        if (query?.where?.livreur) {
          livreurChecks++;
          return livreurChecks >= 2
            ? {
                id: 'ord-race-a',
                status: OrderStatus.ACCEPTED,
                livreur: { id: livreurUser.id },
              }
            : null;
        }
        return {
          id: query?.where?.id,
          status: OrderStatus.PENDING,
          client: { id: clientUser.id },
        };
      });

      await expect(
        service.acceptOrder('ord-race-b', livreurUser.id),
      ).rejects.toBeInstanceOf(ConflictException);

      // L'UPDATE atomique ne doit jamais partir, et le verrou pessimiste
      // sur la ligne user doit avoir été demandé.
      expect(ordersRepository.__updateExecute).not.toHaveBeenCalled();
      expect(ordersRepository.__userLockRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: livreurUser.id },
          lock: { mode: 'pessimistic_write' },
        }),
      );
      expect(gateway.broadcastOrderAccepted).not.toHaveBeenCalled();
    });

    it('P0 atomicité : un accept normal passe par la transaction + verrou pessimiste', async () => {
      routeFindOne({
        byId: {
          'ord-tx': [
            {
              id: 'ord-tx',
              status: OrderStatus.PENDING,
              client: { id: clientUser.id },
            },
            {
              id: 'ord-tx',
              status: OrderStatus.ACCEPTED,
              client: { id: clientUser.id },
              livreur: livreurUser,
            },
          ],
        },
      });
      ordersRepository.__updateExecute.mockResolvedValue({ affected: 1 });
      usersService.findOne.mockResolvedValue(livreurUser);

      await service.acceptOrder('ord-tx', livreurUser.id);

      expect(ordersRepository.manager.transaction).toHaveBeenCalledTimes(1);
      expect(ordersRepository.__userLockRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          lock: { mode: 'pessimistic_write' },
        }),
      );
    });

    // ── Priorité 3, Lot 3, item 1 : course réservée (preferredLivreur) ──────

    it('refuse un livreur non-preferred sur une course réservée à un autre livreur', async () => {
      usersService.findOne.mockResolvedValue(livreurUser);
      routeFindOne({
        byId: {
          'ord-reserved': [
            {
              id: 'ord-reserved',
              status: OrderStatus.PENDING,
              client: { id: clientUser.id },
              preferredLivreur: { id: 'livreur-2' },
            },
          ],
        },
      });

      await expect(
        service.acceptOrder('ord-reserved', livreurUser.id),
      ).rejects.toBeInstanceOf(ForbiddenException);
      // L'UPDATE ne doit même pas être tenté
      expect(ordersRepository.__updateExecute).not.toHaveBeenCalled();
    });

    it('autorise le livreur preferred à accepter la course qui lui est réservée', async () => {
      usersService.findOne.mockResolvedValue(livreurUser);
      routeFindOne({
        byId: {
          'ord-reserved-2': [
            {
              id: 'ord-reserved-2',
              status: OrderStatus.PENDING,
              client: { id: clientUser.id },
              preferredLivreur: { id: livreurUser.id },
            },
            {
              id: 'ord-reserved-2',
              status: OrderStatus.ACCEPTED,
              client: { id: clientUser.id },
              livreur: livreurUser,
            },
          ],
        },
      });
      ordersRepository.__updateExecute.mockResolvedValue({ affected: 1 });

      const result = await service.acceptOrder(
        'ord-reserved-2',
        livreurUser.id,
      );
      expect(result.status).toBe(OrderStatus.ACCEPTED);
      expect(ordersRepository.__updateExecute).toHaveBeenCalledTimes(1);
    });

    it('une course non réservée (preferredLivreur null) reste acceptable par n’importe quel livreur', async () => {
      usersService.findOne.mockResolvedValue(livreurUser);
      routeFindOne({
        byId: {
          'ord-open': [
            {
              id: 'ord-open',
              status: OrderStatus.PENDING,
              client: { id: clientUser.id },
              preferredLivreur: null,
            },
            {
              id: 'ord-open',
              status: OrderStatus.ACCEPTED,
              client: { id: clientUser.id },
              livreur: livreurUser,
            },
          ],
        },
      });
      ordersRepository.__updateExecute.mockResolvedValue({ affected: 1 });

      const result = await service.acceptOrder('ord-open', livreurUser.id);
      expect(result.status).toBe(OrderStatus.ACCEPTED);
    });
  });

  describe('findAvailable', () => {
    it('throw ForbiddenException si le livreur n’est pas validé', async () => {
      usersService.findOne.mockResolvedValue({
        ...livreurUser,
        driverApprovalStatus: 'PENDING',
      });
      await expect(service.findAvailable(livreurUser)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(ordersRepository.find).not.toHaveBeenCalled();
    });

    it('renvoie [] si le livreur est validé mais indisponible', async () => {
      usersService.findOne.mockResolvedValue({
        ...livreurUser,
        isAvailable: false,
      });
      const result = await service.findAvailable(livreurUser);
      expect(result).toEqual([]);
      expect(ordersRepository.find).not.toHaveBeenCalled();
    });

    it('renvoie la liste des courses PENDING si le livreur est validé et disponible', async () => {
      usersService.findOne.mockResolvedValue(livreurUser);
      const orders = [{ id: 'o1' }, { id: 'o2' }];
      ordersRepository.find.mockResolvedValue(orders);

      const result = await service.findAvailable(livreurUser);

      expect(result).toBe(orders);
      const arg = ordersRepository.find.mock.calls[0][0];
      // `where` composite (array) : courses non réservées + réservées à CE livreur
      expect(Array.isArray(arg.where)).toBe(true);
      expect(arg.where).toEqual([
        expect.objectContaining({ status: OrderStatus.PENDING }),
        expect.objectContaining({
          status: OrderStatus.PENDING,
          preferredLivreur: { id: livreurUser.id },
        }),
      ]);
    });

    it('exclut une course réservée à un AUTRE livreur (via le where composite passé au repo)', async () => {
      usersService.findOne.mockResolvedValue(livreurUser);
      ordersRepository.find.mockResolvedValue([]);

      await service.findAvailable(livreurUser);

      const arg = ordersRepository.find.mock.calls[0][0];
      // Le 2e bras du where ne matche que preferredLivreur = CE livreur —
      // une course réservée à un autre livreur ne serait donc renvoyée par
      // aucun des deux bras (status=PENDING+livreur IS NULL+preferredLivreur
      // IS NULL, OU preferredLivreur = ce livreur).
      expect(arg.where[1].preferredLivreur).toEqual({ id: livreurUser.id });
      expect(arg.where[0].preferredLivreur).toBeDefined();
    });
  });

  describe('updateStatus', () => {
    const buildOrder = (status: OrderStatus) => ({
      id: 'o',
      status,
      client: { id: clientUser.id },
      livreur: { id: livreurUser.id },
    });

    it('permet ACCEPTED → IN_PROGRESS par le livreur', async () => {
      deliveryRunsRepository.findOne.mockResolvedValue({
        id: 'run-1',
        status: DeliveryRunStatus.OPEN,
        startedAt: null,
      });
      ordersRepository.find.mockResolvedValue([
        { id: 'o', status: OrderStatus.IN_PROGRESS },
      ]);
      ordersRepository.findOne.mockResolvedValue({
        ...buildOrder(OrderStatus.ACCEPTED),
        run: { id: 'run-1' },
      });
      ordersRepository.save.mockImplementation(async (o: any) => o);
      const result = await service.updateStatus(
        'o',
        OrderStatus.IN_PROGRESS,
        livreurUser,
      );
      expect(result.status).toBe(OrderStatus.IN_PROGRESS);
      expect(gateway.broadcastStatusUpdate).toHaveBeenCalled();
      expect(deliveryRunsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'run-1',
          status: DeliveryRunStatus.IN_PROGRESS,
        }),
      );
    });

    // ── P2 (CDC V1 §11.2) : accès commerçant ────────────────────────────────

    it('passe le merchantId au gateway.broadcastStatusUpdate quand la course a un commerçant créateur', async () => {
      ordersRepository.findOne.mockResolvedValue({
        ...buildOrder(OrderStatus.ACCEPTED),
        merchant: { id: merchantUser.id },
      });
      ordersRepository.save.mockImplementation(async (o: any) => o);

      await service.updateStatus('o', OrderStatus.IN_PROGRESS, livreurUser);

      expect(gateway.broadcastStatusUpdate).toHaveBeenCalledWith(
        'o',
        OrderStatus.IN_PROGRESS,
        clientUser.id,
        livreurUser.id,
        merchantUser.id,
      );
    });

    it('permet IN_PROGRESS → COMPLETED par le livreur', async () => {
      deliveryRunsRepository.findOne.mockResolvedValue({
        id: 'run-1',
        status: DeliveryRunStatus.IN_PROGRESS,
        completedAt: null,
        cancelledAt: null,
      });
      ordersRepository.find.mockResolvedValue([
        { id: 'o1', status: OrderStatus.COMPLETED },
        { id: 'o2', status: OrderStatus.FAILED },
      ]);
      ordersRepository.findOne.mockResolvedValue({
        ...buildOrder(OrderStatus.IN_PROGRESS),
        run: { id: 'run-1' },
      });
      ordersRepository.save.mockImplementation(async (o: any) => o);
      const result = await service.updateStatus(
        'o',
        OrderStatus.COMPLETED,
        livreurUser,
      );
      expect(result.status).toBe(OrderStatus.COMPLETED);
      expect(deliveryRunsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'run-1',
          status: DeliveryRunStatus.COMPLETED,
        }),
      );
    });

    it('permet PENDING → CANCELLED par le client', async () => {
      deliveryRunsRepository.findOne.mockResolvedValue({
        id: 'run-2',
        status: DeliveryRunStatus.IN_PROGRESS,
        completedAt: null,
        cancelledAt: null,
      });
      ordersRepository.find.mockResolvedValue([
        { id: 'o', status: OrderStatus.CANCELLED },
      ]);
      ordersRepository.findOne.mockResolvedValue({
        ...buildOrder(OrderStatus.PENDING),
        livreur: null,
        run: { id: 'run-2' },
      });
      ordersRepository.save.mockImplementation(async (o: any) => o);
      const result = await service.updateStatus(
        'o',
        OrderStatus.CANCELLED,
        clientUser,
      );
      expect(result.status).toBe(OrderStatus.CANCELLED);
      expect(deliveryRunsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'run-2',
          status: DeliveryRunStatus.CANCELLED,
        }),
      );
    });

    it('interdit une transition illégale (COMPLETED → PENDING) → BadRequest', async () => {
      ordersRepository.findOne.mockResolvedValue(
        buildOrder(OrderStatus.COMPLETED),
      );
      await expect(
        service.updateStatus('o', OrderStatus.PENDING, adminUser),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('interdit un client de passer à IN_PROGRESS', async () => {
      ordersRepository.findOne.mockResolvedValue(
        buildOrder(OrderStatus.ACCEPTED),
      );
      await expect(
        service.updateStatus('o', OrderStatus.IN_PROGRESS, clientUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('admin peut tout faire (ACCEPTED → IN_PROGRESS)', async () => {
      ordersRepository.findOne.mockResolvedValue(
        buildOrder(OrderStatus.ACCEPTED),
      );
      ordersRepository.save.mockImplementation(async (o: any) => o);
      const result = await service.updateStatus(
        'o',
        OrderStatus.IN_PROGRESS,
        adminUser,
      );
      expect(result.status).toBe(OrderStatus.IN_PROGRESS);
    });

    // ── Nouveaux statuts granulaires (Priorité 3, Lot 2) ──────────────────

    it('permet ACCEPTED → EN_ROUTE_PICKUP par le livreur', async () => {
      ordersRepository.findOne.mockResolvedValue(
        buildOrder(OrderStatus.ACCEPTED),
      );
      ordersRepository.save.mockImplementation(async (o: any) => o);
      const result = await service.updateStatus(
        'o',
        OrderStatus.EN_ROUTE_PICKUP,
        livreurUser,
      );
      expect(result.status).toBe(OrderStatus.EN_ROUTE_PICKUP);
      expect(gateway.broadcastStatusUpdate).toHaveBeenCalled();
    });

    it('permet ACCEPTED → AT_PICKUP par le livreur', async () => {
      ordersRepository.findOne.mockResolvedValue(
        buildOrder(OrderStatus.ACCEPTED),
      );
      ordersRepository.save.mockImplementation(async (o: any) => o);
      const result = await service.updateStatus(
        'o',
        OrderStatus.AT_PICKUP,
        livreurUser,
      );
      expect(result.status).toBe(OrderStatus.AT_PICKUP);
    });

    it('permet EN_ROUTE_PICKUP → IN_PROGRESS par le livreur (chemin alternatif toujours valide)', async () => {
      ordersRepository.findOne.mockResolvedValue(
        buildOrder(OrderStatus.EN_ROUTE_PICKUP),
      );
      ordersRepository.save.mockImplementation(async (o: any) => o);
      const result = await service.updateStatus(
        'o',
        OrderStatus.IN_PROGRESS,
        livreurUser,
      );
      expect(result.status).toBe(OrderStatus.IN_PROGRESS);
    });

    it('permet IN_PROGRESS → NEAR_CLIENT par le livreur', async () => {
      ordersRepository.findOne.mockResolvedValue(
        buildOrder(OrderStatus.IN_PROGRESS),
      );
      ordersRepository.save.mockImplementation(async (o: any) => o);
      const result = await service.updateStatus(
        'o',
        OrderStatus.NEAR_CLIENT,
        livreurUser,
      );
      expect(result.status).toBe(OrderStatus.NEAR_CLIENT);
    });

    it('permet NEAR_CLIENT → COMPLETED par le livreur', async () => {
      ordersRepository.findOne.mockResolvedValue(
        buildOrder(OrderStatus.NEAR_CLIENT),
      );
      ordersRepository.save.mockImplementation(async (o: any) => o);
      const result = await service.updateStatus(
        'o',
        OrderStatus.COMPLETED,
        livreurUser,
      );
      expect(result.status).toBe(OrderStatus.COMPLETED);
    });

    it('permet ACCEPTED → FAILED par le livreur (statut terminal)', async () => {
      ordersRepository.findOne.mockResolvedValue(
        buildOrder(OrderStatus.ACCEPTED),
      );
      ordersRepository.save.mockImplementation(async (o: any) => o);
      const result = await service.updateStatus(
        'o',
        OrderStatus.FAILED,
        livreurUser,
      );
      expect(result.status).toBe(OrderStatus.FAILED);
    });

    it('permet IN_PROGRESS → FAILED par un admin', async () => {
      ordersRepository.findOne.mockResolvedValue(
        buildOrder(OrderStatus.IN_PROGRESS),
      );
      ordersRepository.save.mockImplementation(async (o: any) => o);
      const result = await service.updateStatus(
        'o',
        OrderStatus.FAILED,
        adminUser,
      );
      expect(result.status).toBe(OrderStatus.FAILED);
    });

    it('interdit une transition FAILED → * (statut terminal)', async () => {
      ordersRepository.findOne.mockResolvedValue(
        buildOrder(OrderStatus.FAILED),
      );
      await expect(
        service.updateStatus('o', OrderStatus.COMPLETED, adminUser),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it.each([
      OrderStatus.EN_ROUTE_PICKUP,
      OrderStatus.AT_PICKUP,
      OrderStatus.NEAR_CLIENT,
      OrderStatus.FAILED,
    ])(
      'refuse qu’un CLIENT déclenche le statut d’avancement %s',
      async (status) => {
        // On place l'order dans un état d'où la transition serait
        // structurellement autorisée (peu importe lequel, le refus doit
        // venir du contrôle d'acteur, pas de la transition elle-même).
        const fromStatus =
          status === OrderStatus.IN_PROGRESS ||
          status === OrderStatus.NEAR_CLIENT
            ? OrderStatus.IN_PROGRESS
            : OrderStatus.ACCEPTED;
        ordersRepository.findOne.mockResolvedValue(buildOrder(fromStatus));
        await expect(
          service.updateStatus('o', status, clientUser),
        ).rejects.toBeInstanceOf(ForbiddenException);
      },
    );

    it('throw NotFoundException si la commande est introuvable', async () => {
      ordersRepository.findOne.mockResolvedValue(null);
      await expect(
        service.updateStatus('o', OrderStatus.COMPLETED, adminUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('envoie une push au LIVREUR quand le CLIENT annule une course ACCEPTED (livreur offline)', async () => {
      ordersRepository.findOne.mockResolvedValue({
        ...buildOrder(OrderStatus.ACCEPTED),
      });
      ordersRepository.save.mockImplementation(async (o: any) => o);
      // Client connecté (pas de push client) ; livreur déconnecté → push livreur
      gateway.isUserConnected.mockImplementation(
        (id: string) => id === clientUser.id,
      );

      await service.updateStatus('o', OrderStatus.CANCELLED, clientUser);

      const calls = (notifications.sendToUser as jest.Mock).mock.calls;
      const livreurCall = calls.find((c) => c[0] === livreurUser.id);
      expect(livreurCall).toBeDefined();
      expect(livreurCall[1].title).toBe('Course annulée');
      expect(livreurCall[1].body).toBe(
        'Le client a annulé la course en cours.',
      );
      expect(livreurCall[1].data.kind).toBe('order_cancelled');
    });

    it("envoie une push au LIVREUR quand l'ADMIN annule (livreur offline)", async () => {
      ordersRepository.findOne.mockResolvedValue(
        buildOrder(OrderStatus.ACCEPTED),
      );
      ordersRepository.save.mockImplementation(async (o: any) => o);
      gateway.isUserConnected.mockReturnValue(false);

      await service.updateStatus('o', OrderStatus.CANCELLED, adminUser);

      const calls = (notifications.sendToUser as jest.Mock).mock.calls;
      const livreurCall = calls.find((c) => c[0] === livreurUser.id);
      expect(livreurCall).toBeDefined();
      expect(livreurCall[1].body).toBe(
        "La course a été annulée par l'administration.",
      );
    });

    it("n'envoie PAS de push au livreur si c'est lui qui annule", async () => {
      ordersRepository.findOne.mockResolvedValue(
        buildOrder(OrderStatus.ACCEPTED),
      );
      ordersRepository.save.mockImplementation(async (o: any) => o);
      gateway.isUserConnected.mockReturnValue(false);

      await service.updateStatus('o', OrderStatus.CANCELLED, livreurUser);

      const calls = (notifications.sendToUser as jest.Mock).mock.calls;
      const livreurCall = calls.find((c) => c[0] === livreurUser.id);
      expect(livreurCall).toBeUndefined();
    });
  });

  describe('findAll (paginated)', () => {
    it('renvoie { items, total, page, limit, hasMore } avec defaults', async () => {
      ordersRepository.findAndCount.mockResolvedValue([[{ id: 'a' }], 1]);
      const result = await service.findAll();
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.hasMore).toBe(false);
      // Vérifie que take/skip sont appliqués
      const callArg = ordersRepository.findAndCount.mock.calls[0][0];
      expect(callArg.take).toBe(20);
      expect(callArg.skip).toBe(0);
      expect(callArg.order).toEqual({ createdAt: 'DESC' });
    });

    it('hasMore=true quand total > page*limit', async () => {
      ordersRepository.findAndCount.mockResolvedValue([
        new Array(20).fill({}),
        50,
      ]);
      const result = await service.findAll({ page: 1, limit: 20 });
      expect(result.hasMore).toBe(true);
      expect(result.total).toBe(50);
    });

    it('applique le filtre status', async () => {
      ordersRepository.findAndCount.mockResolvedValue([[], 0]);
      await service.findAll({ status: OrderStatus.PENDING });
      const arg = ordersRepository.findAndCount.mock.calls[0][0];
      expect(arg.where.status).toBe(OrderStatus.PENDING);
    });

    it('applique le filtre from/to (createdAt Between)', async () => {
      ordersRepository.findAndCount.mockResolvedValue([[], 0]);
      await service.findAll({ from: '2026-01-01', to: '2026-01-31' });
      const arg = ordersRepository.findAndCount.mock.calls[0][0];
      // TypeORM Between produit un FindOperator
      expect(arg.where.createdAt).toBeDefined();
    });
  });

  describe('delivery runs', () => {
    it('createDeliveryRun crée une tournée OPEN pour un commerçant actif', async () => {
      usersService.findOne.mockImplementation(async (id: string) => {
        if (id === merchantUser.id) return merchantUser;
        if (id === livreurUser.id) return livreurUser;
        return null;
      });
      deliveryRunsRepository.save.mockImplementation(async (run: any) => ({
        id: 'run-created',
        ...run,
      }));

      const result = await service.createDeliveryRun(
        merchantUser.id,
        livreurUser.id,
      );

      expect(deliveryRunsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          merchant: merchantUser,
          livreur: livreurUser,
          status: DeliveryRunStatus.OPEN,
        }),
      );
      expect(result.id).toBe('run-created');
    });

    it('findRunsForUser charge la tournée avec ses commandes pour le commerçant', async () => {
      const runs = [{ id: 'run-1' }];
      deliveryRunsRepository.find.mockResolvedValue(runs);

      const result = await service.findRunsForUser(
        merchantUser.id,
        UserRole.COMMERCANT,
      );

      expect(result).toBe(runs);
      expect(deliveryRunsRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { merchant: { id: merchantUser.id } },
          relations: expect.arrayContaining(['orders', 'orders.client']),
        }),
      );
    });
  });

  describe('createMerchantOrder', () => {
    const dto = {
      pickupAddress: 'Boutique A',
      pickupLat: 6.1319,
      pickupLng: 1.2228,
      deliveryAddress: 'Domicile client',
      deliveryLat: 6.1725,
      deliveryLng: 1.2314,
      description: 'colis',
    };

    beforeEach(() => {
      mockedAxios.get.mockResolvedValue({
        data: {
          features: [{ properties: { summary: { distance: 3000 } } }],
        },
      });
      ordersRepository.save.mockImplementation(async (o: any) => ({
        id: 'merch-ord-1',
        ...o,
      }));
    });

    it('rejette si le créateur n’est pas un COMMERCANT', async () => {
      usersService.findOne.mockResolvedValue(clientUser);
      await expect(
        service.createMerchantOrder(clientUser.id, {
          ...dto,
          clientId: 'client-2',
        } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    // ── P0 sécurité (CDC V1) : suspension de compte ─────────────────────────

    it('rejette si le commerçant est SUSPENDED (défense en profondeur)', async () => {
      usersService.findOne.mockResolvedValue({
        ...merchantUser,
        status: UserStatus.SUSPENDED,
      });
      await expect(
        service.createMerchantOrder(merchantUser.id, {
          ...dto,
          clientPhone: '+22899999999',
        } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejette si ni clientId ni clientPhone ne sont fournis', async () => {
      usersService.findOne.mockResolvedValue(merchantUser);
      await expect(
        service.createMerchantOrder(merchantUser.id, dto as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    // ── P2 (CDC V1 §7) : liaison livraison ↔ zone ────────────────────────────

    it('stocke pickupZoneId/destinationZoneId quand fournis par le commerçant', async () => {
      usersService.findOne.mockImplementation(async (id: string) => {
        if (id === merchantUser.id) return merchantUser;
        return null;
      });

      await service.createMerchantOrder(merchantUser.id, {
        ...dto,
        clientPhone: '+22899999999',
        pickupZoneId: 'zone-pickup-2',
        destinationZoneId: 'zone-dest-2',
      } as any);

      expect(ordersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          pickupZone: { id: 'zone-pickup-2' },
          destinationZone: { id: 'zone-dest-2' },
        }),
      );
    });

    it('rattache un client existant via clientId', async () => {
      usersService.findOne.mockImplementation(async (id: string) => {
        if (id === merchantUser.id) return merchantUser;
        if (id === clientUser.id) return clientUser;
        return null;
      });

      const result = await service.createMerchantOrder(merchantUser.id, {
        ...dto,
        clientId: clientUser.id,
      } as any);

      expect(ordersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          merchant: merchantUser,
          client: clientUser,
          clientPhone: clientUser.phone,
        }),
      );
      expect(result).toBeDefined();
    });

    it('rejette si clientId pointe vers un utilisateur non-CLIENT', async () => {
      usersService.findOne.mockImplementation(async (id: string) => {
        if (id === merchantUser.id) return merchantUser;
        if (id === livreurUser.id) return livreurUser;
        return null;
      });

      await expect(
        service.createMerchantOrder(merchantUser.id, {
          ...dto,
          clientId: livreurUser.id,
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rattache le compte client trouvé via clientPhone', async () => {
      usersService.findOne.mockResolvedValue(merchantUser);
      usersService.findByPhone.mockResolvedValue(clientUser);

      await service.createMerchantOrder(merchantUser.id, {
        ...dto,
        clientPhone: clientUser.phone,
      } as any);

      expect(usersService.findByPhone).toHaveBeenCalledWith(clientUser.phone);
      expect(ordersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          client: clientUser,
          clientPhone: clientUser.phone,
        }),
      );
    });

    it('clientPhone inconnu → client null, clientPhone/clientName stockés en clair', async () => {
      usersService.findOne.mockResolvedValue(merchantUser);
      usersService.findByPhone.mockResolvedValue(null);

      await service.createMerchantOrder(merchantUser.id, {
        ...dto,
        clientPhone: '+22899999999',
        clientName: 'Client Sans Compte',
      } as any);

      expect(ordersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          client: null,
          clientPhone: '+22899999999',
          clientName: 'Client Sans Compte',
        }),
      );
    });

    it('broadcast appelé avec les livreurs éligibles', async () => {
      usersService.findOne.mockResolvedValue(merchantUser);
      usersService.findByPhone.mockResolvedValue(null);
      usersService.findEligibleLivreurIds.mockResolvedValue(['livreur-a']);

      const result = await service.createMerchantOrder(merchantUser.id, {
        ...dto,
        clientPhone: '+22899999999',
      } as any);

      expect(gateway.broadcastNewOrder).toHaveBeenCalledWith(
        result,
        new Set(['livreur-a']),
      );
    });

    it('rattache la commande à une tournée ouverte et impose le livreur de la tournée', async () => {
      usersService.findOne.mockImplementation(async (id: string) => {
        if (id === merchantUser.id) return merchantUser;
        if (id === livreurUser.id) return livreurUser;
        return null;
      });
      deliveryRunsRepository.findOne.mockResolvedValue({
        id: 'run-1',
        merchant: { id: merchantUser.id },
        livreur: { id: livreurUser.id },
        status: DeliveryRunStatus.OPEN,
      });

      await service.createMerchantOrder(merchantUser.id, {
        ...dto,
        clientPhone: '+22899999999',
        runId: 'run-1',
      } as any);

      expect(ordersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          run: expect.objectContaining({ id: 'run-1' }),
          preferredLivreur: expect.objectContaining({ id: livreurUser.id }),
        }),
      );
    });

    it('rejette l’ajout d’une commande à une tournée terminale', async () => {
      usersService.findOne.mockResolvedValue(merchantUser);
      deliveryRunsRepository.findOne.mockResolvedValue({
        id: 'run-done',
        merchant: { id: merchantUser.id },
        livreur: { id: livreurUser.id },
        status: DeliveryRunStatus.COMPLETED,
      });

      await expect(
        service.createMerchantOrder(merchantUser.id, {
          ...dto,
          clientPhone: '+22899999999',
          runId: 'run-done',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejette si les coordonnées GPS sont manquantes', async () => {
      usersService.findOne.mockResolvedValue(merchantUser);
      usersService.findByPhone.mockResolvedValue(null);
      const badDto = {
        ...dto,
        pickupLat: undefined,
        clientPhone: '+22899999999',
      };
      await expect(
        service.createMerchantOrder(merchantUser.id, badDto as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('utilise le priceFcfa manuel du commerçant si fourni (override du calcul automatique)', async () => {
      usersService.findOne.mockResolvedValue(merchantUser);
      usersService.findByPhone.mockResolvedValue(null);

      await service.createMerchantOrder(merchantUser.id, {
        ...dto,
        clientPhone: '+22899999999',
        priceFcfa: 999,
      } as any);

      // distance 3km calculée normalement (mock axios: 3000m), mais le prix
      // final doit être celui fourni par le commerçant, pas 3 * 200 = 600.
      expect(ordersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          distanceKm: 3,
          priceFcfa: 999,
        }),
      );
    });

    // ── Priorité 3, Lot 3, item 1 : attribution manuelle (preferredLivreurId) ──

    it('preferredLivreurId valide → réserve la course et broadcast ciblé (Set d’un seul id)', async () => {
      usersService.findOne.mockImplementation(async (id: string) => {
        if (id === merchantUser.id) return merchantUser;
        if (id === livreurUser.id) return livreurUser;
        return null;
      });
      usersService.findByPhone.mockResolvedValue(null);

      const result = await service.createMerchantOrder(merchantUser.id, {
        ...dto,
        clientPhone: '+22899999999',
        preferredLivreurId: livreurUser.id,
      } as any);

      expect(ordersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          preferredLivreur: expect.objectContaining({ id: livreurUser.id }),
        }),
      );
      expect(gateway.broadcastNewOrder).toHaveBeenCalledWith(
        result,
        new Set([livreurUser.id]),
      );
      // Le broadcast large (findEligibleLivreurIds) ne doit pas être utilisé
      // puisque le ciblage est exclusif au livreur préféré.
      expect(usersService.findEligibleLivreurIds).not.toHaveBeenCalled();
    });

    it('preferredLivreurId indisponible → BadRequestException', async () => {
      usersService.findOne.mockImplementation(async (id: string) => {
        if (id === merchantUser.id) return merchantUser;
        if (id === livreurUser.id)
          return { ...livreurUser, isAvailable: false };
        return null;
      });
      usersService.findByPhone.mockResolvedValue(null);

      await expect(
        service.createMerchantOrder(merchantUser.id, {
          ...dto,
          clientPhone: '+22899999999',
          preferredLivreurId: livreurUser.id,
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('preferredLivreurId disponible → autorisé', async () => {
      usersService.findOne.mockImplementation(async (id: string) => {
        if (id === merchantUser.id) return merchantUser;
        if (id === livreurUser.id) return livreurUser; // isAvailable: true
        return null;
      });
      usersService.findByPhone.mockResolvedValue(null);

      const result = await service.createMerchantOrder(merchantUser.id, {
        ...dto,
        clientPhone: '+22899999999',
        preferredLivreurId: livreurUser.id,
      } as any);

      expect(result).toBeDefined();
      expect(gateway.broadcastNewOrder).toHaveBeenCalledWith(
        result,
        new Set([livreurUser.id]),
      );
    });

    it('preferredLivreurId pointant vers un non-livreur → BadRequestException', async () => {
      usersService.findOne.mockImplementation(async (id: string) => {
        if (id === merchantUser.id) return merchantUser;
        if (id === clientUser.id) return clientUser;
        return null;
      });
      usersService.findByPhone.mockResolvedValue(null);

      await expect(
        service.createMerchantOrder(merchantUser.id, {
          ...dto,
          clientPhone: '+22899999999',
          preferredLivreurId: clientUser.id,
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('preferredLivreurId non APPROVED → BadRequestException', async () => {
      usersService.findOne.mockImplementation(async (id: string) => {
        if (id === merchantUser.id) return merchantUser;
        if (id === livreurUser.id)
          return { ...livreurUser, driverApprovalStatus: 'PENDING' };
        return null;
      });
      usersService.findByPhone.mockResolvedValue(null);

      await expect(
        service.createMerchantOrder(merchantUser.id, {
          ...dto,
          clientPhone: '+22899999999',
          preferredLivreurId: livreurUser.id,
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('findForUser', () => {
    it('COMMERCANT → filtre les commandes par merchant.id', async () => {
      const orders = [{ id: 'm1' }, { id: 'm2' }];
      ordersRepository.find.mockResolvedValue(orders);

      const result = await service.findForUser(merchantUser);

      expect(result).toBe(orders);
      expect(ordersRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { merchant: { id: merchantUser.id } },
        }),
      );
    });
  });

  describe('computeEta', () => {
    // Pickup à Lomé centre, delivery à ~5 km au nord.
    const pickupLat = 6.13;
    const pickupLng = 1.22;
    const deliveryLat = 6.18;
    const deliveryLng = 1.23;

    const buildOrder = (status: OrderStatus, withLivreur = true): any => ({
      id: 'ord-eta',
      status,
      pickupLat,
      pickupLng,
      deliveryLat,
      deliveryLng,
      client: { id: clientUser.id },
      merchant: { id: merchantUser.id },
      livreur: withLivreur ? { id: livreurUser.id } : null,
    });

    it('ACCEPTED + position récente livreur → ETA livreur→pickup', async () => {
      ordersRepository.findOne.mockResolvedValue(
        buildOrder(OrderStatus.ACCEPTED),
      );
      // Livreur ~1 km du pickup (≈ 0.01° de latitude)
      positionsService.findLatestForLivreur.mockResolvedValue({
        livreurId: livreurUser.id,
        lat: 6.14,
        lng: 1.22,
        updatedAt: new Date(),
      });

      const result = await service.computeEta('ord-eta', clientUser);

      expect(result.basedOn).toBe('driver_position');
      expect(result.distanceKm).toBeGreaterThan(0);
      expect(result.distanceKm).toBeLessThan(2);
      expect(result.etaMinutes).toBeGreaterThanOrEqual(1);
      // ~1 km / 25 km/h * 60 = ~2.7 min
      expect(result.etaMinutes).toBeLessThanOrEqual(5);
    });

    it('IN_PROGRESS + position récente livreur → ETA livreur→delivery', async () => {
      ordersRepository.findOne.mockResolvedValue(
        buildOrder(OrderStatus.IN_PROGRESS),
      );
      // Livreur très proche de la delivery
      positionsService.findLatestForLivreur.mockResolvedValue({
        livreurId: livreurUser.id,
        lat: 6.181,
        lng: 1.231,
        updatedAt: new Date(),
      });

      const result = await service.computeEta('ord-eta', clientUser);

      expect(result.basedOn).toBe('driver_position');
      expect(result.distanceKm).toBeLessThan(0.5);
      expect(result.etaMinutes).toBe(1); // Math.max(1, ...)
    });

    it('PENDING → basedOn=unavailable', async () => {
      ordersRepository.findOne.mockResolvedValue({
        ...buildOrder(OrderStatus.PENDING, false),
      });
      const result = await service.computeEta('ord-eta', clientUser);
      expect(result).toEqual({
        distanceKm: null,
        etaMinutes: null,
        basedOn: 'unavailable',
      });
    });

    it('ACCEPTED sans position fraîche → basedOn=unavailable', async () => {
      ordersRepository.findOne.mockResolvedValue(
        buildOrder(OrderStatus.ACCEPTED),
      );
      // Position trop vieille (> 5 min)
      positionsService.findLatestForLivreur.mockResolvedValue({
        livreurId: livreurUser.id,
        lat: 6.14,
        lng: 1.22,
        updatedAt: new Date(Date.now() - 10 * 60 * 1000),
      });

      const result = await service.computeEta('ord-eta', clientUser);
      expect(result.basedOn).toBe('unavailable');
      expect(result.etaMinutes).toBeNull();
    });

    it('IN_PROGRESS sans position fraîche → fallback pickup', async () => {
      ordersRepository.findOne.mockResolvedValue(
        buildOrder(OrderStatus.IN_PROGRESS),
      );
      positionsService.findLatestForLivreur.mockResolvedValue(null);

      const result = await service.computeEta('ord-eta', clientUser);
      expect(result.basedOn).toBe('pickup');
      expect(result.distanceKm).toBeGreaterThan(0);
      expect(result.etaMinutes).toBeGreaterThanOrEqual(1);
    });

    it('actor non autorisé → ForbiddenException', async () => {
      ordersRepository.findOne.mockResolvedValue(
        buildOrder(OrderStatus.ACCEPTED),
      );
      const stranger = {
        id: 'stranger-1',
        role: UserRole.CLIENT,
        firstName: 'X',
        lastName: 'Y',
        phone: '+22890000099',
      };
      await expect(
        service.computeEta('ord-eta', stranger),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('order introuvable → NotFoundException', async () => {
      ordersRepository.findOne.mockResolvedValue(null);
      await expect(
        service.computeEta('missing', clientUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('admin peut consulter même sans être client/livreur', async () => {
      ordersRepository.findOne.mockResolvedValue(
        buildOrder(OrderStatus.ACCEPTED),
      );
      positionsService.findLatestForLivreur.mockResolvedValue({
        livreurId: livreurUser.id,
        lat: 6.14,
        lng: 1.22,
        updatedAt: new Date(),
      });

      const result = await service.computeEta('ord-eta', adminUser);
      expect(result.basedOn).toBe('driver_position');
    });

    it('COMMERCANT créateur peut consulter l’ETA de sa livraison', async () => {
      ordersRepository.findOne.mockResolvedValue(
        buildOrder(OrderStatus.IN_PROGRESS),
      );
      positionsService.findLatestForLivreur.mockResolvedValue({
        livreurId: livreurUser.id,
        lat: 6.181,
        lng: 1.231,
        updatedAt: new Date(),
      });

      const result = await service.computeEta('ord-eta', merchantUser);

      expect(result.basedOn).toBe('driver_position');
      expect(result.etaMinutes).toBe(1);
    });
  });

  describe('updatePaymentStatus', () => {
    const buildPaymentOrder = () => ({
      id: 'o',
      status: OrderStatus.COMPLETED,
      paymentStatus: PaymentStatus.UNPAID,
      client: { id: clientUser.id },
      livreur: { id: livreurUser.id },
      merchant: { id: merchantUser.id },
    });

    it('autorisé pour le CLIENT de la course', async () => {
      ordersRepository.findOne.mockResolvedValue(buildPaymentOrder());
      ordersRepository.save.mockImplementation(async (o: any) => o);

      const result = await service.updatePaymentStatus(
        'o',
        PaymentStatus.PAID,
        clientUser,
      );

      expect(result.paymentStatus).toBe(PaymentStatus.PAID);
    });

    it('autorisé pour le LIVREUR assigné', async () => {
      ordersRepository.findOne.mockResolvedValue(buildPaymentOrder());
      ordersRepository.save.mockImplementation(async (o: any) => o);

      const result = await service.updatePaymentStatus(
        'o',
        PaymentStatus.CASH_ON_DELIVERY,
        livreurUser,
      );

      expect(result.paymentStatus).toBe(PaymentStatus.CASH_ON_DELIVERY);
    });

    it('autorisé pour le COMMERCANT créateur (merchant)', async () => {
      ordersRepository.findOne.mockResolvedValue({
        ...buildPaymentOrder(),
        paymentStatus: PaymentStatus.CASH_ON_DELIVERY,
      });
      ordersRepository.save.mockImplementation(async (o: any) => o);

      const result = await service.updatePaymentStatus(
        'o',
        PaymentStatus.RECEIVED_BY_MERCHANT,
        merchantUser,
      );

      expect(result.paymentStatus).toBe(PaymentStatus.RECEIVED_BY_MERCHANT);
    });

    it('autorisé pour un ADMIN', async () => {
      ordersRepository.findOne.mockResolvedValue(buildPaymentOrder());
      ordersRepository.save.mockImplementation(async (o: any) => o);

      const result = await service.updatePaymentStatus(
        'o',
        PaymentStatus.PAY_ON_DELIVERY,
        adminUser,
      );

      expect(result.paymentStatus).toBe(PaymentStatus.PAY_ON_DELIVERY);
    });

    it('refuse un tiers non lié à la course', async () => {
      ordersRepository.findOne.mockResolvedValue(buildPaymentOrder());
      const stranger = {
        id: 'stranger-1',
        role: UserRole.CLIENT,
        firstName: 'X',
        lastName: 'Y',
        phone: '+22890000099',
      };

      await expect(
        service.updatePaymentStatus('o', PaymentStatus.PAID, stranger),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(ordersRepository.save).not.toHaveBeenCalled();
    });

    it('throw NotFoundException si la commande est introuvable', async () => {
      ordersRepository.findOne.mockResolvedValue(null);
      await expect(
        service.updatePaymentStatus('missing', PaymentStatus.PAID, adminUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('diffuse le changement de paiement par socket aux parties (client, livreur, commerçant)', async () => {
      ordersRepository.findOne.mockResolvedValue(buildPaymentOrder());
      ordersRepository.save.mockImplementation(async (o: any) => o);

      await service.updatePaymentStatus('o', PaymentStatus.PAID, clientUser);

      expect(gateway.broadcastPaymentUpdate).toHaveBeenCalledWith(
        'o',
        PaymentStatus.PAID,
        clientUser.id,
        livreurUser.id,
        merchantUser.id,
      );
    });

    it('ne diffuse PAS de paiement si la mise à jour est refusée (tiers)', async () => {
      ordersRepository.findOne.mockResolvedValue(buildPaymentOrder());
      const stranger = {
        id: 'stranger-1',
        role: UserRole.CLIENT,
        firstName: 'X',
        lastName: 'Y',
        phone: '+22890000099',
      };

      await expect(
        service.updatePaymentStatus('o', PaymentStatus.PAID, stranger),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(gateway.broadcastPaymentUpdate).not.toHaveBeenCalled();
    });
  });

  describe('findAvailableDriversForActor', () => {
    const driverA = {
      id: 'driver-a',
      firstName: 'Anna',
      lastName: 'A',
      vehicle: { type: 'MOTO' },
      status: UserStatus.ACTIVE,
      isAvailable: true,
    };
    const driverB = {
      id: 'driver-b',
      firstName: 'Ben',
      lastName: 'B',
      vehicle: null,
      status: UserStatus.ACTIVE,
      isAvailable: true,
    };
    const driverC = {
      id: 'driver-c',
      firstName: 'Cid',
      lastName: 'C',
      vehicle: null,
      status: UserStatus.ACTIVE,
      isAvailable: true,
    };

    it('sans coordonnées : renvoie tous les livreurs disponibles sans distance', async () => {
      usersService.findAvailableDrivers.mockResolvedValue([driverA, driverB]);

      const result = await service.findAvailableDriversForActor(clientUser);

      expect(result).toHaveLength(2);
      expect(result.every((d) => d.distanceKm === null)).toBe(true);
      expect(positionsService.findLatestForLivreur).not.toHaveBeenCalled();
    });

    it('avec coordonnées : calcule la distance et trie par distance croissante (sans position en fin)', async () => {
      usersService.findAvailableDrivers.mockResolvedValue([
        driverA,
        driverB,
        driverC,
      ]);
      // driverA loin (~50km), driverB proche (~1km), driverC sans position
      positionsService.findLatestForLivreur.mockImplementation(
        async (id: string) => {
          if (id === driverA.id) return { lat: 6.6, lng: 1.22 };
          if (id === driverB.id) return { lat: 6.135, lng: 1.225 };
          return null;
        },
      );

      const result = await service.findAvailableDriversForActor(
        clientUser,
        6.13,
        1.22,
      );

      expect(result.map((d) => d.id)).toEqual([
        driverB.id,
        driverA.id,
        driverC.id,
      ]);
      expect(result[0].distanceKm).toBeLessThan(result[1].distanceKm!);
      expect(result[2].distanceKm).toBeNull();
    });

    it('COMMERCANT : place ses livreurs affiliés en tête avec isAffiliated=true', async () => {
      usersService.findAvailableDrivers.mockResolvedValue([driverA, driverB]);
      merchantDriversService.listDriversForMerchant.mockResolvedValue([
        { ...driverB, status: 'ACTIVE' },
      ]);

      const result = await service.findAvailableDriversForActor(merchantUser);

      expect(
        merchantDriversService.listDriversForMerchant,
      ).toHaveBeenCalledWith(merchantUser.id);
      expect(result[0].id).toBe(driverB.id);
      expect(result[0].isAffiliated).toBe(true);
      expect(result[1].isAffiliated).toBe(false);
    });

    it('non-COMMERCANT : n’appelle pas listDriversForMerchant (tous isAffiliated=false)', async () => {
      usersService.findAvailableDrivers.mockResolvedValue([driverA]);

      const result = await service.findAvailableDriversForActor(clientUser);

      expect(
        merchantDriversService.listDriversForMerchant,
      ).not.toHaveBeenCalled();
      expect(result[0].isAffiliated).toBe(false);
    });

    it('exclut les livreurs suspendus, indisponibles ou déjà engagés sur une autre course', async () => {
      usersService.findAvailableDrivers.mockResolvedValue([
        driverA,
        { ...driverB, status: UserStatus.SUSPENDED },
        { ...driverC, isAvailable: false },
        {
          id: 'driver-busy',
          firstName: 'Busy',
          lastName: 'Driver',
          vehicle: null,
          status: UserStatus.ACTIVE,
          isAvailable: true,
        },
      ]);
      ordersRepository.__getRawMany.mockResolvedValue([
        { livreurId: 'driver-busy' },
      ]);

      const result = await service.findAvailableDriversForActor(clientUser);

      expect(result.map((driver) => driver.id)).toEqual([driverA.id]);
      expect(ordersRepository.__getRawMany).toHaveBeenCalled();
    });
  });

  describe('assignPreferredLivreur', () => {
    it('autorise le commerçant propriétaire à réassigner une course PENDING', async () => {
      ordersRepository.findOne
        .mockResolvedValueOnce({
          id: 'ord-assign',
          status: OrderStatus.PENDING,
          livreur: null,
          preferredLivreur: null,
          merchant: { id: merchantUser.id },
        })
        .mockResolvedValueOnce(null);
      usersService.findOne.mockResolvedValue({
        ...livreurUser,
        driverApprovalStatus: 'APPROVED',
        status: UserStatus.ACTIVE,
        isAvailable: true,
      });
      ordersRepository.save.mockImplementation(async (order: any) => order);

      const result = await service.assignPreferredLivreur(
        'ord-assign',
        livreurUser.id,
        merchantUser,
      );

      expect(result.preferredLivreur).toEqual(
        expect.objectContaining({ id: livreurUser.id }),
      );
      expect(gateway.broadcastNewOrder).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'ord-assign' }),
        new Set([livreurUser.id]),
      );
    });

    it('refuse un commerçant qui n’est pas propriétaire de la course', async () => {
      ordersRepository.findOne.mockResolvedValue({
        id: 'ord-assign',
        status: OrderStatus.PENDING,
        livreur: null,
        preferredLivreur: null,
        merchant: { id: merchantUser.id },
      });

      await expect(
        service.assignPreferredLivreur('ord-assign', livreurUser.id, {
          ...merchantUser,
          id: 'merchant-other',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(ordersRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('searchMerchantClients', () => {
    it('délègue à UsersService.searchClients et renvoie un payload compact', async () => {
      usersService.searchClients.mockResolvedValue([
        {
          id: clientUser.id,
          firstName: clientUser.firstName,
          lastName: clientUser.lastName,
          phone: clientUser.phone,
        },
      ]);

      const result = await service.searchMerchantClients('ali', 5);

      expect(usersService.searchClients).toHaveBeenCalledWith('ali', 5);
      expect(result).toEqual([
        {
          id: clientUser.id,
          firstName: clientUser.firstName,
          lastName: clientUser.lastName,
          phone: clientUser.phone,
        },
      ]);
    });
  });

  // ── Priorité 1 (CDC V1) : historique des statuts de livraison ────────────

  describe('historisation — DeliveryStatusHistory', () => {
    const dto = {
      pickupAddress: 'A',
      pickupLat: 6.1319,
      pickupLng: 1.2228,
      deliveryAddress: 'B',
      deliveryLat: 6.1725,
      deliveryLng: 1.2314,
      description: 'colis',
    };

    beforeEach(() => {
      mockedAxios.get.mockResolvedValue({
        data: {
          features: [{ properties: { summary: { distance: 3000 } } }],
        },
      });
    });

    it('createOrder : journalise oldStatus=null → newStatus=PENDING, changedBy=null', async () => {
      usersService.findOne.mockResolvedValue(clientUser);
      ordersRepository.save.mockImplementation(async (o: any) => ({
        id: 'ord-hist-1',
        ...o,
      }));

      await service.createOrder(clientUser.id, dto);
      await new Promise((r) => setImmediate(r));

      expect(statusHistoryRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          deliveryId: 'ord-hist-1',
          oldStatus: null,
          newStatus: OrderStatus.PENDING,
          changedBy: null,
        }),
      );
      expect(statusHistoryRepository.save).toHaveBeenCalled();
    });

    it('createMerchantOrder : journalise oldStatus=null → newStatus=PENDING', async () => {
      usersService.findOne.mockResolvedValue(merchantUser);
      usersService.findByPhone.mockResolvedValue(null);
      ordersRepository.save.mockImplementation(async (o: any) => ({
        id: 'ord-hist-merch',
        ...o,
      }));

      await service.createMerchantOrder(merchantUser.id, {
        ...dto,
        clientPhone: '+22899999999',
      } as any);
      await new Promise((r) => setImmediate(r));

      expect(statusHistoryRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          deliveryId: 'ord-hist-merch',
          oldStatus: null,
          newStatus: OrderStatus.PENDING,
        }),
      );
    });

    it('acceptOrder : journalise PENDING → ACCEPTED avec changedBy=livreurId', async () => {
      ordersRepository.findOne.mockImplementation(async (query: any) => {
        if (query?.where?.livreur) return null; // pas de course active
        return {
          id: 'ord-accept-hist',
          status: OrderStatus.PENDING,
          client: { id: clientUser.id },
        };
      });
      ordersRepository.__updateExecute.mockResolvedValue({ affected: 1 });
      usersService.findOne.mockResolvedValue(livreurUser);

      await service.acceptOrder('ord-accept-hist', livreurUser.id);
      await new Promise((r) => setImmediate(r));

      expect(statusHistoryRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          deliveryId: 'ord-accept-hist',
          oldStatus: OrderStatus.PENDING,
          newStatus: OrderStatus.ACCEPTED,
          changedBy: livreurUser.id,
        }),
      );
    });

    it('updateStatus : journalise oldStatus → newStatus avec changedBy=actor.id', async () => {
      ordersRepository.findOne.mockResolvedValue({
        id: 'ord-status-hist',
        status: OrderStatus.ACCEPTED,
        client: { id: clientUser.id },
        livreur: { id: livreurUser.id },
      });
      ordersRepository.save.mockImplementation(async (o: any) => o);

      await service.updateStatus(
        'ord-status-hist',
        OrderStatus.IN_PROGRESS,
        livreurUser,
      );
      await new Promise((r) => setImmediate(r));

      expect(statusHistoryRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          deliveryId: 'ord-status-hist',
          oldStatus: OrderStatus.ACCEPTED,
          newStatus: OrderStatus.IN_PROGRESS,
          changedBy: livreurUser.id,
        }),
      );
    });

    it('updateStatus : journalise la cancellationReason quand CANCELLED', async () => {
      ordersRepository.findOne.mockResolvedValue({
        id: 'ord-cancel-hist',
        status: OrderStatus.PENDING,
        client: { id: clientUser.id },
        livreur: null,
      });
      ordersRepository.save.mockImplementation(async (o: any) => o);

      await service.updateStatus(
        'ord-cancel-hist',
        OrderStatus.CANCELLED,
        clientUser,
        {
          status: OrderStatus.CANCELLED,
          cancellationReason: 'Changement de plan',
        },
      );
      await new Promise((r) => setImmediate(r));

      expect(statusHistoryRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          oldStatus: OrderStatus.PENDING,
          newStatus: OrderStatus.CANCELLED,
          reason: 'Changement de plan',
        }),
      );
    });

    it('ne bloque pas updateStatus si l’insertion de l’historique échoue (fire-and-forget robuste)', async () => {
      ordersRepository.findOne.mockResolvedValue({
        id: 'ord-fail-hist',
        status: OrderStatus.ACCEPTED,
        client: { id: clientUser.id },
        livreur: { id: livreurUser.id },
      });
      ordersRepository.save.mockImplementation(async (o: any) => o);
      statusHistoryRepository.save.mockRejectedValue(new Error('DB down'));

      const result = await service.updateStatus(
        'ord-fail-hist',
        OrderStatus.IN_PROGRESS,
        livreurUser,
      );
      await new Promise((r) => setImmediate(r));

      expect(result.status).toBe(OrderStatus.IN_PROGRESS);
    });
  });

  describe('getStatusHistory', () => {
    const buildOrder = () => ({
      id: 'o',
      client: { id: clientUser.id },
      livreur: { id: livreurUser.id },
      merchant: { id: merchantUser.id },
    });

    it('renvoie l’historique trié ASC pour le client de la course', async () => {
      ordersRepository.findOne.mockResolvedValue(buildOrder());
      const rows = [{ id: 'h1' }, { id: 'h2' }];
      statusHistoryRepository.find.mockResolvedValue(rows);

      const result = await service.getStatusHistory('o', clientUser);

      expect(result).toBe(rows);
      expect(statusHistoryRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deliveryId: 'o' },
          order: { createdAt: 'ASC' },
        }),
      );
    });

    it('autorisé pour le livreur assigné', async () => {
      ordersRepository.findOne.mockResolvedValue(buildOrder());
      statusHistoryRepository.find.mockResolvedValue([]);
      await expect(service.getStatusHistory('o', livreurUser)).resolves.toEqual(
        [],
      );
    });

    it('autorisé pour le commerçant créateur', async () => {
      ordersRepository.findOne.mockResolvedValue(buildOrder());
      statusHistoryRepository.find.mockResolvedValue([]);
      await expect(
        service.getStatusHistory('o', merchantUser),
      ).resolves.toEqual([]);
    });

    it('autorisé pour un admin', async () => {
      ordersRepository.findOne.mockResolvedValue(buildOrder());
      statusHistoryRepository.find.mockResolvedValue([]);
      await expect(service.getStatusHistory('o', adminUser)).resolves.toEqual(
        [],
      );
    });

    it('refuse un tiers non lié à la course', async () => {
      ordersRepository.findOne.mockResolvedValue(buildOrder());
      const stranger = { id: 'stranger-1', role: UserRole.CLIENT };
      await expect(
        service.getStatusHistory('o', stranger),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throw NotFoundException si la commande est introuvable', async () => {
      ordersRepository.findOne.mockResolvedValue(null);
      await expect(
        service.getStatusHistory('missing', adminUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── Priorité 1 (CDC V1 §6.3) : traçabilité du prix ────────────────────────

  describe('traçabilité du prix — estimatedPrice / priceWasManuallyAdjusted / PriceChange', () => {
    const dto = {
      pickupAddress: 'Boutique A',
      pickupLat: 6.1319,
      pickupLng: 1.2228,
      deliveryAddress: 'Domicile client',
      deliveryLat: 6.1725,
      deliveryLng: 1.2314,
      description: 'colis',
    };

    beforeEach(() => {
      mockedAxios.get.mockResolvedValue({
        data: {
          features: [{ properties: { summary: { distance: 3000 } } }],
        },
      });
    });

    it('createOrder (client) : estimatedPrice = priceFcfa = calcul auto, priceWasManuallyAdjusted=false', async () => {
      usersService.findOne.mockResolvedValue(clientUser);
      ordersRepository.save.mockImplementation(async (o: any) => ({
        id: 'ord-price-1',
        ...o,
      }));

      await service.createOrder(clientUser.id, dto);

      expect(ordersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          priceFcfa: 600,
          estimatedPrice: 600,
          priceWasManuallyAdjusted: false,
        }),
      );
    });

    it('createMerchantOrder sans priceFcfa manuel : estimatedPrice = priceFcfa, priceWasManuallyAdjusted=false', async () => {
      usersService.findOne.mockResolvedValue(merchantUser);
      usersService.findByPhone.mockResolvedValue(null);
      ordersRepository.save.mockImplementation(async (o: any) => ({
        id: 'ord-price-2',
        ...o,
      }));

      await service.createMerchantOrder(merchantUser.id, {
        ...dto,
        clientPhone: '+22899999999',
      } as any);

      expect(ordersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          priceFcfa: 600,
          estimatedPrice: 600,
          priceWasManuallyAdjusted: false,
        }),
      );
      expect(priceChangeRepository.save).not.toHaveBeenCalled();
    });

    it('createMerchantOrder avec priceFcfa manuel différent : estimatedPrice≠priceFcfa, priceWasManuallyAdjusted=true, PriceChange créé', async () => {
      usersService.findOne.mockResolvedValue(merchantUser);
      usersService.findByPhone.mockResolvedValue(null);
      ordersRepository.save.mockImplementation(async (o: any) => ({
        id: 'ord-price-3',
        ...o,
      }));

      await service.createMerchantOrder(merchantUser.id, {
        ...dto,
        clientPhone: '+22899999999',
        priceFcfa: 999,
        priceReason: 'Négociation client',
      } as any);
      await new Promise((r) => setImmediate(r));

      expect(ordersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          priceFcfa: 999,
          estimatedPrice: 600,
          priceWasManuallyAdjusted: true,
        }),
      );
      expect(priceChangeRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          deliveryId: 'ord-price-3',
          oldPrice: 600,
          newPrice: 999,
          changedBy: merchantUser.id,
          reason: 'Négociation client',
        }),
      );
    });

    it('createMerchantOrder avec priceFcfa manuel EGAL au calcul auto : pas d’ajustement, pas de PriceChange', async () => {
      usersService.findOne.mockResolvedValue(merchantUser);
      usersService.findByPhone.mockResolvedValue(null);
      ordersRepository.save.mockImplementation(async (o: any) => ({
        id: 'ord-price-4',
        ...o,
      }));

      await service.createMerchantOrder(merchantUser.id, {
        ...dto,
        clientPhone: '+22899999999',
        priceFcfa: 600, // égal au calcul auto
      } as any);
      await new Promise((r) => setImmediate(r));

      expect(ordersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          priceFcfa: 600,
          estimatedPrice: 600,
          priceWasManuallyAdjusted: false,
        }),
      );
      expect(priceChangeRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('updatePrice (PATCH /orders/:id/price)', () => {
    const buildOrder = (status: OrderStatus, overrides: any = {}) => ({
      id: 'o',
      status,
      priceFcfa: 600,
      merchant: { id: merchantUser.id },
      ...overrides,
    });

    it('autorisé pour le commerçant créateur : met à jour priceFcfa + priceWasManuallyAdjusted + journalise', async () => {
      ordersRepository.findOne.mockResolvedValue(
        buildOrder(OrderStatus.ACCEPTED),
      );
      ordersRepository.save.mockImplementation(async (o: any) => o);

      const result = await service.updatePrice(
        'o',
        800,
        merchantUser,
        'Ajustement demandé',
      );

      expect(result.priceFcfa).toBe(800);
      expect(result.priceWasManuallyAdjusted).toBe(true);
      expect(priceChangeRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          deliveryId: 'o',
          oldPrice: 600,
          newPrice: 800,
          changedBy: merchantUser.id,
          reason: 'Ajustement demandé',
        }),
      );
    });

    it('autorisé pour un admin', async () => {
      ordersRepository.findOne.mockResolvedValue(
        buildOrder(OrderStatus.PENDING),
      );
      ordersRepository.save.mockImplementation(async (o: any) => o);

      const result = await service.updatePrice('o', 700, adminUser);
      expect(result.priceFcfa).toBe(700);
    });

    it('refuse un tiers non lié (ni commerçant créateur, ni admin)', async () => {
      ordersRepository.findOne.mockResolvedValue(
        buildOrder(OrderStatus.PENDING),
      );
      await expect(
        service.updatePrice('o', 700, clientUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(ordersRepository.save).not.toHaveBeenCalled();
    });

    it.each([OrderStatus.COMPLETED, OrderStatus.CANCELLED, OrderStatus.FAILED])(
      'refuse si la course est terminale (%s)',
      async (status) => {
        ordersRepository.findOne.mockResolvedValue(buildOrder(status));
        await expect(
          service.updatePrice('o', 700, merchantUser),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(ordersRepository.save).not.toHaveBeenCalled();
      },
    );

    it('throw NotFoundException si la commande est introuvable', async () => {
      ordersRepository.findOne.mockResolvedValue(null);
      await expect(
        service.updatePrice('missing', 700, adminUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── Priorité 1 (CDC V1 §5.2, §18.13) : historique de paiement ─────────────

  describe('historisation — PaymentStatusHistory', () => {
    const buildPaymentOrder = () => ({
      id: 'o',
      status: OrderStatus.COMPLETED,
      paymentStatus: PaymentStatus.UNPAID,
      client: { id: clientUser.id },
      livreur: { id: livreurUser.id },
      merchant: { id: merchantUser.id },
    });

    it('updatePaymentStatus : journalise oldStatus → newStatus avec changedBy', async () => {
      ordersRepository.findOne.mockResolvedValue(buildPaymentOrder());
      ordersRepository.save.mockImplementation(async (o: any) => o);

      await service.updatePaymentStatus('o', PaymentStatus.PAID, clientUser);
      await new Promise((r) => setImmediate(r));

      expect(paymentHistoryRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          deliveryId: 'o',
          oldStatus: PaymentStatus.UNPAID,
          newStatus: PaymentStatus.PAID,
          changedBy: clientUser.id,
        }),
      );
    });

    it('accepte les nouvelles valeurs CASH_ON_DELIVERY et REFUNDED', async () => {
      ordersRepository.findOne.mockResolvedValue({
        ...buildPaymentOrder(),
        status: OrderStatus.COMPLETED,
      });
      ordersRepository.save.mockImplementation(async (o: any) => o);

      const result = await service.updatePaymentStatus(
        'o',
        PaymentStatus.CASH_ON_DELIVERY,
        livreurUser,
      );
      expect(result.paymentStatus).toBe(PaymentStatus.CASH_ON_DELIVERY);

      ordersRepository.findOne.mockResolvedValue({
        ...buildPaymentOrder(),
        paymentStatus: PaymentStatus.PAID,
      });
      const refunded = await service.updatePaymentStatus(
        'o',
        PaymentStatus.REFUNDED,
        adminUser,
      );
      expect(refunded.paymentStatus).toBe(PaymentStatus.REFUNDED);
    });

    it('refuse un paiement cash confirmé avant la fin de course', async () => {
      ordersRepository.findOne.mockResolvedValue({
        ...buildPaymentOrder(),
        status: OrderStatus.ACCEPTED,
      });

      await expect(
        service.updatePaymentStatus(
          'o',
          PaymentStatus.CASH_ON_DELIVERY,
          livreurUser,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuse au client de marquer payé avant COMPLETED', async () => {
      ordersRepository.findOne.mockResolvedValue({
        ...buildPaymentOrder(),
        status: OrderStatus.ACCEPTED,
      });

      await expect(
        service.updatePaymentStatus('o', PaymentStatus.PAID, clientUser),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuse au commerçant les statuts de paiement arbitraires', async () => {
      ordersRepository.findOne.mockResolvedValue({
        ...buildPaymentOrder(),
        status: OrderStatus.COMPLETED,
      });

      await expect(
        service.updatePaymentStatus(
          'o',
          PaymentStatus.CASH_ON_DELIVERY,
          merchantUser,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('ne bloque pas updatePaymentStatus si l’insertion de l’historique échoue', async () => {
      ordersRepository.findOne.mockResolvedValue(buildPaymentOrder());
      ordersRepository.save.mockImplementation(async (o: any) => o);
      paymentHistoryRepository.save.mockRejectedValue(new Error('DB down'));

      const result = await service.updatePaymentStatus(
        'o',
        PaymentStatus.PAID,
        clientUser,
      );
      await new Promise((r) => setImmediate(r));

      expect(result.paymentStatus).toBe(PaymentStatus.PAID);
    });
  });

  describe('getPaymentHistory', () => {
    const buildOrder = () => ({
      id: 'o',
      client: { id: clientUser.id },
      livreur: { id: livreurUser.id },
      merchant: { id: merchantUser.id },
    });

    it('renvoie l’historique trié ASC pour le livreur assigné', async () => {
      ordersRepository.findOne.mockResolvedValue(buildOrder());
      const rows = [{ id: 'p1' }];
      paymentHistoryRepository.find.mockResolvedValue(rows);

      const result = await service.getPaymentHistory('o', livreurUser);

      expect(result).toBe(rows);
      expect(paymentHistoryRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deliveryId: 'o' },
          order: { createdAt: 'ASC' },
        }),
      );
    });

    it('refuse un tiers non lié à la course', async () => {
      ordersRepository.findOne.mockResolvedValue(buildOrder());
      const stranger = { id: 'stranger-1', role: UserRole.CLIENT };
      await expect(
        service.getPaymentHistory('o', stranger),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throw NotFoundException si la commande est introuvable', async () => {
      ordersRepository.findOne.mockResolvedValue(null);
      await expect(
        service.getPaymentHistory('missing', adminUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
