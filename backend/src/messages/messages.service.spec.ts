import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException } from '@nestjs/common';

import { MessagesService } from './messages.service';
import { Message, MessageType } from '../entities/message.entity';
import { MessageReadReceipt } from '../entities/message-read-receipt.entity';
import { DeliveryOrder, OrderStatus } from '../entities/delivery-order.entity';
import { UserRole } from '../entities/user.entity';
import { OrdersGateway } from '../orders/orders.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { ConversationsService } from '../conversations/conversations.service';

/**
 * `markAsRead`/`unreadCountForUser` utilisent DEUX query builders distincts
 * sur le repo messages : un SELECT (alias 'message', leftJoin receipts →
 * getMany/getCount) et un UPDATE rétro-compat de `readAt` (sans alias).
 * On route selon la présence de l'alias, comme TypeORM.
 */
const mockMessagesRepo = () => {
  const selectQb: any = {
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
    getCount: jest.fn().mockResolvedValue(0),
  };
  const updateQb: any = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected: 0 }),
  };
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((data: any) => ({ ...data })),
    save: jest.fn(),
    createQueryBuilder: jest.fn((alias?: string) =>
      alias ? selectQb : updateQb,
    ),
    __selectQb: selectQb,
    __updateQb: updateQb,
  };
};

const mockReadReceiptsRepo = () => {
  const insertQb: any = {
    insert: jest.fn().mockReturnThis(),
    into: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    orIgnore: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue(undefined),
  };
  return {
    find: jest.fn().mockResolvedValue([]),
    createQueryBuilder: jest.fn(() => insertQb),
    __insertQb: insertQb,
  };
};

const mockOrdersRepo = () => ({
  findOne: jest.fn(),
});

describe('MessagesService', () => {
  let service: MessagesService;
  let messagesRepo: ReturnType<typeof mockMessagesRepo>;
  let readReceiptsRepo: ReturnType<typeof mockReadReceiptsRepo>;
  let ordersRepo: ReturnType<typeof mockOrdersRepo>;
  let gateway: {
    broadcastChatMessage: jest.Mock;
    broadcastChatRead: jest.Mock;
    isInChatRoom: jest.Mock;
  };
  let notifications: { sendToUser: jest.Mock };
  let conversationsService: {
    trackMessageSender: jest.Mock;
    listParticipants: jest.Mock;
  };

  const order = {
    id: 'order-1',
    status: OrderStatus.ACCEPTED,
    client: { id: 'client-1' },
    livreur: { id: 'livreur-1' },
  } as unknown as DeliveryOrder;

  beforeEach(async () => {
    messagesRepo = mockMessagesRepo();
    readReceiptsRepo = mockReadReceiptsRepo();
    ordersRepo = mockOrdersRepo();
    gateway = {
      broadcastChatMessage: jest.fn(),
      broadcastChatRead: jest.fn(),
      isInChatRoom: jest.fn().mockReturnValue(true),
    };
    notifications = { sendToUser: jest.fn().mockResolvedValue(undefined) };
    conversationsService = {
      trackMessageSender: jest.fn().mockResolvedValue(undefined),
      listParticipants: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesService,
        { provide: getRepositoryToken(Message), useValue: messagesRepo },
        {
          provide: getRepositoryToken(MessageReadReceipt),
          useValue: readReceiptsRepo,
        },
        {
          provide: getRepositoryToken(DeliveryOrder),
          useValue: ordersRepo,
        },
        { provide: OrdersGateway, useValue: gateway },
        { provide: NotificationsService, useValue: notifications },
        { provide: ConversationsService, useValue: conversationsService },
      ],
    }).compile();

    service = module.get<MessagesService>(MessagesService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('sendMessage()', () => {
    it('envoie le message normalement ET peuple la conversation (hook fire-and-forget)', async () => {
      ordersRepo.findOne.mockResolvedValue(order);
      const savedMessage = { id: 'msg-1' };
      messagesRepo.save.mockResolvedValue(savedMessage);
      messagesRepo.findOne.mockResolvedValue({
        id: 'msg-1',
        content: 'Bonjour',
        sender: { id: 'client-1', firstName: 'Ama' },
      });

      const actor = { id: 'client-1', role: UserRole.CLIENT };
      const result = await service.sendMessage('order-1', actor, {
        type: MessageType.TEXT,
        content: 'Bonjour',
      });

      // Comportement existant intact
      expect(result).toEqual({
        id: 'msg-1',
        content: 'Bonjour',
        sender: { id: 'client-1', firstName: 'Ama' },
      });
      expect(gateway.broadcastChatMessage).toHaveBeenCalledTimes(1);

      // Hook additif appelé avec le rôle mappé CDC (CLIENT)
      expect(conversationsService.trackMessageSender).toHaveBeenCalledWith(
        'order-1',
        'client-1',
        'CLIENT',
      );
    });

    it('mappe le rôle LIVREUR vers le rôle conversation LIVREUR', async () => {
      ordersRepo.findOne.mockResolvedValue(order);
      messagesRepo.save.mockResolvedValue({ id: 'msg-2' });
      messagesRepo.findOne.mockResolvedValue({ id: 'msg-2', content: 'Ok' });

      const actor = { id: 'livreur-1', role: UserRole.LIVREUR };
      await service.sendMessage('order-1', actor, {
        type: MessageType.TEXT,
        content: 'Ok',
      });

      expect(conversationsService.trackMessageSender).toHaveBeenCalledWith(
        'order-1',
        'livreur-1',
        'LIVREUR',
      );
    });

    it("n'échoue pas l'envoi du message si le hook de conversation lève une erreur", async () => {
      ordersRepo.findOne.mockResolvedValue(order);
      messagesRepo.save.mockResolvedValue({ id: 'msg-3' });
      messagesRepo.findOne.mockResolvedValue({ id: 'msg-3', content: 'Test' });
      conversationsService.trackMessageSender.mockRejectedValue(
        new Error('boom'),
      );

      const actor = { id: 'client-1', role: UserRole.CLIENT };

      await expect(
        service.sendMessage('order-1', actor, {
          type: MessageType.TEXT,
          content: 'Test',
        }),
      ).resolves.toEqual({ id: 'msg-3', content: 'Test' });
    });

    it('refuse toujours l’envoi par un admin (comportement existant préservé)', async () => {
      ordersRepo.findOne.mockResolvedValue(order);
      const actor = { id: 'admin-1', role: UserRole.ADMIN };

      await expect(
        service.sendMessage('order-1', actor, {
          type: MessageType.TEXT,
          content: 'Salut',
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(conversationsService.trackMessageSender).not.toHaveBeenCalled();
    });

    it('refuse aussi l’envoi si la course est en échec (FAILED)', async () => {
      ordersRepo.findOne.mockResolvedValue({
        ...order,
        status: OrderStatus.FAILED,
      });
      const actor = { id: 'client-1', role: UserRole.CLIENT };

      await expect(
        service.sendMessage('order-1', actor, {
          type: MessageType.TEXT,
          content: 'Toujours là ?',
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(conversationsService.trackMessageSender).not.toHaveBeenCalled();
    });
  });

  describe('markAsRead() — lecture PAR PARTICIPANT (P1, chat à 3+)', () => {
    it('insère un receipt par message non lu POUR CE participant et broadcast chat:read', async () => {
      ordersRepo.findOne.mockResolvedValue(order);
      messagesRepo.__selectQb.getMany.mockResolvedValue([
        { id: 'msg-1' },
        { id: 'msg-2' },
      ]);

      const result = await service.markAsRead('order-1', {
        id: 'livreur-1',
        role: UserRole.LIVREUR,
      });

      expect(result).toEqual({ updated: 2 });
      // Le SELECT filtre bien sur le receipt absent DE CE user
      expect(messagesRepo.__selectQb.leftJoin).toHaveBeenCalledWith(
        MessageReadReceipt,
        'receipt',
        'receipt.messageId = message.id AND receipt.userId = :userId',
        { userId: 'livreur-1' },
      );
      // Un receipt inséré par message, pour CE user
      expect(readReceiptsRepo.__insertQb.values).toHaveBeenCalledWith([
        expect.objectContaining({ messageId: 'msg-1', userId: 'livreur-1' }),
        expect.objectContaining({ messageId: 'msg-2', userId: 'livreur-1' }),
      ]);
      expect(readReceiptsRepo.__insertQb.orIgnore).toHaveBeenCalled();
      // Rétro-compat : readAt global toujours alimenté
      expect(messagesRepo.__updateQb.execute).toHaveBeenCalled();
      expect(gateway.broadcastChatRead).toHaveBeenCalledWith(
        'order-1',
        expect.objectContaining({ readerId: 'livreur-1' }),
      );
    });

    it("la lecture par un participant ne consomme PAS le non-lu d'un autre (receipts distincts)", async () => {
      ordersRepo.findOne.mockResolvedValue(order);
      // Même si le message a déjà été lu par le client (readAt global posé),
      // le SELECT joint sur les receipts DU livreur → toujours non lu pour lui.
      messagesRepo.__selectQb.getMany.mockResolvedValue([
        { id: 'msg-1', readAt: new Date() },
      ]);

      const result = await service.markAsRead('order-1', {
        id: 'livreur-1',
        role: UserRole.LIVREUR,
      });

      expect(result).toEqual({ updated: 1 });
      expect(readReceiptsRepo.__insertQb.values).toHaveBeenCalledWith([
        expect.objectContaining({ messageId: 'msg-1', userId: 'livreur-1' }),
      ]);
    });

    it('aucun message à lire → pas de receipt, pas de broadcast', async () => {
      ordersRepo.findOne.mockResolvedValue(order);
      messagesRepo.__selectQb.getMany.mockResolvedValue([]);

      const result = await service.markAsRead('order-1', {
        id: 'client-1',
        role: UserRole.CLIENT,
      });

      expect(result).toEqual({ updated: 0 });
      expect(readReceiptsRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(messagesRepo.__updateQb.execute).not.toHaveBeenCalled();
      expect(gateway.broadcastChatRead).not.toHaveBeenCalled();
    });
  });

  describe('listForOrder() — readBy par message', () => {
    it('attache la liste des lecteurs (receipts) à chaque message', async () => {
      ordersRepo.findOne.mockResolvedValue(order);
      messagesRepo.find.mockResolvedValue([
        { id: 'msg-1', content: 'a' },
        { id: 'msg-2', content: 'b' },
      ]);
      readReceiptsRepo.find.mockResolvedValue([
        { messageId: 'msg-1', userId: 'client-1' },
        { messageId: 'msg-1', userId: 'merchant-1' },
      ]);

      const result = await service.listForOrder('order-1', {
        id: 'livreur-1',
        role: UserRole.LIVREUR,
      });

      expect(result[0]).toEqual(
        expect.objectContaining({
          id: 'msg-1',
          readBy: ['client-1', 'merchant-1'],
        }),
      );
      expect(result[1]).toEqual(
        expect.objectContaining({ id: 'msg-2', readBy: [] }),
      );
    });

    it('liste vide → aucun appel au repo des receipts', async () => {
      ordersRepo.findOne.mockResolvedValue(order);
      messagesRepo.find.mockResolvedValue([]);

      const result = await service.listForOrder('order-1', {
        id: 'client-1',
        role: UserRole.CLIENT,
      });

      expect(result).toEqual([]);
      expect(readReceiptsRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('unreadCountForUser() — compteur par participant', () => {
    it('compte via la jointure sur les receipts DU user (et non readAt global)', async () => {
      messagesRepo.__selectQb.getCount.mockResolvedValue(3);

      const count = await service.unreadCountForUser('order-1', 'client-1');

      expect(count).toBe(3);
      expect(messagesRepo.__selectQb.leftJoin).toHaveBeenCalledWith(
        MessageReadReceipt,
        'receipt',
        'receipt.messageId = message.id AND receipt.userId = :userId',
        { userId: 'client-1' },
      );
      expect(messagesRepo.__selectQb.andWhere).toHaveBeenCalledWith(
        'receipt.messageId IS NULL',
      );
    });
  });
});
