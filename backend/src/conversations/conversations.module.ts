import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation } from '../entities/conversation.entity';
import { ConversationParticipant } from '../entities/conversation-participant.entity';
import { DeliveryOrder } from '../entities/delivery-order.entity';
import { ConversationsService } from './conversations.service';
import { ConversationsController } from './conversations.controller';

/**
 * Module additif — ne dépend QUE de TypeORM (aucune dépendance vers
 * `MessagesModule`/`OrdersModule`) pour éviter tout cycle : c'est
 * `MessagesModule` qui importera `ConversationsModule` (et non l'inverse).
 * `DeliveryOrder` est enregistré ici uniquement pour permettre au
 * controller de vérifier l'appartenance à la livraison (client/livreur/
 * commerçant créateur/admin), sans dépendre de `OrdersModule`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, ConversationParticipant, DeliveryOrder]),
  ],
  controllers: [ConversationsController],
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
