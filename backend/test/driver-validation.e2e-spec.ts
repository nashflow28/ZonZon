/**
 * E2E — validation livreur (DriverApprovalStatus) & disponibilité (§21.4 CDC).
 *
 * Règles couvertes (déjà mergées sur main, cf. `OrdersService.findAvailable`
 * et `OrdersService.acceptOrder`) :
 *  1. Un livreur PENDING (juste après inscription) reçoit 403 sur
 *     `GET /orders/available` et sur `POST /orders/:id/accept`.
 *  2. Après passage APPROVED par un ADMIN, un livreur reste 200/[] tant
 *     qu'il n'est pas `isAvailable` (aucune erreur, juste liste vide, et
 *     403 sur `accept`).
 *  3. Après `PATCH /users/me/availability {available: true}`, le livreur
 *     APPROVED voit la course dans `available` et peut l'accepter.
 *
 * On ne teste PAS ici la suspension de compte (`UserStatus`) ni la règle
 * "une seule course active" (P0, en cours d'écriture par un autre agent au
 * moment de l'écriture de ce fichier) — cf. TEST_PLAN_ZONZON_V1.md.
 */

import { INestApplication } from '@nestjs/common';
import request = require('supertest');

import { UserRole } from '../src/entities/user.entity';
import { OrderStatus } from '../src/entities/delivery-order.entity';
import {
  TestAppBundle,
  buildTestApp,
  setDriverProfilePhoto,
} from './test-helpers';

describe('Driver validation & availability (e2e)', () => {
  let bundle: TestAppBundle;
  let app: INestApplication;
  let adminToken: string;
  let clientToken: string;
  let livreurToken: string;
  let livreurId: string;
  let orderId: string;

  beforeAll(async () => {
    bundle = await buildTestApp();
    app = bundle.app;

    // Admin "de confiance" créé directement dans le repo in-memory (comme
    // /auth/register refuse explicitement le rôle ADMIN).
    const admin = bundle.usersRepo.create({
      firstName: 'Admin',
      lastName: 'Zonzon',
      phone: '+22891000001',
      role: UserRole.ADMIN,
    });
    await bundle.usersRepo.save(admin);
    const { JwtService } = require('@nestjs/jwt');
    const jwtService = new JwtService({ secret: process.env.JWT_SECRET });
    adminToken = jwtService.sign({
      phone: (admin as any).phone,
      sub: (admin as any).id,
      role: UserRole.ADMIN,
    });

    const clientRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        firstName: 'Denise',
        lastName: 'Cliente',
        phone: '+22891000002',
        password: 'secret123',
        role: UserRole.CLIENT,
      })
      .expect(201);
    clientToken = clientRes.body.access_token;

    const livreurRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        firstName: 'Eric',
        lastName: 'Livreur',
        phone: '+22891000003',
        password: 'secret123',
        role: UserRole.LIVREUR,
        vehicleType: 'MOTO',
      })
      .expect(201);
    livreurToken = livreurRes.body.access_token;
    livreurId = livreurRes.body.user.id;

    const orderRes = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        pickupAddress: 'Lomé Centre',
        pickupLat: 6.1319,
        pickupLng: 1.2228,
        deliveryAddress: 'Lomé Agoè',
        deliveryLat: 6.1725,
        deliveryLng: 1.2314,
        description: 'Colis fragile',
      })
      .expect(201);
    orderId = orderRes.body.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('Livreur PENDING (non encore validé par un admin)', () => {
    it('GET /orders/available → 403', async () => {
      await request(app.getHttpServer())
        .get('/orders/available')
        .set('Authorization', `Bearer ${livreurToken}`)
        .expect(403);
    });

    it('POST /orders/:id/accept → 403', async () => {
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/accept`)
        .set('Authorization', `Bearer ${livreurToken}`)
        .expect(403);
    });
  });

  describe('Livreur APPROVED mais indisponible (isAvailable=false)', () => {
    beforeAll(async () => {
      await request(app.getHttpServer())
        .patch(`/users/${livreurId}/driver-approval`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'APPROVED' })
        .expect(400);
      setDriverProfilePhoto(bundle.usersRepo, livreurId);
      await request(app.getHttpServer())
        .patch(`/users/${livreurId}/driver-approval`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'APPROVED' })
        .expect(200);
    });

    it('GET /orders/available → 200 []  (pas d’erreur, juste vide)', async () => {
      const res = await request(app.getHttpServer())
        .get('/orders/available')
        .set('Authorization', `Bearer ${livreurToken}`)
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('POST /orders/:id/accept → 403 (indisponible)', async () => {
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/accept`)
        .set('Authorization', `Bearer ${livreurToken}`)
        .expect(403);
    });
  });

  describe('Livreur APPROVED + disponible', () => {
    beforeAll(async () => {
      await request(app.getHttpServer())
        .patch('/users/me/availability')
        .set('Authorization', `Bearer ${livreurToken}`)
        .send({ available: true })
        .expect(200);
    });

    it('GET /orders/available → 200, contient la course', async () => {
      const res = await request(app.getHttpServer())
        .get('/orders/available')
        .set('Authorization', `Bearer ${livreurToken}`)
        .expect(200);

      expect(res.body.some((o: any) => o.id === orderId)).toBe(true);
    });

    it('POST /orders/:id/accept → 201, status ACCEPTED', async () => {
      const res = await request(app.getHttpServer())
        .post(`/orders/${orderId}/accept`)
        .set('Authorization', `Bearer ${livreurToken}`)
        .expect(201);

      expect(res.body.status).toBe(OrderStatus.ACCEPTED);
    });
  });
});
