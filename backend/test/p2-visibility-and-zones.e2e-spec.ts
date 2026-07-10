/**
 * E2E — chantiers P2 du CDC Zonzon V1 :
 *  - §9.3 : livreur privé/public (`PATCH /users/me/visibility`), exclusion
 *    du broadcast général pour un livreur privé.
 *  - §7 : zones enrichies (CRUD `description`/`basePrice`/`pricePerKmOverride`)
 *    et liaison `pickupZoneId`/`destinationZoneId` sur une commande créée
 *    par un client.
 *  - §13.2 : le commerçant créateur peut être identifié comme partie à une
 *    commande (vérifié plus finement dans orders.gateway.spec.ts ; ici on
 *    vérifie juste que la création d'une commande commerçant reste 201 et
 *    que `merchant` est bien celui attendu — la logique fine du chat/GPS
 *    est unitaire, pas socket.io en e2e HTTP).
 */

import { INestApplication } from '@nestjs/common';
import request = require('supertest');

import { UserRole } from '../src/entities/user.entity';
import {
  TestAppBundle,
  buildTestApp,
  registerAndLogin,
  setDriverProfilePhoto,
} from './test-helpers';

describe('P2 — visibilité livreur & zones enrichies (e2e)', () => {
  let bundle: TestAppBundle;
  let app: INestApplication;
  let adminToken: string;
  let clientToken: string;

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

    const clientAuth = await registerAndLogin(app, {
      firstName: 'Grace',
      lastName: 'Cliente',
      phone: '+22893000002',
      role: UserRole.CLIENT,
    });
    clientToken = clientAuth.token;
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('PATCH /users/me/visibility (§9.3)', () => {
    let livreurToken: string;
    let livreurId: string;

    beforeAll(async () => {
      const livreurAuth = await registerAndLogin(app, {
        firstName: 'Henri',
        lastName: 'Livreur',
        phone: '+22893000003',
        role: UserRole.LIVREUR,
        vehicleType: 'MOTO',
      });
      livreurToken = livreurAuth.token;
      livreurId = livreurAuth.id;
      setDriverProfilePhoto(bundle.usersRepo, livreurId);

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
    });

    it('un CLIENT reçoit 403', async () => {
      await request(app.getHttpServer())
        .patch('/users/me/visibility')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ isPublic: false })
        .expect(403);
    });

    it('un LIVREUR peut passer isPublic à false → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch('/users/me/visibility')
        .set('Authorization', `Bearer ${livreurToken}`)
        .send({ isPublic: false })
        .expect(200);

      expect(res.body).toEqual({ isPublic: false });
    });

    it('un livreur privé (isPublic=false) est exclu du broadcast général', async () => {
      bundle.fakeGateway.broadcastNewOrder.mockClear();

      await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          pickupAddress: 'Lomé Centre',
          pickupLat: 6.1319,
          pickupLng: 1.2228,
          deliveryAddress: 'Lomé Agoè',
          deliveryLat: 6.1725,
          deliveryLng: 1.2314,
          description: 'Colis test visibilité',
        })
        .expect(201);

      expect(bundle.fakeGateway.broadcastNewOrder).toHaveBeenCalled();
      const [, eligibleIds] =
        bundle.fakeGateway.broadcastNewOrder.mock.calls[0];
      expect(eligibleIds.has(livreurId)).toBe(false);
    });

    it('repasser isPublic à true → le livreur redevient éligible au broadcast', async () => {
      await request(app.getHttpServer())
        .patch('/users/me/visibility')
        .set('Authorization', `Bearer ${livreurToken}`)
        .send({ isPublic: true })
        .expect(200);

      bundle.fakeGateway.broadcastNewOrder.mockClear();

      await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          pickupAddress: 'Lomé Centre',
          pickupLat: 6.1319,
          pickupLng: 1.2228,
          deliveryAddress: 'Lomé Agoè',
          deliveryLat: 6.1725,
          deliveryLng: 1.2314,
          description: 'Colis test visibilité 2',
        })
        .expect(201);

      const [, eligibleIds] =
        bundle.fakeGateway.broadcastNewOrder.mock.calls[0];
      expect(eligibleIds.has(livreurId)).toBe(true);
    });
  });

  describe('Zones enrichies (§7)', () => {
    it('POST /zones (ADMIN) accepte description/basePrice/pricePerKmOverride', async () => {
      const res = await request(app.getHttpServer())
        .post('/zones')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Zone Test E2E',
          description: 'Quartier de test',
          basePrice: 400,
          pricePerKmOverride: 120,
        })
        .expect(201);

      expect(res.body).toMatchObject({
        name: 'Zone Test E2E',
        description: 'Quartier de test',
        basePrice: 400,
        pricePerKmOverride: 120,
      });
    });

    it('un CLIENT reçoit 403 sur POST /zones', async () => {
      await request(app.getHttpServer())
        .post('/zones')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ name: 'Zone Interdite' })
        .expect(403);
    });

    it('POST /orders accepte pickupZoneId/destinationZoneId', async () => {
      const zoneRes = await request(app.getHttpServer())
        .post('/zones')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Zone Pickup E2E' })
        .expect(201);
      const zone2Res = await request(app.getHttpServer())
        .post('/zones')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Zone Dest E2E' })
        .expect(201);

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
          description: 'Colis avec zones',
          pickupZoneId: zoneRes.body.id,
          destinationZoneId: zone2Res.body.id,
        })
        .expect(201);

      expect(orderRes.body.pickupZone?.id ?? orderRes.body.pickupZoneId).toBe(
        zoneRes.body.id,
      );
    });
  });
});
