import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDirectThreadStates1780800000000 implements MigrationInterface {
  name = 'AddDirectThreadStates1780800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`direct_thread_states\` (
        \`id\` varchar(36) NOT NULL,
        \`ownerId\` varchar(36) NOT NULL,
        \`contactId\` varchar(36) NOT NULL,
        \`hiddenBefore\` datetime(6) NOT NULL,
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`IDX_direct_thread_owner_contact\` (\`ownerId\`, \`contactId\`),
        INDEX \`IDX_direct_thread_owner\` (\`ownerId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `direct_thread_states`');
  }
}
