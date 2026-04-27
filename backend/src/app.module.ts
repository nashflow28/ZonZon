import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { User } from './entities/user.entity';
import { Vehicle } from './entities/vehicle.entity';
import { DeliveryOrder } from './entities/delivery-order.entity';
import { Commission } from './entities/commission.entity';
import { Message } from './entities/message.entity';
import { SavedAddress } from './entities/saved-address.entity';
import { Shop } from './entities/shop.entity';
import { Product } from './entities/product.entity';
import { UsersModule } from './users/users.module';
import { OrdersModule } from './orders/orders.module';
import { AuthModule } from './auth/auth.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { ReportsModule } from './reports/reports.module';
import { MessagesModule } from './messages/messages.module';
import { AddressesModule } from './addresses/addresses.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ShopsModule } from './shops/shops.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 10 },
      { name: 'medium', ttl: 60_000, limit: 100 },
    ]),
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      username: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_DATABASE || 'zonzon_db',
      entities: [
        User,
        Vehicle,
        DeliveryOrder,
        Commission,
        Message,
        SavedAddress,
        Shop,
        Product,
      ],
      migrations: [__dirname + '/migrations/*{.ts,.js}'],
      migrationsRun: process.env.NODE_ENV === 'production',
      synchronize: process.env.NODE_ENV !== 'production',
    }),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), process.env.UPLOAD_DIR || 'uploads'),
      serveRoot: '/uploads',
    }),
    AuthModule,
    UsersModule,
    OrdersModule,
    VehiclesModule,
    ReportsModule,
    MessagesModule,
    AddressesModule,
    NotificationsModule,
    ShopsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
