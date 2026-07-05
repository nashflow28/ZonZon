import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { PricingService } from './pricing.service';
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
      expect(result.minPriceFcfa).toBeNull();
      expect(repo.save).toHaveBeenCalled();
    });

    it('utilise le cache mémoire : un 2e appel rapproché ne refait pas de findOne', async () => {
      const existing = {
        id: 1,
        pricePerKm: 200,
        minPriceFcfa: null,
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
        minPriceFcfa: null,
      });
      const price = await service.getPricePerKm();
      expect(price).toBe(200);
    });

    it('renvoie minPriceFcfa (null si non défini)', async () => {
      repo.findOne.mockResolvedValue({
        id: 1,
        pricePerKm: 200,
        minPriceFcfa: null,
      });
      const min = await service.getMinPriceFcfa();
      expect(min).toBeNull();
    });
  });

  describe('updateConfig', () => {
    it('met à jour pricePerKm et invalide le cache', async () => {
      const existing = {
        id: 1,
        pricePerKm: 200,
        minPriceFcfa: null,
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
        minPriceFcfa: null,
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
        updatedAt: new Date(),
      });
      repo.save.mockImplementation(async (c: any) => c);

      const updated = await service.updateConfig({});
      expect(updated.pricePerKm).toBe(200);
      expect(updated.minPriceFcfa).toBe(100);
    });
  });
});
