import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { MerchantDriversService } from './merchant-drivers.service';
import { RespondAffiliationDto } from './dto/respond-affiliation.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';

/**
 * Côté livreur du flux d'affiliation invite/accept (§9.2) : consultation
 * des invitations reçues et réponse (accepter/refuser).
 */
@Controller('drivers/me/affiliations')
@UseGuards(RolesGuard)
@Roles(UserRole.LIVREUR)
export class DriverAffiliationsController {
  constructor(private readonly merchantDriversService: MerchantDriversService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    const driverId = user.id ?? user.sub;
    return this.merchantDriversService.listAffiliationsForDriver(driverId!);
  }

  @Patch(':merchantId')
  respond(
    @Param('merchantId') merchantId: string,
    @Body() dto: RespondAffiliationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const driverId = user.id ?? user.sub;
    return this.merchantDriversService.respondToInvitation(
      merchantId,
      driverId!,
      dto.action,
    );
  }
}
