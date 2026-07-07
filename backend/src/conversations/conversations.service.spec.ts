import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IsNull } from 'typeorm';

import { ConversationsService } from './conversations.service';
import { Conversation } from '../entities/conversation.entity';
import { ConversationParticipant } from '../entities/conversation-participant.entity';

const mockConversationsRepo = () => ({
  findOne: jest.fn(),
  create: jest.fn((data: any) => ({ ...data })),
  save: jest.fn(),
});

const mockParticipantsRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn((data: any) => ({ ...data })),
  save: jest.fn(),
  update: jest.fn(),
});

describe('ConversationsService', () => {
  let service: ConversationsService;
  let conversationsRepo: ReturnType<typeof mockConversationsRepo>;
  let participantsRepo: ReturnType<typeof mockParticipantsRepo>;

  beforeEach(async () => {
    conversationsRepo = mockConversationsRepo();
    participantsRepo = mockParticipantsRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationsService,
        {
          provide: getRepositoryToken(Conversation),
          useValue: conversationsRepo,
        },
        {
          provide: getRepositoryToken(ConversationParticipant),
          useValue: participantsRepo,
        },
      ],
    }).compile();

    service = module.get<ConversationsService>(ConversationsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('ensureConversation()', () => {
    it('crée la conversation si elle n’existe pas encore', async () => {
      conversationsRepo.findOne.mockResolvedValueOnce(null);
      conversationsRepo.save.mockImplementation(async (entity: any) => ({
        id: 'conv-1',
        ...entity,
      }));

      const result = await service.ensureConversation('delivery-1');

      expect(conversationsRepo.create).toHaveBeenCalledWith({
        deliveryId: 'delivery-1',
      });
      expect(result.id).toBe('conv-1');
      expect(result.deliveryId).toBe('delivery-1');
    });

    it('est idempotent : renvoie la conversation existante sans recréer', async () => {
      const existing = { id: 'conv-1', deliveryId: 'delivery-1' };
      conversationsRepo.findOne.mockResolvedValueOnce(existing);

      const result = await service.ensureConversation('delivery-1');

      expect(result).toBe(existing);
      expect(conversationsRepo.save).not.toHaveBeenCalled();
    });

    it('retombe sur la ligne existante si save() échoue (contrainte UNIQUE concurrente)', async () => {
      const existing = { id: 'conv-1', deliveryId: 'delivery-1' };
      conversationsRepo.findOne
        .mockResolvedValueOnce(null) // premier check : pas encore là
        .mockResolvedValueOnce(existing); // fallback après échec de save()
      conversationsRepo.save.mockRejectedValueOnce(
        new Error('ER_DUP_ENTRY'),
      );

      const result = await service.ensureConversation('delivery-1');

      expect(result).toBe(existing);
    });
  });

  describe('addParticipant()', () => {
    it('crée le participant si absent (ensure + create)', async () => {
      conversationsRepo.findOne.mockResolvedValue({
        id: 'conv-1',
        deliveryId: 'delivery-1',
      });
      participantsRepo.findOne.mockResolvedValueOnce(null);
      participantsRepo.save.mockImplementation(async (entity: any) => ({
        id: 'part-1',
        ...entity,
      }));

      const result = await service.addParticipant(
        'delivery-1',
        'user-1',
        'CLIENT',
      );

      expect(participantsRepo.create).toHaveBeenCalledWith({
        conversationId: 'conv-1',
        userId: 'user-1',
        role: 'CLIENT',
        leftAt: null,
      });
      expect(result.id).toBe('part-1');
    });

    it('upsert idempotent : ré-ajouter un participant déjà actif ne duplique pas', async () => {
      conversationsRepo.findOne.mockResolvedValue({
        id: 'conv-1',
        deliveryId: 'delivery-1',
      });
      const existing = {
        id: 'part-1',
        conversationId: 'conv-1',
        userId: 'user-1',
        role: 'CLIENT',
        leftAt: null,
      };
      participantsRepo.findOne.mockResolvedValueOnce(existing);

      const result = await service.addParticipant(
        'delivery-1',
        'user-1',
        'CLIENT',
      );

      expect(result).toBe(existing);
      expect(participantsRepo.create).not.toHaveBeenCalled();
      expect(participantsRepo.save).not.toHaveBeenCalled();
    });

    it('réactive un participant qui était parti (leftAt remis à null)', async () => {
      conversationsRepo.findOne.mockResolvedValue({
        id: 'conv-1',
        deliveryId: 'delivery-1',
      });
      const existing = {
        id: 'part-1',
        conversationId: 'conv-1',
        userId: 'user-1',
        role: 'MERCHANT',
        leftAt: new Date('2026-01-01'),
      };
      participantsRepo.findOne.mockResolvedValueOnce(existing);
      participantsRepo.save.mockImplementation(async (entity: any) => entity);

      const result = await service.addParticipant(
        'delivery-1',
        'user-1',
        'MERCHANT',
      );

      expect(result.leftAt).toBeNull();
      expect(participantsRepo.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('removeParticipant()', () => {
    it('positionne leftAt (soft) via update, ne supprime jamais la ligne', async () => {
      conversationsRepo.findOne.mockResolvedValue({
        id: 'conv-1',
        deliveryId: 'delivery-1',
      });

      await service.removeParticipant('delivery-1', 'user-1');

      expect(participantsRepo.update).toHaveBeenCalledWith(
        { conversationId: 'conv-1', userId: 'user-1', leftAt: IsNull() },
        { leftAt: expect.any(Date) },
      );
    });

    it('ne fait rien si la conversation n’existe pas', async () => {
      conversationsRepo.findOne.mockResolvedValue(null);

      await service.removeParticipant('delivery-inconnue', 'user-1');

      expect(participantsRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('listParticipants()', () => {
    it('retourne uniquement les participants actifs (leftAt IS NULL)', async () => {
      conversationsRepo.findOne.mockResolvedValue({
        id: 'conv-1',
        deliveryId: 'delivery-1',
      });
      const activeOnes = [
        { id: 'part-1', userId: 'user-1', leftAt: null },
      ];
      participantsRepo.find.mockResolvedValueOnce(activeOnes);

      const result = await service.listParticipants('delivery-1');

      expect(result).toBe(activeOnes);
      expect(participantsRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { conversationId: 'conv-1', leftAt: IsNull() },
        }),
      );
    });

    it('retourne un tableau vide si la conversation n’existe pas', async () => {
      conversationsRepo.findOne.mockResolvedValue(null);

      const result = await service.listParticipants('delivery-inconnue');

      expect(result).toEqual([]);
      expect(participantsRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('isActiveParticipant()', () => {
    it('true si le participant est actif', async () => {
      conversationsRepo.findOne.mockResolvedValue({
        id: 'conv-1',
        deliveryId: 'delivery-1',
      });
      participantsRepo.findOne.mockResolvedValueOnce({ id: 'part-1' });

      const result = await service.isActiveParticipant(
        'delivery-1',
        'user-1',
      );

      expect(result).toBe(true);
    });

    it('false si le participant est absent ou parti', async () => {
      conversationsRepo.findOne.mockResolvedValue({
        id: 'conv-1',
        deliveryId: 'delivery-1',
      });
      participantsRepo.findOne.mockResolvedValueOnce(null);

      const result = await service.isActiveParticipant(
        'delivery-1',
        'user-1',
      );

      expect(result).toBe(false);
    });

    it('false si la conversation n’existe pas', async () => {
      conversationsRepo.findOne.mockResolvedValue(null);

      const result = await service.isActiveParticipant(
        'delivery-inconnue',
        'user-1',
      );

      expect(result).toBe(false);
    });
  });

  describe('trackMessageSender()', () => {
    it('appelle ensureConversation + addParticipant', async () => {
      conversationsRepo.findOne.mockResolvedValue({
        id: 'conv-1',
        deliveryId: 'delivery-1',
      });
      participantsRepo.findOne.mockResolvedValueOnce(null);
      participantsRepo.save.mockImplementation(async (entity: any) => entity);

      await service.trackMessageSender('delivery-1', 'user-1', 'LIVREUR');

      expect(participantsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', role: 'LIVREUR' }),
      );
    });

    it('avale les erreurs sans les laisser remonter (fire-and-forget)', async () => {
      conversationsRepo.findOne.mockRejectedValue(new Error('DB down'));

      await expect(
        service.trackMessageSender('delivery-1', 'user-1', 'CLIENT'),
      ).resolves.toBeUndefined();
    });
  });
});
