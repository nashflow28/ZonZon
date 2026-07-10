import { IsLatitude, IsLongitude, IsOptional, IsUUID } from 'class-validator';

export class EstimateOrderDto {
  @IsLatitude()
  pickupLat: number;

  @IsLongitude()
  pickupLng: number;

  @IsLatitude()
  deliveryLat: number;

  @IsLongitude()
  deliveryLng: number;

  @IsOptional()
  @IsUUID()
  pickupZoneId?: string;

  @IsOptional()
  @IsUUID()
  destinationZoneId?: string;
}
