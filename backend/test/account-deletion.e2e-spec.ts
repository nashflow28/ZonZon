/**
 * E2E — suppression de compte en self-service (`DELETE /users/me`).
 *
 * Exigence obligatoire Google Play depuis 2024 : l'utilisateur doit pouvoir
 * demander la suppression de son compte depuis l'application. L'implémentation
 * choisie est une ANONYMISATION + soft-delete, pas un DELETE SQL — les
 * livraisons terminées doivent survivre (comptabilité, litiges) alors que les
 * données personnelles, elles, doivent disparaître.
 *
 * Le test décisif n'est pas le 200 sur la route : c'est qu'après l'appel,
 * (a) l'ancien couple numéro/mot de passe ne connecte plus, (b) le jeton
 * encore en poche est rejeté, (c) le numéro réel est libéré pour une
 * réinscription, et (d) la commande livrée est toujours là.
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

const MDP = 'secret123';

async function registerClient(
  app: INestApplication,
  phone: string,
  firstName: string,
): Promise<{ token: string; id: string }> {
  const res = await request(app.getHttpServer())
    .post('/auth/register')
    .send({
      firstName,
      lastName: 'Cliente',
      phone,
      password: MDP,
      role: UserRole.CLIENT,
    })
    .expect(201);
  return { token: res.body.access_token, id: res.body.user.id };
}

async function createOrder(
  app: INestApplication,
  clientToken: string,
): Promise<string> {
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
      description: 'Colis suppression de compte',
    })
    .expect(201);
  return res.body.id;
}

describe('E2E — suppression de compte en self-service', () => {
  let bundle: TestAppBundle;
  let app: INestApplication;
  let adminToken: string;

  /** Livreur validé + disponible, nécessaire pour mener une course à son terme. */
  let livreurToken: string;
  let livreurId: string;

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

    const livreurRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        firstName: 'Kodjo',
        lastName: 'Livreur',
        phone: '+22894000002',
        password: MDP,
        role: UserRole.LIVREUR,
        vehicleType: 'MOTO',
      })
      .expect(201);
    livreurToken = livreurRes.body.access_token;
    livreurId = livreurRes.body.user.id;
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

  afterAll(async () => {
    await app?.close();
  });

  describe('Garde-fous', () => {
    it('refuse une requête sans token (401)', async () => {
      await request(app.getHttpServer())
        .delete('/users/me')
        .send({ password: MDP })
        .expect(401);
    });

    it('refuse un corps sans mot de passe (400, ValidationPipe)', async () => {
      const { token } = await registerClient(app, '+22894000010', 'Validation');
      await request(app.getHttpServer())
        .delete('/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(400);
    });

    it('refuse un mot de passe invalide (403) et laisse le compte intact', async () => {
      const { token, id } = await registerClient(
        app,
        '+22894000011',
        'Mauvaise',
      );

      const res = await request(app.getHttpServer())
        .delete('/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ password: 'pas-le-bon-mot-de-passe' })
        .expect(403);
      expect(res.body.message).toBe('Mot de passe incorrect');

      const stored = bundle.usersRepo._store.get(id) as any;
      expect(stored.deletedAt ?? null).toBeNull();
      expect(stored.phone).toBe('+22894000011');

      // Et le compte se connecte toujours normalement.
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ phone: '+22894000011', password: MDP })
        .expect(201);
    });

    it('refuse (409) tant qu’une course est en cours, avec un message actionnable', async () => {
      const { token } = await registerClient(app, '+22894000012', 'Occupée');
      await createOrder(app, token); // reste PENDING

      const res = await request(app.getHttpServer())
        .delete('/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ password: MDP })
        .expect(409);
      expect(res.body.message).toMatch(/livraison en cours/i);
      expect(res.body.message).toMatch(/annulez/i);
    });

    it('refuse (409) aussi côté livreur, sur une course qu’il a acceptée', async () => {
      const { token: clientToken } = await registerClient(
        app,
        '+22894000013',
        'Cliente',
      );
      const orderId = await createOrder(app, clientToken);
      await acceptOrderDirectly(app, orderId, livreurToken);

      await request(app.getHttpServer())
        .delete('/users/me')
        .set('Authorization', `Bearer ${livreurToken}`)
        .send({ password: MDP })
        .expect(409);

      // On solde la course pour ne pas polluer les cas suivants.
      await request(app.getHttpServer())
        .patch(`/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${livreurToken}`)
        .send({ status: OrderStatus.IN_PROGRESS })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${livreurToken}`)
        .send({ status: OrderStatus.COMPLETED })
        .expect(200);
    });
  });

  describe('Cas nominal — anonymisation + soft-delete', () => {
    let clientToken: string;
    let clientId: string;
    let orderId: string;
    const PHONE = '+22894000020';

    beforeAll(async () => {
      const client = await registerClient(app, PHONE, 'Akouvi');
      clientToken = client.token;
      clientId = client.id;

      // Une course menée jusqu'à COMPLETED : c'est elle qui doit survivre.
      orderId = await createOrder(app, clientToken);
      await acceptOrderDirectly(app, orderId, livreurToken);
      await request(app.getHttpServer())
        .patch(`/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${livreurToken}`)
        .send({ status: OrderStatus.IN_PROGRESS })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${livreurToken}`)
        .send({ status: OrderStatus.COMPLETED })
        .expect(200);

      // Une photo de profil + un device token, pour prouver qu'ils partent.
      const stored = bundle.usersRepo._store.get(clientId) as any;
      stored.profilePhotoUrl = '/uploads/akouvi.jpg';
      stored.fcmToken = 'legacy-fcm-token';
      bundle.usersRepo._store.set(clientId, stored);
      // `DeviceTokensService.upsert` passe par un INSERT ... ON DUPLICATE KEY
      // que le query builder in-memory ne simule pas : on sème la ligne
      // directement, l'objet du test étant la PURGE, pas l'enregistrement.
      bundle.deviceTokensRepo._store.set('device-akouvi', {
        id: 'device-akouvi',
        userId: clientId,
        token: 'fcm-akouvi',
        platform: 'android',
      } as any);
    });

    it('supprime le compte et renvoie { ok: true }', async () => {
      await request(app.getHttpServer())
        .delete('/users/me')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ password: MDP })
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual({ ok: true });
        });
    });

    it('anonymise la ligne users et pose le soft-delete', async () => {
      const stored = bundle.usersRepo._store.get(clientId) as any;

      expect(stored.firstName).toBe('Compte');
      expect(stored.lastName).toBe('supprimé');
      expect(stored.phone).not.toBe(PHONE);
      expect(stored.phone).toMatch(/^deleted-/);
      expect(stored.password).toBeNull();
      expect(stored.profilePhotoUrl).toBeNull();
      expect(stored.idCardPhotoUrl).toBeNull();
      expect(stored.fcmToken).toBeNull();
      expect(stored.deletedAt).toBeTruthy();
    });

    it('purge les device tokens (plus aucune notification push)', () => {
      const restants = [...bundle.deviceTokensRepo._store.values()].filter(
        (t: any) => t.userId === clientId,
      );
      expect(restants).toHaveLength(0);
    });

    it('rend la reconnexion impossible avec l’ancien numéro + mot de passe', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ phone: PHONE, password: MDP })
        .expect(401);
    });

    it('invalide le jeton encore en poche (401 au prochain appel)', async () => {
      // Le JWT n'est pas révoqué en tant que tel : c'est `JwtStrategy` qui ne
      // retrouve plus le compte, le soft-delete l'excluant des `findOne`.
      await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(401);
    });

    it('libère le numéro réel : la réinscription passe et crée un NOUVEAU compte', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          firstName: 'Akouvi',
          lastName: 'Revenue',
          phone: PHONE,
          password: 'nouveau-secret',
          role: UserRole.CLIENT,
        })
        .expect(201);

      expect(res.body.user.id).not.toBe(clientId);
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ phone: PHONE, password: 'nouveau-secret' })
        .expect(201);
    });

    it('conserve la livraison terminée et son rattachement (comptabilité, litiges)', () => {
      const order = bundle.ordersRepo._store.get(orderId) as any;
      expect(order).toBeDefined();
      expect(order.status).toBe(OrderStatus.COMPLETED);
      // La FK n'est pas cassée : la ligne users existe toujours, anonymisée.
      expect(order.client?.id ?? order.client).toBe(clientId);
      expect(bundle.usersRepo._store.get(clientId)).toBeDefined();
    });
  });

  describe('Tous les rôles sont couverts', () => {
    it('un LIVREUR sans course en cours peut supprimer son compte', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          firstName: 'Yao',
          lastName: 'Livreur',
          phone: '+22894000030',
          password: MDP,
          role: UserRole.LIVREUR,
          vehicleType: 'MOTO',
        })
        .expect(201);
      const token = res.body.access_token;
      const id = res.body.user.id;

      await request(app.getHttpServer())
        .delete('/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ password: MDP })
        .expect(200);

      const stored = bundle.usersRepo._store.get(id) as any;
      expect(stored.deletedAt).toBeTruthy();
      // Un livreur supprimé ne doit plus être ni disponible ni public.
      expect(stored.isAvailable).toBe(false);
      expect(stored.isPublic).toBe(false);
    });

    it('un COMMERCANT sans livraison en cours peut supprimer son compte', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          firstName: 'Ama',
          lastName: 'Boutique',
          phone: '+22894000031',
          password: MDP,
          role: UserRole.COMMERCANT,
        })
        .expect(201);

      await request(app.getHttpServer())
        .delete('/users/me')
        .set('Authorization', `Bearer ${res.body.access_token}`)
        .send({ password: MDP })
        .expect(200);
    });
  });
});
