import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SavedAddress } from '../entities/saved-address.entity';
import { AddressesService } from './addresses.service';
import { AddressesController } from './addresses.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SavedAddress])],
  controllers: [AddressesController],
  providers: [AddressesService],
  exports: [AddressesService],
})
export class AddressesModule {}
