import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Priorité 2 (CDC V1 §17.1 — signalements) :
 *  - crée `signalements`, une ligne par signalement (livraison, utilisateur,
 *    livreur ou commerçant) déposé par un utilisateur authentifié.
 *
 * ATTENTION NOMMAGE : ne pas confondre avec le module `reports/` existant
 * (rapports comptables / commissions), qui n'est pas touché ici.
 */
export class AddSignalements1779400000000 implements MigrationInterface {
  name = 'AddSignalements1779400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`signalements\` (
        \`id\` VARCHAR(36) NOT NULL,
        \`reporterId\` VARCHAR(36) NOT NULL,
        \`targetType\` ENUM('DELIVERY', 'USER', 'DRIVER', 'MERCHANT') NOT NULL,
        \`targetId\` VARCHAR(36) NOT NULL,
        \`reason\` VARCHAR(500) NOT NULL,
        \`status\` ENUM('OPEN', 'REVIEWED', 'RESOLVED', 'DISMISSED') NOT NULL DEFAULT 'OPEN',
        \`reviewedBy\` VARCHAR(36) NULL,
        \`reviewedAt\` DATETIME NULL,
        \`createdAt\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_signalements_reporterId\` (\`reporterId\`),
        INDEX \`IDX_signalements_targetType_targetId\` (\`targetType\`, \`targetId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`signalements\``);
  }
}
