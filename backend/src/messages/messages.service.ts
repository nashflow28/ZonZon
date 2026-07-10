import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message, MessageType } from '../entities/message.entity';
import { MessageReadReceipt } from '../entities/message-read-receipt.entity';
import { DeliveryOrder, OrderStatus } from '../entities/delivery-order.entity';
import { UserRole } from '../entities/user.entity';
import { OrdersGateway } from '../orders/orders.gateway';
import { SendMessageDto } from './dto/send-message.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { ConversationsService } from '../conversations/conversations.service';
import type { ConversationParticipantRole } from '../entities/conversation-participant.entity';

interface ActorPayload {
  id?: string;
  sub?: string;
  role: UserRole;
}

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    @InjectRepository(Message)
    private messagesRepo: Repository<Message>,
    @InjectRepository(MessageReadReceipt)
    private readReceiptsRepo: Repository<MessageReadReceipt>,
    @InjectRepository(DeliveryOrder)
    private ordersRepo: Repository<DeliveryOrder>,
    @Inject(forwardRef(() => OrdersGateway))
    private ordersGateway: OrdersGateway,
    private notifications: NotificationsService,
    private conversationsService: ConversationsService,
  ) {}

  private actorId(actor: ActorPayload): string {
    return (actor.id ?? actor.sub) as string;
  }

  /** Mappe le rôle backend (`UserRole`) vers le rôle CDC §18.10 de la conversation. */
  private conversationRole(role: UserRole): ConversationParticipantRole {
    switch (role) {
      case UserRole.ADMIN:
        return 'ADMIN';
      case UserRole.LIVREUR:
        return 'LIVREUR';
      case UserRole.COMMERCANT:
        return 'MERCHANT';
      case UserRole.CLIENT:
      default:
        return 'CLIENT';
    }
  }

  private async loadOrderAndAuthorize(orderId: string, actor: ActorPayload) {
    const order = await this.ordersRepo.findOne({
      where: { id: orderId },
      relations: ['client', 'livreur', 'merchant'],
    });
    if (!order) throw new NotFoundException('Commande introuvable');

    const userId = this.actorId(actor);
    const isClient = order.client?.id === userId;
    const isLivreur = order.livreur?.id === userId;
    // Le commerçant créateur d'une livraison (Type 1) participe à la
    // conversation de SES livraisons (CDC §13.2) — cohérent avec la room chat
    // du gateway qui l'autorise déjà (isUserPartyToOrder).
    const isMerchant = order.merchant?.id === userId;
    const isAdmin = actor.role === UserRole.ADMIN;
    if (!isClient && !isLivreur && !isMerchant && !isAdmin) {
      throw new ForbiddenException('Accès interdit à cette conversation');
    }
    return { order, isClient, isLivreur, isMerchant, isAdmin };
  }

  async listForOrder(orderId: string, actor: ActorPayload) {
    await this.loadOrderAndAuthorize(orderId, actor);
    return this.messagesRepo.find({
      where: { orderId },
      relations: ['sender'],
      order: { createdAt: 'ASC' },
    });
  }

  async sendMessage(orderId: string, actor: ActorPayload, dto: SendMessageDto) {
    const { order, isAdmin } = await this.loadOrderAndAuthorize(orderId, actor);

    if (isAdmin) {
      throw new ForbiddenException("L'admin ne peut pas envoyer de messages");
    }
    if (
      order.status === OrderStatus.COMPLETED ||
      order.status === OrderStatus.CANCELLED ||
      order.status === OrderStatus.FAILED
    ) {
      throw new ForbiddenException(
        'La conversation est fermée pour cette course',
      );
    }

    const senderId = this.actorId(actor);
    const message = this.messagesRepo.create({
      orderId,
      senderId,
      type: dto.type ?? MessageType.TEXT,
      content: dto.content.trim(),
    });
    const saved = await this.messagesRepo.save(message);

    // Hook additif (CDC V1 §13, §18.9-18.11) : peuple la conversation
    // structurée en fire-and-forget. Ne DOIT jamais bloquer/altérer l'envoi
    // du message existant — erreurs avalées et journalisées uniquement.
    // `.catch()` est indispensable ici (et pas seulement un try/catch
    // synchrone) : `trackMessageSender` est async, un rejet non intercepté
    // deviendrait une unhandledRejection qui plante le process.
    try {
      void this.conversationsService
        .trackMessageSender(
          orderId,
          senderId,
          this.conversationRole(actor.role),
        )
        .catch((err) => {
          this.logger.warn(
            `Échec du hook de suivi de conversation pour la commande ${orderId} : ${
              (err as Error)?.message ?? err
            }`,
          );
        });
    } catch (err) {
      this.logger.warn(
        `Échec du hook de suivi de conversation pour la commande ${orderId} : ${
          (err as Error)?.message ?? err
        }`,
      );
    }

    const full = await this.messagesRepo.findOne({
      where: { id: saved.id },
      relations: ['sender'],
    });

    const participantIds = new Set<string>();
    if (order.client?.id) participantIds.add(order.client.id);
    if (order.livreur?.id) participantIds.add(order.livreur.id);
    const extraParticipants =
      await this.conversationsService.listParticipants(orderId);
    for (const participant of extraParticipants) {
      if (participant.userId) {
        participantIds.add(participant.userId);
      }
    }
    participantIds.delete(senderId);
    const recipientIds = [...participantIds];

    this.ordersGateway.broadcastChatMessage(orderId, full!, {
      senderId,
      recipientIds,
    });

    const senderName = (full as any)?.sender?.firstName ?? "Quelqu'un";
    for (const recipientId of recipientIds) {
      if (!this.ordersGateway.isInChatRoom(orderId, recipientId)) {
        void this.notifications.sendToUser(recipientId, {
          title: senderName,
          body:
            full!.content.length > 80
              ? full!.content.substring(0, 77) + '…'
              : full!.content,
          data: {
            kind: 'chat',
            orderId,
          },
        });
      }
    }

    return full;
  }

  /**
   * Marque comme lus PAR CE PARTICIPANT les messages de la commande envoyés
   * par d'autres. Le curseur individuel vit dans `message_read_receipts`
   * (une conversation à 3+ garde ainsi un compteur non-lu correct par
   * participant). `Message.readAt` reste alimenté à la première lecture par
   * un destinataire (rétro-compat de la coche « lu » côté mobile).
   */
  async markAsRead(orderId: string, actor: ActorPayload) {
    const { order } = await this.loadOrderAndAuthorize(orderId, actor);
    const userId = this.actorId(actor);

    const unread = await this.messagesRepo
      .createQueryBuilder('message')
      .leftJoin(
        MessageReadReceipt,
        'receipt',
        'receipt.messageId = message.id AND receipt.userId = :userId',
        { userId },
      )
      .where('message.orderId = :orderId', { orderId })
      .andWhere('message.senderId IS NOT NULL')
      .andWhere('message.senderId != :userId', { userId })
      .andWhere('receipt.messageId IS NULL')
      .getMany();

    if (unread.length > 0) {
      const now = new Date();
      await this.readReceiptsRepo
        .createQueryBuilder()
        .insert()
        .into(MessageReadReceipt)
        .values(
          unread.map((m) => ({ messageId: m.id, userId, readAt: now })),
        )
        // Deux PATCH read concurrents du même participant ne doivent pas
        // planter sur la PK composite (messageId, userId).
        .orIgnore()
        .execute();

      // Rétro-compat : première lecture par un destinataire quelconque.
      await this.messagesRepo
        .createQueryBuilder()
        .update(Message)
        .set({ readAt: () => 'CURRENT_TIMESTAMP' })
        .where('orderId = :orderId', { orderId })
        .andWhere('senderId IS NOT NULL')
        .andWhere('senderId != :userId', { userId })
        .andWhere('readAt IS NULL')
        .execute();
    }

    const participantIds = new Set<string>();
    if (order.client?.id) participantIds.add(order.client.id);
    if (order.livreur?.id) participantIds.add(order.livreur.id);
    const extraParticipants =
      await this.conversationsService.listParticipants(orderId);
    for (const participant of extraParticipants) {
      if (participant.userId) {
        participantIds.add(participant.userId);
      }
    }
    participantIds.delete(userId);
    if (unread.length > 0 && participantIds.size > 0) {
      this.ordersGateway.broadcastChatRead(orderId, {
        readerId: userId,
        recipientIds: [...participantIds],
        at: new Date().toISOString(),
      });
    }

    return { updated: unread.length };
  }

  /**
   * Nombre de messages de la commande non lus PAR CE user (receipt absent),
   * hors messages envoyés par lui-même et messages système (sender null).
   */
  async unreadCountForUser(orderId: string, userId: string): Promise<number> {
    return this.messagesRepo
      .createQueryBuilder('message')
      .leftJoin(
        MessageReadReceipt,
        'receipt',
        'receipt.messageId = message.id AND receipt.userId = :userId',
        { userId },
      )
      .where('message.orderId = :orderId', { orderId })
      .andWhere('message.senderId IS NOT NULL')
      .andWhere('message.senderId != :userId', { userId })
      .andWhere('receipt.messageId IS NULL')
      .getCount();
  }
}
