import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSoftDelete1777626458400 implements MigrationInterface {
  name = 'AddSoftDelete1777626458400';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD COLUMN \`deletedAt\` DATETIME(6) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` ADD COLUMN \`deletedAt\` DATETIME(6) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` DROP COLUMN \`deletedAt\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`deletedAt\``,
    );
  }
}
