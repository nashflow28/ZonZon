import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Priorité 2 backlog V1 : un COMMERCANT peut créer une livraison (Type 1)
 * pour un client existant (compte) ou pour un client identifié seulement
 * par son numéro de téléphone (sans compte).
 *
 * - Ajoute `merchantId` (FK nullable vers users, ON DELETE SET NULL) :
 *   le commerçant créateur. `null` pour les livraisons Type 2 (client).
 * - Ajoute `clientPhone` / `clientName` : identification du destinataire
 *   quand il n'a pas de compte.
 * - Rend `clientId` nullable : une livraison Type 1 "par téléphone" peut ne
 *   pas être rattachée à un compte client.
 */
export class AddMerchantOrders1778200000000 implements MigrationInterface {
  name = 'AddMerchantOrders1778200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` ADD COLUMN \`merchantId\` VARCHAR(36) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` ADD COLUMN \`clientPhone\` VARCHAR(32) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` ADD COLUMN \`clientName\` VARCHAR(120) NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` ADD CONSTRAINT \`FK_delivery_orders_merchantId\` FOREIGN KEY (\`merchantId\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    // clientId doit devenir nullable : une livraison Type 1 "par téléphone"
    // peut ne pas avoir de compte client rattaché. La FK existante
    // (ON DELETE NO ACTION) est recréée à l'identique après le MODIFY —
    // MySQL ne s'oppose pas au MODIFY tant que la contrainte reste valide
    // (colonne nullable + FK simple), mais on la drop/recrée par prudence
    // pour rester cohérent quel que soit le moteur de stockage.
    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` DROP FOREIGN KEY \`FK_0034e09679836d41ff8f65be7ae\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` MODIFY \`clientId\` VARCHAR(36) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` ADD CONSTRAINT \`FK_0034e09679836d41ff8f65be7ae\` FOREIGN KEY (\`clientId\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // NB : suppose qu'aucune ligne Type 1 "sans compte" (clientId NULL)
    // n'existe au moment du rollback — sinon ce MODIFY NOT NULL échouera.
    // Nettoyer/migrer ces lignes manuellement avant de downgrader en prod.
    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` DROP FOREIGN KEY \`FK_0034e09679836d41ff8f65be7ae\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` MODIFY \`clientId\` VARCHAR(36) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` ADD CONSTRAINT \`FK_0034e09679836d41ff8f65be7ae\` FOREIGN KEY (\`clientId\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` DROP FOREIGN KEY \`FK_delivery_orders_merchantId\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` DROP COLUMN \`clientName\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` DROP COLUMN \`clientPhone\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` DROP COLUMN \`merchantId\``,
    );
  }
}
