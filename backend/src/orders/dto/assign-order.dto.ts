import { IsUUID } from 'class-validator';

export class AssignOrderDto {
  @IsUUID()
  livreurId: string;
}
