import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Priorité 3 backlog V1 (Lot 1) : référentiel des quartiers/zones de Lomé.
 * Version simple — pas de tarif par zone, juste une liste gérable (dropdowns
 * mobile/admin). Seed des quartiers principaux de Lomé via `UUID()` MySQL.
 */
export class AddZones1778400000000 implements MigrationInterface {
  name = 'AddZones1778400000000';

  private readonly seedZones = [
    'Adidogomé',
    'Agoè',
    'Totsi',
    'Agbalépédogan',
    'Tokoin',
    'Bè',
    'Nyékonakpoè',
    'Attiegou',
    'Djidjolé',
    'Hédzranawoé',
    'Kégué',
    'Avédji',
    'Légbassito',
    'Sanguéra',
    'Adétikopé',
    'Baguida',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`zones\` (
        \`id\` VARCHAR(36) NOT NULL,
        \`name\` VARCHAR(120) NOT NULL,
        \`active\` TINYINT(1) NOT NULL DEFAULT 1,
        \`createdAt\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`IDX_zones_name\` (\`name\`)
      ) ENGINE=InnoDB`,
    );

    for (const name of this.seedZones) {
      await queryRunner.query(
        `INSERT INTO \`zones\` (\`id\`, \`name\`, \`active\`) VALUES (UUID(), ?, 1)`,
        [name],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`zones\``);
  }
}
