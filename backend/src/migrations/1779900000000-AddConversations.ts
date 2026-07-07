import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Modèle de conversation multi-participants (CDC V1 §13, §18.9-18.11) —
 * couche ADDITIVE au-dessus de la messagerie existante (`messages`, room
 * Socket.IO `order:<id>:chat`). Ne modifie NI ne remplace la table
 * `messages` ni son flux d'envoi/lecture.
 *
 * `conversations` : une ligne par livraison (`deliveryId` UNIQUE) —
 * get-or-create idempotent via `ConversationsService.ensureConversation`.
 *
 * `conversation_participants` : qui participe (client/livreur/commerçant/
 * admin) et depuis quand. `leftAt` = départ soft (on ne supprime jamais la
 * ligne). `(conversationId, userId)` UNIQUE → ré-ajout idempotent.
 */
export class AddConversations1779900000000 implements MigrationInterface {
  name = 'AddConversations1779900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`conversations\` (
        \`id\` VARCHAR(36) NOT NULL,
        \`deliveryId\` VARCHAR(36) NOT NULL,
        \`createdAt\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`closedAt\` DATETIME NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`IDX_conversations_deliveryId\` (\`deliveryId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      CREATE TABLE \`conversation_participants\` (
        \`id\` VARCHAR(36) NOT NULL,
        \`conversationId\` VARCHAR(36) NOT NULL,
        \`userId\` VARCHAR(36) NOT NULL,
        \`role\` VARCHAR(16) NOT NULL,
        \`joinedAt\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`leftAt\` DATETIME NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_conversation_participants_conversationId\` (\`conversationId\`),
        UNIQUE INDEX \`UQ_conversation_participants_conversationId_userId\` (\`conversationId\`, \`userId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      ALTER TABLE \`conversation_participants\`
      ADD CONSTRAINT \`FK_conversation_participants_conversationId\`
      FOREIGN KEY (\`conversationId\`) REFERENCES \`conversations\`(\`id\`)
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`conversation_participants\` DROP FOREIGN KEY \`FK_conversation_participants_conversationId\``,
    );
    await queryRunner.query(`DROP TABLE \`conversation_participants\``);
    await queryRunner.query(`DROP TABLE \`conversations\``);
  }
}
