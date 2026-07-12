import { IsUUID } from 'class-validator';

export class CreateDeliveryRunDto {
  @IsUUID()
  livreurId: string;
}
