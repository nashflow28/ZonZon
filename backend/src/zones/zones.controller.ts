import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ZonesService } from './zones.service';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';

@Controller('zones')
@UseGuards(RolesGuard)
export class ZonesController {
  constructor(private readonly zonesService: ZonesService) {}

  /** Tout utilisateur authentifié — pour les dropdowns mobile/admin. */
  @Get()
  findActive() {
    return this.zonesService.findActive();
  }

  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() dto: CreateZoneDto) {
    return this.zonesService.create(dto.name);
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateZoneDto,
  ) {
    return this.zonesService.update(id, dto);
  }

  @Roles(UserRole.ADMIN)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.zonesService.remove(id);
  }
}
