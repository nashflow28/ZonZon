import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Shop } from '../entities/shop.entity';
import { Product } from '../entities/product.entity';
import { ShopsService } from './shops.service';
import { ShopsController } from './shops.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Shop, Product])],
  controllers: [ShopsController],
  providers: [ShopsService],
  exports: [ShopsService],
})
export class ShopsModule {}
