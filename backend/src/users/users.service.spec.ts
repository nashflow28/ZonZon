import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';

import { UsersService } from './users.service';
import { DriverApprovalStatus, User, UserRole } from '../entities/user.entity';
import { Vehicle } from '../entities/vehicle.entity';
import { AuditLogService } from '../audit-log/audit-log.service';

const mockUsersRepo = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  softDelete: jest.fn(),
  restore: jest.fn(),
});

const mockVehiclesRepo = () => ({
  create: jest.fn(),
  save: jest.fn(),
});

describe('UsersService', () => {
  let service: UsersService;
  let usersRepository: ReturnType<typeof mockUsersRepo>;

  beforeEach(async () => {
    usersRepository = mockUsersRepo();
    const vehiclesRepository = mockVehiclesRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: usersRepository },
        { provide: getRepositoryToken(Vehicle), useValue: vehiclesRepository },
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
  });

  describe('setAvailability', () => {
    it('APPROVED → met à jour isAvailable et renvoie { isAvailable }', async () => {
      usersRepository.findOne.mockResolvedValue({
        id: 'livreur-1',
        role: UserRole.LIVREUR,
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
    it('met à jour idCardPhotoUrl dans le sous-dossier /uploads/identity/', async () => {
      usersRepository.update.mockResolvedValue({ affected: 1 } as any);

      const result = await service.updateIdCardPhoto('user-1', 'cni.jpg');

      expect(usersRepository.update).toHaveBeenCalledWith('user-1', {
        idCardPhotoUrl: '/uploads/identity/cni.jpg',
      });
      expect(result).toEqual({ idCardPhotoUrl: '/uploads/identity/cni.jpg' });
    });
  });

  describe('findEligibleLivreurIds', () => {
    it('renvoie les ids des livreurs APPROVED + isAvailable', async () => {
      usersRepository.find.mockResolvedValue([
        { id: 'l1' },
        { id: 'l2' },
      ]);

      const result = await service.findEligibleLivreurIds();

      expect(result).toEqual(['l1', 'l2']);
      expect(usersRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            role: UserRole.LIVREUR,
            driverApprovalStatus: DriverApprovalStatus.APPROVED,
            isAvailable: true,
          },
        }),
      );
    });
  });
});
