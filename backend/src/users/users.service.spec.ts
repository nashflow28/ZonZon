import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';

import { UsersService } from './users.service';
import {
  DriverApprovalStatus,
  User,
  UserRole,
  UserStatus,
} from '../entities/user.entity';
import { Vehicle } from '../entities/vehicle.entity';
import { DeliveryOrder, OrderStatus } from '../entities/delivery-order.entity';
import { DeviceToken } from '../entities/device-token.entity';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { IdentityStorageService } from '../storage/identity-storage.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import { Readable } from 'stream';

const mockUsersRepo = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  softDelete: jest.fn(),
  restore: jest.fn(),
  createQueryBuilder: jest.fn(),
  // `deleteOwnAccount` travaille dans une transaction : on la rend
  // passthrough et on route chaque entité vers son mock de repo, pour que les
  // assertions portent sur les mêmes objets que hors transaction.
  manager: {
    transaction: jest.fn(),
  },
});

const mockVehiclesRepo = () => ({
  create: jest.fn(),
  save: jest.fn(),
});

const mockOrdersRepo = () => ({
  count: jest.fn().mockResolvedValue(0),
});

const mockDeviceTokensRepo = () => ({
  delete: jest.fn().mockResolvedValue({ affected: 1 }),
});

const mockIdentityStorage = () => ({
  store: jest.fn(),
  open: jest.fn(),
});

describe('UsersService', () => {
  let service: UsersService;
  let usersRepository: ReturnType<typeof mockUsersRepo>;
  let ordersRepository: ReturnType<typeof mockOrdersRepo>;
  let deviceTokensRepository: ReturnType<typeof mockDeviceTokensRepo>;

  beforeEach(async () => {
    usersRepository = mockUsersRepo();
    ordersRepository = mockOrdersRepo();
    deviceTokensRepository = mockDeviceTokensRepo();
    const vehiclesRepository = mockVehiclesRepo();

    usersRepository.manager.transaction.mockImplementation(
      async (cb: (em: any) => Promise<any>) =>
        cb({
          getRepository: (entity: any) =>
            entity === DeviceToken ? deviceTokensRepository : usersRepository,
        }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: usersRepository },
        { provide: getRepositoryToken(Vehicle), useValue: vehiclesRepository },
        {
          provide: getRepositoryToken(DeliveryOrder),
          useValue: ordersRepository,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('softDelete', () => {
    it('appelle softDelete du repo et renvoie ok', async () => {
      usersRepository.softDelete.mockResolvedValue({ affected: 1 } as any);

      const res = await service.softDelete('user-1');

      expect(usersRepository.softDelete).toHaveBeenCalledWith('user-1');
      expect(res).toEqual({ ok: true });
    });
  });

  describe('restore', () => {
    it('appelle restore du repo et renvoie ok', async () => {
      usersRepository.restore.mockResolvedValue({ affected: 1 } as any);

      const res = await service.restore('user-1');

      expect(usersRepository.restore).toHaveBeenCalledWith('user-1');
      expect(res).toEqual({ ok: true });
    });
  });

  describe('createWithPassword', () => {
    it('un nouveau LIVREUR démarre PENDING + isAvailable=false', async () => {
      usersRepository.create.mockImplementation((data: any) => data);
      usersRepository.save.mockImplementation(async (u: any) => u);

      const result = await service.createWithPassword({
        firstName: 'Bob',
        lastName: 'Livreur',
        phone: '+22890000002',
        role: UserRole.LIVREUR,
      });

      expect(usersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          driverApprovalStatus: DriverApprovalStatus.PENDING,
          isAvailable: false,
        }),
      );
      expect(result.driverApprovalStatus).toBe(DriverApprovalStatus.PENDING);
      expect(result.isAvailable).toBe(false);
    });

    it('un CLIENT n’a pas de driverApprovalStatus (null)', async () => {
      usersRepository.create.mockImplementation((data: any) => data);
      usersRepository.save.mockImplementation(async (u: any) => u);

      const result = await service.createWithPassword({
        firstName: 'Alice',
        lastName: 'Client',
        phone: '+22890000001',
        role: UserRole.CLIENT,
      });

      expect(usersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          driverApprovalStatus: null,
          isAvailable: false,
        }),
      );
      expect(result.driverApprovalStatus).toBeNull();
    });
  });

  describe('setDriverApproval', () => {
    const pendingLivreur = () => ({
      id: 'livreur-1',
      role: UserRole.LIVREUR,
      profilePhotoUrl: '/uploads/livreur.jpg',
      driverApprovalStatus: DriverApprovalStatus.PENDING,
      driverRejectionReason: null,
      isAvailable: false,
      vehicle: undefined,
    });

    it('APPROVED : positionne driverApprovalStatus=APPROVED et efface rejectionReason', async () => {
      usersRepository.findOne.mockResolvedValue(pendingLivreur());
      usersRepository.save.mockImplementation(async (u: any) => u);

      const result = await service.setDriverApproval(
        'livreur-1',
        'APPROVED',
        'admin-1',
      );

      expect(result.driverApprovalStatus).toBe(DriverApprovalStatus.APPROVED);
      expect(result.driverRejectionReason).toBeNull();
      expect(usersRepository.save).toHaveBeenCalled();
    });

    it('REJECTED avec reason : positionne REJECTED, reason et isAvailable=false', async () => {
      usersRepository.findOne.mockResolvedValue({
        ...pendingLivreur(),
        isAvailable: true,
      });
      usersRepository.save.mockImplementation(async (u: any) => u);

      const result = await service.setDriverApproval(
        'livreur-1',
        'REJECTED',
        'admin-1',
        'Documents invalides',
      );

      expect(result.driverApprovalStatus).toBe(DriverApprovalStatus.REJECTED);
      expect(result.driverRejectionReason).toBe('Documents invalides');
      expect(result.isAvailable).toBe(false);
    });

    it('non-livreur → BadRequestException', async () => {
      usersRepository.findOne.mockResolvedValue({
        id: 'client-1',
        role: UserRole.CLIENT,
      });

      await expect(
        service.setDriverApproval('client-1', 'APPROVED', 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(usersRepository.save).not.toHaveBeenCalled();
    });

    it('appelle auditLog.log en fire-and-forget quand fourni (@Optional)', async () => {
      const auditLog = { log: jest.fn().mockResolvedValue(undefined) };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          UsersService,
          { provide: getRepositoryToken(User), useValue: usersRepository },
          {
            provide: getRepositoryToken(Vehicle),
            useValue: mockVehiclesRepo(),
          },
          {
            provide: getRepositoryToken(DeliveryOrder),
            useValue: ordersRepository,
          },
          { provide: AuditLogService, useValue: auditLog },
        ],
      }).compile();
      const svc = module.get<UsersService>(UsersService);

      usersRepository.findOne.mockResolvedValue(pendingLivreur());
      usersRepository.save.mockImplementation(async (u: any) => u);

      await svc.setDriverApproval('livreur-1', 'APPROVED', 'admin-1');
      await new Promise((r) => setImmediate(r));

      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          adminId: 'admin-1',
          action: 'DRIVER_APPROVE',
          targetType: 'User',
          targetId: 'livreur-1',
        }),
      );
    });

    // ── §14.1 : notification au livreur à l'approbation/refus ─────────────

    it('APPROVED : envoie une notification "Compte validé" au livreur (@Optional)', async () => {
      const notifications = {
        sendToUser: jest.fn().mockResolvedValue(undefined),
      };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          UsersService,
          { provide: getRepositoryToken(User), useValue: usersRepository },
          {
            provide: getRepositoryToken(Vehicle),
            useValue: mockVehiclesRepo(),
          },
          {
            provide: getRepositoryToken(DeliveryOrder),
            useValue: ordersRepository,
          },
          { provide: NotificationsService, useValue: notifications },
        ],
      }).compile();
      const svc = module.get<UsersService>(UsersService);

      usersRepository.findOne.mockResolvedValue(pendingLivreur());
      usersRepository.save.mockImplementation(async (u: any) => u);

      await svc.setDriverApproval('livreur-1', 'APPROVED', 'admin-1');
      await new Promise((r) => setImmediate(r));

      expect(notifications.sendToUser).toHaveBeenCalledWith(
        'livreur-1',
        expect.objectContaining({
          title: 'Compte validé',
          body: 'Votre compte livreur a été validé, vous pouvez passer disponible.',
          data: { kind: 'driver_approval', status: 'APPROVED' },
        }),
      );
    });

    it('REJECTED avec reason : envoie une notification "Compte refusé" avec la raison en body', async () => {
      const notifications = {
        sendToUser: jest.fn().mockResolvedValue(undefined),
      };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          UsersService,
          { provide: getRepositoryToken(User), useValue: usersRepository },
          {
            provide: getRepositoryToken(Vehicle),
            useValue: mockVehiclesRepo(),
          },
          {
            provide: getRepositoryToken(DeliveryOrder),
            useValue: ordersRepository,
          },
          { provide: NotificationsService, useValue: notifications },
        ],
      }).compile();
      const svc = module.get<UsersService>(UsersService);

      usersRepository.findOne.mockResolvedValue(pendingLivreur());
      usersRepository.save.mockImplementation(async (u: any) => u);

      await svc.setDriverApproval(
        'livreur-1',
        'REJECTED',
        'admin-1',
        'Documents invalides',
      );
      await new Promise((r) => setImmediate(r));

      expect(notifications.sendToUser).toHaveBeenCalledWith(
        'livreur-1',
        expect.objectContaining({
          title: 'Compte refusé',
          body: 'Documents invalides',
          data: { kind: 'driver_approval', status: 'REJECTED' },
        }),
      );
    });

    it('ne casse pas si NotificationsService est absent (non injecté)', async () => {
      usersRepository.findOne.mockResolvedValue(pendingLivreur());
      usersRepository.save.mockImplementation(async (u: any) => u);

      await expect(
        service.setDriverApproval('livreur-1', 'APPROVED', 'admin-1'),
      ).resolves.toEqual(
        expect.objectContaining({
          driverApprovalStatus: DriverApprovalStatus.APPROVED,
        }),
      );
    });
  });

  describe('setAvailability', () => {
    it('APPROVED → met à jour isAvailable et renvoie { isAvailable }', async () => {
      usersRepository.findOne.mockResolvedValue({
        id: 'livreur-1',
        role: UserRole.LIVREUR,
        profilePhotoUrl: '/uploads/livreur.jpg',
        driverApprovalStatus: DriverApprovalStatus.APPROVED,
        isAvailable: false,
      });
      usersRepository.save.mockImplementation(async (u: any) => u);

      const result = await service.setAvailability('livreur-1', true);

      expect(result).toEqual({ isAvailable: true });
      expect(usersRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ isAvailable: true }),
      );
    });

    it('non-APPROVED (PENDING) → ForbiddenException', async () => {
      usersRepository.findOne.mockResolvedValue({
        id: 'livreur-1',
        role: UserRole.LIVREUR,
        driverApprovalStatus: DriverApprovalStatus.PENDING,
        isAvailable: false,
      });

      await expect(
        service.setAvailability('livreur-1', true),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(usersRepository.save).not.toHaveBeenCalled();
    });

    it('non-livreur → ForbiddenException', async () => {
      usersRepository.findOne.mockResolvedValue({
        id: 'client-1',
        role: UserRole.CLIENT,
      });

      await expect(
        service.setAvailability('client-1', true),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(usersRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('updateProfilePhoto', () => {
    it('met à jour profilePhotoUrl à la racine /uploads/', async () => {
      usersRepository.update.mockResolvedValue({ affected: 1 } as any);

      const result = await service.updateProfilePhoto('user-1', 'photo.jpg');

      expect(usersRepository.update).toHaveBeenCalledWith('user-1', {
        profilePhotoUrl: '/uploads/photo.jpg',
      });
      expect(result).toEqual({ profilePhotoUrl: '/uploads/photo.jpg' });
    });
  });

  describe('updateIdCardPhoto', () => {
    it('met à jour idCardPhotoUrl avec une clé opaque identity/<filename>', async () => {
      usersRepository.update.mockResolvedValue({ affected: 1 } as any);

      const result = await service.updateIdCardPhoto('user-1', 'cni.jpg');

      expect(usersRepository.update).toHaveBeenCalledWith('user-1', {
        idCardPhotoUrl: 'identity/cni.jpg',
      });
      expect(result).toEqual({ ok: true });
    });
  });

  describe('getIdCardPhoto', () => {
    it('autorise le propriétaire et renvoie le flux privé', async () => {
      usersRepository.findOne.mockResolvedValue({
        id: 'user-1',
        idCardPhotoUrl: 'identity/cni.jpg',
      });

      const identityStorage = mockIdentityStorage();
      identityStorage.open.mockResolvedValue({
        stream: Readable.from(['binary']),
        contentType: 'image/jpeg',
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          UsersService,
          { provide: getRepositoryToken(User), useValue: usersRepository },
          {
            provide: getRepositoryToken(Vehicle),
            useValue: mockVehiclesRepo(),
          },
          {
            provide: getRepositoryToken(DeliveryOrder),
            useValue: ordersRepository,
          },
          { provide: IdentityStorageService, useValue: identityStorage },
        ],
      }).compile();
      const svc = module.get<UsersService>(UsersService);

      const asset = await svc.getIdCardPhoto('user-1', {
        id: 'user-1',
        role: UserRole.CLIENT,
      });

      expect(identityStorage.open).toHaveBeenCalledWith('identity/cni.jpg');
      expect(asset.contentType).toBe('image/jpeg');
      expect(asset.stream).toBeDefined();
    });

    it('refuse un accès tiers non admin', async () => {
      await expect(
        service.getIdCardPhoto('user-1', {
          id: 'user-2',
          role: UserRole.CLIENT,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('findEligibleLivreurIds', () => {
    it('renvoie les ids des livreurs APPROVED + isAvailable + isPublic', async () => {
      usersRepository.find.mockResolvedValue([
        { id: 'l1', profilePhotoUrl: '/uploads/l1.jpg' },
        { id: 'l2', profilePhotoUrl: '/uploads/l2.jpg' },
      ]);

      const result = await service.findEligibleLivreurIds();

      expect(result).toEqual(['l1', 'l2']);
      expect(usersRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            role: UserRole.LIVREUR,
            driverApprovalStatus: DriverApprovalStatus.APPROVED,
            isAvailable: true,
            isPublic: true,
            status: UserStatus.ACTIVE,
          },
        }),
      );
    });

    it('exclut isPublic=false du filtre (query where isPublic: true)', async () => {
      // Le filtre `isPublic: true` est passé directement à la query — un
      // livreur privé (isPublic=false) ne matcherait donc jamais cette
      // condition côté DB réelle. On vérifie ici que le service construit
      // bien la requête avec ce filtre (CDC V1 §9.3).
      usersRepository.find.mockResolvedValue([]);

      await service.findEligibleLivreurIds();

      const callArg = usersRepository.find.mock.calls[0][0];
      expect(callArg.where.isPublic).toBe(true);
    });
  });

  // ── P2 (CDC V1 §9.3) : livreur privé / public ─────────────────────────────

  describe('setPublicVisibility', () => {
    it('bascule isPublic à false pour un livreur', async () => {
      const livreur = {
        id: 'livreur-1',
        role: UserRole.LIVREUR,
        isPublic: true,
      };
      usersRepository.findOne.mockResolvedValue(livreur);
      usersRepository.save.mockImplementation(async (u: any) => u);

      const result = await service.setPublicVisibility('livreur-1', false);

      expect(result).toEqual({ isPublic: false });
      expect(usersRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ isPublic: false }),
      );
    });

    it('rejette avec ForbiddenException si ce n’est pas un livreur', async () => {
      usersRepository.findOne.mockResolvedValue({
        id: 'client-1',
        role: UserRole.CLIENT,
      });

      await expect(
        service.setPublicVisibility('client-1', false),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(usersRepository.save).not.toHaveBeenCalled();
    });
  });

  // ── P0 sécurité (CDC V1) : suspension de compte ───────────────────────────

  describe('adminResetPassword', () => {
    const targetAdmin = () => ({ id: 'admin-2', role: UserRole.ADMIN });

    it('refuse le self-target (doit passer par changePassword)', async () => {
      await expect(
        service.adminResetPassword('admin-1', 'new-password', 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(usersRepository.findOne).not.toHaveBeenCalled();
      expect(usersRepository.update).not.toHaveBeenCalled();
    });

    it("refuse si la cible n'est pas un compte ADMIN", async () => {
      usersRepository.findOne.mockResolvedValue({
        id: 'user-1',
        role: UserRole.CLIENT,
      });
      await expect(
        service.adminResetPassword('user-1', 'new-password', 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(usersRepository.update).not.toHaveBeenCalled();
    });

    it('hash et enregistre le nouveau mot de passe pour une cible ADMIN', async () => {
      usersRepository.findOne.mockResolvedValue(targetAdmin());
      usersRepository.update.mockResolvedValue({ affected: 1 } as any);

      await expect(
        service.adminResetPassword('admin-2', 'new-password', 'admin-1'),
      ).resolves.toEqual({ ok: true });

      expect(usersRepository.update).toHaveBeenCalledTimes(1);
      const [id, patch] = usersRepository.update.mock.calls[0];
      expect(id).toBe('admin-2');
      // Le mot de passe stocké doit être un hash bcrypt qui valide bien le
      // mot de passe fourni — pas juste une chaîne quelconque.
      await expect(
        bcrypt.compare('new-password', patch.password),
      ).resolves.toBe(true);
    });

    it('appelle auditLog.log en fire-and-forget (@Optional)', async () => {
      const auditLog = { log: jest.fn().mockResolvedValue(undefined) };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          UsersService,
          { provide: getRepositoryToken(User), useValue: usersRepository },
          {
            provide: getRepositoryToken(Vehicle),
            useValue: mockVehiclesRepo(),
          },
          {
            provide: getRepositoryToken(DeliveryOrder),
            useValue: ordersRepository,
          },
          { provide: AuditLogService, useValue: auditLog },
        ],
      }).compile();
      const svc = module.get<UsersService>(UsersService);

      usersRepository.findOne.mockResolvedValue(targetAdmin());
      usersRepository.update.mockResolvedValue({ affected: 1 } as any);

      await svc.adminResetPassword('admin-2', 'new-password', 'admin-1');
      await new Promise((r) => setImmediate(r));

      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          adminId: 'admin-1',
          action: 'ADMIN_PASSWORD_RESET',
          targetType: 'User',
          targetId: 'admin-2',
        }),
      );
    });

    it("ne casse pas si auditLog est absent (non injecté)", async () => {
      usersRepository.findOne.mockResolvedValue(targetAdmin());
      usersRepository.update.mockResolvedValue({ affected: 1 } as any);

      await expect(
        service.adminResetPassword('admin-2', 'new-password', 'admin-1'),
      ).resolves.toEqual({ ok: true });
    });
  });

  describe('suspend', () => {
    const activeUser = () => ({
      id: 'user-1',
      role: UserRole.CLIENT,
      status: UserStatus.ACTIVE,
    });

    it('positionne status=SUSPENDED et renvoie le user à jour', async () => {
      usersRepository.findOne.mockResolvedValue(activeUser());
      usersRepository.save.mockImplementation(async (u: any) => u);

      const result = await service.suspend('user-1', 'admin-1', 'Fraude');

      expect(result.status).toBe(UserStatus.SUSPENDED);
      expect(usersRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: UserStatus.SUSPENDED }),
      );
    });

    it('appelle auditLog.log en fire-and-forget avec la reason (@Optional)', async () => {
      const auditLog = { log: jest.fn().mockResolvedValue(undefined) };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          UsersService,
          { provide: getRepositoryToken(User), useValue: usersRepository },
          {
            provide: getRepositoryToken(Vehicle),
            useValue: mockVehiclesRepo(),
          },
          {
            provide: getRepositoryToken(DeliveryOrder),
            useValue: ordersRepository,
          },
          { provide: AuditLogService, useValue: auditLog },
        ],
      }).compile();
      const svc = module.get<UsersService>(UsersService);

      usersRepository.findOne.mockResolvedValue(activeUser());
      usersRepository.save.mockImplementation(async (u: any) => u);

      await svc.suspend('user-1', 'admin-1', 'Fraude avérée');
      await new Promise((r) => setImmediate(r));

      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          adminId: 'admin-1',
          action: 'USER_SUSPEND',
          targetType: 'User',
          targetId: 'user-1',
          metadata: { reason: 'Fraude avérée' },
        }),
      );
    });

    it('ne casse pas si auditLog est absent (non injecté)', async () => {
      usersRepository.findOne.mockResolvedValue(activeUser());
      usersRepository.save.mockImplementation(async (u: any) => u);

      await expect(service.suspend('user-1', 'admin-1')).resolves.toEqual(
        expect.objectContaining({ status: UserStatus.SUSPENDED }),
      );
    });
  });

  describe('reactivate', () => {
    const suspendedUser = () => ({
      id: 'user-1',
      role: UserRole.CLIENT,
      status: UserStatus.SUSPENDED,
    });

    it('positionne status=ACTIVE et renvoie le user à jour', async () => {
      usersRepository.findOne.mockResolvedValue(suspendedUser());
      usersRepository.save.mockImplementation(async (u: any) => u);

      const result = await service.reactivate('user-1', 'admin-1');

      expect(result.status).toBe(UserStatus.ACTIVE);
      expect(usersRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: UserStatus.ACTIVE }),
      );
    });

    it('appelle auditLog.log en fire-and-forget (@Optional)', async () => {
      const auditLog = { log: jest.fn().mockResolvedValue(undefined) };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          UsersService,
          { provide: getRepositoryToken(User), useValue: usersRepository },
          {
            provide: getRepositoryToken(Vehicle),
            useValue: mockVehiclesRepo(),
          },
          {
            provide: getRepositoryToken(DeliveryOrder),
            useValue: ordersRepository,
          },
          { provide: AuditLogService, useValue: auditLog },
        ],
      }).compile();
      const svc = module.get<UsersService>(UsersService);

      usersRepository.findOne.mockResolvedValue(suspendedUser());
      usersRepository.save.mockImplementation(async (u: any) => u);

      await svc.reactivate('user-1', 'admin-1');
      await new Promise((r) => setImmediate(r));

      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          adminId: 'admin-1',
          action: 'USER_REACTIVATE',
          targetType: 'User',
          targetId: 'user-1',
        }),
      );
    });
  });

  // ── Conformité Google Play : suppression de compte en self-service ────────

  describe('deleteOwnAccount', () => {
    const MOT_DE_PASSE = 'motdepasse123';
    const HASH = bcrypt.hashSync(MOT_DE_PASSE, 4);

    /**
     * `findByIdWithPassword` passe par le query builder (la colonne `password`
     * est `select: false`) : on mocke la chaîne addSelect→where→getOne.
     */
    const mockLoadWithPassword = (user: any) => {
      usersRepository.createQueryBuilder.mockReturnValue({
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(user),
      } as any);
    };

    const compte = (overrides: Record<string, unknown> = {}) => ({
      id: 'user-1',
      role: UserRole.CLIENT,
      phone: '+22890000001',
      password: HASH,
      ...overrides,
    });

    it('refuse un mot de passe invalide sans rien modifier', async () => {
      mockLoadWithPassword(compte());

      await expect(
        service.deleteOwnAccount('user-1', 'mauvais-mot-de-passe'),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(ordersRepository.count).not.toHaveBeenCalled();
      expect(usersRepository.update).not.toHaveBeenCalled();
      expect(usersRepository.softDelete).not.toHaveBeenCalled();
    });

    it('refuse un compte sans mot de passe local, avec le même message', async () => {
      mockLoadWithPassword(compte({ password: undefined }));

      await expect(
        service.deleteOwnAccount('user-1', MOT_DE_PASSE),
      ).rejects.toMatchObject({ message: 'Mot de passe incorrect' });
      expect(usersRepository.softDelete).not.toHaveBeenCalled();
    });

    it('refuse (409) si une course est encore en cours', async () => {
      mockLoadWithPassword(compte());
      ordersRepository.count.mockResolvedValue(1);

      await expect(
        service.deleteOwnAccount('user-1', MOT_DE_PASSE),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(usersRepository.softDelete).not.toHaveBeenCalled();
    });

    it('cherche les courses actives sur les 3 rattachements (client, livreur, commerçant)', async () => {
      mockLoadWithPassword(compte({ role: UserRole.LIVREUR }));

      await service.deleteOwnAccount('user-1', MOT_DE_PASSE);

      const where = ordersRepository.count.mock.calls[0][0].where;
      expect(where.map((clause: any) => Object.keys(clause)[0])).toEqual([
        'client',
        'livreur',
        'merchant',
      ]);
      // Les statuts terminaux (COMPLETED / CANCELLED / FAILED) ne doivent pas
      // bloquer : une commande livrée l'an dernier n'est plus « en cours ».
      const statuts = where[0].status.value;
      expect(statuts).toEqual([
        OrderStatus.PENDING,
        OrderStatus.ACCEPTED,
        OrderStatus.EN_ROUTE_PICKUP,
        OrderStatus.AT_PICKUP,
        OrderStatus.IN_PROGRESS,
        OrderStatus.NEAR_CLIENT,
      ]);
    });

    it('anonymise, purge les device tokens et soft-delete dans une transaction', async () => {
      mockLoadWithPassword(compte());
      usersRepository.update.mockResolvedValue({ affected: 1 } as any);
      usersRepository.softDelete.mockResolvedValue({ affected: 1 } as any);

      await expect(
        service.deleteOwnAccount('user-1', MOT_DE_PASSE),
      ).resolves.toEqual({ ok: true });

      expect(usersRepository.manager.transaction).toHaveBeenCalledTimes(1);
      expect(deviceTokensRepository.delete).toHaveBeenCalledWith({
        userId: 'user-1',
      });

      const [id, patch] = usersRepository.update.mock.calls[0];
      expect(id).toBe('user-1');
      expect(patch).toEqual(
        expect.objectContaining({
          firstName: 'Compte',
          lastName: 'supprimé',
          password: null,
          profilePhotoUrl: null,
          idCardPhotoUrl: null,
          fcmToken: null,
          isAvailable: false,
          isPublic: false,
        }),
      );
      // Le numéro réel doit être libéré ET rendu inutilisable pour un login.
      expect(patch.phone).not.toBe('+22890000001');
      expect(patch.phone).toMatch(/^deleted-[0-9a-f-]{36}$/);
      expect(String(patch.phone).length).toBeLessThanOrEqual(255);

      expect(usersRepository.softDelete).toHaveBeenCalledWith('user-1');
    });

    it('journalise ACCOUNT_SELF_DELETE sans adminId ni donnée personnelle', async () => {
      const auditLog = { log: jest.fn().mockResolvedValue(undefined) };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          UsersService,
          { provide: getRepositoryToken(User), useValue: usersRepository },
          {
            provide: getRepositoryToken(Vehicle),
            useValue: mockVehiclesRepo(),
          },
          {
            provide: getRepositoryToken(DeliveryOrder),
            useValue: ordersRepository,
          },
          { provide: AuditLogService, useValue: auditLog },
        ],
      }).compile();
      const svc = module.get<UsersService>(UsersService);

      mockLoadWithPassword(compte({ role: UserRole.COMMERCANT }));

      await svc.deleteOwnAccount('user-1', MOT_DE_PASSE);
      await new Promise((r) => setImmediate(r));

      expect(auditLog.log).toHaveBeenCalledWith({
        adminId: null,
        action: 'ACCOUNT_SELF_DELETE',
        targetType: 'User',
        targetId: 'user-1',
        metadata: { role: UserRole.COMMERCANT },
      });
    });

    it('ne casse pas si auditLog est absent (non injecté)', async () => {
      mockLoadWithPassword(compte());

      await expect(
        service.deleteOwnAccount('user-1', MOT_DE_PASSE),
      ).resolves.toEqual({ ok: true });
    });

    /**
     * Purge des fichiers : l'application annonce à l'utilisateur que sa photo
     * et sa pièce d'identité sont supprimées. Remettre les colonnes à NULL ne
     * suffit pas — les binaires resteraient lisibles sur les volumes.
     */
    describe('purge des fichiers', () => {
      const buildWithStorage = async (
        objectStorage: any,
        identityStorage: any,
      ) => {
        const module: TestingModule = await Test.createTestingModule({
          providers: [
            UsersService,
            { provide: getRepositoryToken(User), useValue: usersRepository },
            {
              provide: getRepositoryToken(Vehicle),
              useValue: mockVehiclesRepo(),
            },
            {
              provide: getRepositoryToken(DeliveryOrder),
              useValue: ordersRepository,
            },
            {
              provide: getRepositoryToken(DeviceToken),
              useValue: deviceTokensRepository,
            },
            { provide: ObjectStorageService, useValue: objectStorage },
            { provide: IdentityStorageService, useValue: identityStorage },
          ],
        }).compile();
        return module.get<UsersService>(UsersService);
      };

      it('supprime la photo de profil et la pièce d’identité du stockage', async () => {
        const objectStorage = { remove: jest.fn().mockResolvedValue(true) };
        const identityStorage = { remove: jest.fn().mockResolvedValue(true) };
        const svc = await buildWithStorage(objectStorage, identityStorage);

        mockLoadWithPassword(
          compte({
            role: UserRole.LIVREUR,
            profilePhotoUrl: '/uploads/photo-1.jpg',
          }),
        );
        // `idCardPhotoUrl` est `select: false` : le service doit le relire
        // explicitement, sinon la pièce d'identité resterait sur disque.
        usersRepository.findOne.mockResolvedValue({
          id: 'user-1',
          idCardPhotoUrl: 'identity/piece-1.jpg',
        } as any);

        await expect(
          svc.deleteOwnAccount('user-1', MOT_DE_PASSE),
        ).resolves.toEqual({ ok: true });

        expect(objectStorage.remove).toHaveBeenCalledWith('/uploads/photo-1.jpg');
        expect(identityStorage.remove).toHaveBeenCalledWith(
          'identity/piece-1.jpg',
        );
      });

      it('n’appelle pas le stockage quand le compte n’a aucun fichier', async () => {
        const objectStorage = { remove: jest.fn().mockResolvedValue(true) };
        const identityStorage = { remove: jest.fn().mockResolvedValue(true) };
        const svc = await buildWithStorage(objectStorage, identityStorage);

        mockLoadWithPassword(compte({ profilePhotoUrl: null }));
        usersRepository.findOne.mockResolvedValue({
          id: 'user-1',
          idCardPhotoUrl: null,
        } as any);

        await svc.deleteOwnAccount('user-1', MOT_DE_PASSE);

        expect(objectStorage.remove).not.toHaveBeenCalled();
        expect(identityStorage.remove).not.toHaveBeenCalled();
      });

      it('ne fait pas échouer la suppression si le stockage refuse', async () => {
        // Le compte est déjà supprimé et committé à ce stade : renvoyer une
        // erreur laisserait croire le contraire à l'utilisateur.
        const objectStorage = { remove: jest.fn().mockResolvedValue(false) };
        const identityStorage = {
          remove: jest.fn().mockRejectedValue(new Error('storage HS')),
        };
        const svc = await buildWithStorage(objectStorage, identityStorage);

        mockLoadWithPassword(
          compte({ profilePhotoUrl: '/uploads/photo-1.jpg' }),
        );
        usersRepository.findOne.mockResolvedValue({
          id: 'user-1',
          idCardPhotoUrl: 'identity/piece-1.jpg',
        } as any);

        await expect(
          svc.deleteOwnAccount('user-1', MOT_DE_PASSE),
        ).resolves.toEqual({ ok: true });
        expect(usersRepository.softDelete).toHaveBeenCalledWith('user-1');
      });

      it('purge les fichiers APRÈS le commit, jamais avant', async () => {
        const ordre: string[] = [];
        const objectStorage = {
          remove: jest.fn().mockImplementation(() => {
            ordre.push('purge');
            return Promise.resolve(true);
          }),
        };
        const svc = await buildWithStorage(objectStorage, {
          remove: jest.fn().mockResolvedValue(true),
        });

        usersRepository.manager.transaction.mockImplementation(
          async (cb: any) => {
            const res = await cb({
              getRepository: (entity: any) =>
                entity === DeviceToken
                  ? deviceTokensRepository
                  : usersRepository,
            });
            ordre.push('commit');
            return res;
          },
        );

        mockLoadWithPassword(
          compte({ profilePhotoUrl: '/uploads/photo-1.jpg' }),
        );
        usersRepository.findOne.mockResolvedValue({
          id: 'user-1',
          idCardPhotoUrl: null,
        } as any);

        await svc.deleteOwnAccount('user-1', MOT_DE_PASSE);

        expect(ordre).toEqual(['commit', 'purge']);
      });
    });
  });
});
