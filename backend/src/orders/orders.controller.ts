import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { EstimateOrderDto } from './dto/estimate-order.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('orders')
@UseGuards(RolesGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Roles(UserRole.CLIENT)
  @Post()
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: any) {
    return this.ordersService.createOrder(user.id, dto);
  }

  @Post('estimate')
  estimate(@Body() dto: EstimateOrderDto) {
    return this.ordersService.estimateRoute(
      dto.pickupLat,
      dto.pickupLng,
      dto.deliveryLat,
      dto.deliveryLng,
    );
  }

  @Roles(UserRole.ADMIN, UserRole.LIVREUR)
  @Get()
  findAll() {
    return this.ordersService.findAll();
  }

  @Get('mine')
  findMine(@CurrentUser() user: any) {
    return this.ordersService.findForUser(user);
  }

  @Roles(UserRole.LIVREUR)
  @Post(':id/accept')
  accept(@Param('id') id: string, @CurrentUser() user: any) {
    return this.ordersService.acceptOrder(id, user.id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
    @CurrentUser() user: any,
  ) {
    return this.ordersService.updateStatus(id, dto.status, user);
  }
}
