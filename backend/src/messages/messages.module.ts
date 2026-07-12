import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Message } from '../entities/message.entity';
import { MessageReadReceipt } from '../entities/message-read-receipt.entity';
import { DirectMessage } from '../entities/direct-message.entity';
import { MerchantDriver } from '../entities/merchant-driver.entity';
import { User } from '../entities/user.entity';
import { DeliveryOrder } from '../entities/delivery-order.entity';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';
import { DirectMessagesController } from './direct-messages.controller';
import { DirectMessagesService } from './direct-messages.service';
import { OrdersModule } from '../orders/orders.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ConversationsModule } from '../conversations/conversations.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Message,
      MessageReadReceipt,
      DirectMessage,
      MerchantDriver,
      User,
      DeliveryOrder,
    ]),
    forwardRef(() => OrdersModule),
    NotificationsModule,
    ConversationsModule,
  ],
  controllers: [MessagesController, DirectMessagesController],
  providers: [MessagesService, DirectMessagesService],
  exports: [MessagesService, DirectMessagesService],
})
export class MessagesModule {}
