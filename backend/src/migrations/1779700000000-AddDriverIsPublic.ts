import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P2 (CDC V1 §9.3) — Livreur privé / public : un livreur peut choisir de ne
 * plus apparaître dans le broadcast général de courses (il ne travaille
 * alors que sur assignation manuelle de son commerçant via
 * `preferredLivreurId`, déjà en place). Grandfather : tous les livreurs
 * existants restent publics (`DEFAULT 1`) — aucun changement de
 * comportement rétroactif.
 */
export class AddDriverIsPublic1779700000000 implements MigrationInterface {
  name = 'AddDriverIsPublic1779700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD COLUMN \`isPublic\` TINYINT(1) NOT NULL DEFAULT 1`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`isPublic\``);
  }
}
