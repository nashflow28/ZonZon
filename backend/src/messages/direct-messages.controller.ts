import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { DirectMessagesService } from './direct-messages.service';
import { SendDirectMessageDto } from './dto/send-direct-message.dto';

@Controller('direct-messages')
export class DirectMessagesController {
  constructor(private readonly service: DirectMessagesService) {}

  @Get('contacts') contacts(@Req() req: Request) {
    return this.service.listContacts(req.user as any);
  }
  @Get(':userId') thread(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() req: Request,
  ) {
    return this.service.listThread(userId, req.user as any);
  }
  @Post(':userId') send(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: SendDirectMessageDto,
    @Req() req: Request,
  ) {
    return this.service.send(userId, dto.content, req.user as any, dto.orderId);
  }
  @Delete(':userId') hide(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() req: Request,
  ) {
    return this.service.hideThread(userId, req.user as any);
  }
}
