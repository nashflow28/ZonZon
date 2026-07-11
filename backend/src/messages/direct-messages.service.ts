import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, IsNull, Repository } from 'typeorm';
import { DirectMessage } from '../entities/direct-message.entity';
import { AffiliationStatus, MerchantDriver } from '../entities/merchant-driver.entity';
import { User, UserRole } from '../entities/user.entity';
import { DeliveryOrder } from '../entities/delivery-order.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { OrdersGateway } from '../orders/orders.gateway';

type Actor = { id?: string; sub?: string; role: UserRole };

@Injectable()
export class DirectMessagesService {
  constructor(
    @InjectRepository(DirectMessage) private readonly messages: Repository<DirectMessage>,
    @InjectRepository(MerchantDriver) private readonly affiliations: Repository<MerchantDriver>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(DeliveryOrder) private readonly orders: Repository<DeliveryOrder>,
    private readonly gateway: OrdersGateway,
    private readonly notifications: NotificationsService,
  ) {}

  private actorId(actor: Actor) {
    return (actor.id ?? actor.sub) as string;
  }

  private assertSupportedRole(actor: Actor) {
    if (![UserRole.CLIENT, UserRole.COMMERCANT, UserRole.LIVREUR].includes(actor.role)) {
      throw new ForbiddenException('La messagerie générale est indisponible pour ce rôle');
    }
  }

  private async sharedOrders(actorId: string, role: UserRole, otherUserId?: string) {
    const where = role === UserRole.CLIENT
      ? { client: { id: actorId } }
      : role === UserRole.LIVREUR
      ? { livreur: { id: actorId } }
      : { merchant: { id: actorId } };
    const orders = await this.orders.find({ where, relations: ['client', 'livreur', 'merchant'] });
    return orders.filter((order) => !otherUserId || [order.client?.id, order.livreur?.id, order.merchant?.id].includes(otherUserId));
  }

  async listContacts(actor: Actor) {
    this.assertSupportedRole(actor);
    const id = this.actorId(actor);
    const contacts = new Map<string, User>();
    const rows = await this.affiliations.find({
      where: actor.role === UserRole.COMMERCANT
          ? { merchantId: id, status: AffiliationStatus.ACTIVE }
          : { driverId: id, status: AffiliationStatus.ACTIVE },
      relations: ['merchant', 'driver'],
      order: { createdAt: 'DESC' },
    });
    for (const row of rows) {
      const other = actor.role === UserRole.COMMERCANT ? row.driver : row.merchant;
      contacts.set(other.id, other);
    }
    for (const order of await this.sharedOrders(id, actor.role)) {
      for (const user of [order.client, order.livreur, order.merchant]) {
        if (user && user.id !== id) contacts.set(user.id, user);
      }
    }
    return [...contacts.values()].map((user) => ({ id: user.id, firstName: user.firstName, lastName: user.lastName, phone: user.phone, role: user.role }));
  }

  private async assertContact(actor: Actor, otherUserId: string): Promise<User> {
    this.assertSupportedRole(actor);
    const actorId = this.actorId(actor);
    if (actorId === otherUserId) throw new ForbiddenException('Vous ne pouvez pas vous écrire à vous-même');
    const other = await this.users.findOne({ where: { id: otherUserId } });
    if (!other) throw new NotFoundException('Contact introuvable');
    const affiliation = await this.affiliations.count({ where: [
      { merchantId: actorId, driverId: otherUserId, status: AffiliationStatus.ACTIVE },
      { merchantId: otherUserId, driverId: actorId, status: AffiliationStatus.ACTIVE },
    ] });
    if (!affiliation && (await this.sharedOrders(actorId, actor.role, otherUserId)).length === 0) {
      throw new ForbiddenException('Ce contact ne fait pas partie de vos affiliations actives');
    }
    return other;
  }

  async listThread(otherUserId: string, actor: Actor) {
    await this.assertContact(actor, otherUserId);
    const actorId = this.actorId(actor);
    await this.messages.update({ senderId: otherUserId, recipientId: actorId, readAt: IsNull() }, { readAt: new Date() });
    return this.messages.createQueryBuilder('message')
      .where(new Brackets((qb) => qb.where('message.senderId = :actorId AND message.recipientId = :otherUserId', { actorId, otherUserId })
        .orWhere('message.senderId = :otherUserId AND message.recipientId = :actorId', { actorId, otherUserId })))
      .orderBy('message.createdAt', 'ASC')
      .getMany();
  }

  async send(otherUserId: string, content: string, actor: Actor, orderId?: string) {
    const recipient = await this.assertContact(actor, otherUserId);
    const senderId = this.actorId(actor);
    if (orderId && !(await this.sharedOrders(senderId, actor.role, otherUserId)).some((order) => order.id === orderId)) {
      throw new ForbiddenException('Cette course ne relie pas les deux participants');
    }
    const saved = await this.messages.save(this.messages.create({ senderId, recipientId: recipient.id, content: content.trim(), orderId: orderId ?? null, readAt: null }));
    this.gateway.broadcastDirectMessage(saved, senderId, recipient.id);
    void this.notifications.sendToUser(recipient.id, { title: 'Nouveau message', body: saved.content.slice(0, 120), data: { kind: 'direct_message', senderId } });
    return saved;
  }
}
