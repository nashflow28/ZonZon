import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { UpdatePricingDto } from './dto/update-pricing.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';

/**
 * Priorité 3 backlog V1 (Lot 1) : gestion du tarif au km par l'admin.
 */
@Controller('admin/pricing')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Get()
  getConfig() {
    return this.pricingService.getConfig();
  }

  @Patch()
  updateConfig(@Body() dto: UpdatePricingDto) {
    return this.pricingService.updateConfig(dto);
  }
}
