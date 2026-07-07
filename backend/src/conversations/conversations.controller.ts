import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Request } from 'express';
import { DeliveryOrder } from '../entities/delivery-order.entity';
import { UserRole } from '../entities/user.entity';
import { ConversationsService } from './conversations.service';

interface ActorPayload {
  id?: string;
  sub?: string;
  role: UserRole;
}

/**
 * Endpoints de la couche conversation multi-participants (CDC V1 §13.2,
 * §13.4). ADDITIF : ne remplace pas `GET/POST/PATCH /orders/:orderId/messages`
 * (module `messages/`), qui reste le flux d'envoi/lecture des messages.
 */
@Controller('orders/:orderId/conversation')
export class ConversationsController {
  constructor(
    private readonly conversationsService: ConversationsService,
    @InjectRepository(DeliveryOrder)
    private readonly ordersRepo: Repository<DeliveryOrder>,
  ) {}

  private actorId(actor: ActorPayload): string {
    return (actor.id ?? actor.sub) as string;
  }

  /**
   * Vérifie que l'acteur est partie prenante de la livraison : client,
   * livreur, commerçant créateur, ou admin (§13.2 — le commerçant participe
   * à la conversation de SES livraisons ; §13.4 — l'admin accède en cas de
   * litige). Même logique d'appartenance que `MessagesService`/le gateway
   * chat, étendue au commerçant pour rester cohérente avec
   * `OrdersGateway.isUserPartyToOrder`.
   */
  private async loadOrderAndAuthorize(orderId: string, actor: ActorPayload) {
    const order = await this.ordersRepo.findOne({
      where: { id: orderId },
      relations: ['client', 'livreur', 'merchant'],
    });
    if (!order) throw new NotFoundException('Commande introuvable');

    const userId = this.actorId(actor);
    const isClient = order.client?.id === userId;
    const isLivreur = order.livreur?.id === userId;
    const isMerchant = order.merchant?.id === userId;
    const isAdmin = actor.role === UserRole.ADMIN;

    if (!isClient && !isLivreur && !isMerchant && !isAdmin) {
      throw new ForbiddenException('Accès interdit à cette conversation');
    }

    return { order, isClient, isLivreur, isMerchant, isAdmin };
  }

  @Get()
  async get(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Req() req: Request,
  ) {
    await this.loadOrderAndAuthorize(orderId, req.user as any);

    const conversation = await this.conversationsService.ensureConversation(
      orderId,
    );
    const participants = await this.conversationsService.listParticipants(
      orderId,
    );

    return { conversation, participants };
  }

  /**
   * Inclusion optionnelle du commerçant créateur (§13.2), ou d'un admin
   * pour instruction de litige (§13.4). Le client/livreur ne peuvent pas
   * s'ajouter via cette route : ils sont déjà suivis automatiquement via le
   * hook d'envoi de message (`MessagesService.sendMessage`).
   */
  @Post('participants')
  async addSelf(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Req() req: Request,
  ) {
    const actor = req.user as ActorPayload;
    const { order, isMerchant, isAdmin } = await this.loadOrderAndAuthorize(
      orderId,
      actor,
    );

    if (!isMerchant && !isAdmin) {
      throw new ForbiddenException(
        'Seul le commerçant créateur ou un admin peut se rajouter à cette conversation',
      );
    }

    const userId = this.actorId(actor);
    const role = isAdmin && order.merchant?.id !== userId ? 'ADMIN' : 'MERCHANT';

    return this.conversationsService.addParticipant(orderId, userId, role);
  }

  @Delete('participants/me')
  async removeSelf(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Req() req: Request,
  ) {
    const actor = req.user as ActorPayload;
    const { isMerchant, isAdmin } = await this.loadOrderAndAuthorize(
      orderId,
      actor,
    );

    if (!isMerchant && !isAdmin) {
      throw new ForbiddenException(
        'Seul le commerçant créateur ou un admin peut se retirer de cette conversation',
      );
    }

    const userId = this.actorId(actor);
    await this.conversationsService.removeParticipant(orderId, userId);
    return { removed: true };
  }
}
