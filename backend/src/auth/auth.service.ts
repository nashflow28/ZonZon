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

  /**
   * Étape 1 du reset de mot de passe admin (self-service, via WhatsApp OTP).
   *
   * Réponse volontairement IDENTIQUE que le numéro corresponde ou non à un
   * compte ADMIN (anti-énumération, même principe que la revue avait relevé
   * sur `register`) : on ne déclenche l'envoi WhatsApp — et donc la seule
   * fuite d'information observable (un message reçu ou non) — que si le
   * compte existe et est bien un ADMIN.
   *
   * Si `WHATSAPP_OTP_ENABLED` n'est pas activé, `whatsappOtp.request()` lève
   * un 503 explicite : ce n'est PAS spécifique au compte visé (même échec
   * pour n'importe quel admin tant que le canal n'est pas configuré), donc
   * aucune fuite d'énumération supplémentaire.
   */
  async requestPasswordReset(phone: string): Promise<{ sent: true }> {
    const user = await this.usersService.findByPhone(phone);
    if (user && user.role === UserRole.ADMIN) {
      await this.whatsappOtp.request(phone);
    }
    return { sent: true };
  }

  /**
   * Étape 2 : vérifie le code WhatsApp et applique le nouveau mot de passe.
   * Scopé aux comptes ADMIN — c'est le rôle demandé, et élargir résoudrait un
   * problème plus large (canal de recovery pour tous les rôles) non posé ici.
   */
  async resetPasswordWithOtp(
    phone: string,
    code: string,
    newPassword: string,
  ): Promise<{ ok: true }> {
    const user = await this.usersService.findByPhone(phone);
    if (!user || user.role !== UserRole.ADMIN) {
      // Même message que "code invalide" : ne pas distinguer un compte
      // inexistant/non-admin d'un code erroné (anti-énumération).
      throw new UnauthorizedException('Code invalide ou expiré');
    }
    // Lève UnauthorizedException (code invalide/expiré) ou 429 (trop de
    // tentatives) — la garde anti-brute-force est déjà dans WhatsappOtpService.
    await this.whatsappOtp.verify(phone, code);

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(newPassword, salt);
    await this.usersService.updatePassword(user.id, hash);
    return { ok: true };
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
