import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthenticatedUser } from './types';
import { WhatsappOtpService } from './whatsapp-otp.service';
import { RequestWhatsappOtpDto } from './dto/request-whatsapp-otp.dto';
import { VerifyWhatsappOtpDto } from './dto/verify-whatsapp-otp.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private whatsappOtp: WhatsappOtpService,
  ) {}

  @Public()
  @Get('otp/whatsapp/status')
  whatsappOtpStatus() {
    return { enabled: this.whatsappOtp.isEnabled() };
  }

  @Public()
  @Throttle({ short: { limit: 3, ttl: 60_000 } })
  @Post('otp/whatsapp/request')
  requestWhatsappOtp(@Body() dto: RequestWhatsappOtpDto) {
    return this.whatsappOtp.request(dto.phone);
  }

  @Public()
  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  @Post('otp/whatsapp/verify')
  verifyWhatsappOtp(@Body() dto: VerifyWhatsappOtpDto) {
    return this.whatsappOtp.verify(dto.phone, dto.code);
  }

  @Public()
  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.loginWithCredentials(dto.phone, dto.password);
  }

  @Public()
  @Throttle({ short: { limit: 3, ttl: 60_000 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Patch('password')
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(
      user.id ?? user.sub,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    const { password: _p, ...safe } = user as AuthenticatedUser & {
      password?: string;
    };
    return safe;
  }
}
