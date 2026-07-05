import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Priorité 3 (Lot 3, item 2) : affiliation M:N entre un COMMERCANT et un
 * LIVREUR ("mes livreurs"). Table de jointure `merchant_drivers` avec
 * contrainte UNIQUE (merchantId, driverId) pour empêcher les doublons, et
 * FK ON DELETE CASCADE des deux côtés (si le commerçant ou le livreur est
 * supprimé, l'affiliation disparaît avec lui).
 */
export class AddMerchantDrivers1778700000000 implements MigrationInterface {
  name = 'AddMerchantDrivers1778700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`merchant_drivers\` (` +
        `\`id\` varchar(36) NOT NULL, ` +
        `\`merchantId\` varchar(36) NOT NULL, ` +
        `\`driverId\` varchar(36) NOT NULL, ` +
        `\`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ` +
        `UNIQUE INDEX \`UQ_merchant_drivers_merchant_driver\` (\`merchantId\`, \`driverId\`), ` +
        `PRIMARY KEY (\`id\`)` +
        `) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`merchant_drivers\` ADD CONSTRAINT \`FK_merchant_drivers_merchant\` ` +
        `FOREIGN KEY (\`merchantId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`merchant_drivers\` ADD CONSTRAINT \`FK_merchant_drivers_driver\` ` +
        `FOREIGN KEY (\`driverId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`merchant_drivers\` DROP FOREIGN KEY \`FK_merchant_drivers_driver\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`merchant_drivers\` DROP FOREIGN KEY \`FK_merchant_drivers_merchant\``,
    );
    await queryRunner.query(`DROP TABLE \`merchant_drivers\``);
  }
}
