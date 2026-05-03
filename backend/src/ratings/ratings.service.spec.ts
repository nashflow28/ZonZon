import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { RatingsService } from './ratings.service';
import { Rating } from '../entities/rating.entity';
import {
  DeliveryOrder,
  OrderStatus,
} from '../entities/delivery-order.entity';

/**
 * Helper pour mocker un QueryBuilder TypeORM dont `getRawOne` est paramétrable
 * indépendamment pour chaque appel successif. La RatingsService utilise des
 * QueryBuilder distincts pour : ratings (avg/count + sous-catégories),
 * completed (cnt/avgMin), cancellations (cancelled/assigned).
 */

describe('RatingsService - getExtendedStats', () => {
  let service: RatingsService;
  let ratingsRepo: any;
  let ordersRepo: any;
  let ratingsQb: any;
  let ordersQb: any;
  let ordersGetRawOne: jest.Mock;

  beforeEach(async () => {
    // QB côté ratings (utilisé par getUserStats)
    ratingsQb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(),
    };
    ratingsRepo = {
      createQueryBuilder: jest.fn(() => ratingsQb),
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn((entity: any) =>
        Promise.resolve({ id: 'rating-id', ...entity }),
      ),
      create: jest.fn((fn: any) => fn),
    };

    // QB côté orders : on retourne le MÊME builder, mais getRawOne est piloté
    // séquentiellement (1er appel = stats completed, 2e appel = stats cancel).
    ordersGetRawOne = jest.fn();
    ordersQb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: ordersGetRawOne,
    };
    ordersRepo = {
      createQueryBuilder: jest.fn(() => ordersQb),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RatingsService,
        { provide: getRepositoryToken(Rating), useValue: ratingsRepo },
        { provide: getRepositoryToken(DeliveryOrder), useValue: ordersRepo },
      ],
    }).compile();

    service = module.get<RatingsService>(RatingsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('user sans course ni rating : tous les counts à 0, averageDurationMinutes null', async () => {
    ratingsQb.getRawOne.mockResolvedValue({
      avg: null,
      count: '0',
      punctualityAvg: null,
      punctualityCount: '0',
      communicationAvg: null,
      communicationCount: '0',
      courtesyAvg: null,
      courtesyCount: '0',
    });
    ordersGetRawOne
      .mockResolvedValueOnce({ cnt: '0', avgMin: null })
      .mockResolvedValueOnce({ cancelled: '0', assigned: '0' });

    const res = await service.getExtendedStats('user-empty');
    expect(res).toEqual({
      ratingAverage: 0,
      ratingCount: 0,
      completedCount: 0,
      averageDurationMinutes: null,
      cancellationRate: 0,
    });
  });

  it('user avec courses COMPLETED : durée moyenne calculée correctement', async () => {
    ratingsQb.getRawOne.mockResolvedValue({
      avg: '4.6',
      count: '10',
      punctualityAvg: null,
      punctualityCount: '0',
      communicationAvg: null,
      communicationCount: '0',
      courtesyAvg: null,
      courtesyCount: '0',
    });
    ordersGetRawOne
      .mockResolvedValueOnce({ cnt: '8', avgMin: '23.5' })
      .mockResolvedValueOnce({ cancelled: '0', assigned: '8' });

    const res = await service.getExtendedStats('user-1');
    expect(res.completedCount).toBe(8);
    expect(res.averageDurationMinutes).toBe(23.5);
    expect(res.ratingAverage).toBe(4.6);
    expect(res.ratingCount).toBe(10);
    expect(res.cancellationRate).toBe(0);
  });

  it('cancellationRate calculé = annulé livreur / total assigné', async () => {
    ratingsQb.getRawOne.mockResolvedValue({
      avg: '3.0',
      count: '4',
      punctualityAvg: null,
      punctualityCount: '0',
      communicationAvg: null,
      communicationCount: '0',
      courtesyAvg: null,
      courtesyCount: '0',
    });
    // 5 completed, et au total 10 assignées avec 2 annulées par le livreur
    ordersGetRawOne
      .mockResolvedValueOnce({ cnt: '5', avgMin: '15' })
      .mockResolvedValueOnce({ cancelled: '2', assigned: '10' });

    const res = await service.getExtendedStats('user-c');
    expect(res.cancellationRate).toBe(0.2);
    expect(res.completedCount).toBe(5);
    expect(res.averageDurationMinutes).toBe(15);
  });

  it('totalAssigned = 0 → cancellationRate = 0 (pas de division par zéro)', async () => {
    ratingsQb.getRawOne.mockResolvedValue({
      avg: null,
      count: '0',
      punctualityAvg: null,
      punctualityCount: '0',
      communicationAvg: null,
      communicationCount: '0',
      courtesyAvg: null,
      courtesyCount: '0',
    });
    ordersGetRawOne
      .mockResolvedValueOnce({ cnt: '0', avgMin: null })
      .mockResolvedValueOnce({ cancelled: null, assigned: null });

    const res = await service.getExtendedStats('user-z');
    expect(res.cancellationRate).toBe(0);
  });
});

describe('RatingsService - getUserStats (sous-catégories)', () => {
  let service: RatingsService;
  let ratingsRepo: any;
  let ordersRepo: any;
  let ratingsQb: any;

  beforeEach(async () => {
    ratingsQb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(),
    };
    ratingsRepo = {
      createQueryBuilder: jest.fn(() => ratingsQb),
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    };
    ordersRepo = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RatingsService,
        { provide: getRepositoryToken(Rating), useValue: ratingsRepo },
        { provide: getRepositoryToken(DeliveryOrder), useValue: ordersRepo },
      ],
    }).compile();

    service = module.get<RatingsService>(RatingsService);
  });

  it('aucune note de catégorie : averages catégorie sont null', async () => {
    ratingsQb.getRawOne.mockResolvedValue({
      avg: '4.5',
      count: '3',
      punctualityAvg: null,
      punctualityCount: '0',
      communicationAvg: null,
      communicationCount: '0',
      courtesyAvg: null,
      courtesyCount: '0',
    });

    const res = await service.getUserStats('u1');
    expect(res.average).toBe(4.5);
    expect(res.count).toBe(3);
    expect(res.punctualityAverage).toBeNull();
    expect(res.communicationAverage).toBeNull();
    expect(res.courtesyAverage).toBeNull();
  });

  it('mix de ratings : moyennes catégorie calculées sur les non-null seulement', async () => {
    // 5 ratings dont 3 ont la ponctualité notée, 2 la communication, 0 la courtoisie.
    ratingsQb.getRawOne.mockResolvedValue({
      avg: '4.2',
      count: '5',
      punctualityAvg: '4.6667',
      punctualityCount: '3',
      communicationAvg: '3.5',
      communicationCount: '2',
      courtesyAvg: null,
      courtesyCount: '0',
    });

    const res = await service.getUserStats('u2');
    expect(res.average).toBe(4.2);
    expect(res.count).toBe(5);
    expect(res.punctualityAverage).toBe(4.67);
    expect(res.communicationAverage).toBe(3.5);
    expect(res.courtesyAverage).toBeNull();
  });

  it('user vide : average=0, count=0, sous-catégories null', async () => {
    ratingsQb.getRawOne.mockResolvedValue({
      avg: null,
      count: '0',
      punctualityAvg: null,
      punctualityCount: '0',
      communicationAvg: null,
      communicationCount: '0',
      courtesyAvg: null,
      courtesyCount: '0',
    });

    const res = await service.getUserStats('u3');
    expect(res).toEqual({
      average: 0,
      count: 0,
      punctualityAverage: null,
      communicationAverage: null,
      courtesyAverage: null,
    });
  });
});

describe('RatingsService - submitRating (sous-catégories)', () => {
  let service: RatingsService;
  let ratingsRepo: any;
  let ordersRepo: any;

  const completedOrder = {
    id: 'order-1',
    status: OrderStatus.COMPLETED,
    client: { id: 'client-1' },
    livreur: { id: 'livreur-1' },
  };

  beforeEach(async () => {
    ratingsRepo = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn().mockResolvedValue(null), // pas de doublon
      save: jest.fn((entity: any) =>
        Promise.resolve({ id: 'rating-id', ...entity }),
      ),
      create: jest.fn((entity: any) => entity),
    };
    ordersRepo = {
      findOne: jest.fn().mockResolvedValue(completedOrder),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RatingsService,
        { provide: getRepositoryToken(Rating), useValue: ratingsRepo },
        { provide: getRepositoryToken(DeliveryOrder), useValue: ordersRepo },
      ],
    }).compile();

    service = module.get<RatingsService>(RatingsService);
  });

  it('soumet un rating avec les 3 sous-catégories', async () => {
    const result = await service.submitRating('order-1', 'client-1', {
      score: 5,
      comment: 'Super livreur',
      punctualityScore: 5,
      communicationScore: 4,
      courtesyScore: 5,
    });
    expect(ratingsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-1',
        fromUserId: 'client-1',
        toUserId: 'livreur-1',
        score: 5,
        comment: 'Super livreur',
        punctualityScore: 5,
        communicationScore: 4,
        courtesyScore: 5,
      }),
    );
    expect(result).toMatchObject({
      score: 5,
      punctualityScore: 5,
      communicationScore: 4,
      courtesyScore: 5,
    });
  });

  it('soumet un rating sans sous-catégories : null persisté (rétro-compat)', async () => {
    await service.submitRating('order-1', 'client-1', {
      score: 4,
    });
    expect(ratingsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        score: 4,
        comment: null,
        punctualityScore: null,
        communicationScore: null,
        courtesyScore: null,
      }),
    );
  });

  it('soumet un rating avec seulement certaines sous-catégories', async () => {
    await service.submitRating('order-1', 'livreur-1', {
      score: 3,
      punctualityScore: 4,
      // communicationScore et courtesyScore omis
    });
    expect(ratingsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        toUserId: 'client-1', // livreur note client
        score: 3,
        punctualityScore: 4,
        communicationScore: null,
        courtesyScore: null,
      }),
    );
  });
});
