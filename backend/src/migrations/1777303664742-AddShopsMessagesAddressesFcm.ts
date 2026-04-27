import { MigrationInterface, QueryRunner } from "typeorm";

export class AddShopsMessagesAddressesFcm1777303664742 implements MigrationInterface {
    name = 'AddShopsMessagesAddressesFcm1777303664742'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`products\` (\`id\` varchar(36) NOT NULL, \`shopId\` varchar(255) NOT NULL, \`name\` varchar(120) NOT NULL, \`description\` text NULL, \`priceFcfa\` int NOT NULL, \`photoUrl\` varchar(255) NULL, \`available\` tinyint NOT NULL DEFAULT 1, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_f8c89d57cb3de44d9ca873ac4e\` (\`shopId\`, \`available\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`shops\` (\`id\` varchar(36) NOT NULL, \`ownerId\` varchar(255) NOT NULL, \`name\` varchar(120) NOT NULL, \`category\` enum ('RESTAURANT', 'SUPERMARKET', 'BAKERY', 'PHARMACY', 'FASHION', 'ELECTRONICS', 'BEAUTY', 'HARDWARE', 'BOOKS', 'OTHER') NOT NULL DEFAULT 'OTHER', \`status\` enum ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED') NOT NULL DEFAULT 'PENDING', \`description\` text NULL, \`address\` text NOT NULL, \`lat\` float NOT NULL, \`lng\` float NOT NULL, \`logoUrl\` varchar(255) NULL, \`phone\` varchar(32) NULL, \`hours\` varchar(200) NULL, \`rejectionReason\` text NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_fb039dda7901078840715e3cf2\` (\`status\`, \`category\`), UNIQUE INDEX \`REL_9f222a91f08322c9d08a1b443b\` (\`ownerId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`saved_addresses\` (\`id\` varchar(36) NOT NULL, \`userId\` varchar(255) NOT NULL, \`label\` varchar(60) NOT NULL, \`address\` text NOT NULL, \`lat\` float NOT NULL, \`lng\` float NOT NULL, \`icon\` varchar(32) NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_79d8246572cf2c2f975ec5a6b7\` (\`userId\`, \`createdAt\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`messages\` (\`id\` varchar(36) NOT NULL, \`orderId\` varchar(255) NOT NULL, \`senderId\` varchar(255) NULL, \`type\` enum ('TEXT', 'QUICK_REPLY', 'SYSTEM') NOT NULL DEFAULT 'TEXT', \`content\` text NOT NULL, \`readAt\` datetime NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_c147b6d4fa7d0eddac332ed3ef\` (\`orderId\`, \`createdAt\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`delivery_orders\` ADD \`cancellationReason\` text NULL`);
        await queryRunner.query(`ALTER TABLE \`delivery_orders\` ADD \`cancelledBy\` enum ('CLIENT', 'LIVREUR', 'ADMIN') NULL`);
        await queryRunner.query(`ALTER TABLE \`users\` ADD \`fcmToken\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`delivery_orders\` DROP COLUMN \`priceFcfa\``);
        await queryRunner.query(`ALTER TABLE \`delivery_orders\` ADD \`priceFcfa\` int NULL`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`role\` \`role\` enum ('ADMIN', 'CLIENT', 'LIVREUR', 'COMMERCANT') NOT NULL DEFAULT 'CLIENT'`);
        await queryRunner.query(`ALTER TABLE \`commissions\` DROP COLUMN \`totalRevenue\``);
        await queryRunner.query(`ALTER TABLE \`commissions\` ADD \`totalRevenue\` int NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE \`commissions\` DROP COLUMN \`commissionDue\``);
        await queryRunner.query(`ALTER TABLE \`commissions\` ADD \`commissionDue\` int NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE \`products\` ADD CONSTRAINT \`FK_51a281693ebef6fa8729de39381\` FOREIGN KEY (\`shopId\`) REFERENCES \`shops\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`shops\` ADD CONSTRAINT \`FK_9f222a91f08322c9d08a1b443b8\` FOREIGN KEY (\`ownerId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`saved_addresses\` ADD CONSTRAINT \`FK_d42add0254b71c33f16263e8444\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`messages\` ADD CONSTRAINT \`FK_96163d8417c2820f2e8e2e61b2a\` FOREIGN KEY (\`orderId\`) REFERENCES \`delivery_orders\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`messages\` ADD CONSTRAINT \`FK_2db9cf2b3ca111742793f6c37ce\` FOREIGN KEY (\`senderId\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`messages\` DROP FOREIGN KEY \`FK_2db9cf2b3ca111742793f6c37ce\``);
        await queryRunner.query(`ALTER TABLE \`messages\` DROP FOREIGN KEY \`FK_96163d8417c2820f2e8e2e61b2a\``);
        await queryRunner.query(`ALTER TABLE \`saved_addresses\` DROP FOREIGN KEY \`FK_d42add0254b71c33f16263e8444\``);
        await queryRunner.query(`ALTER TABLE \`shops\` DROP FOREIGN KEY \`FK_9f222a91f08322c9d08a1b443b8\``);
        await queryRunner.query(`ALTER TABLE \`products\` DROP FOREIGN KEY \`FK_51a281693ebef6fa8729de39381\``);
        await queryRunner.query(`ALTER TABLE \`commissions\` DROP COLUMN \`commissionDue\``);
        await queryRunner.query(`ALTER TABLE \`commissions\` ADD \`commissionDue\` decimal(12,2) NOT NULL DEFAULT '0.00'`);
        await queryRunner.query(`ALTER TABLE \`commissions\` DROP COLUMN \`totalRevenue\``);
        await queryRunner.query(`ALTER TABLE \`commissions\` ADD \`totalRevenue\` decimal(12,2) NOT NULL DEFAULT '0.00'`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`role\` \`role\` enum ('ADMIN', 'CLIENT', 'LIVREUR') NOT NULL DEFAULT 'CLIENT'`);
        await queryRunner.query(`ALTER TABLE \`delivery_orders\` DROP COLUMN \`priceFcfa\``);
        await queryRunner.query(`ALTER TABLE \`delivery_orders\` ADD \`priceFcfa\` decimal NULL`);
        await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`fcmToken\``);
        await queryRunner.query(`ALTER TABLE \`delivery_orders\` DROP COLUMN \`cancelledBy\``);
        await queryRunner.query(`ALTER TABLE \`delivery_orders\` DROP COLUMN \`cancellationReason\``);
        await queryRunner.query(`DROP INDEX \`IDX_c147b6d4fa7d0eddac332ed3ef\` ON \`messages\``);
        await queryRunner.query(`DROP TABLE \`messages\``);
        await queryRunner.query(`DROP INDEX \`IDX_79d8246572cf2c2f975ec5a6b7\` ON \`saved_addresses\``);
        await queryRunner.query(`DROP TABLE \`saved_addresses\``);
        await queryRunner.query(`DROP INDEX \`REL_9f222a91f08322c9d08a1b443b\` ON \`shops\``);
        await queryRunner.query(`DROP INDEX \`IDX_fb039dda7901078840715e3cf2\` ON \`shops\``);
        await queryRunner.query(`DROP TABLE \`shops\``);
        await queryRunner.query(`DROP INDEX \`IDX_f8c89d57cb3de44d9ca873ac4e\` ON \`products\``);
        await queryRunner.query(`DROP TABLE \`products\``);
    }

}
