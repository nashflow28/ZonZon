import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Zone } from '../entities/zone.entity';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';

/**
 * Priorité 3 backlog V1 (Lot 1) : référentiel des quartiers/zones de Lomé.
 * Version simple — pas de tarif par zone, juste une liste gérable.
 *
 * Décision : `active` (désactivation logique, via PATCH) coexiste avec un
 * `remove()` qui fait un DELETE réel. On ne fait PAS de soft-delete sur
 * `remove()` pour éviter deux mécanismes redondants de "désactivation" —
 * si l'admin veut juste masquer une zone des dropdowns sans la supprimer,
 * il utilise `PATCH { active: false }`. `DELETE` est réservé à une vraie
 * suppression (ex: doublon créé par erreur).
 */
@Injectable()
export class ZonesService {
  constructor(
    @InjectRepository(Zone)
    private readonly zonesRepo: Repository<Zone>,
  ) {}

  findAll(): Promise<Zone[]> {
    return this.zonesRepo.find({ order: { name: 'ASC' } });
  }

  findActive(): Promise<Zone[]> {
    return this.zonesRepo.find({
      where: { active: true },
      order: { name: 'ASC' },
    });
  }

  private async assertNameAvailable(name: string, excludeId?: string) {
    const existing = await this.zonesRepo.findOne({ where: { name } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('Une zone avec ce nom existe déjà');
    }
  }

  async create(name: string): Promise<Zone> {
    const trimmed = name.trim();
    await this.assertNameAvailable(trimmed);
    const zone = this.zonesRepo.create({ name: trimmed, active: true });
    return this.zonesRepo.save(zone);
  }

  async update(id: string, dto: UpdateZoneDto): Promise<Zone> {
    const zone = await this.zonesRepo.findOne({ where: { id } });
    if (!zone) {
      throw new NotFoundException('Zone introuvable');
    }
    if (dto.name !== undefined) {
      const trimmed = dto.name.trim();
      await this.assertNameAvailable(trimmed, id);
      zone.name = trimmed;
    }
    if (dto.active !== undefined) {
      zone.active = dto.active;
    }
    return this.zonesRepo.save(zone);
  }

  async remove(id: string): Promise<{ ok: boolean }> {
    const zone = await this.zonesRepo.findOne({ where: { id } });
    if (!zone) {
      throw new NotFoundException('Zone introuvable');
    }
    await this.zonesRepo.remove(zone);
    return { ok: true };
  }
}
