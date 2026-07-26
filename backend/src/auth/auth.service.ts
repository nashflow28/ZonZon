import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { UserRole, UserStatus } from '../entities/user.entity';
import { RegisterDto } from './dto/register.dto';
import { WhatsappOtpService } from './whatsapp-otp.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private whatsappOtp: WhatsappOtpService,
  ) {}

  async validateUser(phone: string, pass: string) {
    const user = await this.usersService.findByPhone(phone);
    if (user && user.password) {
      const isMatch = await bcrypt.compare(pass, user.password);
      if (isMatch) {
        const { password: _p, ...result } = user;
        return result;
      }
    }
    return null;
  }

  async register(dto: RegisterDto) {
    // Défense en profondeur : même si le DTO restreint déjà les rôles
    // acceptés (@IsIn CLIENT/LIVREUR/COMMERCANT), on refuse explicitement
    // toute tentative de création d'un ADMIN via l'inscription publique.
    if ((dto.role as unknown as UserRole) === UserRole.ADMIN) {
      throw new ForbiddenException(
        "Impossible de créer un compte administrateur via l'inscription publique",
      );
    }

    this.whatsappOtp.assertProof(dto.phone, dto.verificationToken);

    const existing = await this.usersService.findByPhone(dto.phone);
    if (existing) {
      throw new ConflictException('Ce numéro de téléphone est déjà utilisé');
    }

    const user = await this.usersService.createWithPassword({
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
      role: dto.role,
      password: dto.password,
    });

    if (dto.role === 'LIVREUR' && dto.vehicleType) {
      await this.usersService.attachVehicle(user.id, dto.vehicleType);
    }

    const { password: _p, ...safe } = user as any;
    return this.login(safe);
  }

  login(user: any) {
    const payload = { phone: user.phone, sub: user.id, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user,
    };
  }

  async loginWithCredentials(phone: string, password: string) {
    const user = await this.validateUser(phone, password);
    if (!user) {
      throw new UnauthorizedException(
        'Numéro de téléphone ou mot de passe incorrect',
      );
    }
    // P0 sécurité (CDC V1) : un compte suspendu ne peut plus se connecter.
    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('Compte suspendu. Contactez le support.');
    }
    return this.login(user);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.usersService.findByIdWithPassword(userId);
    // 403 et non 401 : le porteur est authentifié, c'est la donnée fournie qui
    // est invalide. Un 401 est interprété par les clients (mobile, PWA) comme
    // une session expirée et provoque une déconnexion complète — se tromper de
    // mot de passe déconnectait l'utilisateur et détruisait son token FCM.
    if (!user.password) {
      throw new ForbiddenException(
        'Ce compte ne possède pas de mot de passe local',
      );
    }

    const matches = await bcrypt.compare(currentPassword, user.password);
    if (!matches) {
      throw new ForbiddenException('Mot de passe actuel incorrect');
    }
    if (currentPassword === newPassword) {
      throw new ConflictException(
        'Le nouveau mot de passe doit être différent de l’ancien',
      );
    }

    const salt = await bcrypt.genSalt(10);
    const password = await bcrypt.hash(newPassword, salt);
    await this.usersService.updatePassword(userId, password);
    return { ok: true };
  }
}
