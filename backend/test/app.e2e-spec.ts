import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppController } from './../src/app.controller';
import { AppService } from './../src/app.service';

/**
 * E2E hermétique du health-check racine.
 *
 * On NE démarre PAS `AppModule` complet (TypeORM/MySQL, Socket.IO, Firebase…) :
 * ça exige une base de données et rend le test non déterministe hors infra.
 * On monte uniquement `AppController` + `AppService`, ce qui suffit à couvrir
 * l'endpoint `GET /` (health) utilisé par les monitors externes.
 *
 * NB : la racine `/` n'est PAS préfixée par `/v1` (exclusion `setGlobalPrefix`),
 * mais comme on ne monte pas le prefix global ici, on l'interroge directement.
 */
describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET) renvoie un statut de santé { status: "ok", ... }', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual(
          expect.objectContaining({
            status: 'ok',
            env: expect.any(String),
            timestamp: expect.any(String),
            uptime: expect.any(Number),
          }),
        );
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
