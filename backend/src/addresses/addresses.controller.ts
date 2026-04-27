import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AddressesService } from './addresses.service';
import { CreateSavedAddressDto } from './dto/create-saved-address.dto';
import { UpdateSavedAddressDto } from './dto/update-saved-address.dto';

@Controller('addresses/saved')
export class AddressesController {
  constructor(private addressesService: AddressesService) {}

  private userId(req: Request): string {
    const user = req.user as any;
    return (user?.id ?? user?.sub) as string;
  }

  @Get()
  list(@Req() req: Request) {
    return this.addressesService.list(this.userId(req));
  }

  @Post()
  create(@Body() dto: CreateSavedAddressDto, @Req() req: Request) {
    return this.addressesService.create(this.userId(req), dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSavedAddressDto,
    @Req() req: Request,
  ) {
    return this.addressesService.update(this.userId(req), id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.addressesService.remove(this.userId(req), id);
  }
}
