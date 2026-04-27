import { IsLatitude, IsLongitude } from 'class-validator';

export class EstimateOrderDto {
  @IsLatitude()
  pickupLat: number;

  @IsLongitude()
  pickupLng: number;

  @IsLatitude()
  deliveryLat: number;

  @IsLongitude()
  deliveryLng: number;
}
