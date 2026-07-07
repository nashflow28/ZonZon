import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Priorité 1 (CDC V1 §5.2, §18.13 — historique de paiement) :
 *  - étend l'enum `delivery_orders.paymentStatus` avec `CASH_ON_DELIVERY`
 *    et `REFUNDED` (les 5 valeurs historiques sont conservées à l'identique,
 *    notamment `RECEIVED_BY_LIVREUR`, pour ne pas casser mobile/admin).
 *  - crée `payment_status_history`, une ligne par changement de statut de
 *    paiement.
 *
 * ATTENTION (down) : si des lignes portent déjà `CASH_ON_DELIVERY` ou
 * `REFUNDED` au moment du rollback, le `MODIFY` vers l'ancien enum à 5
 * valeurs échouera (ou tronquera silencieusement selon le mode SQL strict).
 * Migrer ces lignes vers une valeur des 5 historiques avant de rollback en
 * production.
 */
export class AddPaymentHistory1779300000000 implements MigrationInterface {
  name = 'AddPaymentHistory1779300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`delivery_orders\`
      MODIFY \`paymentStatus\` ENUM(
        'UNPAID',
        'PAID',
        'PAY_ON_DELIVERY',
        'RECEIVED_BY_MERCHANT',
        'RECEIVED_BY_LIVREUR',
        'CASH_ON_DELIVERY',
        'REFUNDED'
      ) NOT NULL DEFAULT 'UNPAID'
    `);

    await queryRunner.query(`
      CREATE TABLE \`payment_status_history\` (
        \`id\` VARCHAR(36) NOT NULL,
        \`deliveryId\` VARCHAR(36) NOT NULL,
        \`oldStatus\` VARCHAR(32) NULL,
        \`newStatus\` VARCHAR(32) NOT NULL,
        \`changedBy\` VARCHAR(36) NULL,
        \`createdAt\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_payment_status_history_deliveryId\` (\`deliveryId\`),
        INDEX \`IDX_payment_status_history_deliveryId_createdAt\` (\`deliveryId\`, \`createdAt\`),
        CONSTRAINT \`FK_payment_status_history_delivery\`
          FOREIGN KEY (\`deliveryId\`) REFERENCES \`delivery_orders\`(\`id\`)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`payment_status_history\``);
    // Risque : échoue si des lignes portent CASH_ON_DELIVERY/REFUNDED — les
    // migrer manuellement au préalable si un rollback est nécessaire en prod.
    await queryRunner.query(`
      ALTER TABLE \`delivery_orders\`
      MODIFY \`paymentStatus\` ENUM(
        'UNPAID',
        'PAID',
        'PAY_ON_DELIVERY',
        'RECEIVED_BY_MERCHANT',
        'RECEIVED_BY_LIVREUR'
      ) NOT NULL DEFAULT 'UNPAID'
    `);
  }
}
