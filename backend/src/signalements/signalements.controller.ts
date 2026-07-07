import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import { SignalementsService } from './signalements.service';
import { CreateSignalementDto } from './dto/create-signalement.dto';
import { ListSignalementsDto } from './dto/list-signalements.dto';
import { UpdateSignalementDto } from './dto/update-signalement.dto';

/**
 * Signalements (CDC V1 §17.1) : permet à tout utilisateur authentifié de
 * signaler une livraison, un utilisateur, un livreur ou un commerçant.
 * Le traitement (consultation liste + changement de statut) est réservé
 * à l'ADMIN.
 */
@Controller('signalements')
@UseGuards(RolesGuard)
export class SignalementsController {
  constructor(private readonly signalementsService: SignalementsService) {}

  @Post()
  create(
    @Body() dto: CreateSignalementDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.signalementsService.create(user.id ?? user.sub, dto);
  }

  @Roles(UserRole.ADMIN)
  @Get()
  list(@Query() query: ListSignalementsDto) {
    return this.signalementsService.list(query);
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSignalementDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.signalementsService.updateStatus(id, user.id ?? user.sub, dto);
  }
}
