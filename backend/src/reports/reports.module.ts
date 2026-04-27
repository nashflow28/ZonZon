import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { DeliveryOrder } from '../entities/delivery-order.entity';
import { Commission } from '../entities/commission.entity';
import { User } from '../entities/user.entity';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([DeliveryOrder, Commission, User]),
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
