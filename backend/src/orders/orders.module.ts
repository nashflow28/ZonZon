import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrdersGateway } from './orders.gateway';
import { PositionsService } from './positions.service';
import { DeliveryOrder } from '../entities/delivery-order.entity';
import { DriverPosition } from '../entities/driver-position.entity';
import { DeliveryStatusHistory } from '../entities/delivery-status-history.entity';
import { PriceChange } from '../entities/price-change.entity';
import { PaymentStatusHistory } from '../entities/payment-status-history.entity';
import { Zone } from '../entities/zone.entity';
import { DeliveryRun } from '../entities/delivery-run.entity';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PricingModule } from '../pricing/pricing.module';
import { MerchantDriversModule } from '../merchant-drivers/merchant-drivers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DeliveryOrder,
      DriverPosition,
      DeliveryStatusHistory,
      PriceChange,
      PaymentStatusHistory,
      Zone,
      DeliveryRun,
    ]),
    UsersModule,
    NotificationsModule,
    PricingModule,
    MerchantDriversModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersGateway, PositionsService],
  exports: [OrdersGateway],
})
export class OrdersModule {}
