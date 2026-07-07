/**
 * Helpers partagés pour les tests e2e "hermétiques" (sans DB réelle).
 *
 * Stratégie (héritée de l'ancien `orders.e2e-spec.ts`) : on construit le
 * pipeline HTTP (controllers + services + guards + JWT) SANS TypeORM/MySQL.
 * Les repositories sont remplacés par des implémentations in-memory via
 * `getRepositoryToken()`. `axios` est mocké globalement (route OSRM/ORS
 * déterministe : ~3 km pour Lomé Centre → Agoè avec fallback Haversine).
 *
 * Ce fichier centralise :
 *  - `makeInMemoryRepo<T>()` : mini-repo TypeORM-like (find/findOne/save/
 *    create/update/delete/count/createQueryBuilder minimal).
 *  - `buildTestApp()` : assemble une app Nest complète avec tous les
 *    controllers/services nécessaires aux règles métier §21.4 (orders,
 *    users, merchant-drivers, auth), les vrais Guards (JwtAuthGuard +
 *    RolesGuard) et des stubs légers pour les services annexes
 *    (Notifications/Positions/Pricing) qui ne sont pas eux-mêmes la cible
 *    des tests.
 *  - `registerAndLogin()` : raccourci pour créer un user via /auth/register
 *    et récupérer son token.
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
import { UsersController } from '../src/users/users.controller';
import { UsersService } from '../src/users/users.service';
import { DeviceTokensService } from '../src/users/device-tokens.service';
import { MerchantDriversController } from '../src/merchant-drivers/merchant-drivers.controller';
import { MerchantDriversService } from '../src/merchant-drivers/merchant-drivers.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { PositionsService } from '../src/orders/positions.service';
import { PricingService } from '../src/pricing/pricing.service';
import { User, UserRole } from '../src/entities/user.entity';
import { Vehicle } from '../src/entities/vehicle.entity';
import { DeviceToken } from '../src/entities/device-token.entity';
import { MerchantDriver } from '../src/entities/merchant-driver.entity';
import { DriverPosition } from '../src/entities/driver-position.entity';
import { PricingConfig } from '../src/entities/pricing-config.entity';
import { DeliveryOrder } from '../src/entities/delivery-order.entity';
import { DeliveryStatusHistory } from '../src/entities/delivery-status-history.entity';
import { PriceChange } from '../src/entities/price-change.entity';
import { PaymentStatusHistory } from '../src/entities/payment-status-history.entity';

jest.mock('axios');
export const mockedAxios = axios as jest.Mocked<typeof axios>;

/**
 * Minimal in-memory repository that covers what services & JWT strategy call:
 * find, findOne, findAndCount, save, create, update, delete, count,
 * createQueryBuilder (subset used by OrdersService.acceptOrder + friends).
 */
export function makeInMemoryRepo<T extends { id?: string }>() {
  const store = new Map<string, T>();
  let seq = 0;
  // Génère un UUID v4 valide (certaines routes utilisent `ParseUUIDPipe`,
  // qui rejetterait un id du style `id-1`).
  const nextId = () => {
    seq++;
    const hex = seq.toString(16).padStart(12, '0');
    return `00000000-0000-4000-8000-${hex}`;
  };

  const matches = (entity: any, where: any): boolean => {
    if (!where) return true;
    if (Array.isArray(where)) return where.some((w) => matches(entity, w));
    return Object.entries(where).every(([k, v]) => {
      // TypeORM `FindOperator` (IsNull(), Not(...), MoreThanOrEqual(...)...)
      // expose un getter `.type` + `.value`. On gère ici les opérateurs
      // effectivement utilisés par le code source sur les entités testées.
      if (v && typeof v === 'object' && typeof (v as any).type === 'string') {
        const val = entity?.[k];
        const op = (v as any).type as string;
        const opValue = (v as any).value;
        switch (op) {
          case 'isNull':
            return val === null || val === undefined;
          case 'not': {
            // Not(IsNull()) → opValue est lui-même un FindOperator isNull
            if (
              opValue &&
              typeof opValue === 'object' &&
              opValue.type === 'isNull'
            ) {
              return !(val === null || val === undefined);
            }
            return val !== opValue;
          }
          case 'moreThanOrEqual':
            return val != null && new Date(val) >= new Date(opValue);
          case 'lessThanOrEqual':
            return val != null && new Date(val) <= new Date(opValue);
          case 'between':
            return (
              val != null &&
              new Date(val) >= new Date(opValue[0]) &&
              new Date(val) <= new Date(opValue[1])
            );
          case 'in':
            return Array.isArray(opValue) && opValue.includes(val);
          default:
            // Opérateur non géré explicitement : on ignore le filtre plutôt
            // que de planter (mieux vaut un faux positif ponctuel qu'un 500).
            return true;
        }
      }
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        // nested relation filter like { client: { id: '...' } }
        return matches(entity?.[k], v);
      }
      return entity?.[k] === v;
    });
  };

  const repo = {
    _store: store,
    create: jest.fn((data: Partial<T>) => ({ ...(data as any) })),
    save: jest.fn(async (entity: any) => {
      // TypeORM mute l'entité passée en argument (assigne `id` en place) en
      // plus de la retourner. Reproduire ce comportement est important : du
      // code appelant peut faire `const x = repo.create(...); await
      // repo.save(x); console.log(x.id)` en s'attendant à ce que `x.id` soit
      // rempli après l'appel (cf. tests qui créent un admin directement).
      if (!entity.id) {
        entity.id = nextId();
      }
      store.set(entity.id, entity);
      return entity;
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
      if (opts?.order?.createdAt === 'DESC') {
        out.sort(
          (a: any, b: any) =>
            new Date(b.createdAt ?? 0).getTime() -
            new Date(a.createdAt ?? 0).getTime(),
        );
      }
      return out;
    }),
    findAndCount: jest.fn(async (opts: any) => {
      const out: any[] = [];
      for (const v of store.values()) {
        if (matches(v, opts?.where)) out.push(v);
      }
      if (opts?.order?.createdAt === 'DESC') {
        out.sort(
          (a: any, b: any) =>
            new Date(b.createdAt ?? 0).getTime() -
            new Date(a.createdAt ?? 0).getTime(),
        );
      }
      const skip = opts?.skip ?? 0;
      const take = opts?.take ?? out.length;
      return [out.slice(skip, skip + take), out.length];
    }),
    update: jest.fn(async (id: string, patch: any) => {
      const cur = store.get(id);
      if (cur) store.set(id, { ...cur, ...patch });
      return { affected: cur ? 1 : 0 };
    }),
    delete: jest.fn(async (where: any) => {
      let affected = 0;
      for (const [id, v] of [...store.entries()]) {
        if (matches(v, where)) {
          store.delete(id);
          affected++;
        }
      }
      return { affected };
    }),
    count: jest.fn(async (opts: any) => {
      let n = 0;
      for (const v of store.values()) {
        if (matches(v, opts?.where)) n++;
      }
      return n;
    }),
    softDelete: jest.fn(async (id: string) => {
      const cur = store.get(id);
      if (cur) store.set(id, { ...cur, deletedAt: new Date() } as any);
      return { affected: cur ? 1 : 0 };
    }),
    restore: jest.fn(async (id: string) => {
      const cur = store.get(id);
      if (cur) store.set(id, { ...cur, deletedAt: null } as any);
      return { affected: cur ? 1 : 0 };
    }),
    /**
     * Sous-ensemble minimal du query builder utilisé par
     * `OrdersService.acceptOrder` : update().set().where().andWhere()...execute().
     * On simule l'update atomique conditionnel (status=PENDING, livreur IS
     * NULL, preferredLivreurId IS NULL OU = livreurId) directement en lisant
     * les conditions accumulées.
     */
    createQueryBuilder: jest.fn(() => {
      const conditions: Array<{ sql: string; params: any }> = [];
      let updateSet: any = null;

      const builder: any = {
        update: () => builder,
        set: (patch: any) => {
          updateSet = patch;
          return builder;
        },
        where: (sql: string, params: any) => {
          conditions.push({ sql, params });
          return builder;
        },
        andWhere: (sql: string, params?: any) => {
          conditions.push({ sql, params });
          return builder;
        },
        execute: async () => {
          // Trouve la ligne par id (toujours la première condition dans notre
          // usage réel : "id = :id")
          const idCond = conditions.find((c) => c.sql.startsWith('id ='));
          const id = idCond?.params?.id;
          const row = id ? store.get(id) : null;
          if (!row) return { affected: 0 };

          const rowAny = row as any;
          let ok = true;
          for (const c of conditions) {
            if (c.sql.startsWith('id =')) continue;
            if (c.sql.includes('status =')) {
              ok = ok && rowAny.status === c.params.pending;
            } else if (c.sql.includes('livreurId IS NULL')) {
              ok = ok && (rowAny.livreur == null || rowAny.livreur?.id == null);
            } else if (c.sql.includes('preferredLivreurId IS NULL OR')) {
              const preferredId = rowAny.preferredLivreur?.id ?? null;
              ok =
                ok &&
                (preferredId == null || preferredId === c.params?.livreurId);
            }
          }
          if (!ok) return { affected: 0 };

          if (updateSet) {
            for (const [k, v] of Object.entries(updateSet)) {
              if (typeof v === 'function') {
                rowAny[k] = new Date();
              } else if (v && typeof v === 'object' && 'id' in (v as any)) {
                rowAny[k] = { id: (v as any).id };
              } else {
                rowAny[k] = v;
              }
            }
          }
          store.set(id, rowAny);
          return { affected: 1 };
        },
        // Support minimal pour NotificationsService (query builder update sur fcmToken)
        insert: () => builder,
        into: () => builder,
        values: () => builder,
        orUpdate: () => builder,
      };
      return builder;
    }),
  };

  return repo;
}

export interface TestAppBundle {
  app: INestApplication;
  usersRepo: ReturnType<typeof makeInMemoryRepo<User>>;
  vehiclesRepo: ReturnType<typeof makeInMemoryRepo<Vehicle>>;
  ordersRepo: ReturnType<typeof makeInMemoryRepo<DeliveryOrder>>;
  merchantDriversRepo: ReturnType<typeof makeInMemoryRepo<MerchantDriver>>;
  statusHistoryRepo: ReturnType<typeof makeInMemoryRepo<DeliveryStatusHistory>>;
  priceChangeRepo: ReturnType<typeof makeInMemoryRepo<PriceChange>>;
  paymentHistoryRepo: ReturnType<typeof makeInMemoryRepo<PaymentStatusHistory>>;
  fakeGateway: {
    broadcastNewOrder: jest.Mock;
    broadcastOrderAccepted: jest.Mock;
    broadcastStatusUpdate: jest.Mock;
    isUserConnected: jest.Mock;
  };
}

/**
 * Construit l'app Nest de test avec tous les controllers nécessaires pour
 * couvrir les règles métier §21.4 : orders, users (validation livreur,
 * permissions ADMIN), merchant-drivers (affiliation).
 *
 * `axios` est mocké pour renvoyer une distance déterministe (3 km) au format
 * OpenRouteService réellement consommé par `OrdersService.calculateRealDistance`
 * (`features[0].properties.summary.distance` en mètres). On force aussi
 * `ORS_API_KEY` à une valeur factice pour que le service ne bascule pas sur
 * le fallback Haversine (non déterministe selon les coordonnées) — le champ
 * `orsApiKey` étant lu une seule fois à la construction du service, il faut
 * que la variable d'env soit positionnée AVANT `Test.createTestingModule`.
 */
export async function buildTestApp(): Promise<TestAppBundle> {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
  process.env.ORS_API_KEY = process.env.ORS_API_KEY || 'test-ors-key';
  mockedAxios.get.mockResolvedValue({
    data: {
      features: [
        {
          properties: { summary: { distance: 3000 } },
          geometry: {
            coordinates: [
              [1.2228, 6.1319],
              [1.2314, 6.1725],
            ],
          },
        },
      ],
    },
  });

  const usersRepo = makeInMemoryRepo<User>();
  const vehiclesRepo = makeInMemoryRepo<Vehicle>();
  const ordersRepo = makeInMemoryRepo<DeliveryOrder>();
  const deviceTokensRepo = makeInMemoryRepo<DeviceToken>();
  const merchantDriversRepo = makeInMemoryRepo<MerchantDriver>();
  const driverPositionsRepo = makeInMemoryRepo<DriverPosition>();
  const pricingConfigRepo = makeInMemoryRepo<PricingConfig>();
  const statusHistoryRepo = makeInMemoryRepo<DeliveryStatusHistory>();
  const priceChangeRepo = makeInMemoryRepo<PriceChange>();
  const paymentHistoryRepo = makeInMemoryRepo<PaymentStatusHistory>();

  // Stub gateway so we do not need socket.io infrastructure
  const fakeGateway = {
    broadcastNewOrder: jest.fn(),
    broadcastOrderAccepted: jest.fn(),
    broadcastStatusUpdate: jest.fn(),
    isUserConnected: jest.fn().mockReturnValue(false),
  };

  // Stubs légers pour les services annexes : ils ne sont pas la cible des
  // tests métier (validation livreur, permissions, propriété des
  // ressources...), on évite juste qu'ils cassent le DI ou lèvent une
  // exception (fire-and-forget dans le vrai code).
  const fakeNotifications = {
    sendToUser: jest.fn().mockResolvedValue(undefined),
  };
  const fakePositions = {
    upsertPosition: jest.fn().mockResolvedValue(undefined),
    findRecentLivreurPositions: jest.fn().mockResolvedValue([]),
    findLatestForLivreur: jest.fn().mockResolvedValue(null),
  };
  const fakePricing = {
    getPricePerKm: jest.fn().mockResolvedValue(150),
    getMinPriceFcfa: jest.fn().mockResolvedValue(null),
  };

  const moduleRef = await Test.createTestingModule({
    imports: [
      PassportModule,
      JwtModule.register({
        secret: process.env.JWT_SECRET,
        signOptions: { expiresIn: '7d' },
      }),
    ],
    controllers: [
      AuthController,
      OrdersController,
      UsersController,
      MerchantDriversController,
    ],
    providers: [
      AuthService,
      UsersService,
      OrdersService,
      MerchantDriversService,
      DeviceTokensService,
      JwtStrategy,
      { provide: APP_GUARD, useClass: JwtAuthGuard },
      { provide: OrdersGateway, useValue: fakeGateway },
      { provide: NotificationsService, useValue: fakeNotifications },
      { provide: PositionsService, useValue: fakePositions },
      { provide: PricingService, useValue: fakePricing },
      { provide: getRepositoryToken(User), useValue: usersRepo },
      { provide: getRepositoryToken(Vehicle), useValue: vehiclesRepo },
      { provide: getRepositoryToken(DeliveryOrder), useValue: ordersRepo },
      {
        provide: getRepositoryToken(DeviceToken),
        useValue: deviceTokensRepo,
      },
      {
        provide: getRepositoryToken(MerchantDriver),
        useValue: merchantDriversRepo,
      },
      {
        provide: getRepositoryToken(DriverPosition),
        useValue: driverPositionsRepo,
      },
      {
        provide: getRepositoryToken(PricingConfig),
        useValue: pricingConfigRepo,
      },
      {
        provide: getRepositoryToken(DeliveryStatusHistory),
        useValue: statusHistoryRepo,
      },
      {
        provide: getRepositoryToken(PriceChange),
        useValue: priceChangeRepo,
      },
      {
        provide: getRepositoryToken(PaymentStatusHistory),
        useValue: paymentHistoryRepo,
      },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();

  return {
    app,
    usersRepo,
    vehiclesRepo,
    ordersRepo,
    merchantDriversRepo,
    statusHistoryRepo,
    priceChangeRepo,
    paymentHistoryRepo,
    fakeGateway,
  };
}

/**
 * Enregistre un utilisateur via /auth/register et renvoie son token + id.
 */
export async function registerAndLogin(
  app: INestApplication,
  overrides: {
    firstName?: string;
    lastName?: string;
    phone: string;
    role: UserRole;
    vehicleType?: string;
  },
): Promise<{ token: string; id: string }> {
  const res = await request(app.getHttpServer())
    .post('/auth/register')
    .send({
      firstName: overrides.firstName ?? 'Test',
      lastName: overrides.lastName ?? 'User',
      phone: overrides.phone,
      password: 'secret123',
      role: overrides.role,
      ...(overrides.vehicleType ? { vehicleType: overrides.vehicleType } : {}),
    })
    .expect(201);

  return { token: res.body.access_token, id: res.body.user.id };
}

/** Passe un livreur en APPROVED directement dans le repo in-memory (pas de route publique pour ça). */
export function approveLivreur(
  usersRepo: ReturnType<typeof makeInMemoryRepo<User>>,
  livreurId: string,
) {
  const user = usersRepo._store.get(livreurId) as any;
  user.driverApprovalStatus = 'APPROVED';
  usersRepo._store.set(livreurId, user);
}

/** Bascule isAvailable directement dans le repo in-memory. */
export function setAvailable(
  usersRepo: ReturnType<typeof makeInMemoryRepo<User>>,
  livreurId: string,
  available: boolean,
) {
  const user = usersRepo._store.get(livreurId) as any;
  user.isAvailable = available;
  usersRepo._store.set(livreurId, user);
}
