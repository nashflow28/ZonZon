import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ShopsService } from './shops.service';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { RejectShopDto } from './dto/reject-shop.dto';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../entities/user.entity';
import { ShopCategory, ShopStatus } from '../entities/shop.entity';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import {
  imageFileFilter,
  productPhotoStorage,
  shopLogoStorage,
} from './upload.config';

type ShopActor = { id?: string; sub?: string; role: UserRole };

@Controller('shops')
@UseGuards(RolesGuard)
export class ShopsController {
  constructor(private shopsService: ShopsService) {}

  /** Convertit un AuthenticatedUser (rôle string-literal) vers le shape `ActorPayload` (rôle UserRole) attendu par le service. */
  private toActor(user: AuthenticatedUser): ShopActor {
    return { id: user.id, sub: user.sub, role: user.role as UserRole };
  }

  // ── Public ─────────────────────────────────────────────────────────────

  @Public()
  @Get('categories')
  categories() {
    return Object.values(ShopCategory).map((value) => ({
      value,
      label: this.categoryLabel(value),
    }));
  }

  @Public()
  @Get()
  list(
    @Query('category') category?: ShopCategory,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radius') radius?: string,
  ) {
    return this.shopsService.listPublic({
      category,
      lat: lat ? parseFloat(lat) : undefined,
      lng: lng ? parseFloat(lng) : undefined,
      radiusKm: radius ? parseFloat(radius) : undefined,
    });
  }

  // ── Merchant : ma boutique ────────────────────────────────────────────

  @Roles(UserRole.COMMERCANT)
  @Get('me')
  getMine(@CurrentUser() user: AuthenticatedUser) {
    return this.shopsService.getMyShop(this.toActor(user));
  }

  @Roles(UserRole.COMMERCANT)
  @Post('me')
  createMine(
    @Body() dto: CreateShopDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.shopsService.createMyShop(this.toActor(user), dto);
  }

  @Roles(UserRole.COMMERCANT)
  @Patch('me')
  updateMine(
    @Body() dto: UpdateShopDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.shopsService.updateMyShop(this.toActor(user), dto);
  }

  @Roles(UserRole.COMMERCANT)
  @Post('me/logo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: shopLogoStorage,
      fileFilter: imageFileFilter,
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadLogo(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.shopsService.setMyShopLogo(this.toActor(user), file.filename);
  }

  // ── Merchant : produits ──────────────────────────────────────────────

  @Roles(UserRole.COMMERCANT)
  @Get('me/products')
  listMyProducts(@CurrentUser() user: AuthenticatedUser) {
    return this.shopsService.listMyProducts(this.toActor(user));
  }

  @Roles(UserRole.COMMERCANT)
  @Post('me/products')
  createProduct(
    @Body() dto: CreateProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.shopsService.createProduct(this.toActor(user), dto);
  }

  @Roles(UserRole.COMMERCANT)
  @Patch('me/products/:id')
  updateProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.shopsService.updateProduct(this.toActor(user), id, dto);
  }

  @Roles(UserRole.COMMERCANT)
  @Post('me/products/:id/photo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: productPhotoStorage,
      fileFilter: imageFileFilter,
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadProductPhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.shopsService.setProductPhoto(
      this.toActor(user),
      id,
      file.filename,
    );
  }

  @Roles(UserRole.COMMERCANT)
  @Delete('me/products/:id')
  deleteProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.shopsService.removeProduct(this.toActor(user), id);
  }

  // ── Admin ────────────────────────────────────────────────────────────

  @Roles(UserRole.ADMIN)
  @Get('admin')
  adminList(@Query('status') status?: ShopStatus) {
    return this.shopsService.adminList(status);
  }

  @Roles(UserRole.ADMIN)
  @Patch('admin/:id/approve')
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.shopsService.adminApprove(id, (user.id ?? user.sub) as string);
  }

  @Roles(UserRole.ADMIN)
  @Patch('admin/:id/reject')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectShopDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.shopsService.adminReject(
      id,
      (user.id ?? user.sub) as string,
      dto.reason,
    );
  }

  @Roles(UserRole.ADMIN)
  @Patch('admin/:id/suspend')
  suspend(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.shopsService.adminSuspend(id, (user.id ?? user.sub) as string);
  }

  // ── Favoris (DOIVENT être avant le pattern catch-all `:id`) ─────────

  @Get('favorites')
  listFavorites(@CurrentUser() user: AuthenticatedUser) {
    return this.shopsService.listFavorites(
      (user.id ?? user.sub) as string,
    );
  }

  @Post(':id/favorite')
  addFavorite(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.shopsService.addFavorite(
      (user.id ?? user.sub) as string,
      id,
    );
  }

  @Delete(':id/favorite')
  removeFavorite(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.shopsService.removeFavorite(
      (user.id ?? user.sub) as string,
      id,
    );
  }

  // ── Public : détail boutique (DOIT être après les /me et /admin) ─────

  @Public()
  @Get(':id')
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.shopsService.getPublic(id);
  }

  private categoryLabel(c: ShopCategory): string {
    const map: Record<ShopCategory, string> = {
      [ShopCategory.RESTAURANT]: 'Restauration',
      [ShopCategory.SUPERMARKET]: 'Supérette / alimentation',
      [ShopCategory.BAKERY]: 'Boulangerie / pâtisserie',
      [ShopCategory.PHARMACY]: 'Pharmacie',
      [ShopCategory.FASHION]: 'Mode et accessoires',
      [ShopCategory.ELECTRONICS]: 'Téléphonie / électronique',
      [ShopCategory.BEAUTY]: 'Cosmétiques / beauté',
      [ShopCategory.HARDWARE]: 'Quincaillerie / matériaux',
      [ShopCategory.BOOKS]: 'Librairie / fournitures',
      [ShopCategory.OTHER]: 'Autre',
    };
    return map[c];
  }
}
