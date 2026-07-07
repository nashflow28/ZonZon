import { IsIn } from 'class-validator';

/**
 * Réponse du livreur à une invitation d'affiliation (§9.2) —
 * `PATCH /drivers/me/affiliations/:merchantId`.
 */
export class RespondAffiliationDto {
  @IsIn(['accept', 'reject'])
  action: 'accept' | 'reject';
}
