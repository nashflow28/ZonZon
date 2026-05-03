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
import { DeliveryOrder, OrderStatus } from '../entities/delivery-order.entity';
import { UserRole } from '../entities/user.entity';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const mockRepo = () => {
  const updateExecute = jest.fn();
  const qb: any = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: updateExecute,
  };
  return {
    find: jest.fn(),
    findAndCount: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn((fn: any) => fn),
    update: jest.fn(),
    createQueryBuilder: jest.fn(() => qb),
    __qb: qb,
    __updateExecute: updateExecute,
  };
};

const clientUser = {
  id: 'client-1',
  role: UserRole.CLIENT,
  firstName: 'Alice',
  lastName: 'Client',
  phone: '+22890000001',
};
const livreurUser = {
  id: 'livreur-1',
  role: UserRole.LIVREUR,
  firstName: 'Bob',
  lastName: 'Livreur',
  phone: '+22890000002',
};
const adminUser = {
  id: 'admin-1',
  role: UserRole.ADMIN,
  firstName: 'Admin',
  lastName: 'Root',
  phone: '+22890000003',
};

describe('OrdersService', () => {
  let service: OrdersService;
  let ordersRepository: ReturnType<typeof mockRepo>;
  let usersService: {
    findOne: jest.Mock;
    findLivreursWithFcmToken: jest.Mock;
  };
  let gateway: {
    broadcastNewOrder: jest.Mock;
    broadcastOrderAccepted: jest.Mock;
    broadcastStatusUpdate: jest.Mock;
    isUserConnected: jest.Mock;
  };
  let notifications: { sendToUser: jest.Mock };
  let positionsService: {
    upsertPosition: jest.Mock;
    findRecentLivreurPositions: jest.Mock;
    findLatestForLivreur: jest.Mock;
  };
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
    usersService = {
      findOne: jest.fn(),
      findLivreursWithFcmToken: jest.fn().mockResolvedValue([]),
    } as any;
    gateway = {
      broadcastNewOrder: jest.fn(),
      broadcastOrderAccepted: jest.fn(),
      broadcastStatusUpdate: jest.fn(),
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: getRepositoryToken(DeliveryOrder),
          useValue: ordersRepository,
        },
        { provide: UsersService, useValue: usersService },
        { provide: OrdersGateway, useValue: gateway },
        { provide: NotificationsService, useValue: notifications },
        { provide: PositionsService, useValue: positionsService },
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

    it('calcule un prix = distance × 150 arrondi, sauvegarde et broadcast', async () => {
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

      // distance 3km → price = 3 * 150 = 450
      expect(ordersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          priceFcfa: 450,
          distanceKm: 3,
          status: OrderStatus.PENDING,
        }),
      );
      expect(ordersRepository.save).toHaveBeenCalled();
      expect(gateway.broadcastNewOrder).toHaveBeenCalledWith(result);
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
          priceFcfa: 75, // 0.5 * 150
        }),
      );
    });

    it('rejette si l’utilisateur n’est pas un client', async () => {
      usersService.findOne.mockResolvedValue(livreurUser);
      await expect(
        service.createOrder(livreurUser.id, dto as any),
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
      // price = distance * 150 rounded
      expect(createdArg.priceFcfa).toBe(
        Math.round(createdArg.distanceKm * 150),
      );
    });
  });

  describe('acceptOrder', () => {
    it('passe PENDING → ACCEPTED via UPDATE atomique', async () => {
      // 1er findOne : check d'existence (avant UPDATE)
      // 2e findOne : reload après UPDATE pour broadcast/notif
      ordersRepository.findOne
        .mockResolvedValueOnce({
          id: 'ord-1',
          status: OrderStatus.PENDING,
          client: { id: clientUser.id },
        })
        .mockResolvedValueOnce({
          id: 'ord-1',
          status: OrderStatus.ACCEPTED,
          client: { id: clientUser.id },
          livreur: livreurUser,
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
      );
    });

    it('throw ConflictException si UPDATE n’affecte aucune ligne (déjà prise)', async () => {
      ordersRepository.findOne.mockResolvedValueOnce({
        id: 'o',
        status: OrderStatus.ACCEPTED,
        client: { id: clientUser.id },
      });
      ordersRepository.__updateExecute.mockResolvedValue({ affected: 0 });
      await expect(
        service.acceptOrder('o', livreurUser.id),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(ordersRepository.save).not.toHaveBeenCalled();
    });

    it('throw NotFoundException si introuvable', async () => {
      ordersRepository.findOne.mockResolvedValue(null);
      await expect(
        service.acceptOrder('o', livreurUser.id),
      ).rejects.toBeInstanceOf(NotFoundException);
      // L'UPDATE ne doit pas être tenté si l'order n'existe pas
      expect(ordersRepository.__updateExecute).not.toHaveBeenCalled();
    });

    it('atomicité : 2 livreurs en concurrence → 1 seul gagne, l’autre reçoit ConflictException', async () => {
      const livreur2 = {
        id: 'livreur-2',
        role: UserRole.LIVREUR,
        firstName: 'Carl',
        lastName: 'Livreur2',
        phone: '+22890000004',
      };

      // Existence checks pour les 2 appels + reload pour le gagnant
      ordersRepository.findOne
        .mockResolvedValueOnce({
          id: 'ord-concurrent',
          status: OrderStatus.PENDING,
          client: { id: clientUser.id },
        })
        .mockResolvedValueOnce({
          id: 'ord-concurrent',
          status: OrderStatus.ACCEPTED,
          client: { id: clientUser.id },
          livreur: livreurUser,
        })
        .mockResolvedValueOnce({
          id: 'ord-concurrent',
          status: OrderStatus.ACCEPTED,
          client: { id: clientUser.id },
          livreur: livreurUser,
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
      );
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
      ordersRepository.findOne.mockResolvedValue(
        buildOrder(OrderStatus.ACCEPTED),
      );
      ordersRepository.save.mockImplementation(async (o: any) => o);
      const result = await service.updateStatus(
        'o',
        OrderStatus.IN_PROGRESS,
        livreurUser,
      );
      expect(result.status).toBe(OrderStatus.IN_PROGRESS);
      expect(gateway.broadcastStatusUpdate).toHaveBeenCalled();
    });

    it('permet IN_PROGRESS → COMPLETED par le livreur', async () => {
      ordersRepository.findOne.mockResolvedValue(
        buildOrder(OrderStatus.IN_PROGRESS),
      );
      ordersRepository.save.mockImplementation(async (o: any) => o);
      const result = await service.updateStatus(
        'o',
        OrderStatus.COMPLETED,
        livreurUser,
      );
      expect(result.status).toBe(OrderStatus.COMPLETED);
    });

    it('permet PENDING → CANCELLED par le client', async () => {
      ordersRepository.findOne.mockResolvedValue({
        ...buildOrder(OrderStatus.PENDING),
        livreur: null,
      });
      ordersRepository.save.mockImplementation(async (o: any) => o);
      const result = await service.updateStatus(
        'o',
        OrderStatus.CANCELLED,
        clientUser,
      );
      expect(result.status).toBe(OrderStatus.CANCELLED);
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

      await service.updateStatus(
        'o',
        OrderStatus.CANCELLED,
        clientUser,
      );

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

  describe('computeEta', () => {
    // Pickup à Lomé centre, delivery à ~5 km au nord.
    const pickupLat = 6.13;
    const pickupLng = 1.22;
    const deliveryLat = 6.18;
    const deliveryLng = 1.23;

    const buildOrder = (
      status: OrderStatus,
      withLivreur = true,
    ): any => ({
      id: 'ord-eta',
      status,
      pickupLat,
      pickupLng,
      deliveryLat,
      deliveryLng,
      client: { id: clientUser.id },
      livreur: withLivreur ? { id: livreurUser.id } : null,
    });

    it('ACCEPTED + position récente livreur → ETA livreur→pickup', async () => {
      ordersRepository.findOne.mockResolvedValue(buildOrder(OrderStatus.ACCEPTED));
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
      ordersRepository.findOne.mockResolvedValue(buildOrder(OrderStatus.ACCEPTED));
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
  });
});
