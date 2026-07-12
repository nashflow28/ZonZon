import { INestApplication } from '@nestjs/common';
import request = require('supertest');

import { OrderStatus } from '../src/entities/delivery-order.entity';
import { DeliveryRunStatus } from '../src/entities/delivery-run.entity';
import { UserRole } from '../src/entities/user.entity';
import {
  approveLivreur,
  buildTestApp,
  registerAndLogin,
  setAvailable,
  setDriverProfilePhoto,
  TestAppBundle,
} from './test-helpers';

describe('Delivery runs (e2e)', () => {
  let bundle: TestAppBundle;
  let app: INestApplication;
  let merchantToken: string;
  let driverToken: string;
  let driverId: string;

  beforeAll(async () => {
    bundle = await buildTestApp();
    app = bundle.app;
    const merchant = await registerAndLogin(app, {
      phone: '+22891000001',
      role: UserRole.COMMERCANT,
    });
    const driver = await registerAndLogin(app, {
      phone: '+22891000002',
      role: UserRole.LIVREUR,
      vehicleType: 'MOTO',
    });
    merchantToken = merchant.token;
    driverToken = driver.token;
    driverId = driver.id;
    setDriverProfilePhoto(bundle.usersRepo, driverId);
    approveLivreur(bundle.usersRepo, driverId);
    setAvailable(bundle.usersRepo, driverId, true);
  });

  afterAll(async () => app?.close());

  it('crée deux courses, les accepte et termine la tournée avec le même livreur', async () => {
    const run = await request(app.getHttpServer())
      .post('/orders/runs')
      .set('Authorization', `Bearer ${merchantToken}`)
      .send({ livreurId: driverId })
      .expect(201);

    const createOrder = (phone: string, destination: string) =>
      request(app.getHttpServer())
        .post('/orders/merchant')
        .set('Authorization', `Bearer ${merchantToken}`)
        .send({
          pickupAddress: 'Boutique centrale',
          pickupLat: 6.1319,
          pickupLng: 1.2228,
          deliveryAddress: destination,
          deliveryLat: 6.1725,
          deliveryLng: 1.2314,
          description: '1 colis',
          clientPhone: phone,
          runId: run.body.id,
        })
        .expect(201);

    const first = await createOrder('+22892000001', 'Client A');
    const second = await createOrder('+22892000002', 'Client B');
    expect(first.body.run.id).toBe(run.body.id);
    expect(second.body.run.id).toBe(run.body.id);

    for (const orderId of [first.body.id, second.body.id]) {
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/accept`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(201);
    }

    for (const orderId of [first.body.id, second.body.id]) {
      await request(app.getHttpServer())
        .patch(`/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ status: OrderStatus.IN_PROGRESS })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ status: OrderStatus.COMPLETED })
        .expect(200);
    }

    const runs = await request(app.getHttpServer())
      .get('/orders/runs/mine')
      .set('Authorization', `Bearer ${merchantToken}`)
      .expect(200);
    expect(runs.body).toHaveLength(1);
    expect(runs.body[0].status).toBe(DeliveryRunStatus.COMPLETED);
  });
});
