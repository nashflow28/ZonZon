import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { imageFileFilter, profilePhotoStorage } from './upload.config';
import { UpdateFcmTokenDto } from './dto/update-fcm-token.dto';

@Controller('users')
@UseGuards(RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: any) {
    const { password: _p, ...safe } = user;
    return safe;
  }

  @Patch('me/fcm-token')
  updateFcmToken(@CurrentUser() user: any, @Body() dto: UpdateFcmTokenDto) {
    return this.usersService.updateFcmToken(user.id, dto.token ?? null);
  }

  @Post('me/photo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: profilePhotoStorage,
      fileFilter: imageFileFilter,
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadPhoto(
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.usersService.updateProfilePhoto(user.id, file.filename);
  }

  @Roles(UserRole.ADMIN)
  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Roles(UserRole.ADMIN)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }
}
