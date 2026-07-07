/**
 * E2E — permissions par rôle (§21.4 CDC).
 *
 * Vérifie que `RolesGuard` + `@Roles(...)` bloquent bien l'accès aux routes
 * réservées à un rôle donné (403), et que le rôle attendu passe (200/201).
 *
 * Routes couvertes :
 *  - `GET /users` : @Roles(ADMIN) — un CLIENT (et un LIVREUR) doivent
 *    recevoir 403 ; un ADMIN doit recevoir 200.
 *  - `POST /orders/merchant` : @Roles(COMMERCANT) — un LIVREUR (et un
 *    CLIENT) doivent recevoir 403 ; un COMMERCANT doit recevoir 201.
 *  - `PATCH /users/me/availability` : @Roles(LIVREUR) — un CLIENT doit
 *    recevoir 403.
 *  - `GET /orders` : @Roles(ADMIN, LIVREUR) — un CLIENT/COMMERCANT doivent
 *    recevoir 403.
 */

import { INestApplication } from '@nestjs/common';
import request = require('supertest');

import { UserRole } from '../src/entities/user.entity';
import { TestAppBundle, buildTestApp } from './test-helpers';

describe('Permissions par rôle (e2e)', () => {
  let bundle: TestAppBundle;
  let app: INestApplication;
  let adminToken: string;
  let clientToken: string;
  let livreurToken: string;
  let merchantToken: string;

  beforeAll(async () => {
    bundle = await buildTestApp();
    app = bundle.app;

    const admin = bundle.usersRepo.create({
      firstName: 'Admin',
      lastName: 'Zonzon',
      phone: '+22892000001',
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
        firstName: 'Fanta',
        lastName: 'Cliente',
        phone: '+22892000002',
        password: 'secret123',
        role: UserRole.CLIENT,
      })
      .expect(201);
    clientToken = clientRes.body.access_token;

    const livreurRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        firstName: 'Gaston',
        lastName: 'Livreur',
        phone: '+22892000003',
        password: 'secret123',
        role: UserRole.LIVREUR,
        vehicleType: 'MOTO',
      })
      .expect(201);
    livreurToken = livreurRes.body.access_token;

    const merchantRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        firstName: 'Hélène',
        lastName: 'Commerçante',
        phone: '+22892000004',
        password: 'secret123',
        role: UserRole.COMMERCANT,
      })
      .expect(201);
    merchantToken = merchantRes.body.access_token;
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('GET /users — @Roles(ADMIN)', () => {
    it('CLIENT → 403', async () => {
      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(403);
    });

    it('LIVREUR → 403', async () => {
      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${livreurToken}`)
        .expect(403);
    });

    it('COMMERCANT → 403', async () => {
      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${merchantToken}`)
        .expect(403);
    });

    it('ADMIN → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /orders/merchant — @Roles(COMMERCANT)', () => {
    const payload = {
      pickupAddress: 'Marché de Lomé',
      pickupLat: 6.1319,
      pickupLng: 1.2228,
      deliveryAddress: 'Lomé Agoè',
      deliveryLat: 6.1725,
      deliveryLng: 1.2314,
      description: 'Colis boutique',
      clientPhone: '+22899888777',
      clientName: 'Client Sans Compte',
    };

    it('LIVREUR → 403', async () => {
      await request(app.getHttpServer())
        .post('/orders/merchant')
        .set('Authorization', `Bearer ${livreurToken}`)
        .send(payload)
        .expect(403);
    });

    it('CLIENT → 403', async () => {
      await request(app.getHttpServer())
        .post('/orders/merchant')
        .set('Authorization', `Bearer ${clientToken}`)
        .send(payload)
        .expect(403);
    });

    it('COMMERCANT → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/orders/merchant')
        .set('Authorization', `Bearer ${merchantToken}`)
        .send(payload)
        .expect(201);
      expect(res.body.id).toBeDefined();
    });
  });

  describe('PATCH /users/me/availability — @Roles(LIVREUR)', () => {
    it('CLIENT → 403', async () => {
      await request(app.getHttpServer())
        .patch('/users/me/availability')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ available: true })
        .expect(403);
    });

    it('COMMERCANT → 403', async () => {
      await request(app.getHttpServer())
        .patch('/users/me/availability')
        .set('Authorization', `Bearer ${merchantToken}`)
        .send({ available: true })
        .expect(403);
    });
  });

  describe('GET /orders — @Roles(ADMIN, LIVREUR)', () => {
    it('CLIENT → 403', async () => {
      await request(app.getHttpServer())
        .get('/orders')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(403);
    });

    it('COMMERCANT → 403', async () => {
      await request(app.getHttpServer())
        .get('/orders')
        .set('Authorization', `Bearer ${merchantToken}`)
        .expect(403);
    });

    it('ADMIN → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.items).toBeDefined();
    });
  });
});
