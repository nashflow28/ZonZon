import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { DeviceTokensService } from './device-tokens.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import {
  idCardPhotoStorage,
  imageFileFilter,
  profilePhotoStorage,
} from './upload.config';
import { UpdateFcmTokenDto } from './dto/update-fcm-token.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AvailabilityDto } from './dto/availability.dto';
import { DriverApprovalDto } from './dto/driver-approval.dto';
import { SuspendUserDto } from './dto/suspend-user.dto';
import { VisibilityDto } from './dto/visibility.dto';

@Controller('users')
@UseGuards(RolesGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly deviceTokensService: DeviceTokensService,
  ) {}

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    const { password: _p, ...safe } = user as AuthenticatedUser & {
      password?: string;
    };
    return safe;
  }

  @Patch('me')
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(user.id ?? user.sub, dto);
  }

  /**
   * Enregistre / met à jour le(s) token(s) FCM d'un user.
   *
   * - `{ token: "abc" }` → upsert (un user peut avoir N tokens, un par device)
   * - `{ token: "abc", platform: "ios" }` → upsert avec plateforme explicite
   * - `{ token: null, previousToken: "old" }` → suppression d'un device précis
   * - `{ token: null }` → suppression de TOUS les tokens du user (logout final)
   *
   * Pour la rétro-compatibilité, on garde aussi un sync sur `User.fcmToken`
   * (champ legacy mono-token) tant que le mobile n'a pas migré. Cette
   * synchro disparaîtra dans une migration de cleanup ultérieure.
   */
  @Patch('me/fcm-token')
  async updateFcmToken(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateFcmTokenDto,
  ) {
    const userId = user.id ?? user.sub;

    if (dto.token) {
      const platform = dto.platform ?? 'android';
      await this.deviceTokensService.upsert(userId, dto.token, platform);
      // Rétro-compat : on garde le champ legacy synchronisé sur le dernier token
      // enregistré, pour que les anciens chemins (NotificationsService.sendToUser
      // en fallback) continuent de fonctionner.
      await this.usersService.updateFcmToken(userId, dto.token);
      return { ok: true };
    }

    // token == null/empty → délistage
    const targetToken = dto.previousToken ?? dto.lastToken;
    if (targetToken) {
      await this.deviceTokensService.deleteByToken(targetToken);
    } else {
      await this.deviceTokensService.deleteAllForUser(userId);
    }
    // Rétro-compat : on efface aussi le champ legacy
    await this.usersService.updateFcmToken(userId, null);
    return { ok: true };
  }

  @Roles(UserRole.LIVREUR)
  @Patch('me/availability')
  setMyAvailability(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AvailabilityDto,
  ) {
    return this.usersService.setAvailability(user.id ?? user.sub, dto.available);
  }

  /**
   * Bascule la visibilité publique du livreur (CDC V1 §9.3). Un livreur
   * privé (`isPublic = false`) n'est plus ciblé par le broadcast général de
   * nouvelles courses — il reste éligible à l'attribution manuelle par un
   * commerçant (`preferredLivreurId`).
   */
  @Roles(UserRole.LIVREUR)
  @Patch('me/visibility')
  setMyVisibility(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VisibilityDto,
  ) {
    return this.usersService.setPublicVisibility(
      user.id ?? user.sub,
      dto.isPublic,
    );
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
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.usersService.updateProfilePhoto(
      user.id ?? user.sub,
      file.filename,
    );
  }

  /**
   * Upload de la photo de pièce d'identité du livreur (CNI, passeport...).
   * Pas de restriction de rôle (cohérent avec /me/photo) : tout user
   * authentifié peut uploader SA propre pièce d'identité.
   */
  @Post('me/id-card-photo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: idCardPhotoStorage,
      fileFilter: imageFileFilter,
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadIdCardPhoto(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.usersService.updateIdCardPhoto(
      user.id ?? user.sub,
      file.filename,
    );
  }

  @Roles(UserRole.ADMIN)
  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Roles(UserRole.ADMIN)
  @Get('drivers/pending')
  pendingDrivers() {
    return this.usersService.findPendingDrivers();
  }

  @Roles(UserRole.ADMIN)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Roles(UserRole.ADMIN)
  @Delete(':id')
  softDelete(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.softDelete(id);
  }

  @Roles(UserRole.ADMIN)
  @Post(':id/restore')
  restore(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.restore(id);
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id/driver-approval')
  approveDriver(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DriverApprovalDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.usersService.setDriverApproval(
      id,
      dto.status,
      admin.id ?? admin.sub,
      dto.reason,
    );
  }

  /**
   * Suspend un compte (P0 sécurité, CDC V1). Bloque immédiatement la
   * connexion et les actions sensibles (création/acceptation de commande),
   * quel que soit le rôle du compte ciblé.
   */
  @Roles(UserRole.ADMIN)
  @Patch(':id/suspend')
  suspend(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SuspendUserDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.usersService.suspend(id, admin.id ?? admin.sub, dto.reason);
  }

  /** Réactive un compte préalablement suspendu. */
  @Roles(UserRole.ADMIN)
  @Patch(':id/reactivate')
  reactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.usersService.reactivate(id, admin.id ?? admin.sub);
  }
}
