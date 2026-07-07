import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException } from '@nestjs/common';

import { MessagesService } from './messages.service';
import { Message, MessageType } from '../entities/message.entity';
import { DeliveryOrder, OrderStatus } from '../entities/delivery-order.entity';
import { UserRole } from '../entities/user.entity';
import { OrdersGateway } from '../orders/orders.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { ConversationsService } from '../conversations/conversations.service';

const mockMessagesRepo = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn((data: any) => ({ ...data })),
  save: jest.fn(),
  createQueryBuilder: jest.fn(),
});

const mockOrdersRepo = () => ({
  findOne: jest.fn(),
});

describe('MessagesService', () => {
  let service: MessagesService;
  let messagesRepo: ReturnType<typeof mockMessagesRepo>;
  let ordersRepo: ReturnType<typeof mockOrdersRepo>;
  let gateway: { broadcastChatMessage: jest.Mock; isInChatRoom: jest.Mock };
  let notifications: { sendToUser: jest.Mock };
  let conversationsService: { trackMessageSender: jest.Mock };

  const order = {
    id: 'order-1',
    status: OrderStatus.ACCEPTED,
    client: { id: 'client-1' },
    livreur: { id: 'livreur-1' },
  } as unknown as DeliveryOrder;

  beforeEach(async () => {
    messagesRepo = mockMessagesRepo();
    ordersRepo = mockOrdersRepo();
    gateway = {
      broadcastChatMessage: jest.fn(),
      isInChatRoom: jest.fn().mockReturnValue(true),
    };
    notifications = { sendToUser: jest.fn().mockResolvedValue(undefined) };
    conversationsService = {
      trackMessageSender: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesService,
        { provide: getRepositoryToken(Message), useValue: messagesRepo },
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
  });
});
