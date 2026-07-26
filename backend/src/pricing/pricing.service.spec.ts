import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { calculateDeliveryPrice, PricingService } from './pricing.service';
import { PricingConfig } from '../entities/pricing-config.entity';

const mockRepo = () => ({
  findOne: jest.fn(),
  create: jest.fn((fn: any) => fn),
  save: jest.fn(),
});

describe('PricingService', () => {
  let service: PricingService;
  let repo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    repo = mockRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PricingService,
        { provide: getRepositoryToken(PricingConfig), useValue: repo },
      ],
    }).compile();

    service = module.get<PricingService>(PricingService);
  });

  describe('getConfig (get-or-create singleton)', () => {
    it('renvoie la ligne existante si présente', async () => {
      const existing = {
        id: 1,
        pricePerKm: 250,
        minPriceFcfa: 300,
        shortTripMaxDistanceKm: 2.5,
        updatedAt: new Date(),
      };
      repo.findOne.mockResolvedValue(existing);

      const result = await service.getConfig();

      expect(result).toEqual(existing);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('crée la ligne par défaut (pricePerKm=200) si absente', async () => {
      repo.findOne.mockResolvedValue(null);
      repo.save.mockImplementation(async (c: any) => c);

      const result = await service.getConfig();

      expect(result.id).toBe(1);
      expect(result.pricePerKm).toBe(200);
      expect(result.minPriceFcfa).toBe(500);
      expect(result.shortTripMaxDistanceKm).toBe(2.5);
      expect(repo.save).toHaveBeenCalled();
    });

    it('utilise le cache mémoire : un 2e appel rapproché ne refait pas de findOne', async () => {
      const existing = {
        id: 1,
        pricePerKm: 200,
        minPriceFcfa: 500,
        shortTripMaxDistanceKm: 2.5,
        updatedAt: new Date(),
      };
      repo.findOne.mockResolvedValue(existing);

      await service.getConfig();
      await service.getConfig();

      expect(repo.findOne).toHaveBeenCalledTimes(1);
    });
  });

  describe('getPricePerKm / getMinPriceFcfa', () => {
    it('renvoie pricePerKm de la config', async () => {
      repo.findOne.mockResolvedValue({
        id: 1,
        pricePerKm: 200,
        minPriceFcfa: 500,
        shortTripMaxDistanceKm: 2.5,
      });
      const price = await service.getPricePerKm();
      expect(price).toBe(200);
    });

    it('renvoie le forfait course courte', async () => {
      repo.findOne.mockResolvedValue({
        id: 1,
        pricePerKm: 200,
        minPriceFcfa: 500,
        shortTripMaxDistanceKm: 2.5,
      });
      const min = await service.getMinPriceFcfa();
      expect(min).toBe(500);
    });
  });

  describe('updateConfig', () => {
    it('met à jour pricePerKm et invalide le cache', async () => {
      const existing = {
        id: 1,
        pricePerKm: 200,
        minPriceFcfa: 500,
        shortTripMaxDistanceKm: 2.5,
        updatedAt: new Date(),
      };
      repo.findOne.mockResolvedValue(existing);
      repo.save.mockImplementation(async (c: any) => c);

      // Prime le cache
      await service.getConfig();

      const updated = await service.updateConfig({ pricePerKm: 250 });
      expect(updated.pricePerKm).toBe(250);

      // Le cache doit avoir été invalidé : un nouvel appel refait un findOne
      repo.findOne.mockResolvedValue({ ...existing, pricePerKm: 250 });
      const price = await service.getPricePerKm();
      expect(price).toBe(250);
      expect(repo.findOne).toHaveBeenCalledTimes(2);
    });

    it('met à jour minPriceFcfa', async () => {
      repo.findOne.mockResolvedValue({
        id: 1,
        pricePerKm: 200,
        minPriceFcfa: 500,
        shortTripMaxDistanceKm: 2.5,
        updatedAt: new Date(),
      });
      repo.save.mockImplementation(async (c: any) => c);

      const updated = await service.updateConfig({ minPriceFcfa: 500 });
      expect(updated.minPriceFcfa).toBe(500);
    });

    it('ignore les champs non fournis (partial update)', async () => {
      repo.findOne.mockResolvedValue({
        id: 1,
        pricePerKm: 200,
        minPriceFcfa: 100,
        shortTripMaxDistanceKm: 2.5,
        updatedAt: new Date(),
      });
      repo.save.mockImplementation(async (c: any) => c);

      const updated = await service.updateConfig({});
      expect(updated.pricePerKm).toBe(200);
      expect(updated.minPriceFcfa).toBe(100);
      expect(updated.shortTripMaxDistanceKm).toBe(2.5);
    });

    it('met à jour la distance maximale du forfait', async () => {
      repo.findOne.mockResolvedValue({
        id: 1,
        pricePerKm: 200,
        minPriceFcfa: 500,
        shortTripMaxDistanceKm: 2.5,
        updatedAt: new Date(),
      });
      repo.save.mockImplementation(async (c: any) => c);

      const updated = await service.updateConfig({
        shortTripMaxDistanceKm: 3,
      });
      expect(updated.shortTripMaxDistanceKm).toBe(3);
    });
  });
});

describe('calculateDeliveryPrice', () => {
  const base = {
    pricePerKm: 200,
    shortTripPriceFcfa: 500,
    shortTripMaxDistanceKm: 2.5,
  };

  it('applique 500 FCFA jusqu’à 2,50 km inclus', () => {
    expect(calculateDeliveryPrice({ ...base, distanceKm: 2.5 })).toBe(500);
  });

  it('applique le tarif kilométrique juste au-dessus du seuil', () => {
    expect(calculateDeliveryPrice({ ...base, distanceKm: 2.51 })).toBe(502);
  });

  it('ajoute le prix de base de zone uniquement au-delà du forfait', () => {
    expect(
      calculateDeliveryPrice({
        ...base,
        distanceKm: 3,
        basePriceFcfa: 100,
      }),
    ).toBe(700);
  });
});
