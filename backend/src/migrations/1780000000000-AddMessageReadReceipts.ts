import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Accusés de lecture PAR PARTICIPANT (CDC V1 §13 — conversations à 3+).
 *
 * `messages.readAt` était un flag GLOBAL : la lecture par un participant
 * marquait le message comme lu pour tous (compteurs non-lus faussés dans les
 * chats à 3 avec le commerçant). `message_read_receipts` porte désormais le
 * curseur de lecture individuel — une ligne = « ce user a lu ce message ».
 *
 * `messages.readAt` est CONSERVÉ (rétro-compat mobile : coche « lu » côté
 * expéditeur) avec la sémantique « lu par au moins un destinataire ».
 *
 * Backfill : les messages déjà lus (readAt non nul) sont considérés lus par
 * le client ET le livreur de la course (sauf l'expéditeur) — reproduit
 * l'ancienne sémantique 1-à-1 sans faire réapparaître de badges non-lus.
 */
export class AddMessageReadReceipts1780000000000 implements MigrationInterface {
  name = 'AddMessageReadReceipts1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`message_read_receipts\` (
        \`messageId\` VARCHAR(36) NOT NULL,
        \`userId\` VARCHAR(36) NOT NULL,
        \`readAt\` DATETIME NOT NULL,
        PRIMARY KEY (\`messageId\`, \`userId\`),
        INDEX \`IDX_message_read_receipts_userId\` (\`userId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      ALTER TABLE \`message_read_receipts\`
      ADD CONSTRAINT \`FK_message_read_receipts_messageId\`
      FOREIGN KEY (\`messageId\`) REFERENCES \`messages\`(\`id\`)
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE \`message_read_receipts\`
      ADD CONSTRAINT \`FK_message_read_receipts_userId\`
      FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`)
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // Backfill côté client de la course
    await queryRunner.query(`
      INSERT IGNORE INTO \`message_read_receipts\` (\`messageId\`, \`userId\`, \`readAt\`)
      SELECT m.\`id\`, o.\`clientId\`, m.\`readAt\`
      FROM \`messages\` m
      JOIN \`delivery_orders\` o ON o.\`id\` = m.\`orderId\`
      WHERE m.\`readAt\` IS NOT NULL
        AND o.\`clientId\` IS NOT NULL
        AND (m.\`senderId\` IS NULL OR m.\`senderId\` <> o.\`clientId\`)
    `);

    // Backfill côté livreur de la course
    await queryRunner.query(`
      INSERT IGNORE INTO \`message_read_receipts\` (\`messageId\`, \`userId\`, \`readAt\`)
      SELECT m.\`id\`, o.\`livreurId\`, m.\`readAt\`
      FROM \`messages\` m
      JOIN \`delivery_orders\` o ON o.\`id\` = m.\`orderId\`
      WHERE m.\`readAt\` IS NOT NULL
        AND o.\`livreurId\` IS NOT NULL
        AND (m.\`senderId\` IS NULL OR m.\`senderId\` <> o.\`livreurId\`)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`message_read_receipts\` DROP FOREIGN KEY \`FK_message_read_receipts_userId\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`message_read_receipts\` DROP FOREIGN KEY \`FK_message_read_receipts_messageId\``,
    );
    await queryRunner.query(`DROP TABLE \`message_read_receipts\``);
  }
}
