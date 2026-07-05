import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Priorité 3 backlog V1 (Lot 2) : colonne `paymentStatus` sur
 * `delivery_orders`, indépendante de la machine à états `status`.
 * Permet de suivre le règlement (client→plateforme, cash à la livraison,
 * remise au commerçant/livreur) sans impacter le flux de statuts existant.
 */
export class AddPaymentStatus1778600000000 implements MigrationInterface {
  name = 'AddPaymentStatus1778600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` ADD COLUMN \`paymentStatus\` ENUM(
        'UNPAID',
        'PAID',
        'PAY_ON_DELIVERY',
        'RECEIVED_BY_MERCHANT',
        'RECEIVED_BY_LIVREUR'
      ) NOT NULL DEFAULT 'UNPAID'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` DROP COLUMN \`paymentStatus\``,
    );
  }
}
