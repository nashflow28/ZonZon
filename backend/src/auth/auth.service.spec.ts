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
import { UserRole, UserStatus } from '../entities/user.entity';
import { VehicleType } from '../entities/vehicle.entity';
import { WhatsappOtpService } from './whatsapp-otp.service';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: {
    findByPhone: jest.Mock;
    findByIdWithPassword: jest.Mock;
    updatePassword: jest.Mock;
    createWithPassword: jest.Mock;
    attachVehicle: jest.Mock;
  };
  let jwtService: { sign: jest.Mock };
  let whatsappOtp: {
    assertProof: jest.Mock;
    request: jest.Mock;
    verify: jest.Mock;
  };

  beforeEach(async () => {
    usersService = {
      findByPhone: jest.fn(),
      findByIdWithPassword: jest.fn(),
      updatePassword: jest.fn(),
      createWithPassword: jest.fn(),
      attachVehicle: jest.fn(),
    };
    jwtService = { sign: jest.fn().mockReturnValue('fake.jwt.token') };
    whatsappOtp = {
      assertProof: jest.fn(),
      request: jest.fn(),
      verify: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        { provide: WhatsappOtpService, useValue: whatsappOtp },
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
      expect(whatsappOtp.assertProof).toHaveBeenCalledWith(
        dto.phone,
        undefined,
      );
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

    // ── P0 sécurité (CDC V1) : suspension de compte ─────────────────────────

    it('throw UnauthorizedException si le compte est SUSPENDED', async () => {
      usersService.findByPhone.mockResolvedValue({
        id: 'u',
        phone: '+228',
        password: 'hash',
        role: UserRole.CLIENT,
        status: UserStatus.SUSPENDED,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        service.loginWithCredentials('+228', 'good'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('autorise le login si le compte est ACTIVE', async () => {
      usersService.findByPhone.mockResolvedValue({
        id: 'u',
        phone: '+228',
        password: 'hash',
        role: UserRole.CLIENT,
        status: UserStatus.ACTIVE,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const res = await service.loginWithCredentials('+228', 'good');
      expect(res.access_token).toBe('fake.jwt.token');
    });
  });

  describe('changePassword', () => {
    it('refuse l’ancien mot de passe incorrect', async () => {
      usersService.findByIdWithPassword.mockResolvedValue({
        id: 'u',
        password: 'old-hash',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      // 403 et non 401 : le porteur est authentifié. Un 401 est interprété par
      // les clients comme une session expirée et déclenche une déconnexion
      // complète (purge du JWT et du token FCM).
      await expect(
        service.changePassword('u', 'wrong', 'new-password'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(usersService.updatePassword).not.toHaveBeenCalled();
    });

    it('refuse un nouveau mot de passe identique', async () => {
      usersService.findByIdWithPassword.mockResolvedValue({
        id: 'u',
        password: 'old-hash',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        service.changePassword('u', 'same-password', 'same-password'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(usersService.updatePassword).not.toHaveBeenCalled();
    });

    it('hash et enregistre le nouveau mot de passe', async () => {
      usersService.findByIdWithPassword.mockResolvedValue({
        id: 'u',
        password: 'old-hash',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.genSalt as jest.Mock).mockResolvedValue('salt');
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');

      await expect(
        service.changePassword('u', 'old-password', 'new-password'),
      ).resolves.toEqual({ ok: true });
      expect(bcrypt.hash).toHaveBeenCalledWith('new-password', 'salt');
      expect(usersService.updatePassword).toHaveBeenCalledWith(
        'u',
        'new-hash',
      );
    });
  });

  describe('requestPasswordReset', () => {
    it("n'appelle pas WhatsApp si le compte n'existe pas (anti-énumération)", async () => {
      usersService.findByPhone.mockResolvedValue(null);
      await expect(
        service.requestPasswordReset('+22890000001'),
      ).resolves.toEqual({ sent: true });
      expect(whatsappOtp.request).not.toHaveBeenCalled();
    });

    it("n'appelle pas WhatsApp si le compte n'est pas ADMIN (anti-énumération)", async () => {
      usersService.findByPhone.mockResolvedValue({
        id: 'u',
        role: UserRole.CLIENT,
      });
      await expect(
        service.requestPasswordReset('+22890000001'),
      ).resolves.toEqual({ sent: true });
      expect(whatsappOtp.request).not.toHaveBeenCalled();
    });

    it('appelle WhatsApp uniquement pour un compte ADMIN existant', async () => {
      usersService.findByPhone.mockResolvedValue({
        id: 'admin-1',
        role: UserRole.ADMIN,
      });
      await expect(
        service.requestPasswordReset('+22890000009'),
      ).resolves.toEqual({ sent: true });
      expect(whatsappOtp.request).toHaveBeenCalledWith('+22890000009');
    });
  });

  describe('resetPasswordWithOtp', () => {
    it("refuse si le compte n'existe pas, avec le même message qu'un code invalide", async () => {
      usersService.findByPhone.mockResolvedValue(null);
      await expect(
        service.resetPasswordWithOtp('+228', '123456', 'new-password'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(whatsappOtp.verify).not.toHaveBeenCalled();
      expect(usersService.updatePassword).not.toHaveBeenCalled();
    });

    it("refuse si le compte n'est pas ADMIN (anti-énumération)", async () => {
      usersService.findByPhone.mockResolvedValue({
        id: 'u',
        role: UserRole.CLIENT,
      });
      await expect(
        service.resetPasswordWithOtp('+228', '123456', 'new-password'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(whatsappOtp.verify).not.toHaveBeenCalled();
    });

    it('propage le rejet de whatsappOtp.verify (code invalide/expiré)', async () => {
      usersService.findByPhone.mockResolvedValue({
        id: 'admin-1',
        role: UserRole.ADMIN,
      });
      whatsappOtp.verify.mockRejectedValue(
        new UnauthorizedException('Code invalide ou expiré'),
      );
      await expect(
        service.resetPasswordWithOtp('+228', '000000', 'new-password'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(usersService.updatePassword).not.toHaveBeenCalled();
    });

    it('hash et enregistre le nouveau mot de passe si le code est valide', async () => {
      usersService.findByPhone.mockResolvedValue({
        id: 'admin-1',
        role: UserRole.ADMIN,
      });
      whatsappOtp.verify.mockResolvedValue({ verificationToken: 'proof.jwt' });
      (bcrypt.genSalt as jest.Mock).mockResolvedValue('salt');
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');

      await expect(
        service.resetPasswordWithOtp('+228', '123456', 'new-password'),
      ).resolves.toEqual({ ok: true });
      expect(whatsappOtp.verify).toHaveBeenCalledWith('+228', '123456');
      expect(usersService.updatePassword).toHaveBeenCalledWith(
        'admin-1',
        'new-hash',
      );
    });
  });
});
