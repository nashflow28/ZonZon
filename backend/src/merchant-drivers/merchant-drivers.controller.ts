import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { MerchantDriversService } from './merchant-drivers.service';
import { AddMerchantDriverDto } from './dto/add-merchant-driver.dto';
import { UsersService } from '../users/users.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';

/**
 * Gestion des livreurs affiliés d'un commerçant ("mes livreurs") —
 * Priorité 3, Lot 3, item 2.
 */
@Controller('merchants/me/drivers')
@UseGuards(RolesGuard)
@Roles(UserRole.COMMERCANT)
export class MerchantDriversController {
  constructor(
    private readonly merchantDriversService: MerchantDriversService,
    private readonly usersService: UsersService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    const merchantId = user.id ?? user.sub;
    return this.merchantDriversService.listDriversForMerchant(merchantId!);
  }

  /**
   * Invite un livreur (§9.2) : crée l'affiliation en `PENDING` — elle ne
   * devient active qu'après acceptation par le livreur via
   * `PATCH /drivers/me/affiliations/:merchantId`.
   */
  @Post()
  async add(
    @Body() dto: AddMerchantDriverDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const merchantId = user.id ?? user.sub;

    let driverId = dto.driverId;
    if (!driverId) {
      if (!dto.driverPhone) {
        throw new BadRequestException(
          'driverId ou driverPhone requis pour affilier un livreur',
        );
      }
      const found = await this.usersService.findByPhone(dto.driverPhone);
      if (!found) {
        throw new BadRequestException(
          'Aucun utilisateur trouvé avec ce numéro de téléphone',
        );
      }
      if (found.role !== UserRole.LIVREUR) {
        throw new BadRequestException(
          "L'utilisateur trouvé n'est pas un livreur",
        );
      }
      driverId = found.id;
    }

    return this.merchantDriversService.addAffiliation(merchantId!, driverId);
  }

  @Delete(':driverId')
  remove(
    @Param('driverId') driverId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const merchantId = user.id ?? user.sub;
    return this.merchantDriversService.removeAffiliation(
      merchantId!,
      driverId,
    );
  }
}
