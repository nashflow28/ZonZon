import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRatingCategories1778000000000 implements MigrationInterface {
  name = 'AddRatingCategories1778000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`ratings\` ADD COLUMN \`punctualityScore\` TINYINT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`ratings\` ADD COLUMN \`communicationScore\` TINYINT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`ratings\` ADD COLUMN \`courtesyScore\` TINYINT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`ratings\` DROP COLUMN \`courtesyScore\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`ratings\` DROP COLUMN \`communicationScore\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`ratings\` DROP COLUMN \`punctualityScore\``,
    );
  }
}
