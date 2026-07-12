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
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto';
import { UpdatePriceDto } from './dto/update-price.dto';
import { EstimateOrderDto } from './dto/estimate-order.dto';
import { ListOrdersDto } from './dto/list-orders.dto';
import { AvailableDriversQueryDto } from './dto/available-drivers-query.dto';
import { AssignOrderDto } from './dto/assign-order.dto';
import { SearchMerchantClientsQueryDto } from './dto/search-merchant-clients-query.dto';
import { CreateDeliveryRunDto } from './dto/create-delivery-run.dto';
import { ProposePriceDto } from './dto/propose-price.dto';
import { RespondPriceProposalDto } from './dto/respond-price-proposal.dto';
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
      {
        pickupZoneId: dto.pickupZoneId,
        destinationZoneId: dto.destinationZoneId,
      },
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

  @Roles(UserRole.COMMERCANT)
  @Post('runs')
  createRun(
    @Body() dto: CreateDeliveryRunDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.createDeliveryRun(
      user.id ?? user.sub,
      dto.livreurId,
    );
  }

  @Roles(UserRole.COMMERCANT, UserRole.LIVREUR)
  @Get('runs/mine')
  findMyRuns(@CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.findRunsForUser(
      user.id ?? user.sub,
      user.role as UserRole,
    );
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

  @Roles(UserRole.COMMERCANT, UserRole.CLIENT, UserRole.ADMIN)
  @Get('available-drivers')
  findAvailableDrivers(
    @Query() query: AvailableDriversQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.findAvailableDriversForActor(
      user,
      query.lat,
      query.lng,
    );
  }

  @Roles(UserRole.COMMERCANT)
  @Get('merchant-clients/search')
  searchMerchantClients(@Query() query: SearchMerchantClientsQueryDto) {
    return this.ordersService.searchMerchantClients(query.query, query.limit);
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

  @Roles(UserRole.LIVREUR)
  @Post(':id/price-proposals')
  proposePrice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProposePriceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.proposePrice(
      id,
      user.id ?? user.sub,
      dto.priceFcfa,
    );
  }

  @Roles(UserRole.CLIENT)
  @Get(':id/price-proposal')
  getPendingPriceProposal(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.getPendingPriceProposal(id, user.id ?? user.sub);
  }

  @Roles(UserRole.CLIENT)
  @Patch(':id/price-proposal/:proposalId')
  respondToPriceProposal(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('proposalId', ParseUUIDPipe) proposalId: string,
    @Body() dto: RespondPriceProposalDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.respondToPriceProposal(
      id,
      proposalId,
      user.id ?? user.sub,
      dto.accept,
    );
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

  @Patch(':id/payment-status')
  updatePayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePaymentStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.updatePaymentStatus(id, dto.paymentStatus, user);
  }

  /**
   * Historique des changements de statut de livraison (Priorité 1, CDC V1 —
   * traçabilité).
   */
  @Get(':id/history')
  getHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.getStatusHistory(id, user);
  }

  /**
   * Historique des changements de statut de paiement (Priorité 1, CDC V1
   * §5.2, §18.13).
   */
  @Get(':id/payment-history')
  getPaymentHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.getPaymentHistory(id, user);
  }

  /**
   * Ajustement manuel du prix (Priorité 1, CDC V1 §6.3) : autorisé au
   * commerçant créateur ou à un admin, tant que la course n'est pas
   * terminale.
   */
  @Roles(UserRole.COMMERCANT, UserRole.ADMIN)
  @Patch(':id/price')
  updatePrice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePriceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.updatePrice(id, dto.priceFcfa, user, dto.reason);
  }

  /**
   * Réassignation manuelle (optionnelle, Priorité 3 Lot 3 item 1) : utile
   * si le premier livreur ciblé n'a pas répondu à temps.
   */
  @Roles(UserRole.COMMERCANT, UserRole.ADMIN)
  @Patch(':id/assign')
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.assignPreferredLivreur(id, dto.livreurId, user);
  }
}
