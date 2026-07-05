import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { DeviceTokensService } from './device-tokens.service';
import { User } from '../entities/user.entity';
import { Vehicle } from '../entities/vehicle.entity';
import { DeviceToken } from '../entities/device-token.entity';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Vehicle, DeviceToken]),
    AuditLogModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, DeviceTokensService],
  exports: [UsersService, DeviceTokensService],
})
export class UsersModule {}
