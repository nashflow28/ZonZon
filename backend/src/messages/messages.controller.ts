import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { MessagesService } from './messages.service';
import { SendMessageDto } from './dto/send-message.dto';

@Controller('orders/:orderId/messages')
export class MessagesController {
  constructor(private messagesService: MessagesService) {}

  @Get()
  list(@Param('orderId', ParseUUIDPipe) orderId: string, @Req() req: Request) {
    return this.messagesService.listForOrder(orderId, req.user as any);
  }

  @Post()
  send(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: SendMessageDto,
    @Req() req: Request,
  ) {
    return this.messagesService.sendMessage(orderId, req.user as any, dto);
  }

  @Patch('read')
  markRead(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Req() req: Request,
  ) {
    return this.messagesService.markAsRead(orderId, req.user as any);
  }
}
