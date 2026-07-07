import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { Notification } from '../entities/notification.entity';
import { NotificationsService } from './notifications.service';
import { NotificationsQueryService } from './notifications-query.service';
import { NotificationsController } from './notifications.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Notification]),
    // forwardRef : UsersModule importe aussi NotificationsModule (§14.1 —
    // UsersService envoie une notif à l'approbation/refus livreur).
    forwardRef(() => UsersModule),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsQueryService],
  exports: [NotificationsService, NotificationsQueryService],
})
export class NotificationsModule {}
