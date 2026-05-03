import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Shop, ShopCategory, ShopStatus } from '../entities/shop.entity';
import { Product } from '../entities/product.entity';
import { FavoriteShop } from '../entities/favorite-shop.entity';
import { UserRole } from '../entities/user.entity';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { haversineKm } from '../common/geo';
import { AuditLogService } from '../audit-log/audit-log.service';

interface ActorPayload {
  id?: string;
  sub?: string;
  role: UserRole;
}

@Injectable()
export class ShopsService {
  constructor(
    @InjectRepository(Shop) private shopsRepo: Repository<Shop>,
    @InjectRepository(Product) private productsRepo: Repository<Product>,
    @InjectRepository(FavoriteShop)
    private favoritesRepo: Repository<FavoriteShop>,
    private readonly auditLog: AuditLogService,
  ) {}

  private actorId(actor: ActorPayload): string {
    return (actor.id ?? actor.sub) as string;
  }

  // ── Merchant : ma boutique ────────────────────────────────────────────────

  async createMyShop(actor: ActorPayload, dto: CreateShopDto): Promise<Shop> {
    if (actor.role !== UserRole.COMMERCANT) {
      throw new ForbiddenException('Réservé aux commerçants');
    }
    const ownerId = this.actorId(actor);
    const existing = await this.shopsRepo.findOne({ where: { ownerId } });
    if (existing) {
      throw new ConflictException('Vous avez déjà une boutique enregistrée');
    }
    const shop = this.shopsRepo.create({
      ownerId,
      name: dto.name.trim(),
      category: dto.category,
      status: ShopStatus.PENDING,
      address: dto.address.trim(),
      lat: dto.lat,
      lng: dto.lng,
      description: dto.description?.trim() ?? null,
      phone: dto.phone?.trim() ?? null,
      hours: dto.hours?.trim() ?? null,
    });
    return this.shopsRepo.save(shop);
  }

  async getMyShop(actor: ActorPayload): Promise<Shop | null> {
    const ownerId = this.actorId(actor);
    return this.shopsRepo.findOne({
      where: { ownerId },
      relations: ['products'],
    });
  }

  async updateMyShop(actor: ActorPayload, dto: UpdateShopDto): Promise<Shop> {
    const shop = await this.getMyShop(actor);
    if (!shop) throw new NotFoundException('Aucune boutique à modifier');

    Object.assign(shop, {
      name: dto.name?.trim() ?? shop.name,
      category: dto.category ?? shop.category,
      address: dto.address?.trim() ?? shop.address,
      lat: dto.lat ?? shop.lat,
      lng: dto.lng ?? shop.lng,
      description: dto.description?.trim() ?? shop.description,
      phone: dto.phone?.trim() ?? shop.phone,
      hours: dto.hours?.trim() ?? shop.hours,
    });

    // Toute modification re-passe en review (sauf si déjà rejected → on garde)
    if (shop.status === ShopStatus.APPROVED) {
      shop.status = ShopStatus.PENDING;
    }
    return this.shopsRepo.save(shop);
  }

  async setMyShopLogo(actor: ActorPayload, filename: string): Promise<Shop> {
    const shop = await this.getMyShop(actor);
    if (!shop) throw new NotFoundException('Aucune boutique');
    shop.logoUrl = `/uploads/shops/${filename}`;
    return this.shopsRepo.save(shop);
  }

  // ── Public : browse ──────────────────────────────────────────────────────

  async listPublic(filter: {
    category?: ShopCategory;
    lat?: number;
    lng?: number;
    radiusKm?: number;
  }): Promise<Array<Shop & { distanceKm?: number }>> {
    const where: any = { status: ShopStatus.APPROVED };
    if (filter.category) where.category = filter.category;
    const shops = await this.shopsRepo.find({
      where,
      order: { updatedAt: 'DESC' },
    });
    if (
      typeof filter.lat === 'number' &&
      typeof filter.lng === 'number' &&
      Number.isFinite(filter.lat) &&
      Number.isFinite(filter.lng)
    ) {
      const radius =
        filter.radiusKm && filter.radiusKm > 0 ? filter.radiusKm : null;
      const enriched = shops
        .map((s) => ({
          ...s,
          distanceKm: haversineKm(filter.lat!, filter.lng!, s.lat, s.lng),
        }))
        .filter((s) => radius === null || s.distanceKm <= radius)
        .sort((a, b) => a.distanceKm - b.distanceKm);
      return enriched;
    }
    return shops;
  }

  async getPublic(id: string): Promise<Shop> {
    const shop = await this.shopsRepo.findOne({
      where: { id, status: ShopStatus.APPROVED },
      relations: ['products'],
    });
    if (!shop) throw new NotFoundException('Boutique introuvable');
    // On ne renvoie que les produits dispos en public
    shop.products = (shop.products || []).filter((p) => p.available);
    return shop;
  }

  // ── Merchant : produits ─────────────────────────────────────────────────

  async listMyProducts(actor: ActorPayload): Promise<Product[]> {
    const shop = await this.getMyShop(actor);
    if (!shop) throw new NotFoundException("Créez d'abord votre boutique");
    return this.productsRepo.find({
      where: { shopId: shop.id },
      order: { createdAt: 'DESC' },
    });
  }

  async createProduct(
    actor: ActorPayload,
    dto: CreateProductDto,
  ): Promise<Product> {
    const shop = await this.getMyShop(actor);
    if (!shop) throw new NotFoundException("Créez d'abord votre boutique");
    const product = this.productsRepo.create({
      shopId: shop.id,
      name: dto.name.trim(),
      description: dto.description?.trim() ?? null,
      priceFcfa: dto.priceFcfa,
      available: dto.available ?? true,
    });
    return this.productsRepo.save(product);
  }

  private async ownProduct(
    actor: ActorPayload,
    productId: string,
  ): Promise<Product> {
    const shop = await this.getMyShop(actor);
    if (!shop) throw new NotFoundException('Aucune boutique');
    const product = await this.productsRepo.findOne({
      where: { id: productId },
    });
    if (!product) throw new NotFoundException('Produit introuvable');
    if (product.shopId !== shop.id) throw new ForbiddenException();
    return product;
  }

  async updateProduct(
    actor: ActorPayload,
    productId: string,
    dto: UpdateProductDto,
  ): Promise<Product> {
    const product = await this.ownProduct(actor, productId);
    if (dto.name !== undefined) product.name = dto.name.trim();
    if (dto.description !== undefined)
      product.description = dto.description?.trim() ?? null;
    if (dto.priceFcfa !== undefined) product.priceFcfa = dto.priceFcfa;
    if (dto.available !== undefined) product.available = dto.available;
    return this.productsRepo.save(product);
  }

  async setProductPhoto(
    actor: ActorPayload,
    productId: string,
    filename: string,
  ): Promise<Product> {
    const product = await this.ownProduct(actor, productId);
    product.photoUrl = `/uploads/products/${filename}`;
    return this.productsRepo.save(product);
  }

  async removeProduct(actor: ActorPayload, productId: string): Promise<void> {
    const product = await this.ownProduct(actor, productId);
    await this.productsRepo.remove(product);
  }

  // ── Admin : modération ──────────────────────────────────────────────────

  async adminList(status?: ShopStatus): Promise<Shop[]> {
    const where = status ? { status } : {};
    return this.shopsRepo.find({
      where,
      relations: ['owner'],
      order: { createdAt: 'DESC' },
    });
  }

  async adminApprove(id: string, adminId: string): Promise<Shop> {
    const shop = await this.shopsRepo.findOne({ where: { id } });
    if (!shop) throw new NotFoundException();
    shop.status = ShopStatus.APPROVED;
    shop.rejectionReason = null;
    const saved = await this.shopsRepo.save(shop);
    void this.auditLog.log({
      adminId,
      action: 'SHOP_APPROVE',
      targetType: 'Shop',
      targetId: id,
    });
    return saved;
  }

  async adminReject(
    id: string,
    adminId: string,
    reason?: string,
  ): Promise<Shop> {
    const shop = await this.shopsRepo.findOne({ where: { id } });
    if (!shop) throw new NotFoundException();
    shop.status = ShopStatus.REJECTED;
    shop.rejectionReason = reason ?? null;
    const saved = await this.shopsRepo.save(shop);
    void this.auditLog.log({
      adminId,
      action: 'SHOP_REJECT',
      targetType: 'Shop',
      targetId: id,
      metadata: { reason: reason ?? null },
    });
    return saved;
  }

  async adminSuspend(id: string, adminId: string): Promise<Shop> {
    const shop = await this.shopsRepo.findOne({ where: { id } });
    if (!shop) throw new NotFoundException();
    shop.status = ShopStatus.SUSPENDED;
    const saved = await this.shopsRepo.save(shop);
    void this.auditLog.log({
      adminId,
      action: 'SHOP_SUSPEND',
      targetType: 'Shop',
      targetId: id,
    });
    return saved;
  }

  // ── Favoris boutiques ────────────────────────────────────────────────────

  /**
   * Ajoute la boutique aux favoris du user.
   * Idempotent : un double-clic ne déclenche pas d'erreur (UNIQUE en base
   * gère le cas, on swallow le ConflictException issu du conflit clé unique).
   */
  async addFavorite(
    userId: string,
    shopId: string,
  ): Promise<{ ok: boolean }> {
    const shop = await this.shopsRepo.findOne({
      where: { id: shopId, status: ShopStatus.APPROVED },
    });
    if (!shop) {
      throw new NotFoundException('Boutique introuvable ou non approuvée');
    }

    // INSERT … ON DUPLICATE KEY UPDATE → idempotent par construction.
    // On laisse `id` être généré par la PK (uuid) à la première insertion.
    try {
      await this.favoritesRepo.insert({ userId, shopId });
    } catch (err: any) {
      // ER_DUP_ENTRY (1062) ou QueryFailedError de TypeORM → favori déjà existant
      const code = err?.code ?? err?.driverError?.code;
      if (code === 'ER_DUP_ENTRY' || code === '23505') {
        return { ok: true };
      }
      throw err;
    }
    return { ok: true };
  }

  /**
   * Retire la boutique des favoris. No-op si le favori n'existait pas.
   */
  async removeFavorite(
    userId: string,
    shopId: string,
  ): Promise<{ ok: boolean }> {
    await this.favoritesRepo.delete({ userId, shopId });
    return { ok: true };
  }

  /**
   * Liste des boutiques favorites du user (uniquement les APPROVED, triées
   * par date d'ajout du favori décroissante).
   */
  async listFavorites(userId: string): Promise<Shop[]> {
    const rows = await this.favoritesRepo
      .createQueryBuilder('f')
      .innerJoinAndSelect('f.shop', 'shop')
      .where('f.userId = :userId', { userId })
      .andWhere('shop.status = :status', { status: ShopStatus.APPROVED })
      .orderBy('f.createdAt', 'DESC')
      .getMany();
    return rows.map((f) => f.shop);
  }

  async isFavorite(userId: string, shopId: string): Promise<boolean> {
    const count = await this.favoritesRepo.count({
      where: { userId, shopId },
    });
    return count > 0;
  }
}
