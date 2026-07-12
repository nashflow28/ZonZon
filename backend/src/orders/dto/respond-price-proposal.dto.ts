import { IsBoolean } from 'class-validator';

export class RespondPriceProposalDto {
  @IsBoolean()
  accept: boolean;
}
