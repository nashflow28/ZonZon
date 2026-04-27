import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SavedAddress } from '../entities/saved-address.entity';
import { CreateSavedAddressDto } from './dto/create-saved-address.dto';
import { UpdateSavedAddressDto } from './dto/update-saved-address.dto';

@Injectable()
export class AddressesService {
  constructor(
    @InjectRepository(SavedAddress)
    private repo: Repository<SavedAddress>,
  ) {}

  list(userId: string) {
    return this.repo.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });
  }

  async create(userId: string, dto: CreateSavedAddressDto) {
    const entity = this.repo.create({
      userId,
      label: dto.label.trim(),
      address: dto.address.trim(),
      lat: dto.lat,
      lng: dto.lng,
      icon: dto.icon ?? null,
    });
    return this.repo.save(entity);
  }

  async update(userId: string, id: string, dto: UpdateSavedAddressDto) {
    const found = await this.repo.findOne({ where: { id } });
    if (!found) throw new NotFoundException('Adresse introuvable');
    if (found.userId !== userId) throw new ForbiddenException();

    if (dto.label !== undefined) found.label = dto.label.trim();
    if (dto.address !== undefined) found.address = dto.address.trim();
    if (dto.lat !== undefined) found.lat = dto.lat;
    if (dto.lng !== undefined) found.lng = dto.lng;
    if (dto.icon !== undefined) found.icon = dto.icon;

    return this.repo.save(found);
  }

  async remove(userId: string, id: string) {
    const found = await this.repo.findOne({ where: { id } });
    if (!found) throw new NotFoundException('Adresse introuvable');
    if (found.userId !== userId) throw new ForbiddenException();
    await this.repo.remove(found);
    return { deleted: true };
  }
}
