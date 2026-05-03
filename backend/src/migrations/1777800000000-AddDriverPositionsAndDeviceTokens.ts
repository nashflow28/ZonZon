import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDriverPositionsAndDeviceTokens1777800000000
  implements MigrationInterface
{
  name = 'AddDriverPositionsAndDeviceTokens1777800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ──────────────────────────────────────────────────────────────────────
    // driver_positions : 1 ligne par livreur, dernière position connue
    // ──────────────────────────────────────────────────────────────────────
    await queryRunner.query(
      `CREATE TABLE \`driver_positions\` (` +
        `\`id\` varchar(36) NOT NULL, ` +
        `\`livreurId\` varchar(64) NOT NULL, ` +
        `\`lat\` float NOT NULL, ` +
        `\`lng\` float NOT NULL, ` +
        `\`orderId\` varchar(64) NULL, ` +
        `\`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ` +
        `\`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ` +
        `UNIQUE INDEX \`UQ_driver_positions_livreurId\` (\`livreurId\`), ` +
        `INDEX \`IDX_driver_positions_updated_at\` (\`updatedAt\`), ` +
        `PRIMARY KEY (\`id\`)` +
        `) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`driver_positions\` ADD CONSTRAINT \`FK_driver_positions_livreur\` ` +
        `FOREIGN KEY (\`livreurId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // ──────────────────────────────────────────────────────────────────────
    // device_tokens : N lignes par user (un user peut avoir plusieurs devices)
    // ──────────────────────────────────────────────────────────────────────
    await queryRunner.query(
      `CREATE TABLE \`device_tokens\` (` +
        `\`id\` varchar(36) NOT NULL, ` +
        `\`userId\` varchar(64) NOT NULL, ` +
        `\`token\` varchar(512) NOT NULL, ` +
        `\`platform\` varchar(16) NOT NULL DEFAULT 'android', ` +
        `\`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ` +
        `\`lastSeenAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ` +
        `UNIQUE INDEX \`UQ_device_tokens_token\` (\`token\`), ` +
        `INDEX \`IDX_device_tokens_user_lastseen\` (\`userId\`, \`lastSeenAt\`), ` +
        `PRIMARY KEY (\`id\`)` +
        `) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`device_tokens\` ADD CONSTRAINT \`FK_device_tokens_user\` ` +
        `FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`device_tokens\` DROP FOREIGN KEY \`FK_device_tokens_user\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_device_tokens_user_lastseen\` ON \`device_tokens\``,
    );
    await queryRunner.query(
      `DROP INDEX \`UQ_device_tokens_token\` ON \`device_tokens\``,
    );
    await queryRunner.query(`DROP TABLE \`device_tokens\``);

    await queryRunner.query(
      `ALTER TABLE \`driver_positions\` DROP FOREIGN KEY \`FK_driver_positions_livreur\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_driver_positions_updated_at\` ON \`driver_positions\``,
    );
    await queryRunner.query(
      `DROP INDEX \`UQ_driver_positions_livreurId\` ON \`driver_positions\``,
    );
    await queryRunner.query(`DROP TABLE \`driver_positions\``);
  }
}
