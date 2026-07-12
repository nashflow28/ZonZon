import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { NotificationsService } from './notifications.service';
import { User } from '../entities/user.entity';
import { Notification } from '../entities/notification.entity';
import { DeviceTokensService } from '../users/device-tokens.service';

const mockUsersRepo = () => ({
  findOne: jest.fn(),
  createQueryBuilder: jest.fn(() => ({
    update: () => ({
      set: () => ({
        where: () => ({ execute: jest.fn().mockResolvedValue({}) }),
      }),
    }),
  })),
});

const mockNotificationsRepo = () => ({
  create: jest.fn((data: any) => data),
  save: jest.fn(),
});

const mockDeviceTokensService = () => ({
  listForUser: jest.fn().mockResolvedValue([]),
  deleteByToken: jest.fn(),
});

describe('NotificationsService', () => {
  let service: NotificationsService;
  let usersRepo: ReturnType<typeof mockUsersRepo>;
  let notificationsRepo: ReturnType<typeof mockNotificationsRepo>;
  let deviceTokens: ReturnType<typeof mockDeviceTokensService>;

  beforeEach(async () => {
    usersRepo = mockUsersRepo();
    notificationsRepo = mockNotificationsRepo();
    deviceTokens = mockDeviceTokensService();

    // Pas de Firebase configuré dans les tests : le service doit rester
    // no-op côté FCM (`ensureInit()` renvoie null), la persistance devant
    // fonctionner indépendamment de ça.
    delete process.env.FIREBASE_CREDENTIALS_JSON;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: getRepositoryToken(User), useValue: usersRepo },
        {
          provide: getRepositoryToken(Notification),
          useValue: notificationsRepo,
        },
        { provide: DeviceTokensService, useValue: deviceTokens },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('sendToUser() — persistance', () => {
    it('persiste une ligne Notification même si Firebase n’est pas configuré', async () => {
      notificationsRepo.save.mockResolvedValue({ id: 'notif-1' });

      await service.sendToUser('user-1', {
        title: 'Nouvelle course',
        body: 'Une course vous attend',
        data: { kind: 'NEW_ORDER', orderId: 'order-1' },
      });

      expect(notificationsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          deliveryId: 'order-1',
          type: 'NEW_ORDER',
          title: 'Nouvelle course',
          body: 'Une course vous attend',
          data: { kind: 'NEW_ORDER', orderId: 'order-1' },
          readAt: null,
        }),
      );
      expect(notificationsRepo.save).toHaveBeenCalledTimes(1);
    });

    it('utilise type = "generic" et deliveryId = null si data absent', async () => {
      notificationsRepo.save.mockResolvedValue({ id: 'notif-2' });

      await service.sendToUser('user-2', {
        title: 'Info',
        body: 'Message générique',
      });

      expect(notificationsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-2',
          deliveryId: null,
          type: 'generic',
        }),
      );
    });

    it('ne lève pas d’exception si repo.save échoue (fire-and-forget)', async () => {
      notificationsRepo.save.mockRejectedValue(new Error('DB down'));

      await expect(
        service.sendToUser('user-3', { title: 'X', body: 'Y' }),
      ).resolves.toBeUndefined();
    });

    it('la persistance se fait avant/en parallèle de l’envoi FCM, sans jamais le bloquer par une exception', async () => {
      notificationsRepo.save.mockResolvedValue({ id: 'notif-4' });

      await expect(
        service.sendToUser('user-4', { title: 'X', body: 'Y' }),
      ).resolves.toBeUndefined();

      expect(notificationsRepo.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('sendToUser() — comportement FCM existant (non-régression)', () => {
    it('reste no-op côté FCM si Firebase non configuré (pas de crash)', async () => {
      notificationsRepo.save.mockResolvedValue({ id: 'notif-5' });

      await expect(
        service.sendToUser('user-5', { title: 'X', body: 'Y' }),
      ).resolves.toBeUndefined();
    });
  });
});
