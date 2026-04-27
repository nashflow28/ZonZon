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
import { UsersService } from '../users/users.service';
import { DeliveryOrder, OrderStatus } from '../entities/delivery-order.entity';
import { UserRole } from '../entities/user.entity';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const mockRepo = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  save: jest.fn(),
  create: jest.fn((fn: any) => fn),
  update: jest.fn(),
});

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
  let usersService: { findOne: jest.Mock };
  let gateway: {
    broadcastNewOrder: jest.Mock;
    broadcastOrderAccepted: jest.Mock;
    broadcastStatusUpdate: jest.Mock;
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // Make setTimeout instant so retries do not slow the tests
    jest.spyOn(global, 'setTimeout').mockImplementation(((fn: any) => {
      fn();
      return 0 as any;
    }) as any);

    ordersRepository = mockRepo();
    usersService = { findOne: jest.fn() };
    gateway = {
      broadcastNewOrder: jest.fn(),
      broadcastOrderAccepted: jest.fn(),
      broadcastStatusUpdate: jest.fn(),
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
        data: { routes: [{ distance: 3000 }] },
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
        data: { routes: [{ distance: 100 }] },
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

    it('cache OSRM : le 2e appel avec les mêmes coords n’appelle pas axios', async () => {
      usersService.findOne.mockResolvedValue(clientUser);
      mockedAxios.get.mockResolvedValue({
        data: { routes: [{ distance: 3000 }] },
      });
      ordersRepository.save.mockImplementation(async (o: any) => ({
        id: 'o',
        ...o,
      }));

      await service.createOrder(clientUser.id, dto);
      await service.createOrder(clientUser.id, dto);

      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
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
    it('passe PENDING → ACCEPTED', async () => {
      const order: any = {
        id: 'ord-1',
        status: OrderStatus.PENDING,
        client: { id: clientUser.id },
      };
      ordersRepository.findOne.mockResolvedValue(order);
      usersService.findOne.mockResolvedValue(livreurUser);
      ordersRepository.save.mockImplementation(async (o: any) => o);

      const result = await service.acceptOrder('ord-1', livreurUser.id);
      expect(result.status).toBe(OrderStatus.ACCEPTED);
      expect(result.livreur).toEqual(livreurUser);
      expect(gateway.broadcastOrderAccepted).toHaveBeenCalledWith(
        'ord-1',
        livreurUser.id,
        clientUser.id,
      );
    });

    it('throw ConflictException si déjà ACCEPTED', async () => {
      ordersRepository.findOne.mockResolvedValue({
        id: 'o',
        status: OrderStatus.ACCEPTED,
        client: { id: clientUser.id },
      });
      await expect(
        service.acceptOrder('o', livreurUser.id),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throw NotFoundException si introuvable', async () => {
      ordersRepository.findOne.mockResolvedValue(null);
      await expect(
        service.acceptOrder('o', livreurUser.id),
      ).rejects.toBeInstanceOf(NotFoundException);
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
  });
});
