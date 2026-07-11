import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDirectMessages1780100000000 implements MigrationInterface {
  name = 'AddDirectMessages1780100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`direct_messages\` (
        \`id\` varchar(36) NOT NULL,
        \`senderId\` varchar(36) NOT NULL,
        \`recipientId\` varchar(36) NOT NULL,
        \`orderId\` varchar(36) NULL,
        \`content\` text NOT NULL,
        \`readAt\` datetime NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_direct_messages_sender_recipient_created\` (\`senderId\`, \`recipientId\`, \`createdAt\`),
        INDEX \`IDX_direct_messages_recipient_read\` (\`recipientId\`, \`readAt\`)
        ,INDEX \`IDX_direct_messages_order_created\` (\`orderId\`, \`createdAt\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `direct_messages`');
  }
}
