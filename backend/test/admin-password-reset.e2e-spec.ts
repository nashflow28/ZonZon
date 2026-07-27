/**
 * E2E — réinitialisation de mot de passe admin (session 91).
 *
 * Couvre les deux canaux livrés, à travers le vrai pipeline HTTP
 * (JwtAuthGuard + RolesGuard + ValidationPipe + bcrypt réels) :
 *
 *  A. Filet de secours admin-à-admin — `PATCH /users/:id/reset-password`
 *     C'est ce que déclenche le bouton « Réinitialiser le mot de passe »
 *     de la page Utilisateurs du dashboard admin.
 *  B. Self-service OTP WhatsApp — `POST /auth/forgot-password/request|reset`
 *
 * Le test décisif est « le mot de passe réinitialisé permet réellement de se
 * reconnecter, et l'ancien ne fonctionne plus » : vérifier un 200 sur la route
 * ne prouverait pas que le hash écrit est exploitable.
 */

import { INestApplication } from '@nestjs/common';
import request = require('supertest');

import { UserRole } from '../src/entities/user.entity';
import { WhatsappOtpService } from '../src/auth/whatsapp-otp.service';
import { TestAppBundle, buildTestApp } from './test-helpers';

/** Signe un JWT pour un compte déjà présent dans le repo in-memory. */
function signToken(phone: string, sub: string, role: UserRole): string {
  const { JwtService } = require('@nestjs/jwt');
  const jwtService = new JwtService({ secret: process.env.JWT_SECRET });
  return jwtService.sign({ phone, sub, role });
}

/**
 * Crée un ADMIN qui possède un vrai hash bcrypt : on passe par
 * `/auth/register` (qui interdit le rôle ADMIN, cf. `REGISTRABLE_ROLES`)
 * puis on promeut le compte dans le repo. C'est le seul moyen d'obtenir un
 * admin sur lequel `POST /auth/login` est réellement testable.
 */
async function makeAdminWithPassword(
  bundle: TestAppBundle,
  app: INestApplication,
  phone: string,
  password: string,
): Promise<{ id: string; phone: string }> {
  const res = await request(app.getHttpServer())
    .post('/auth/register')
    .send({
      firstName: 'Admin',
      lastName: 'Cible',
      phone,
      password,
      role: UserRole.CLIENT,
    })
    .expect(201);

  const id = res.body.user.id;
  const stored = bundle.usersRepo._store.get(id) as any;
  stored.role = UserRole.ADMIN;
  bundle.usersRepo._store.set(id, stored);

  return { id, phone };
}

describe('E2E — réinitialisation de mot de passe admin', () => {
  let bundle: TestAppBundle;
  let app: INestApplication;

  let adminActeurId: string;
  let adminActeurToken: string;
  let clientToken: string;
  let clientId: string;

  const CIBLE_PHONE = '+22893000010';
  const CIBLE_MDP_INITIAL = 'secret123';
  let cibleId: string;

  beforeAll(async () => {
    bundle = await buildTestApp();
    app = bundle.app;

    // Admin qui effectue la réinitialisation (l'admin connecté au dashboard).
    const acteur = bundle.usersRepo.create({
      firstName: 'Admin',
      lastName: 'Acteur',
      phone: '+22893000001',
      role: UserRole.ADMIN,
    });
    await bundle.usersRepo.save(acteur);
    adminActeurId = (acteur as any).id;
    adminActeurToken = signToken(
      '+22893000001',
      adminActeurId,
      UserRole.ADMIN,
    );

    // Admin cible, avec un mot de passe réel pour pouvoir tester le login.
    const cible = await makeAdminWithPassword(
      bundle,
      app,
      CIBLE_PHONE,
      CIBLE_MDP_INITIAL,
    );
    cibleId = cible.id;

    // Compte non-admin, pour les tests de permission.
    const clientRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        firstName: 'Fanta',
        lastName: 'Cliente',
        phone: '+22893000002',
        password: 'secret123',
        role: UserRole.CLIENT,
      })
      .expect(201);
    clientToken = clientRes.body.access_token;
    clientId = clientRes.body.user.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('A. Filet de secours admin-à-admin (bouton du dashboard)', () => {
    it('refuse une requête sans token (401)', async () => {
      await request(app.getHttpServer())
        .patch(`/users/${cibleId}/reset-password`)
        .send({ newPassword: 'NouveauMdp123' })
        .expect(401);
    });

    it('refuse un compte non-admin authentifié (403)', async () => {
      await request(app.getHttpServer())
        .patch(`/users/${cibleId}/reset-password`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ newPassword: 'NouveauMdp123' })
        .expect(403);
    });

    it("refuse qu'un admin réinitialise son propre mot de passe (400)", async () => {
      const res = await request(app.getHttpServer())
        .patch(`/users/${adminActeurId}/reset-password`)
        .set('Authorization', `Bearer ${adminActeurToken}`)
        .send({ newPassword: 'NouveauMdp123' })
        .expect(400);

      expect(res.body.message).toContain('Modifier le mot de passe');
    });

    it('refuse une cible qui n’est pas administrateur (400)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/users/${clientId}/reset-password`)
        .set('Authorization', `Bearer ${adminActeurToken}`)
        .send({ newPassword: 'NouveauMdp123' })
        .expect(400);

      expect(res.body.message).toContain("n'est pas un administrateur");
    });

    it('refuse un mot de passe trop court (400, ValidationPipe)', async () => {
      await request(app.getHttpServer())
        .patch(`/users/${cibleId}/reset-password`)
        .set('Authorization', `Bearer ${adminActeurToken}`)
        .send({ newPassword: 'court' })
        .expect(400);
    });

    it('réinitialise réellement : le nouveau mot de passe connecte, l’ancien non', async () => {
      // Pré-condition : l'ancien mot de passe fonctionne avant l'opération.
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ phone: CIBLE_PHONE, password: CIBLE_MDP_INITIAL })
        .expect(201);

      const NOUVEAU = 'MotDePasseReinitialise2026';

      await request(app.getHttpServer())
        .patch(`/users/${cibleId}/reset-password`)
        .set('Authorization', `Bearer ${adminActeurToken}`)
        .send({ newPassword: NOUVEAU })
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual({ ok: true });
        });

      // Le hash écrit est exploitable : la connexion réussit et renvoie bien
      // un compte ADMIN.
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ phone: CIBLE_PHONE, password: NOUVEAU })
        .expect(201);
      expect(login.body.access_token).toBeTruthy();
      expect(login.body.user.role).toBe(UserRole.ADMIN);

      // L'ancien mot de passe est bien révoqué.
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ phone: CIBLE_PHONE, password: CIBLE_MDP_INITIAL })
        .expect(401);
    });
  });

  describe('B. Self-service OTP WhatsApp', () => {
    it('ne déclenche aucun OTP pour un numéro non-admin, mais répond comme si (anti-énumération)', async () => {
      const otp = app.get(WhatsappOtpService) as any;
      otp.request.mockClear();

      const res = await request(app.getHttpServer())
        .post('/auth/forgot-password/request')
        .send({ phone: '+22893000002' }) // le compte CLIENT
        .expect(201);

      expect(res.body).toEqual({ sent: true });
      expect(otp.request).not.toHaveBeenCalled();
    });

    it('répond identiquement pour un numéro inexistant (anti-énumération)', async () => {
      const otp = app.get(WhatsappOtpService) as any;
      otp.request.mockClear();

      const res = await request(app.getHttpServer())
        .post('/auth/forgot-password/request')
        .send({ phone: '+22899999999' })
        .expect(201);

      expect(res.body).toEqual({ sent: true });
      expect(otp.request).not.toHaveBeenCalled();
    });

    it('déclenche bien un OTP pour un compte ADMIN', async () => {
      const otp = app.get(WhatsappOtpService) as any;
      otp.request.mockClear();
      otp.request.mockResolvedValue(undefined);

      await request(app.getHttpServer())
        .post('/auth/forgot-password/request')
        .send({ phone: CIBLE_PHONE })
        .expect(201);

      expect(otp.request).toHaveBeenCalledWith(CIBLE_PHONE);
    });

    it('rejette un code invalide sans distinguer un compte non-admin (401)', async () => {
      const otp = app.get(WhatsappOtpService) as any;
      otp.verify.mockClear();

      // Compte non-admin : rejeté sans même appeler le service OTP.
      const res = await request(app.getHttpServer())
        .post('/auth/forgot-password/reset')
        .send({
          phone: '+22893000002',
          code: '123456',
          newPassword: 'NouveauMdp123',
        })
        .expect(401);

      expect(res.body.message).toBe('Code invalide ou expiré');
      expect(otp.verify).not.toHaveBeenCalled();
    });

    it('applique le nouveau mot de passe quand le code est valide', async () => {
      const otp = app.get(WhatsappOtpService) as any;
      otp.verify.mockClear();
      otp.verify.mockResolvedValue(undefined);

      const MDP_VIA_OTP = 'MotDePasseViaWhatsApp2026';

      await request(app.getHttpServer())
        .post('/auth/forgot-password/reset')
        .send({
          phone: CIBLE_PHONE,
          code: '123456',
          newPassword: MDP_VIA_OTP,
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toEqual({ ok: true });
        });

      expect(otp.verify).toHaveBeenCalledWith(CIBLE_PHONE, '123456');

      // Vérification de bout en bout : le compte se connecte avec ce mot de passe.
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ phone: CIBLE_PHONE, password: MDP_VIA_OTP })
        .expect(201);
    });
  });
});
