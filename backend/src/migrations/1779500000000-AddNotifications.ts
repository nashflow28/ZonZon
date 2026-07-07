import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Priorité 2 (CDC V1 §18.12 — notifications persistées) :
 *  - crée `notifications`, une ligne par notification envoyée à un
 *    utilisateur via `NotificationsService.sendToUser` (persistance
 *    indépendante de l'envoi FCM effectif).
 */
export class AddNotifications1779500000000 implements MigrationInterface {
  name = 'AddNotifications1779500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`notifications\` (
        \`id\` VARCHAR(36) NOT NULL,
        \`userId\` VARCHAR(36) NOT NULL,
        \`deliveryId\` VARCHAR(36) NULL,
        \`type\` VARCHAR(64) NOT NULL,
        \`title\` VARCHAR(255) NOT NULL,
        \`body\` VARCHAR(500) NOT NULL,
        \`readAt\` DATETIME NULL,
        \`createdAt\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_notifications_userId\` (\`userId\`),
        INDEX \`IDX_notifications_userId_createdAt\` (\`userId\`, \`createdAt\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`notifications\``);
  }
}
