import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../users/users.service';
import { UserRole, UserStatus } from '../entities/user.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private usersService: UsersService) {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET manquant dans la configuration');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  /**
   * `sub` doit être vérifié explicitement : un jeton signé avec le même secret
   * mais sans `sub` (jeton de preuve OTP, par exemple) atteindrait sinon
   * `findOne(undefined)`, qui renvoyait le premier utilisateur de la table.
   */
  async validate(payload: { sub?: string; phone?: string; role?: UserRole }) {
    if (!payload?.sub) {
      throw new UnauthorizedException();
    }
    const user = await this.usersService
      .findOne(payload.sub)
      .catch(() => null);
    if (!user) {
      throw new UnauthorizedException();
    }
    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('Compte suspendu');
    }
    return user;
  }
}
