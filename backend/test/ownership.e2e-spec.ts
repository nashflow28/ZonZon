/**
 * E2E — propriété des ressources & attribution manuelle (§21.4 CDC).
 *
 * Règles couvertes (déjà mergées sur main) :
 *  1. Un livreur non assigné à une course ne peut pas faire
 *     `PATCH /orders/:id/status` dessus (403 — cf. `OrdersService.updateStatus`,
 *     qui vérifie `isClient || isLivreur || isAdmin`).
 *  2. `GET /orders/mine` : un client ne voit que SES commandes (pas celles
 *     d'un autre client) ; un commerçant ne voit que les livraisons qu'il a
 *     créées (Type 1).
 *  3. Attribution manuelle (`preferredLivreurId`, Priorité 3 Lot 3 item 1) :
 *     une course réservée à un livreur donné n'est acceptable que par lui —
 *     un autre livreur validé + disponible reçoit 403 « réservée ».
 */

import { INestApplication } from '@nestjs/common';
import request = require('supertest');

import { UserRole } from '../src/entities/user.entity';
import { OrderStatus } from '../src/entities/delivery-order.entity';
import {
  TestAppBundle,
  buildTestApp,
  acceptOrderDirectly,
  setDriverProfilePhoto,
} from './test-helpers';

async function makeApprovedAvailableLivreur(
  bundle: TestAppBundle,
  app: INestApplication,
  adminToken: string,
  phone: string,
  firstName: string,
): Promise<{ token: string; id: string }> {
  const res = await request(app.getHttpServer())
    .post('/auth/register')
    .send({
      firstName,
      lastName: 'Livreur',
      phone,
      password: 'secret123',
      role: UserRole.LIVREUR,
      vehicleType: 'MOTO',
    })
    .expect(201);
  const token = res.body.access_token;
  const id = res.body.user.id;
  // La validation admin exige une photo de profil opérationnelle.
  setDriverProfilePhoto(bundle.usersRepo, id);

  await request(app.getHttpServer())
    .patch(`/users/${id}/driver-approval`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ status: 'APPROVED' })
    .expect(200);

  await request(app.getHttpServer())
    .patch('/users/me/availability')
    .set('Authorization', `Bearer ${token}`)
    .send({ available: true })
    .expect(200);

  return { token, id };
}

describe('Propriété des ressources & attribution manuelle (e2e)', () => {
  let bundle: TestAppBundle;
  let app: INestApplication;
  let adminToken: string;

  beforeAll(async () => {
    bundle = await buildTestApp();
    app = bundle.app;

    const admin = bundle.usersRepo.create({
      firstName: 'Admin',
      lastName: 'Zonzon',
      phone: '+22893000001',
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
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('PATCH /orders/:id/status — propriété (livreur non assigné)', () => {
    let clientToken: string;
    let ownerLivreurToken: string;
    let strangerLivreurToken: string;
    let orderId: string;

    beforeAll(async () => {
      const clientRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          firstName: 'Irène',
          lastName: 'Cliente',
          phone: '+22893000002',
          password: 'secret123',
          role: UserRole.CLIENT,
        })
        .expect(201);
      clientToken = clientRes.body.access_token;

      const owner = await makeApprovedAvailableLivreur(
        bundle,
        app,
        adminToken,
        '+22893000003',
        'Owner',
      );
      ownerLivreurToken = owner.token;

      const stranger = await makeApprovedAvailableLivreur(
        bundle,
        app,
        adminToken,
        '+22893000004',
        'Stranger',
      );
      strangerLivreurToken = stranger.token;

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
          description: 'Colis propriété',
        })
        .expect(201);
      orderId = orderRes.body.id;

      await acceptOrderDirectly(app, orderId, ownerLivreurToken);
    });

    it('le livreur NON assigné reçoit 403 sur PATCH /orders/:id/status', async () => {
      await request(app.getHttpServer())
        .patch(`/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${strangerLivreurToken}`)
        .send({ status: OrderStatus.IN_PROGRESS })
        .expect(403);
    });

    it('le livreur assigné (owner) peut faire avancer la course', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${ownerLivreurToken}`)
        .send({ status: OrderStatus.IN_PROGRESS })
        .expect(200);
      expect(res.body.status).toBe(OrderStatus.IN_PROGRESS);
    });
  });

  describe('GET /orders/mine — isolation par propriétaire', () => {
    let clientAToken: string;
    let clientBToken: string;
    let merchantToken: string;
    let orderAId: string;
    let orderBId: string;
    let merchantOrderId: string;

    beforeAll(async () => {
      const clientA = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          firstName: 'Julie',
          lastName: 'ClienteA',
          phone: '+22893000010',
          password: 'secret123',
          role: UserRole.CLIENT,
        })
        .expect(201);
      clientAToken = clientA.body.access_token;

      const clientB = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          firstName: 'Karim',
          lastName: 'ClientB',
          phone: '+22893000011',
          password: 'secret123',
          role: UserRole.CLIENT,
        })
        .expect(201);
      clientBToken = clientB.body.access_token;

      const merchant = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          firstName: 'Laura',
          lastName: 'Commerçante',
          phone: '+22893000012',
          password: 'secret123',
          role: UserRole.COMMERCANT,
        })
        .expect(201);
      merchantToken = merchant.body.access_token;

      const orderA = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${clientAToken}`)
        .send({
          pickupAddress: 'Lomé Centre',
          pickupLat: 6.1319,
          pickupLng: 1.2228,
          deliveryAddress: 'Lomé Agoè',
          deliveryLat: 6.1725,
          deliveryLng: 1.2314,
          description: 'Commande A',
        })
        .expect(201);
      orderAId = orderA.body.id;

      const orderB = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${clientBToken}`)
        .send({
          pickupAddress: 'Lomé Centre',
          pickupLat: 6.1319,
          pickupLng: 1.2228,
          deliveryAddress: 'Lomé Agoè',
          deliveryLat: 6.1725,
          deliveryLng: 1.2314,
          description: 'Commande B',
        })
        .expect(201);
      orderBId = orderB.body.id;

      const merchantOrder = await request(app.getHttpServer())
        .post('/orders/merchant')
        .set('Authorization', `Bearer ${merchantToken}`)
        .send({
          pickupAddress: 'Marché de Lomé',
          pickupLat: 6.1319,
          pickupLng: 1.2228,
          deliveryAddress: 'Lomé Agoè',
          deliveryLat: 6.1725,
          deliveryLng: 1.2314,
          description: 'Livraison commerçant',
          clientPhone: '+22899000000',
          clientName: 'Client Sans Compte',
        })
        .expect(201);
      merchantOrderId = merchantOrder.body.id;
    });

    it('client A ne voit que SA commande (pas celle de B ni celle du commerçant)', async () => {
      const res = await request(app.getHttpServer())
        .get('/orders/mine')
        .set('Authorization', `Bearer ${clientAToken}`)
        .expect(200);

      const ids = res.body.map((o: any) => o.id);
      expect(ids).toContain(orderAId);
      expect(ids).not.toContain(orderBId);
      expect(ids).not.toContain(merchantOrderId);
    });

    it('client B ne voit que SA commande', async () => {
      const res = await request(app.getHttpServer())
        .get('/orders/mine')
        .set('Authorization', `Bearer ${clientBToken}`)
        .expect(200);

      const ids = res.body.map((o: any) => o.id);
      expect(ids).toContain(orderBId);
      expect(ids).not.toContain(orderAId);
    });

    it('le commerçant ne voit que les livraisons qu’il a créées', async () => {
      const res = await request(app.getHttpServer())
        .get('/orders/mine')
        .set('Authorization', `Bearer ${merchantToken}`)
        .expect(200);

      const ids = res.body.map((o: any) => o.id);
      expect(ids).toContain(merchantOrderId);
      expect(ids).not.toContain(orderAId);
      expect(ids).not.toContain(orderBId);
    });
  });

  describe('Attribution manuelle (preferredLivreurId) — réservation', () => {
    let clientToken: string;
    let preferredLivreurToken: string;
    let preferredLivreurId: string;
    let otherLivreurToken: string;
    let reservedOrderId: string;

    beforeAll(async () => {
      const clientRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          firstName: 'Marc',
          lastName: 'Client',
          phone: '+22893000020',
          password: 'secret123',
          role: UserRole.CLIENT,
        })
        .expect(201);
      clientToken = clientRes.body.access_token;

      const preferred = await makeApprovedAvailableLivreur(
        bundle,
        app,
        adminToken,
        '+22893000021',
        'Preferred',
      );
      preferredLivreurToken = preferred.token;
      preferredLivreurId = preferred.id;

      const other = await makeApprovedAvailableLivreur(
        bundle,
        app,
        adminToken,
        '+22893000022',
        'Other',
      );
      otherLivreurToken = other.token;

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
          description: 'Course réservée',
          preferredLivreurId,
        })
        .expect(201);
      reservedOrderId = orderRes.body.id;
    });

    it('un AUTRE livreur validé+dispo reçoit 403 (course réservée)', async () => {
      await request(app.getHttpServer())
        .post(`/orders/${reservedOrderId}/accept`)
        .set('Authorization', `Bearer ${otherLivreurToken}`)
        .send({})
        .expect(403);
    });

    it('le livreur préféré peut accepter directement la course', async () => {
      const res = await acceptOrderDirectly(
        app,
        reservedOrderId,
        preferredLivreurToken,
      );
      expect(res.body.status).toBe(OrderStatus.ACCEPTED);
    });
  });
});
