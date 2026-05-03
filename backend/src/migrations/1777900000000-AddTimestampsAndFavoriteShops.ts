import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTimestampsAndFavoriteShops1777900000000
  implements MigrationInterface
{
  name = 'AddTimestampsAndFavoriteShops1777900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ──────────────────────────────────────────────────────────────────────
    // 1. delivery_orders : timestamps de transition (ACCEPTED, IN_PROGRESS, COMPLETED)
    // ──────────────────────────────────────────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` ADD COLUMN \`acceptedAt\` DATETIME NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` ADD COLUMN \`inProgressAt\` DATETIME NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` ADD COLUMN \`completedAt\` DATETIME NULL`,
    );

    // ──────────────────────────────────────────────────────────────────────
    // 2. favorite_shops : lien user → boutique (favoris client)
    // ──────────────────────────────────────────────────────────────────────
    await queryRunner.query(
      `CREATE TABLE \`favorite_shops\` (` +
        `\`id\` varchar(36) NOT NULL, ` +
        `\`userId\` varchar(64) NOT NULL, ` +
        `\`shopId\` varchar(64) NOT NULL, ` +
        `\`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ` +
        `UNIQUE INDEX \`UQ_favorite_shops_user_shop\` (\`userId\`, \`shopId\`), ` +
        `INDEX \`IDX_favorite_shops_user_created\` (\`userId\`, \`createdAt\`), ` +
        `PRIMARY KEY (\`id\`)` +
        `) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`favorite_shops\` ADD CONSTRAINT \`FK_favorite_shops_user\` ` +
        `FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`favorite_shops\` ADD CONSTRAINT \`FK_favorite_shops_shop\` ` +
        `FOREIGN KEY (\`shopId\`) REFERENCES \`shops\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // favorite_shops
    await queryRunner.query(
      `ALTER TABLE \`favorite_shops\` DROP FOREIGN KEY \`FK_favorite_shops_shop\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`favorite_shops\` DROP FOREIGN KEY \`FK_favorite_shops_user\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_favorite_shops_user_created\` ON \`favorite_shops\``,
    );
    await queryRunner.query(
      `DROP INDEX \`UQ_favorite_shops_user_shop\` ON \`favorite_shops\``,
    );
    await queryRunner.query(`DROP TABLE \`favorite_shops\``);

    // delivery_orders timestamps
    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` DROP COLUMN \`completedAt\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` DROP COLUMN \`inProgressAt\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` DROP COLUMN \`acceptedAt\``,
    );
  }
}
