import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateFcmTokenDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  token?: string | null;
}
