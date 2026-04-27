/**
 * E2E test for the orders flow.
 *
 * Strategy: we build the HTTP pipeline (controllers + services + guards + JWT)
 * WITHOUT TypeORM/MySQL/SQLite. Repositories are replaced with in-memory
 * implementations via `getRepositoryToken()`. Axios is mocked globally so the
 * OSRM route distance is deterministic (3 km → 450 FCFA).
 *
 * This mirrors a real HTTP run (register → create order → accept → progress
 * → complete → second livreur tries to accept) while keeping the test hermetic.
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { getRepositoryToken } from '@nestjs/typeorm';
import request = require('supertest');
import axios from 'axios';

import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { OrdersController } from '../src/orders/orders.controller';
import { OrdersService } from '../src/orders/orders.service';
import { OrdersGateway } from '../src/orders/orders.gateway';
import { UsersService } from '../src/users/users.service';
import { User, UserRole } from '../src/entities/user.entity';
import { Vehicle } from '../src/entities/vehicle.entity';
import {
  DeliveryOrder,
  OrderStatus,
} from '../src/entities/delivery-order.entity';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

/**
 * Minimal in-memory repository that covers what services & JWT strategy call:
 * find, findOne, save, create, update.
 */
function makeInMemoryRepo<T extends { id?: string }>() {
  const store = new Map<string, T>();
  let seq = 0;
  const nextId = () => `id-${++seq}`;

  const matches = (entity: any, where: any): boolean => {
    if (!where) return true;
    if (Array.isArray(where)) return where.some((w) => matches(entity, w));
    return Object.entries(where).every(([k, v]) => {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        // nested relation filter like { client: { id: '...' } }
        return matches(entity[k], v);
      }
      return entity[k] === v;
    });
  };

  return {
    _store: store,
    create: jest.fn((data: Partial<T>) => ({ ...(data as any) })),
    save: jest.fn(async (entity: any) => {
      const withId: T = entity.id ? entity : { ...entity, id: nextId() };
      store.set((withId as any).id, withId);
      return withId;
    }),
    findOne: jest.fn(async (opts: any) => {
      for (const v of store.values()) {
        if (matches(v, opts?.where)) return v;
      }
      return null;
    }),
    find: jest.fn(async (opts: any) => {
      const out: any[] = [];
      for (const v of store.values()) {
        if (matches(v, opts?.where)) out.push(v);
      }
      return out;
    }),
    update: jest.fn(async (id: string, patch: any) => {
      const cur = store.get(id);
      if (cur) store.set(id, { ...cur, ...patch });
      return { affected: 1 };
    }),
  };
}

describe('Orders (e2e)', () => {
  let app: INestApplication;
  let usersRepo: ReturnType<typeof makeInMemoryRepo<User>>;
  let vehiclesRepo: ReturnType<typeof makeInMemoryRepo<Vehicle>>;
  let ordersRepo: ReturnType<typeof makeInMemoryRepo<DeliveryOrder>>;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
    mockedAxios.get.mockResolvedValue({
      data: { routes: [{ distance: 3000 }] },
    });

    usersRepo = makeInMemoryRepo<User>();
    vehiclesRepo = makeInMemoryRepo<Vehicle>();
    ordersRepo = makeInMemoryRepo<DeliveryOrder>();

    // Stub gateway so we do not need socket.io infrastructure
    const fakeGateway = {
      broadcastNewOrder: jest.fn(),
      broadcastOrderAccepted: jest.fn(),
      broadcastStatusUpdate: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({
          secret: process.env.JWT_SECRET,
          signOptions: { expiresIn: '7d' },
        }),
      ],
      controllers: [AuthController, OrdersController],
      providers: [
        AuthService,
        UsersService,
        OrdersService,
        JwtStrategy,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: OrdersGateway, useValue: fakeGateway },
        { provide: getRepositoryToken(User), useValue: usersRepo },
        { provide: getRepositoryToken(Vehicle), useValue: vehiclesRepo },
        { provide: getRepositoryToken(DeliveryOrder), useValue: ordersRepo },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  // Shared state between steps
  let clientToken: string;
  let livreurToken: string;
  let secondLivreurToken: string;
  let orderId: string;

  it('POST /auth/register — client → 201 + token', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        firstName: 'Alice',
        lastName: 'Client',
        phone: '+22890000001',
        password: 'secret123',
        role: UserRole.CLIENT,
      })
      .expect(201);

    expect(res.body.access_token).toBeDefined();
    expect(res.body.user.role).toBe(UserRole.CLIENT);
    clientToken = res.body.access_token;
  });

  it('POST /auth/register — livreur (MOTO) → 201 + token', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        firstName: 'Bob',
        lastName: 'Livreur',
        phone: '+22890000002',
        password: 'secret123',
        role: UserRole.LIVREUR,
        vehicleType: 'MOTO',
      })
      .expect(201);

    expect(res.body.access_token).toBeDefined();
    expect(res.body.user.role).toBe(UserRole.LIVREUR);
    livreurToken = res.body.access_token;
  });

  it('POST /auth/register — second livreur → 201 + token', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        firstName: 'Charlie',
        lastName: 'Livreur2',
        phone: '+22890000003',
        password: 'secret123',
        role: UserRole.LIVREUR,
        vehicleType: 'MOTO',
      })
      .expect(201);
    secondLivreurToken = res.body.access_token;
  });

  it('POST /orders (client) → 201, prix calculé', async () => {
    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        pickupAddress: 'Lomé Centre',
        pickupLat: 6.1319,
        pickupLng: 1.2228,
        deliveryAddress: 'Lomé Agoè',
        deliveryLat: 6.1725,
        deliveryLng: 1.2314,
        description: 'Documents',
      })
      .expect(201);

    // 3000 m → 3 km → 3 * 150 = 450
    expect(Number(res.body.priceFcfa)).toBe(450);
    expect(res.body.status).toBe(OrderStatus.PENDING);
    orderId = res.body.id;
  });

  it('GET /orders (livreur) — retourne la commande', async () => {
    const res = await request(app.getHttpServer())
      .get('/orders')
      .set('Authorization', `Bearer ${livreurToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((o: any) => o.id === orderId)).toBe(true);
  });

  it('POST /orders/:id/accept (livreur) → 201, status ACCEPTED', async () => {
    const res = await request(app.getHttpServer())
      .post(`/orders/${orderId}/accept`)
      .set('Authorization', `Bearer ${livreurToken}`)
      .expect(201);

    expect(res.body.status).toBe(OrderStatus.ACCEPTED);
  });

  it('PATCH /orders/:id/status → IN_PROGRESS (livreur) → 200', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${livreurToken}`)
      .send({ status: OrderStatus.IN_PROGRESS })
      .expect(200);

    expect(res.body.status).toBe(OrderStatus.IN_PROGRESS);
  });

  it('PATCH /orders/:id/status → COMPLETED (livreur) → 200', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${livreurToken}`)
      .send({ status: OrderStatus.COMPLETED })
      .expect(200);

    expect(res.body.status).toBe(OrderStatus.COMPLETED);
  });

  it('Second livreur qui essaie d’accepter après coup → 409', async () => {
    await request(app.getHttpServer())
      .post(`/orders/${orderId}/accept`)
      .set('Authorization', `Bearer ${secondLivreurToken}`)
      .expect(409);
  });
});
