import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { Message, MessageType } from '../entities/message.entity';
import { DeliveryOrder, OrderStatus } from '../entities/delivery-order.entity';
import { UserRole } from '../entities/user.entity';
import { OrdersGateway } from '../orders/orders.gateway';
import { SendMessageDto } from './dto/send-message.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { User } from '../entities/user.entity';

interface ActorPayload {
  id?: string;
  sub?: string;
  role: UserRole;
}

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message)
    private messagesRepo: Repository<Message>,
    @InjectRepository(DeliveryOrder)
    private ordersRepo: Repository<DeliveryOrder>,
    @Inject(forwardRef(() => OrdersGateway))
    private ordersGateway: OrdersGateway,
    private notifications: NotificationsService,
  ) {}

  private actorId(actor: ActorPayload): string {
    return (actor.id ?? actor.sub) as string;
  }

  private async loadOrderAndAuthorize(orderId: string, actor: ActorPayload) {
    const order = await this.ordersRepo.findOne({
      where: { id: orderId },
      relations: ['client', 'livreur'],
    });
    if (!order) throw new NotFoundException('Commande introuvable');

    const userId = this.actorId(actor);
    const isClient = order.client?.id === userId;
    const isLivreur = order.livreur?.id === userId;
    const isAdmin = actor.role === UserRole.ADMIN;
    if (!isClient && !isLivreur && !isAdmin) {
      throw new ForbiddenException('Accès interdit à cette conversation');
    }
    return { order, isClient, isLivreur, isAdmin };
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
      order.status === OrderStatus.CANCELLED
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

    const full = await this.messagesRepo.findOne({
      where: { id: saved.id },
      relations: ['sender'],
    });

    const recipientId =
      order.client?.id === senderId ? order.livreur?.id : order.client?.id;

    this.ordersGateway.broadcastChatMessage(orderId, full!, {
      clientId: order.client?.id,
      livreurId: order.livreur?.id,
      senderId,
      recipientId,
    });

    // Push notification : seulement si le destinataire n'est pas dans la room du chat
    if (recipientId && !this.ordersGateway.isInChatRoom(orderId, recipientId)) {
      const senderName = (full as any)?.sender?.firstName ?? "Quelqu'un";
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

    return full;
  }

  async markAsRead(orderId: string, actor: ActorPayload) {
    const { order } = await this.loadOrderAndAuthorize(orderId, actor);
    const userId = this.actorId(actor);

    const result = await this.messagesRepo
      .createQueryBuilder()
      .update(Message)
      .set({ readAt: () => 'CURRENT_TIMESTAMP' })
      .where('orderId = :orderId', { orderId })
      .andWhere('senderId IS NOT NULL')
      .andWhere('senderId != :userId', { userId })
      .andWhere('readAt IS NULL')
      .execute();

    const otherPartyId =
      order.client?.id === userId ? order.livreur?.id : order.client?.id;
    if (otherPartyId && (result.affected ?? 0) > 0) {
      this.ordersGateway.broadcastChatRead(orderId, {
        readerId: userId,
        otherPartyId,
        at: new Date().toISOString(),
      });
    }

    return { updated: result.affected ?? 0 };
  }

  async unreadCountForUser(orderId: string, userId: string): Promise<number> {
    return this.messagesRepo.count({
      where: {
        orderId,
        readAt: IsNull(),
        senderId: Not(userId),
      },
    });
  }
}
