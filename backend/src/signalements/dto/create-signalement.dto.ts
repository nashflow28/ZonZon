import { IsEnum, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { SignalementTargetType } from '../../entities/signalement.entity';

export class CreateSignalementDto {
  @IsEnum(SignalementTargetType)
  targetType: SignalementTargetType;

  @IsUUID()
  targetId: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}
