import { IsEnum } from 'class-validator';
import { OrderStatus } from '../../entities/delivery-order.entity';

export class UpdateStatusDto {
  @IsEnum(OrderStatus)
  status: OrderStatus;
}
