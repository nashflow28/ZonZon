import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * §9.2 CDC V1 — Flux d'affiliation invite/accept commerçant↔livreur :
 * `merchant_drivers` gagne un `status` (PENDING/ACTIVE/REJECTED/REMOVED) +
 * `acceptedAt`/`removedAt`. Auparavant l'affiliation était implicitement
 * active dès sa création côté commerçant ; désormais elle démarre en
 * attente d'acceptation par le livreur concerné.
 *
 * Grandfather : toutes les lignes existantes passent en `ACTIVE` (défaut de
 * colonne) — aucune affiliation déjà en place n'est perdue/dégradée.
 */
export class AddAffiliationStatus1779800000000 implements MigrationInterface {
  name = 'AddAffiliationStatus1779800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`merchant_drivers\` ADD COLUMN \`status\` ` +
        `ENUM('PENDING', 'ACTIVE', 'REJECTED', 'REMOVED') NOT NULL DEFAULT 'ACTIVE'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`merchant_drivers\` ADD COLUMN \`acceptedAt\` DATETIME NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`merchant_drivers\` ADD COLUMN \`removedAt\` DATETIME NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`merchant_drivers\` DROP COLUMN \`removedAt\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`merchant_drivers\` DROP COLUMN \`acceptedAt\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`merchant_drivers\` DROP COLUMN \`status\``,
    );
  }
}
