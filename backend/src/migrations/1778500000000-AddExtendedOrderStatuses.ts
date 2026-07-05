import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Priorité 3 backlog V1 (Lot 2) : statuts de livraison granulaires.
 *
 * Ajoute EN_ROUTE_PICKUP, AT_PICKUP, NEAR_CLIENT, FAILED à l'enum `status`
 * de `delivery_orders`, SANS retirer ni renommer les 5 statuts historiques
 * (PENDING, ACCEPTED, IN_PROGRESS, COMPLETED, CANCELLED). `IN_PROGRESS`
 * conserve sa sémantique actuelle (« colis récupéré / en route vers le
 * client ») pour ne pas casser le géofencing mobile
 * (ACCEPTED → IN_PROGRESS → COMPLETED reste un chemin valide).
 */
export class AddExtendedOrderStatuses1778500000000
  implements MigrationInterface
{
  name = 'AddExtendedOrderStatuses1778500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` MODIFY \`status\` ENUM(
        'PENDING',
        'ACCEPTED',
        'EN_ROUTE_PICKUP',
        'AT_PICKUP',
        'IN_PROGRESS',
        'NEAR_CLIENT',
        'COMPLETED',
        'CANCELLED',
        'FAILED'
      ) NOT NULL DEFAULT 'PENDING'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ATTENTION : ce down() échouera (erreur MySQL "Data truncated for
    // column 'status'") si des lignes portent l'un des nouveaux statuts
    // (EN_ROUTE_PICKUP, AT_PICKUP, NEAR_CLIENT, FAILED) au moment du
    // rollback. Il faut migrer/nettoyer ces lignes manuellement avant de
    // redescendre (ex. les remapper vers ACCEPTED/IN_PROGRESS/CANCELLED).
    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` MODIFY \`status\` ENUM(
        'PENDING',
        'ACCEPTED',
        'IN_PROGRESS',
        'COMPLETED',
        'CANCELLED'
      ) NOT NULL DEFAULT 'PENDING'`,
    );
  }
}
