import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1776850595860 implements MigrationInterface {
  name = 'InitialSchema1776850595860';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`delivery_orders\` (\`id\` varchar(36) NOT NULL, \`pickupAddress\` text NOT NULL, \`pickupLat\` float NULL, \`pickupLng\` float NULL, \`deliveryAddress\` text NOT NULL, \`deliveryLat\` float NULL, \`deliveryLng\` float NULL, \`description\` text NOT NULL, \`distanceKm\` decimal(10,2) NULL, \`priceFcfa\` decimal(10,2) NULL, \`status\` enum ('PENDING', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PENDING', \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`clientId\` varchar(36) NULL, \`livreurId\` varchar(36) NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`users\` (\`id\` varchar(36) NOT NULL, \`role\` enum ('ADMIN', 'CLIENT', 'LIVREUR') NOT NULL DEFAULT 'CLIENT', \`firstName\` varchar(255) NOT NULL, \`lastName\` varchar(255) NOT NULL, \`phone\` varchar(255) NOT NULL, \`password\` varchar(255) NULL, \`profilePhotoUrl\` varchar(255) NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_a000cca60bcf04454e72769949\` (\`phone\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`vehicles\` (\`id\` varchar(36) NOT NULL, \`type\` enum ('MOTO', 'VOITURE', 'TRICYCLE') NOT NULL DEFAULT 'MOTO', \`licensePlate\` varchar(255) NULL, \`description\` varchar(255) NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`driverId\` varchar(36) NULL, UNIQUE INDEX \`REL_28d7607488252336b22511e9e8\` (\`driverId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`commissions\` (\`id\` varchar(36) NOT NULL, \`weekStart\` date NOT NULL, \`weekEnd\` date NOT NULL, \`completedCount\` int NOT NULL DEFAULT '0', \`totalRevenue\` decimal(12,2) NOT NULL DEFAULT '0.00', \`commissionRate\` decimal(5,4) NOT NULL DEFAULT '0.3500', \`commissionDue\` decimal(12,2) NOT NULL DEFAULT '0.00', \`status\` enum ('DUE', 'PAID') NOT NULL DEFAULT 'DUE', \`paidAt\` datetime NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`livreurId\` varchar(36) NULL, UNIQUE INDEX \`IDX_73080cdb986a4996c0fdfc6ce2\` (\`livreurId\`, \`weekStart\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` ADD CONSTRAINT \`FK_0034e09679836d41ff8f65be7ae\` FOREIGN KEY (\`clientId\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` ADD CONSTRAINT \`FK_524893f227abbe41c0a8f6b37ef\` FOREIGN KEY (\`livreurId\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`vehicles\` ADD CONSTRAINT \`FK_28d7607488252336b22511e9e80\` FOREIGN KEY (\`driverId\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`commissions\` ADD CONSTRAINT \`FK_0b18a51f261500ed912c482ed7c\` FOREIGN KEY (\`livreurId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`commissions\` DROP FOREIGN KEY \`FK_0b18a51f261500ed912c482ed7c\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`vehicles\` DROP FOREIGN KEY \`FK_28d7607488252336b22511e9e80\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` DROP FOREIGN KEY \`FK_524893f227abbe41c0a8f6b37ef\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` DROP FOREIGN KEY \`FK_0034e09679836d41ff8f65be7ae\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_73080cdb986a4996c0fdfc6ce2\` ON \`commissions\``,
    );
    await queryRunner.query(`DROP TABLE \`commissions\``);
    await queryRunner.query(
      `DROP INDEX \`REL_28d7607488252336b22511e9e8\` ON \`vehicles\``,
    );
    await queryRunner.query(`DROP TABLE \`vehicles\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_a000cca60bcf04454e72769949\` ON \`users\``,
    );
    await queryRunner.query(`DROP TABLE \`users\``);
    await queryRunner.query(`DROP TABLE \`delivery_orders\``);
  }
}
