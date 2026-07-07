import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Priorité 1 (CDC V1 §6.3 — traçabilité du prix) :
 *  - `delivery_orders.estimatedPrice` : prix calculé automatiquement
 *    (distance × tarif/km), conservé même si `priceFcfa` (prix effectif)
 *    est ajusté manuellement.
 *  - `delivery_orders.priceWasManuallyAdjusted` : flag posé à `true` dès
 *    qu'un commerçant/admin modifie le prix par rapport au calcul auto.
 *  - `price_changes` : historique de chaque ajustement manuel.
 */
export class AddPriceTraceability1779200000000 implements MigrationInterface {
  name = 'AddPriceTraceability1779200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`delivery_orders\`
        ADD COLUMN \`estimatedPrice\` INT NULL,
        ADD COLUMN \`priceWasManuallyAdjusted\` TINYINT(1) NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      CREATE TABLE \`price_changes\` (
        \`id\` VARCHAR(36) NOT NULL,
        \`deliveryId\` VARCHAR(36) NOT NULL,
        \`oldPrice\` INT NULL,
        \`newPrice\` INT NOT NULL,
        \`changedBy\` VARCHAR(36) NOT NULL,
        \`reason\` VARCHAR(255) NULL,
        \`createdAt\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_price_changes_deliveryId\` (\`deliveryId\`),
        INDEX \`IDX_price_changes_deliveryId_createdAt\` (\`deliveryId\`, \`createdAt\`),
        CONSTRAINT \`FK_price_changes_delivery\`
          FOREIGN KEY (\`deliveryId\`) REFERENCES \`delivery_orders\`(\`id\`)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`price_changes\``);
    await queryRunner.query(`
      ALTER TABLE \`delivery_orders\`
        DROP COLUMN \`estimatedPrice\`,
        DROP COLUMN \`priceWasManuallyAdjusted\`
    `);
  }
}
