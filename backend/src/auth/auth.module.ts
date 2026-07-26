import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PhoneVerification } from '../entities/phone-verification.entity';
import { WhatsappOtpService } from './whatsapp-otp.service';

@Module({
  imports: [
    UsersModule,
    TypeOrmModule.forFeature([PhoneVerification]),
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_SECRET;
        if (!secret) {
          throw new Error('JWT_SECRET manquant dans la configuration');
        }
        const isProd = process.env.NODE_ENV === 'production';
        const isExampleValue = secret === 'change_me_in_production';
        const isTooShort = secret.length < 32;
        if (isProd) {
          if (isExampleValue) {
            throw new Error(
              'JWT_SECRET utilise la valeur d\'exemple "change_me_in_production" en production. Générez une vraie clé (ex: openssl rand -base64 48).',
            );
          }
          if (isTooShort) {
            throw new Error(
              `JWT_SECRET trop court (${secret.length} caractères) en production : ≥ 32 caractères requis.`,
            );
          }
        } else if (isExampleValue || isTooShort) {
          console.warn(
            `[auth] JWT_SECRET faible (${isExampleValue ? "valeur d'exemple" : `${secret.length} caractères`}). Acceptable en dev uniquement. Génère une vraie clé pour la prod : openssl rand -base64 48`,
          );
        }
        return {
          secret,
          signOptions: { expiresIn: '7d' },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    WhatsappOtpService,
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
