import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedUser } from '../auth/types';
import { UserRole } from '../entities/user.entity';
import { SubmitRatingDto } from './dto/submit-rating.dto';
import { RatingsService } from './ratings.service';

@Controller()
@UseGuards(RolesGuard)
export class RatingsController {
  constructor(private readonly ratingsService: RatingsService) {}

  @Roles(UserRole.CLIENT, UserRole.LIVREUR)
  @Post('orders/:orderId/rating')
  submit(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: SubmitRatingDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const userId = user.id ?? (user.sub as string);
    return this.ratingsService.submitRating(orderId, userId, dto);
  }

  @Get('users/:userId/ratings/stats')
  stats(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.ratingsService.getUserStats(userId);
  }

  /**
   * Stats étendues publiques d'un user (typiquement un livreur) :
   * note moyenne, nombre de courses terminées, durée moyenne, taux d'annulation.
   * Tout user authentifié peut consulter (pas de restriction de rôle).
   */
  @Get('users/:userId/stats')
  extendedStats(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.ratingsService.getExtendedStats(userId);
  }

  @Get('users/:userId/ratings')
  list(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('take') take?: string,
  ) {
    const parsed = take ? parseInt(take, 10) : undefined;
    return this.ratingsService.listForUser(userId, {
      take: Number.isFinite(parsed) ? parsed : undefined,
    });
  }
}
