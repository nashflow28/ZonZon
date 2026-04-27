import { Body, Controller, Delete, Get, Put, UseGuards } from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import { UpsertVehicleDto } from './dto/upsert-vehicle.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../entities/user.entity';

@Controller('vehicles')
@UseGuards(RolesGuard)
@Roles(UserRole.LIVREUR, UserRole.ADMIN)
export class VehiclesController {
  constructor(private vehiclesService: VehiclesService) {}

  @Get('me')
  getMine(@CurrentUser() user: any) {
    return this.vehiclesService.findByDriver(user.id);
  }

  @Put('me')
  upsertMine(@CurrentUser() user: any, @Body() dto: UpsertVehicleDto) {
    return this.vehiclesService.upsertForDriver(user.id, dto);
  }

  @Delete('me')
  deleteMine(@CurrentUser() user: any) {
    return this.vehiclesService.removeForDriver(user.id);
  }
}
