import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
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
    return this.login(user);
  }
}
