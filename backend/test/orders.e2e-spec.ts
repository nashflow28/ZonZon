/**
 * E2E test for the orders flow.
 *
 * Strategy: we build the HTTP pipeline (controllers + services + guards + JWT)
 * WITHOUT TypeORM/MySQL. Repositories are replaced with in-memory
 * implementations via `getRepositoryToken()`. Axios is mocked globally so the
 * OSRM route distance is deterministic (3 km → 450 FCFA).
 *
 * This mirrors a real HTTP run: register → admin approves the driver →
 * driver goes available → create order → accept → progress → complete →
 * second livreur tries to accept (409).
 *
 * NOTE : depuis l'introduction du workflow de validation livreur
 * (DriverApprovalStatus PENDING/APPROVED/REJECTED) et de la disponibilité
 * (`isAvailable`), un livreur fraîchement inscrit est PENDING + indisponible.
 * Il doit être approuvé par un ADMIN puis passer disponible avant de
 * pouvoir voir/accepter une course — cf. `driver-validation.e2e-spec.ts`
 * pour les tests dédiés à ce workflow.
 */

import { INestApplication } from '@nestjs/common';
import request = require('supertest');

import { UserRole } from '../src/entities/user.entity';
import { OrderStatus } from '../src/entities/delivery-order.entity';
import {
  TestAppBundle,
  buildTestApp,
  registerAndLogin,
  setDriverProfilePhoto,
} from './test-helpers';

describe('Orders (e2e)', () => {
  let bundle: TestAppBundle;
  let app: INestApplication;

  beforeAll(async () => {
    bundle = await buildTestApp();
    app = bundle.app;
  });

  afterAll(async () => {
    await app?.close();
  });

  // Shared state between steps
  let adminToken: string;
  let clientToken: string;
  let livreurToken: string;
  let livreurId: string;
  let secondLivreurToken: string;
  let secondLivreurId: string;
  let orderId: string;
  let proposalId: string;

  it('POST /auth/register — admin → 201 + token', async () => {
    // Note: /auth/register REFUSE explicitement le rôle ADMIN (sécurité).
    // On simule un admin déjà existant en le créant directement via le repo,
    // puis on se logue normalement.
    const { usersRepo } = bundle;
    const admin = usersRepo.create({
      firstName: 'Admin',
      lastName: 'Zonzon',
      phone: '+22890000099',
      role: UserRole.ADMIN,
      password: undefined,
    });
    await usersRepo.save(admin);

    // On génère le token directement via login n'est pas possible sans mdp;
    // à la place on utilise un JWT signé identique à ce que ferait AuthService.
    const jwt = require('@nestjs/jwt');
    const { JwtService } = jwt;
    const jwtService = new JwtService({ secret: process.env.JWT_SECRET });
    adminToken = jwtService.sign({
      phone: admin.phone,
      sub: (admin as any).id,
      role: UserRole.ADMIN,
    });
    expect(adminToken).toBeDefined();
  });

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
    expect(res.body.user.password).toBeUndefined();
    expect(res.body.user.fcmToken).toBeUndefined();
    clientToken = res.body.access_token;
  });

  it('POST /auth/register — livreur (MOTO) → 201 + token, PENDING par défaut', async () => {
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
    expect(res.body.user.driverApprovalStatus).toBe('PENDING');
    livreurToken = res.body.access_token;
    livreurId = res.body.user.id;
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
    secondLivreurId = res.body.user.id;
  });

  it('ADMIN approuve les deux livreurs puis ils passent disponibles', async () => {
    setDriverProfilePhoto(bundle.usersRepo, livreurId);
    setDriverProfilePhoto(bundle.usersRepo, secondLivreurId);
    await request(app.getHttpServer())
      .patch(`/users/${livreurId}/driver-approval`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'APPROVED' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/users/${secondLivreurId}/driver-approval`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'APPROVED' })
      .expect(200);

    await request(app.getHttpServer())
      .patch('/users/me/availability')
      .set('Authorization', `Bearer ${livreurToken}`)
      .send({ available: true })
      .expect(200);

    await request(app.getHttpServer())
      .patch('/users/me/availability')
      .set('Authorization', `Bearer ${secondLivreurToken}`)
      .send({ available: true })
      .expect(200);
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

    // 3000 m → 3 km → 3 * 150 = 450 (pricePerKm stubbé à 150 dans PricingService)
    expect(Number(res.body.priceFcfa)).toBe(450);
    expect(res.body.status).toBe(OrderStatus.PENDING);
    orderId = res.body.id;
  });

  it('GET /orders/available (livreur validé + dispo) — retourne la commande', async () => {
    const res = await request(app.getHttpServer())
      .get('/orders/available')
      .set('Authorization', `Bearer ${livreurToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((o: any) => o.id === orderId)).toBe(true);
  });

  it('POST /orders/:id/price-proposals (livreur) → proposition sans attribution', async () => {
    const res = await request(app.getHttpServer())
      .post(`/orders/${orderId}/price-proposals`)
      .set('Authorization', `Bearer ${livreurToken}`)
      .send({ priceFcfa: 700 })
      .expect(201);

    expect(res.body.status).toBe('PENDING');
    expect(res.body.priceFcfa).toBe(700);
    proposalId = res.body.id;
    expect((bundle.ordersRepo._store.get(orderId) as any).livreur).toBeFalsy();
  });

  it('PATCH proposition (client accepte) → attribution + prix proposé', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/orders/${orderId}/price-proposal/${proposalId}`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ accept: true })
      .expect(200);

    expect(res.body.accepted).toBe(true);
    expect(res.body.order.status).toBe(OrderStatus.ACCEPTED);
    expect(res.body.order.priceFcfa).toBe(700);
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

  it('Second livreur qui propose après attribution → 409', async () => {
    await request(app.getHttpServer())
      .post(`/orders/${orderId}/price-proposals`)
      .set('Authorization', `Bearer ${secondLivreurToken}`)
      .send({ priceFcfa: 800 })
      .expect(409);
  });

  it('un refus remet la course en attente pour la proposition d’un autre livreur', async () => {
    const created = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        pickupAddress: 'Adidogomé',
        pickupLat: 6.1979,
        pickupLng: 1.1471,
        deliveryAddress: 'Lomé Centre',
        deliveryLat: 6.1319,
        deliveryLng: 1.2228,
        description: 'Course à renégocier',
      })
      .expect(201);

    const first = await request(app.getHttpServer())
      .post(`/orders/${created.body.id}/price-proposals`)
      .set('Authorization', `Bearer ${livreurToken}`)
      .send({ priceFcfa: 1200 })
      .expect(201);

    const rejected = await request(app.getHttpServer())
      .patch(`/orders/${created.body.id}/price-proposal/${first.body.id}`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ accept: false })
      .expect(200);
    expect(rejected.body.accepted).toBe(false);
    expect(rejected.body.order.status).toBe(OrderStatus.PENDING);

    const second = await request(app.getHttpServer())
      .post(`/orders/${created.body.id}/price-proposals`)
      .set('Authorization', `Bearer ${secondLivreurToken}`)
      .send({ priceFcfa: 950 })
      .expect(201);
    expect(second.body.priceFcfa).toBe(950);
    expect(second.body.status).toBe('PENDING');
  });

  it('refuse une sixième commande ouverte pour le même client', async () => {
    const extraClient = await registerAndLogin(app, {
      role: UserRole.CLIENT,
      phone: '+22890000077',
      firstName: 'Limite',
      lastName: 'Client',
    });
    const payload = {
      pickupAddress: 'Adidogomé',
      pickupLat: 6.1979,
      pickupLng: 1.1471,
      deliveryAddress: 'Lomé Centre',
      deliveryLat: 6.1319,
      deliveryLng: 1.2228,
      description: 'Course sous limite',
    };

    for (let index = 0; index < 5; index++) {
      await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${extraClient.token}`)
        .send(payload)
        .expect(201);
    }

    await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${extraClient.token}`)
      .send(payload)
      .expect(409);
  });
});
