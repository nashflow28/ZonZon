import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Priorité 1 (CDC V1 — historisation/traçabilité) : table
 * `delivery_status_history` traçant chaque transition de statut d'une
 * livraison (y compris la création : `oldStatus = NULL`, `newStatus =
 * 'PENDING'`). FK CASCADE vers `delivery_orders` : l'historique disparaît
 * avec la course si celle-ci est supprimée (soft-delete n'affecte pas
 * cette FK, seul un DELETE physique la déclencherait).
 */
export class AddDeliveryStatusHistory1779100000000
  implements MigrationInterface
{
  name = 'AddDeliveryStatusHistory1779100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`delivery_status_history\` (
        \`id\` VARCHAR(36) NOT NULL,
        \`deliveryId\` VARCHAR(36) NOT NULL,
        \`oldStatus\` VARCHAR(32) NULL,
        \`newStatus\` VARCHAR(32) NOT NULL,
        \`changedBy\` VARCHAR(36) NULL,
        \`reason\` VARCHAR(255) NULL,
        \`createdAt\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_delivery_status_history_deliveryId\` (\`deliveryId\`),
        INDEX \`IDX_delivery_status_history_deliveryId_createdAt\` (\`deliveryId\`, \`createdAt\`),
        CONSTRAINT \`FK_delivery_status_history_delivery\`
          FOREIGN KEY (\`deliveryId\`) REFERENCES \`delivery_orders\`(\`id\`)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`delivery_status_history\``);
  }
}
