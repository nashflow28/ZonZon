import { IsEnum } from 'class-validator';
import { PaymentStatus } from '../../entities/delivery-order.entity';

export class UpdatePaymentStatusDto {
  @IsEnum(PaymentStatus)
  paymentStatus: PaymentStatus;
}
