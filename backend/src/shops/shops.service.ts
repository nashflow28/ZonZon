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
import { UserRole } from '../entities/user.entity';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { haversineKm } from '../common/geo';

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

  async adminApprove(id: string): Promise<Shop> {
    const shop = await this.shopsRepo.findOne({ where: { id } });
    if (!shop) throw new NotFoundException();
    shop.status = ShopStatus.APPROVED;
    shop.rejectionReason = null;
    return this.shopsRepo.save(shop);
  }

  async adminReject(id: string, reason?: string): Promise<Shop> {
    const shop = await this.shopsRepo.findOne({ where: { id } });
    if (!shop) throw new NotFoundException();
    shop.status = ShopStatus.REJECTED;
    shop.rejectionReason = reason ?? null;
    return this.shopsRepo.save(shop);
  }

  async adminSuspend(id: string): Promise<Shop> {
    const shop = await this.shopsRepo.findOne({ where: { id } });
    if (!shop) throw new NotFoundException();
    shop.status = ShopStatus.SUSPENDED;
    return this.shopsRepo.save(shop);
  }
}
