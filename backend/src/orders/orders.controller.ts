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
import { Throttle } from '@nestjs/throttler';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateMerchantOrderDto } from './dto/create-merchant-order.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { EstimateOrderDto } from './dto/estimate-order.dto';
import { ListOrdersDto } from './dto/list-orders.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';

@Controller('orders')
@UseGuards(RolesGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Roles(UserRole.CLIENT)
  @Post()
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.createOrder(user.id ?? user.sub, dto);
  }

  @Throttle({ short: { limit: 20, ttl: 60_000 } })
  @Post('estimate')
  estimate(@Body() dto: EstimateOrderDto) {
    return this.ordersService.estimateRoute(
      dto.pickupLat,
      dto.pickupLng,
      dto.deliveryLat,
      dto.deliveryLng,
    );
  }

  @Roles(UserRole.COMMERCANT)
  @Post('merchant')
  createMerchant(
    @Body() dto: CreateMerchantOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.createMerchantOrder(user.id ?? user.sub, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.LIVREUR)
  @Get()
  findAll(@Query() query: ListOrdersDto) {
    return this.ordersService.findAll(query);
  }

  @Roles(UserRole.LIVREUR)
  @Get('available')
  findAvailable(@CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.findAvailable(user);
  }

  @Get('mine')
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.findForUser(user);
  }

  @Roles(UserRole.LIVREUR)
  @Post(':id/accept')
  accept(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.acceptOrder(id, user.id ?? user.sub);
  }

  @Get(':id/eta')
  getEta(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.computeEta(id, user);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.updateStatus(id, dto.status, user, dto);
  }
}
