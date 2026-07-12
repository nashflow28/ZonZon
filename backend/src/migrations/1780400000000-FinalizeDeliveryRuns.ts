import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Finalisation des tournées commerçant :
 * - contraintes FK/index pour `delivery_runs` et `delivery_orders.runId`
 * - timestamps de cycle de vie (`startedAt`, `completedAt`, `cancelledAt`)
 * - `updatedAt` pour refléter les recalculs de statut de tournée
 */
export class FinalizeDeliveryRuns1780400000000 implements MigrationInterface {
  name = 'FinalizeDeliveryRuns1780400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`delivery_runs\` ADD COLUMN \`startedAt\` datetime NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`delivery_runs\` ADD COLUMN \`completedAt\` datetime NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`delivery_runs\` ADD COLUMN \`cancelledAt\` datetime NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`delivery_runs\` ADD COLUMN \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)`,
    );

    await queryRunner.query(
      `CREATE INDEX \`IDX_delivery_runs_merchantId\` ON \`delivery_runs\` (\`merchantId\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_delivery_runs_livreurId\` ON \`delivery_runs\` (\`livreurId\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_delivery_runs_status\` ON \`delivery_runs\` (\`status\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_delivery_orders_runId\` ON \`delivery_orders\` (\`runId\`)`,
    );

    await queryRunner.query(
      `ALTER TABLE \`delivery_runs\` ADD CONSTRAINT \`FK_delivery_runs_merchantId\` ` +
        `FOREIGN KEY (\`merchantId\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`delivery_runs\` ADD CONSTRAINT \`FK_delivery_runs_livreurId\` ` +
        `FOREIGN KEY (\`livreurId\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` ADD CONSTRAINT \`FK_delivery_orders_runId\` ` +
        `FOREIGN KEY (\`runId\`) REFERENCES \`delivery_runs\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` DROP FOREIGN KEY \`FK_delivery_orders_runId\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`delivery_runs\` DROP FOREIGN KEY \`FK_delivery_runs_livreurId\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`delivery_runs\` DROP FOREIGN KEY \`FK_delivery_runs_merchantId\``,
    );

    await queryRunner.query(
      `DROP INDEX \`IDX_delivery_orders_runId\` ON \`delivery_orders\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_delivery_runs_status\` ON \`delivery_runs\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_delivery_runs_livreurId\` ON \`delivery_runs\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_delivery_runs_merchantId\` ON \`delivery_runs\``,
    );

    await queryRunner.query(
      `ALTER TABLE \`delivery_runs\` DROP COLUMN \`updatedAt\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`delivery_runs\` DROP COLUMN \`cancelledAt\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`delivery_runs\` DROP COLUMN \`completedAt\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`delivery_runs\` DROP COLUMN \`startedAt\``,
    );
  }
}
