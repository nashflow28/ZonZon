import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Shop } from '../entities/shop.entity';
import { Product } from '../entities/product.entity';
import { FavoriteShop } from '../entities/favorite-shop.entity';
import { ShopsService } from './shops.service';
import { ShopsController } from './shops.controller';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Shop, Product, FavoriteShop]),
    AuditLogModule,
  ],
  controllers: [ShopsController],
  providers: [ShopsService],
  exports: [ShopsService],
})
export class ShopsModule {}
