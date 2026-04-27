import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Vehicle } from '../entities/vehicle.entity';
import { User } from '../entities/user.entity';
import { UpsertVehicleDto } from './dto/upsert-vehicle.dto';

@Injectable()
export class VehiclesService {
  constructor(
    @InjectRepository(Vehicle)
    private vehiclesRepo: Repository<Vehicle>,
  ) {}

  async findByDriver(userId: string) {
    return this.vehiclesRepo.findOne({ where: { driver: { id: userId } } });
  }

  async upsertForDriver(userId: string, dto: UpsertVehicleDto) {
    const existing = await this.findByDriver(userId);
    if (existing) {
      existing.type = dto.type;
      if (dto.licensePlate !== undefined)
        existing.licensePlate = dto.licensePlate;
      if (dto.description !== undefined) existing.description = dto.description;
      return this.vehiclesRepo.save(existing);
    }
    const vehicle = this.vehiclesRepo.create({
      type: dto.type,
      licensePlate: dto.licensePlate,
      description: dto.description,
      driver: { id: userId } as User,
    });
    return this.vehiclesRepo.save(vehicle);
  }

  async removeForDriver(userId: string) {
    const existing = await this.findByDriver(userId);
    if (!existing) throw new NotFoundException('Véhicule introuvable');
    await this.vehiclesRepo.remove(existing);
    return { success: true };
  }
}
