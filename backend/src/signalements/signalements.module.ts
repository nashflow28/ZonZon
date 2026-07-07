import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Signalement } from '../entities/signalement.entity';
import { SignalementsService } from './signalements.service';
import { SignalementsController } from './signalements.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Signalement])],
  controllers: [SignalementsController],
  providers: [SignalementsService],
  exports: [SignalementsService],
})
export class SignalementsModule {}
