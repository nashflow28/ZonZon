import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Conversation } from '../entities/conversation.entity';
import {
  ConversationParticipant,
  ConversationParticipantRole,
} from '../entities/conversation-participant.entity';

/**
 * Couche additive de conversation multi-participants (CDC V1 §13,
 * §18.9-18.11). Ne remplace NI ne modifie la messagerie existante
 * (`Message`/gateway chat) : sert uniquement à suivre qui participe à
 * l'échange d'une livraison donnée (client/livreur/commerçant/admin).
 */
@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    @InjectRepository(Conversation)
    private readonly conversationsRepo: Repository<Conversation>,
    @InjectRepository(ConversationParticipant)
    private readonly participantsRepo: Repository<ConversationParticipant>,
  ) {}

  /**
   * Get-or-create idempotent sur `deliveryId` (colonne UNIQUE). En cas de
   * course de concurrence (deux appels simultanés pour la même livraison),
   * on retombe sur la ligne existante plutôt que de laisser remonter une
   * erreur de contrainte UNIQUE.
   */
  async ensureConversation(deliveryId: string): Promise<Conversation> {
    const existing = await this.conversationsRepo.findOne({
      where: { deliveryId },
    });
    if (existing) return existing;

    try {
      const created = this.conversationsRepo.create({ deliveryId });
      return await this.conversationsRepo.save(created);
    } catch (err) {
      const fallback = await this.conversationsRepo.findOne({
        where: { deliveryId },
      });
      if (fallback) return fallback;
      throw err;
    }
  }

  /**
   * Ajoute (ou réactive) un participant à la conversation de la livraison.
   * Idempotent : si le participant existe déjà (actif ou parti), on le
   * remet actif (`leftAt = null`) plutôt que de créer un doublon — respecte
   * la contrainte UNIQUE `(conversationId, userId)`.
   */
  async addParticipant(
    deliveryId: string,
    userId: string,
    role: ConversationParticipantRole,
  ): Promise<ConversationParticipant> {
    const conversation = await this.ensureConversation(deliveryId);

    const existing = await this.participantsRepo.findOne({
      where: { conversationId: conversation.id, userId },
    });

    if (existing) {
      if (existing.leftAt !== null || existing.role !== role) {
        existing.leftAt = null;
        existing.role = role;
        return this.participantsRepo.save(existing);
      }
      return existing;
    }

    const created = this.participantsRepo.create({
      conversationId: conversation.id,
      userId,
      role,
      leftAt: null,
    });
    return this.participantsRepo.save(created);
  }

  /** Départ soft : ne supprime jamais la ligne, positionne `leftAt`. */
  async removeParticipant(deliveryId: string, userId: string): Promise<void> {
    const conversation = await this.conversationsRepo.findOne({
      where: { deliveryId },
    });
    if (!conversation) return;

    await this.participantsRepo.update(
      { conversationId: conversation.id, userId, leftAt: IsNull() },
      { leftAt: new Date() },
    );
  }

  /** Participants actifs (`leftAt IS NULL`) de la conversation d'une livraison. */
  async listParticipants(
    deliveryId: string,
  ): Promise<ConversationParticipant[]> {
    const conversation = await this.conversationsRepo.findOne({
      where: { deliveryId },
    });
    if (!conversation) return [];

    return this.participantsRepo.find({
      where: { conversationId: conversation.id, leftAt: IsNull() },
      order: { joinedAt: 'ASC' },
    });
  }

  async isActiveParticipant(
    deliveryId: string,
    userId: string,
  ): Promise<boolean> {
    const conversation = await this.conversationsRepo.findOne({
      where: { deliveryId },
    });
    if (!conversation) return false;

    const participant = await this.participantsRepo.findOne({
      where: { conversationId: conversation.id, userId, leftAt: IsNull() },
    });
    return !!participant;
  }

  /**
   * Utilisé par le hook fire-and-forget de `MessagesService` : ne doit
   * jamais lever d'exception qui bloquerait l'envoi d'un message existant.
   */
  async trackMessageSender(
    deliveryId: string,
    userId: string,
    role: ConversationParticipantRole,
  ): Promise<void> {
    try {
      await this.ensureConversation(deliveryId);
      await this.addParticipant(deliveryId, userId, role);
    } catch (err) {
      this.logger.warn(
        `Échec du suivi de conversation (deliveryId=${deliveryId}, userId=${userId}) : ${
          (err as Error)?.message ?? err
        }`,
      );
    }
  }
}
