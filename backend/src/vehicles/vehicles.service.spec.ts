import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';

import { VehiclesService } from './vehicles.service';
import { Vehicle, VehicleType } from '../entities/vehicle.entity';
import { Zone } from '../entities/zone.entity';

const mockVehiclesRepo = () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
});

const mockZonesRepo = () => ({
  findOne: jest.fn(),
});

describe('VehiclesService', () => {
  let service: VehiclesService;
  let vehiclesRepo: ReturnType<typeof mockVehiclesRepo>;
  let zonesRepo: ReturnType<typeof mockZonesRepo>;

  beforeEach(async () => {
    vehiclesRepo = mockVehiclesRepo();
    zonesRepo = mockZonesRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VehiclesService,
        { provide: getRepositoryToken(Vehicle), useValue: vehiclesRepo },
        { provide: getRepositoryToken(Zone), useValue: zonesRepo },
      ],
    }).compile();

    service = module.get<VehiclesService>(VehiclesService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('upsertForDriver', () => {
    const existingVehicle = () => ({
      id: 'vehicle-1',
      type: VehicleType.MOTO,
      licensePlate: 'AB-123',
      description: null,
      usualZone: null,
    });

    it('usualZoneId valide → zone assignée', async () => {
      vehiclesRepo.findOne.mockResolvedValue(existingVehicle());
      zonesRepo.findOne.mockResolvedValue({ id: 'zone-1', name: 'Bè' });
      vehiclesRepo.save.mockImplementation(async (v: any) => v);

      const result = await service.upsertForDriver('driver-1', {
        type: VehicleType.MOTO,
        usualZoneId: 'zone-1',
      } as any);

      expect(zonesRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'zone-1' },
      });
      expect(result.usualZone).toEqual({ id: 'zone-1', name: 'Bè' });
      expect(vehiclesRepo.save).toHaveBeenCalled();
    });

    it('zone inexistante → BadRequestException', async () => {
      vehiclesRepo.findOne.mockResolvedValue(existingVehicle());
      zonesRepo.findOne.mockResolvedValue(null);

      await expect(
        service.upsertForDriver('driver-1', {
          type: VehicleType.MOTO,
          usualZoneId: 'zone-inconnue',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(vehiclesRepo.save).not.toHaveBeenCalled();
    });

    it('usualZoneId absent du DTO → champ existant préservé', async () => {
      const existing = {
        ...existingVehicle(),
        usualZone: { id: 'zone-old', name: 'Tokoin' },
      };
      vehiclesRepo.findOne.mockResolvedValue(existing);
      vehiclesRepo.save.mockImplementation(async (v: any) => v);

      const result = await service.upsertForDriver('driver-1', {
        type: VehicleType.MOTO,
      } as any);

      expect(zonesRepo.findOne).not.toHaveBeenCalled();
      expect(result.usualZone).toEqual({ id: 'zone-old', name: 'Tokoin' });
    });

    it('usualZoneId: null → retire la zone existante', async () => {
      const existing = {
        ...existingVehicle(),
        usualZone: { id: 'zone-old', name: 'Tokoin' },
      };
      vehiclesRepo.findOne.mockResolvedValue(existing);
      vehiclesRepo.save.mockImplementation(async (v: any) => v);

      const result = await service.upsertForDriver('driver-1', {
        type: VehicleType.MOTO,
        usualZoneId: null,
      } as any);

      expect(zonesRepo.findOne).not.toHaveBeenCalled();
      expect(result.usualZone).toBeNull();
    });

    it("pas de véhicule existant + usualZoneId valide → création avec zone", async () => {
      vehiclesRepo.findOne.mockResolvedValue(null);
      zonesRepo.findOne.mockResolvedValue({ id: 'zone-1', name: 'Bè' });
      vehiclesRepo.create.mockImplementation((v: any) => v);
      vehiclesRepo.save.mockImplementation(async (v: any) => v);

      const result = await service.upsertForDriver('driver-1', {
        type: VehicleType.MOTO,
        usualZoneId: 'zone-1',
      } as any);

      expect(result.usualZone).toEqual({ id: 'zone-1', name: 'Bè' });
    });
  });
});
