import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import { NotificationsQueryService } from './notifications-query.service';
import { ListNotificationsDto } from './dto/list-notifications.dto';

/**
 * Centre de notifications (CDC V1 §18.12) : consultation et gestion de la
 * lecture des notifications persistées pour l'utilisateur courant.
 */
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsQueryService: NotificationsQueryService,
  ) {}

  @Get()
  findMine(
    @Query() query: ListNotificationsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.notificationsQueryService.list(user.id ?? user.sub, query);
  }

  @Patch(':id/read')
  async markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const userId = user.id ?? user.sub;
    const notification = await this.notificationsQueryService.findById(id);
    if (!notification) {
      throw new NotFoundException('Notification introuvable');
    }
    if (notification.userId !== userId) {
      throw new ForbiddenException(
        "Cette notification n'appartient pas à l'utilisateur courant",
      );
    }
    return this.notificationsQueryService.markRead(id);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsQueryService.markAllRead(user.id ?? user.sub);
  }
}
