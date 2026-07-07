import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { SignalementStatus } from '../../entities/signalement.entity';

export class UpdateSignalementDto {
  @IsEnum(SignalementStatus)
  status: SignalementStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
