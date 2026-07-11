import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { DeviceTokensService } from './device-tokens.service';
import { User } from '../entities/user.entity';
import { Vehicle } from '../entities/vehicle.entity';
import { DeviceToken } from '../entities/device-token.entity';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Vehicle, DeviceToken]),
    AuditLogModule,
    // Cycle DI : NotificationsModule importe UsersModule (pour
    // DeviceTokensService). UsersService a lui-même besoin de
    // NotificationsService (§14.1 — notif validation/refus livreur) → on
    // casse le cycle avec forwardRef des deux côtés.
    forwardRef(() => NotificationsModule),
    StorageModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, DeviceTokensService],
  exports: [UsersService, DeviceTokensService],
})
export class UsersModule {}
