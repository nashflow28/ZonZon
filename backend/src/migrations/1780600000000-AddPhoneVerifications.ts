import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPhoneVerifications1780600000000 implements MigrationInterface {
  name = 'AddPhoneVerifications1780600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`phone_verifications\` (
        \`id\` varchar(36) NOT NULL,
        \`phone\` varchar(20) NOT NULL,
        \`codeHash\` varchar(100) NOT NULL,
        \`expiresAt\` datetime NOT NULL,
        \`attempts\` tinyint unsigned NOT NULL DEFAULT 0,
        \`consumedAt\` datetime NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX \`IDX_phone_verifications_phone_createdAt\` (\`phone\`, \`createdAt\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `phone_verifications`');
  }
}
