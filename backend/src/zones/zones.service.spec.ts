import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';

import { ZonesService } from './zones.service';
import { Zone } from '../entities/zone.entity';

const mockRepo = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn((fn: any) => fn),
  save: jest.fn(),
  remove: jest.fn(),
});

describe('ZonesService', () => {
  let service: ZonesService;
  let repo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    repo = mockRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ZonesService,
        { provide: getRepositoryToken(Zone), useValue: repo },
      ],
    }).compile();

    service = module.get<ZonesService>(ZonesService);
  });

  describe('findAll / findActive', () => {
    it('findAll renvoie toutes les zones triées par nom', async () => {
      const zones = [{ id: '1', name: 'Bè', active: true }];
      repo.find.mockResolvedValue(zones);

      const result = await service.findAll();

      expect(result).toBe(zones);
      expect(repo.find).toHaveBeenCalledWith({ order: { name: 'ASC' } });
    });

    it('findActive ne renvoie que les zones actives', async () => {
      const zones = [{ id: '1', name: 'Bè', active: true }];
      repo.find.mockResolvedValue(zones);

      const result = await service.findActive();

      expect(result).toBe(zones);
      expect(repo.find).toHaveBeenCalledWith({
        where: { active: true },
        order: { name: 'ASC' },
      });
    });
  });

  describe('create', () => {
    it('crée une zone active par défaut', async () => {
      repo.findOne.mockResolvedValue(null);
      repo.save.mockImplementation(async (z: any) => ({ id: 'new-1', ...z }));

      const result = await service.create('Adidogomé');

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Adidogomé', active: true }),
      );
      expect(result.id).toBe('new-1');
    });

    it('trim le nom avant de vérifier le doublon', async () => {
      repo.findOne.mockResolvedValue(null);
      repo.save.mockImplementation(async (z: any) => z);

      await service.create('  Agoè  ');

      expect(repo.findOne).toHaveBeenCalledWith({ where: { name: 'Agoè' } });
    });

    it('rejette avec ConflictException si le nom existe déjà', async () => {
      repo.findOne.mockResolvedValue({ id: 'existing', name: 'Bè' });

      await expect(service.create('Bè')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('renomme une zone', async () => {
      const zone = { id: 'z1', name: 'Bè', active: true };
      repo.findOne
        .mockResolvedValueOnce(zone) // find zone by id
        .mockResolvedValueOnce(null); // assertNameAvailable
      repo.save.mockImplementation(async (z: any) => z);

      const result = await service.update('z1', { name: 'Bè Kpéhénou' });

      expect(result.name).toBe('Bè Kpéhénou');
    });

    it('désactive une zone (active=false)', async () => {
      const zone = { id: 'z1', name: 'Bè', active: true };
      repo.findOne.mockResolvedValue(zone);
      repo.save.mockImplementation(async (z: any) => z);

      const result = await service.update('z1', { active: false });

      expect(result.active).toBe(false);
    });

    it('rejette avec ConflictException si le nouveau nom est déjà pris par une autre zone', async () => {
      const zone = { id: 'z1', name: 'Bè', active: true };
      const other = { id: 'z2', name: 'Tokoin', active: true };
      repo.findOne
        .mockResolvedValueOnce(zone)
        .mockResolvedValueOnce(other);

      await expect(
        service.update('z1', { name: 'Tokoin' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('autorise à renommer avec le même nom (pas de conflit avec soi-même)', async () => {
      const zone = { id: 'z1', name: 'Bè', active: true };
      repo.findOne
        .mockResolvedValueOnce(zone)
        .mockResolvedValueOnce(zone); // même id → pas de conflit
      repo.save.mockImplementation(async (z: any) => z);

      const result = await service.update('z1', { name: 'Bè' });
      expect(result.name).toBe('Bè');
    });

    it('throw NotFoundException si la zone est introuvable', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.update('missing', { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('supprime la zone (delete réel)', async () => {
      const zone = { id: 'z1', name: 'Bè', active: true };
      repo.findOne.mockResolvedValue(zone);
      repo.remove.mockResolvedValue(zone);

      const result = await service.remove('z1');

      expect(repo.remove).toHaveBeenCalledWith(zone);
      expect(result).toEqual({ ok: true });
    });

    it('throw NotFoundException si la zone est introuvable', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.remove('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repo.remove).not.toHaveBeenCalled();
    });
  });
});
