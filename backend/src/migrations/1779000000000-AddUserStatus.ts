import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P0 sécurité (CDC V1) : ajoute le statut de compte global `users.status`
 * (ACTIVE/SUSPENDED), distinct de `driverApprovalStatus` (workflow de
 * validation livreur). Permet à un admin de suspendre n'importe quel
 * compte (CLIENT, LIVREUR, COMMERCANT). Tous les comptes existants sont
 * "grandfathered" ACTIVE via le DEFAULT. Postérieure à 1778900000000.
 */
export class AddUserStatus1779000000000 implements MigrationInterface {
  name = 'AddUserStatus1779000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD COLUMN \`status\` ENUM('ACTIVE','SUSPENDED') NOT NULL DEFAULT 'ACTIVE'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`status\``);
  }
}
