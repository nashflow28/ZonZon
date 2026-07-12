import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeliveryRuns1780300000000 implements MigrationInterface {
  name = 'AddDeliveryRuns1780300000000';
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE TABLE `delivery_runs` (`id` varchar(36) NOT NULL, `merchantId` varchar(36) NOT NULL, `livreurId` varchar(36) NULL, `status` enum (\'OPEN\', \'IN_PROGRESS\', \'COMPLETED\', \'CANCELLED\') NOT NULL DEFAULT \'OPEN\', `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (`id`)) ENGINE=InnoDB');
    await queryRunner.query('ALTER TABLE `delivery_orders` ADD `runId` varchar(36) NULL');
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `delivery_orders` DROP COLUMN `runId`');
    await queryRunner.query('DROP TABLE `delivery_runs`');
  }
}
