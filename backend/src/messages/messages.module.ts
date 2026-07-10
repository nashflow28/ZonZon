import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Message } from '../entities/message.entity';
import { MessageReadReceipt } from '../entities/message-read-receipt.entity';
import { DeliveryOrder } from '../entities/delivery-order.entity';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';
import { OrdersModule } from '../orders/orders.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ConversationsModule } from '../conversations/conversations.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Message, MessageReadReceipt, DeliveryOrder]),
    forwardRef(() => OrdersModule),
    NotificationsModule,
    ConversationsModule,
  ],
  controllers: [MessagesController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
