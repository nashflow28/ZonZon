import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRatings1777312383481 implements MigrationInterface {
    name = 'AddRatings1777312383481'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`ratings\` (\`id\` varchar(36) NOT NULL, \`orderId\` varchar(255) NOT NULL, \`fromUserId\` varchar(255) NOT NULL, \`toUserId\` varchar(255) NOT NULL, \`score\` tinyint NOT NULL, \`comment\` text NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_1b39900a1218faf159fba91da6\` (\`toUserId\`, \`createdAt\`), UNIQUE INDEX \`IDX_1e29eebb2dc434426a0190d8f3\` (\`orderId\`, \`fromUserId\`, \`toUserId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`ratings\` ADD CONSTRAINT \`FK_38bce3ebd84aa545a418c6b6e9c\` FOREIGN KEY (\`orderId\`) REFERENCES \`delivery_orders\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`ratings\` ADD CONSTRAINT \`FK_fd94d05641b3a6bdabf02aca740\` FOREIGN KEY (\`fromUserId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`ratings\` ADD CONSTRAINT \`FK_f1d8c3473dc910170bd67a76558\` FOREIGN KEY (\`toUserId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`ratings\` DROP FOREIGN KEY \`FK_f1d8c3473dc910170bd67a76558\``);
        await queryRunner.query(`ALTER TABLE \`ratings\` DROP FOREIGN KEY \`FK_fd94d05641b3a6bdabf02aca740\``);
        await queryRunner.query(`ALTER TABLE \`ratings\` DROP FOREIGN KEY \`FK_38bce3ebd84aa545a418c6b6e9c\``);
        await queryRunner.query(`DROP INDEX \`IDX_1e29eebb2dc434426a0190d8f3\` ON \`ratings\``);
        await queryRunner.query(`DROP INDEX \`IDX_1b39900a1218faf159fba91da6\` ON \`ratings\``);
        await queryRunner.query(`DROP TABLE \`ratings\``);
    }

}
