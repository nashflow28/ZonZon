import { IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export class SendDirectMessageDto {
  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  @MaxLength(1000)
  content: string;

  @IsOptional()
  @IsUUID()
  orderId?: string;
}
