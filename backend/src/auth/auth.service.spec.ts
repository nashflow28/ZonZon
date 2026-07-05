import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn().mockResolvedValue('hashed'),
  genSalt: jest.fn().mockResolvedValue('salt'),
}));

import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { UserRole } from '../entities/user.entity';
import { VehicleType } from '../entities/vehicle.entity';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: {
    findByPhone: jest.Mock;
    createWithPassword: jest.Mock;
    attachVehicle: jest.Mock;
  };
  let jwtService: { sign: jest.Mock };

  beforeEach(async () => {
    usersService = {
      findByPhone: jest.fn(),
      createWithPassword: jest.fn(),
      attachVehicle: jest.fn(),
    };
    jwtService = { sign: jest.fn().mockReturnValue('fake.jwt.token') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('register', () => {
    const dto = {
      firstName: 'Alice',
      lastName: 'Bob',
      phone: '+22890000001',
      password: 'secret123',
      role: UserRole.CLIENT,
    };

    it('throw ConflictException si le phone existe déjà', async () => {
      usersService.findByPhone.mockResolvedValue({ id: 'u-1' });
      await expect(service.register(dto as any)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('crée l’utilisateur et retourne { access_token, user } sans password', async () => {
      usersService.findByPhone.mockResolvedValue(null);
      usersService.createWithPassword.mockResolvedValue({
        id: 'u-1',
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        role: dto.role,
        password: 'hashed',
      });

      const res = await service.register(dto);

      expect(usersService.createWithPassword).toHaveBeenCalledWith({
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        role: dto.role,
        password: dto.password,
      });
      expect(jwtService.sign).toHaveBeenCalledWith({
        phone: dto.phone,
        sub: 'u-1',
        role: dto.role,
      });
      expect(res).toEqual({
        access_token: 'fake.jwt.token',
        user: expect.objectContaining({ id: 'u-1', phone: dto.phone }),
      });
      expect(res.user.password).toBeUndefined();
    });

    it('attache le véhicule si le rôle est LIVREUR avec un vehicleType', async () => {
      usersService.findByPhone.mockResolvedValue(null);
      usersService.createWithPassword.mockResolvedValue({
        id: 'u-2',
        role: UserRole.LIVREUR,
        phone: '+22890000002',
      });

      await service.register({
        ...dto,
        phone: '+22890000002',
        role: UserRole.LIVREUR,
        vehicleType: VehicleType.MOTO,
      });

      expect(usersService.attachVehicle).toHaveBeenCalledWith(
        'u-2',
        VehicleType.MOTO,
      );
    });

    it('refuse la création d’un compte ADMIN via l’inscription publique (escalade de privilèges)', async () => {
      await expect(
        service.register({
          ...dto,
          phone: '+22890000099',
          role: UserRole.ADMIN,
        } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);

      // Aucun accès DB ne doit avoir lieu : le refus est immédiat.
      expect(usersService.findByPhone).not.toHaveBeenCalled();
      expect(usersService.createWithPassword).not.toHaveBeenCalled();
    });
  });

  describe('validateUser', () => {
    it('retourne null si l’utilisateur n’existe pas', async () => {
      usersService.findByPhone.mockResolvedValue(null);
      const res = await service.validateUser('+228', 'x');
      expect(res).toBeNull();
    });

    it('retourne null si bcrypt ne match pas', async () => {
      usersService.findByPhone.mockResolvedValue({ id: 'u', password: 'hash' });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      const res = await service.validateUser('+228', 'bad');
      expect(res).toBeNull();
    });

    it('retourne le user sans password si bcrypt match', async () => {
      usersService.findByPhone.mockResolvedValue({
        id: 'u',
        phone: '+228',
        password: 'hash',
        role: UserRole.CLIENT,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const res = await service.validateUser('+228', 'good');
      expect(res).toEqual({ id: 'u', phone: '+228', role: UserRole.CLIENT });
      expect((res as any).password).toBeUndefined();
    });
  });

  describe('loginWithCredentials', () => {
    it('throw UnauthorizedException si validateUser retourne null', async () => {
      usersService.findByPhone.mockResolvedValue(null);
      await expect(
        service.loginWithCredentials('+228', 'x'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('retourne { access_token, user } si OK', async () => {
      usersService.findByPhone.mockResolvedValue({
        id: 'u',
        phone: '+228',
        password: 'hash',
        role: UserRole.CLIENT,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const res = await service.loginWithCredentials('+228', 'good');
      expect(res.access_token).toBe('fake.jwt.token');
      expect(res.user).toEqual(expect.objectContaining({ id: 'u' }));
    });
  });
});
