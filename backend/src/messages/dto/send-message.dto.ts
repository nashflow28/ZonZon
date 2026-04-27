import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { MessageType } from '../../entities/message.entity';

export class SendMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  content: string;

  @IsOptional()
  @IsEnum(MessageType)
  type?: MessageType;
}
