import { DirectMessagesService } from './direct-messages.service';
import { UserRole } from '../entities/user.entity';

describe('DirectMessagesService', () => {
  const actor = { id: 'client-1', role: UserRole.CLIENT };
  let messages: any;
  let threadStates: any;
  let affiliations: any;
  let users: any;
  let orders: any;
  let gateway: any;
  let notifications: any;
  let service: DirectMessagesService;

  beforeEach(() => {
    messages = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 'message-1', ...value })),
    };
    threadStates = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    affiliations = { count: jest.fn().mockResolvedValue(1) };
    users = {
      findOne: jest.fn().mockResolvedValue({
        id: 'driver-1',
        firstName: 'Kofi',
        role: UserRole.LIVREUR,
      }),
    };
    orders = { find: jest.fn().mockResolvedValue([]) };
    gateway = { broadcastDirectMessage: jest.fn() };
    notifications = { sendToUser: jest.fn().mockResolvedValue(undefined) };
    service = new DirectMessagesService(
      messages,
      threadStates,
      affiliations,
      users,
      orders,
      gateway,
      notifications,
    );
  });

  it('archive une conversation uniquement pour son propriétaire', async () => {
    await expect(service.hideThread('driver-1', actor)).resolves.toEqual({
      hidden: true,
    });

    expect(threadStates.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: 'client-1',
        contactId: 'driver-1',
        hiddenBefore: expect.any(Date),
      }),
    );
    expect(messages.save).not.toHaveBeenCalled();
  });

  it('conserve le contexte de course dans le fil unique du contact', async () => {
    orders.find.mockResolvedValue([
      {
        id: 'order-1',
        client: { id: 'client-1' },
        livreur: { id: 'driver-1' },
        merchant: null,
      },
    ]);

    const result = await service.send(
      'driver-1',
      'Je suis devant.',
      actor,
      'order-1',
    );

    expect(result).toEqual(
      expect.objectContaining({
        senderId: 'client-1',
        recipientId: 'driver-1',
        orderId: 'order-1',
      }),
    );
    expect(gateway.broadcastDirectMessage).toHaveBeenCalledWith(
      result,
      'client-1',
      'driver-1',
    );
  });
});
