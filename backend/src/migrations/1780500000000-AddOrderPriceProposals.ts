import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderPriceProposals1780500000000 implements MigrationInterface {
  name = 'AddOrderPriceProposals1780500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`order_price_proposals\` (
        \`id\` varchar(36) NOT NULL,
        \`priceFcfa\` int NOT NULL,
        \`status\` enum('PENDING','ACCEPTED','REJECTED','SUPERSEDED') NOT NULL DEFAULT 'PENDING',
        \`respondedAt\` datetime NULL,
        \`expiresAt\` datetime NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`orderId\` varchar(36) NOT NULL,
        \`livreurId\` varchar(36) NOT NULL,
        INDEX \`IDX_price_proposal_order_status_expiry\` (\`orderId\`, \`status\`, \`expiresAt\`),
        INDEX \`IDX_price_proposal_livreur\` (\`livreurId\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_price_proposal_order\` FOREIGN KEY (\`orderId\`) REFERENCES \`delivery_orders\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_price_proposal_livreur\` FOREIGN KEY (\`livreurId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `order_price_proposals`');
  }
}
