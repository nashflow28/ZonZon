import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDriverApprovalAndAvailability1778100000000
  implements MigrationInterface
{
  name = 'AddDriverApprovalAndAvailability1778100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD COLUMN \`driverApprovalStatus\` ENUM('PENDING','APPROVED','REJECTED') NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD COLUMN \`driverRejectionReason\` VARCHAR(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD COLUMN \`isAvailable\` TINYINT(1) NOT NULL DEFAULT 0`,
    );

    // Grandfather : les livreurs déjà inscrits en phase de test sont validés
    // automatiquement et rendus disponibles, pour ne pas les bloquer du jour
    // au lendemain lors du déploiement de cette migration.
    await queryRunner.query(
      `UPDATE \`users\` SET \`driverApprovalStatus\` = 'APPROVED', \`isAvailable\` = 1 WHERE \`role\` = 'LIVREUR'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`isAvailable\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`driverRejectionReason\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`driverApprovalStatus\``,
    );
  }
}
