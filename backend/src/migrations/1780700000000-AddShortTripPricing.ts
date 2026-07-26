import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddShortTripPricing1780700000000 implements MigrationInterface {
  name = 'AddShortTripPricing1780700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `pricing_config` ADD `shortTripMaxDistanceKm` DECIMAL(5,2) NOT NULL DEFAULT 2.50 AFTER `minPriceFcfa`',
    );
    await queryRunner.query(
      'UPDATE `pricing_config` SET `minPriceFcfa` = 500, `shortTripMaxDistanceKm` = 2.50 WHERE `id` = 1',
    );
    await queryRunner.query(
      'ALTER TABLE `pricing_config` MODIFY `minPriceFcfa` INT NOT NULL DEFAULT 500',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `pricing_config` MODIFY `minPriceFcfa` INT NULL DEFAULT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `pricing_config` DROP COLUMN `shortTripMaxDistanceKm`',
    );
  }
}
