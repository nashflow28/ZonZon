import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { SentryGlobalFilter } from '@sentry/nestjs/setup';
import { LoggerModule } from 'nestjs-pino';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { User } from './entities/user.entity';
import { Vehicle } from './entities/vehicle.entity';
import { DeliveryOrder } from './entities/delivery-order.entity';
import { Commission } from './entities/commission.entity';
import { Message } from './entities/message.entity';
import { MessageReadReceipt } from './entities/message-read-receipt.entity';
import { SavedAddress } from './entities/saved-address.entity';
import { Shop } from './entities/shop.entity';
import { Product } from './entities/product.entity';
import { FavoriteShop } from './entities/favorite-shop.entity';
import { Rating } from './entities/rating.entity';
import { AdminAuditLog } from './entities/admin-audit-log.entity';
import { DriverPosition } from './entities/driver-position.entity';
import { DeviceToken } from './entities/device-token.entity';
import { PricingConfig } from './entities/pricing-config.entity';
import { Zone } from './entities/zone.entity';
import { MerchantDriver } from './entities/merchant-driver.entity';
import { DeliveryStatusHistory } from './entities/delivery-status-history.entity';
import { PriceChange } from './entities/price-change.entity';
import { PaymentStatusHistory } from './entities/payment-status-history.entity';
import { Signalement } from './entities/signalement.entity';
import { Notification } from './entities/notification.entity';
import { Conversation } from './entities/conversation.entity';
import { ConversationParticipant } from './entities/conversation-participant.entity';
import { DirectMessage } from './entities/direct-message.entity';
import { DeliveryRun } from './entities/delivery-run.entity';
import { OrderPriceProposal } from './entities/order-price-proposal.entity';
import { UsersModule } from './users/users.module';
import { OrdersModule } from './orders/orders.module';
import { AuthModule } from './auth/auth.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { ReportsModule } from './reports/reports.module';
import { MessagesModule } from './messages/messages.module';
import { AddressesModule } from './addresses/addresses.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ShopsModule } from './shops/shops.module';
import { RatingsModule } from './ratings/ratings.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { PricingModule } from './pricing/pricing.module';
import { ZonesModule } from './zones/zones.module';
import { MerchantDriversModule } from './merchant-drivers/merchant-drivers.module';
import { SignalementsModule } from './signalements/signalements.module';
import { ConversationsModule } from './conversations/conversations.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    StorageModule,
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? {
                target: 'pino-pretty',
                options: { singleLine: true, colorize: true },
              }
            : undefined,
        redact: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
        ],
        customProps: () => ({ context: 'HTTP' }),
        serializers: {
          req: (req: { method: string; url: string; id: string | number }) => ({
            method: req.method,
            url: req.url,
            id: req.id,
          }),
          res: (res: { statusCode: number }) => ({
            statusCode: res.statusCode,
          }),
        },
        autoLogging: process.env.NODE_ENV === 'production',
      },
    }),
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
      ssl:
        process.env.DB_SSL === 'true'
          ? { rejectUnauthorized: true }
          : undefined,
      entities: [
        User,
        Vehicle,
        DeliveryOrder,
        Commission,
        Message,
        MessageReadReceipt,
        SavedAddress,
        Shop,
        Product,
        FavoriteShop,
        Rating,
        AdminAuditLog,
        DriverPosition,
        DeviceToken,
        PricingConfig,
        Zone,
        MerchantDriver,
        DeliveryStatusHistory,
        PriceChange,
        PaymentStatusHistory,
        Signalement,
        Notification,
        Conversation,
        ConversationParticipant,
        DirectMessage,
        DeliveryRun,
        OrderPriceProposal,
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
    RatingsModule,
    AuditLogModule,
    PricingModule,
    ZonesModule,
    MerchantDriversModule,
    SignalementsModule,
    ConversationsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // SentryGlobalFilter doit être enregistré via APP_FILTER (DI) et non via
    // app.useGlobalFilters(new SentryGlobalFilter()) — sans DI, applicationRef
    // est undefined et le filtre crashe sur chaque exception avec
    // "Cannot read properties of undefined (reading 'isHeadersSent')".
    { provide: APP_FILTER, useClass: SentryGlobalFilter },
  ],
})
export class AppModule {}
