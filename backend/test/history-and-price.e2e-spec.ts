/**
 * E2E — Priorité 1 (CDC V1, historisation/traçabilité) :
 *  - GET /orders/:id/history       (historique des statuts de livraison)
 *  - PATCH /orders/:id/price       (ajustement manuel du prix, §6.3)
 *  - GET /orders/:id/payment-history (historique des statuts de paiement)
 *
 * Ces tests exercent le pipeline HTTP complet (controllers + guards + JWT)
 * avec des repositories in-memory (cf. `test-helpers.ts`), comme les autres
 * specs e2e du projet.
 */

import { INestApplication } from '@nestjs/common';
import request = require('supertest');

import { UserRole } from '../src/entities/user.entity';
import { OrderStatus, PaymentStatus } from '../src/entities/delivery-order.entity';
import { TestAppBundle, buildTestApp } from './test-helpers';

describe('Historique & traçabilité (e2e)', () => {
  let bundle: TestAppBundle;
  let app: INestApplication;
  let adminToken: string;

  let clientToken: string;
  let livreurToken: string;
  let livreurId: string;
  let merchantToken: string;
  let merchantId: string;
  let strangerToken: string;

  beforeAll(async () => {
    bundle = await buildTestApp();
    app = bundle.app;

    const admin = bundle.usersRepo.create({
      firstName: 'Admin',
      lastName: 'Zonzon',
      phone: '+22894000001',
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
        firstName: 'Hélène',
        lastName: 'Cliente',
        phone: '+22894000002',
        password: 'secret123',
        role: UserRole.CLIENT,
      })
      .expect(201);
    clientToken = clientRes.body.access_token;

    const livreurRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        firstName: 'Yao',
        lastName: 'Livreur',
        phone: '+22894000003',
        password: 'secret123',
        role: UserRole.LIVREUR,
        vehicleType: 'MOTO',
      })
      .expect(201);
    livreurToken = livreurRes.body.access_token;
    livreurId = livreurRes.body.user.id;

    await request(app.getHttpServer())
      .patch(`/users/${livreurId}/driver-approval`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'APPROVED' })
      .expect(200);
    await request(app.getHttpServer())
      .patch('/users/me/availability')
      .set('Authorization', `Bearer ${livreurToken}`)
      .send({ available: true })
      .expect(200);

    const merchantRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        firstName: 'Nadia',
        lastName: 'Commerçante',
        phone: '+22894000004',
        password: 'secret123',
        role: UserRole.COMMERCANT,
      })
      .expect(201);
    merchantToken = merchantRes.body.access_token;
    merchantId = merchantRes.body.user.id;

    const strangerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        firstName: 'Intrus',
        lastName: 'Externe',
        phone: '+22894000005',
        password: 'secret123',
        role: UserRole.CLIENT,
      })
      .expect(201);
    strangerToken = strangerRes.body.access_token;
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('GET /orders/:id/history', () => {
    let orderId: string;

    beforeAll(async () => {
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
          description: 'Colis historique',
        })
        .expect(201);
      orderId = orderRes.body.id;

      await request(app.getHttpServer())
        .post(`/orders/${orderId}/accept`)
        .set('Authorization', `Bearer ${livreurToken}`)
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${livreurToken}`)
        .send({ status: OrderStatus.IN_PROGRESS })
        .expect(200);
    });

    it('le client de la course voit l’historique trié ASC (création → acceptation → in_progress)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/orders/${orderId}/history`)
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(3);
      expect(res.body[0].oldStatus).toBeNull();
      expect(res.body[0].newStatus).toBe(OrderStatus.PENDING);
      expect(res.body[1].oldStatus).toBe(OrderStatus.PENDING);
      expect(res.body[1].newStatus).toBe(OrderStatus.ACCEPTED);
      expect(res.body[1].changedBy).toBe(livreurId);
      expect(res.body[2].newStatus).toBe(OrderStatus.IN_PROGRESS);

      // Tri ASC par createdAt
      const dates = res.body.map((h: any) => new Date(h.createdAt).getTime());
      const sorted = [...dates].sort((a, b) => a - b);
      expect(dates).toEqual(sorted);
    });

    it('le livreur assigné peut aussi consulter l’historique', async () => {
      await request(app.getHttpServer())
        .get(`/orders/${orderId}/history`)
        .set('Authorization', `Bearer ${livreurToken}`)
        .expect(200);
    });

    it('un admin peut consulter l’historique', async () => {
      await request(app.getHttpServer())
        .get(`/orders/${orderId}/history`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('un tiers non lié à la course reçoit 403', async () => {
      await request(app.getHttpServer())
        .get(`/orders/${orderId}/history`)
        .set('Authorization', `Bearer ${strangerToken}`)
        .expect(403);
    });
  });

  describe('PATCH /orders/:id/price', () => {
    let orderId: string;

    beforeEach(async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/orders/merchant')
        .set('Authorization', `Bearer ${merchantToken}`)
        .send({
          pickupAddress: 'Boutique Nadia',
          pickupLat: 6.1319,
          pickupLng: 1.2228,
          deliveryAddress: 'Domicile client',
          deliveryLat: 6.1725,
          deliveryLng: 1.2314,
          description: 'Colis prix',
          clientPhone: '+22894000099',
        })
        .expect(201);
      orderId = orderRes.body.id;
    });

    it('le commerçant créateur peut ajuster le prix', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/orders/${orderId}/price`)
        .set('Authorization', `Bearer ${merchantToken}`)
        .send({ priceFcfa: 1234, reason: 'Ajustement e2e' })
        .expect(200);

      expect(res.body.priceFcfa).toBe(1234);
      expect(res.body.priceWasManuallyAdjusted).toBe(true);
    });

    it('un admin peut ajuster le prix', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/orders/${orderId}/price`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ priceFcfa: 555 })
        .expect(200);

      expect(res.body.priceFcfa).toBe(555);
    });

    it('un client (non créateur) reçoit 403', async () => {
      await request(app.getHttpServer())
        .patch(`/orders/${orderId}/price`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ priceFcfa: 100 })
        .expect(403);
    });

    it('rejette un prix négatif (400)', async () => {
      await request(app.getHttpServer())
        .patch(`/orders/${orderId}/price`)
        .set('Authorization', `Bearer ${merchantToken}`)
        .send({ priceFcfa: -50 })
        .expect(400);
    });

    it('refuse l’ajustement sur une course terminale (CANCELLED)', async () => {
      // `updateStatus` n'autorise pas le commerçant (seuls client/livreur/
      // admin peuvent changer le statut) — on annule via un admin.
      await request(app.getHttpServer())
        .patch(`/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: OrderStatus.CANCELLED })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/orders/${orderId}/price`)
        .set('Authorization', `Bearer ${merchantToken}`)
        .send({ priceFcfa: 999 })
        .expect(400);
    });
  });

  describe('GET /orders/:id/payment-history', () => {
    let orderId: string;

    beforeAll(async () => {
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
          description: 'Colis paiement',
        })
        .expect(201);
      orderId = orderRes.body.id;

      await request(app.getHttpServer())
        .patch(`/orders/${orderId}/payment-status`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ paymentStatus: PaymentStatus.PAID })
        .expect(200);
    });

    it('le client voit l’historique de paiement', async () => {
      const res = await request(app.getHttpServer())
        .get(`/orders/${orderId}/payment-history`)
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0].oldStatus).toBe(PaymentStatus.UNPAID);
      expect(res.body[0].newStatus).toBe(PaymentStatus.PAID);
      expect(res.body[0].changedBy).toBeDefined();
    });

    it('un tiers non lié reçoit 403', async () => {
      await request(app.getHttpServer())
        .get(`/orders/${orderId}/payment-history`)
        .set('Authorization', `Bearer ${strangerToken}`)
        .expect(403);
    });

    it('un admin peut consulter', async () => {
      await request(app.getHttpServer())
        .get(`/orders/${orderId}/payment-history`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });
});
