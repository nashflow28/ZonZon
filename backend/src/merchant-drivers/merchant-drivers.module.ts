import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MerchantDriver } from '../entities/merchant-driver.entity';
import { MerchantDriversService } from './merchant-drivers.service';
import { MerchantDriversController } from './merchant-drivers.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [TypeOrmModule.forFeature([MerchantDriver]), UsersModule],
  controllers: [MerchantDriversController],
  providers: [MerchantDriversService],
  exports: [MerchantDriversService],
})
export class MerchantDriversModule {}
