import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MessageType } from '../../entities/message.entity';

export class SendMessageDto {
  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  @MaxLength(1000)
  content: string;

  @IsOptional()
  @IsEnum(MessageType)
  type?: MessageType;
}
