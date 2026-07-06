import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Vehicle } from '../entities/vehicle.entity';
import { User } from '../entities/user.entity';
import { Zone } from '../entities/zone.entity';
import { UpsertVehicleDto } from './dto/upsert-vehicle.dto';

@Injectable()
export class VehiclesService {
  constructor(
    @InjectRepository(Vehicle)
    private vehiclesRepo: Repository<Vehicle>,
    @InjectRepository(Zone)
    private zonesRepo: Repository<Zone>,
  ) {}

  async findByDriver(userId: string) {
    return this.vehiclesRepo.findOne({
      where: { driver: { id: userId } },
      relations: ['usualZone'],
    });
  }

  /**
   * Résout `usualZoneId` en entité `Zone` (ou `null` pour retirer la zone).
   * Renvoie `undefined` si le champ n'a pas été fourni dans le DTO, pour ne
   * pas toucher à la valeur existante.
   */
  private async resolveUsualZone(
    usualZoneId: string | null | undefined,
  ): Promise<Zone | null | undefined> {
    if (usualZoneId === undefined) return undefined;
    if (usualZoneId === null) return null;
    const zone = await this.zonesRepo.findOne({
      where: { id: usualZoneId },
    });
    if (!zone) throw new BadRequestException('Zone introuvable');
    return zone;
  }

  async upsertForDriver(userId: string, dto: UpsertVehicleDto) {
    const usualZone = await this.resolveUsualZone(dto.usualZoneId);

    const existing = await this.findByDriver(userId);
    if (existing) {
      existing.type = dto.type;
      if (dto.licensePlate !== undefined)
        existing.licensePlate = dto.licensePlate;
      if (dto.description !== undefined) existing.description = dto.description;
      if (usualZone !== undefined) existing.usualZone = usualZone;
      return this.vehiclesRepo.save(existing);
    }
    const vehicle = this.vehiclesRepo.create({
      type: dto.type,
      licensePlate: dto.licensePlate,
      description: dto.description,
      driver: { id: userId } as User,
      ...(usualZone !== undefined ? { usualZone } : {}),
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
