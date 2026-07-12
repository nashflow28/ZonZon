import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotificationData1780200000000 implements MigrationInterface {
  name = 'AddNotificationData1780200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `notifications` ADD `data` JSON NULL AFTER `body`',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `notifications` DROP COLUMN `data`');
  }
}
