import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P2 (CDC V1 §7) — Zones enrichies :
 *  - `zones` gagne `description`, `basePrice`, `pricePerKmOverride`
 *    (tous optionnels, champs préparatoires — pas encore utilisés dans le
 *    calcul de prix automatique en V1).
 *  - `delivery_orders` gagne `pickupZoneId`/`destinationZoneId` (FK vers
 *    `zones`, ON DELETE SET NULL) : liaison optionnelle livraison↔zone,
 *    renseignée par le client/commerçant à la création (PAS de dérivation
 *    automatique depuis les coordonnées GPS en V1).
 *  - Seed idempotent des 6 quartiers manquants (Agoè-Assiyéyé,
 *    Agoè-Cacavéli, Nukafu, Kodjoviakopé, Amoutivé, Akodésséwa), en plus
 *    des 16 déjà seedés par la migration 1778400000000.
 */
export class AddZoneDetailsAndDeliveryZones1779600000000
  implements MigrationInterface
{
  name = 'AddZoneDetailsAndDeliveryZones1779600000000';

  private readonly seedZones = [
    'Agoè-Assiyéyé',
    'Agoè-Cacavéli',
    'Nukafu',
    'Kodjoviakopé',
    'Amoutivé',
    'Akodésséwa',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`zones\` ADD COLUMN \`description\` VARCHAR(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`zones\` ADD COLUMN \`basePrice\` INT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`zones\` ADD COLUMN \`pricePerKmOverride\` INT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` ADD COLUMN \`pickupZoneId\` VARCHAR(36) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` ADD COLUMN \`destinationZoneId\` VARCHAR(36) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` ADD CONSTRAINT \`FK_delivery_orders_pickupZoneId\` ` +
        `FOREIGN KEY (\`pickupZoneId\`) REFERENCES \`zones\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` ADD CONSTRAINT \`FK_delivery_orders_destinationZoneId\` ` +
        `FOREIGN KEY (\`destinationZoneId\`) REFERENCES \`zones\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    // Seed idempotent : n'insère que les quartiers absents (basé sur `name`,
    // colonne UNIQUE) pour ne jamais dupliquer les 16 déjà présents.
    for (const name of this.seedZones) {
      await queryRunner.query(
        `INSERT INTO \`zones\` (\`id\`, \`name\`, \`active\`)
         SELECT UUID(), ?, 1 FROM DUAL
         WHERE NOT EXISTS (SELECT 1 FROM \`zones\` WHERE \`name\` = ?)`,
        [name, name],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` DROP FOREIGN KEY \`FK_delivery_orders_destinationZoneId\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` DROP FOREIGN KEY \`FK_delivery_orders_pickupZoneId\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` DROP COLUMN \`destinationZoneId\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` DROP COLUMN \`pickupZoneId\``,
    );

    await queryRunner.query(
      `ALTER TABLE \`zones\` DROP COLUMN \`pricePerKmOverride\``,
    );
    await queryRunner.query(`ALTER TABLE \`zones\` DROP COLUMN \`basePrice\``);
    await queryRunner.query(
      `ALTER TABLE \`zones\` DROP COLUMN \`description\``,
    );

    // Ne supprime pas les 6 zones seedées au down (cohérent avec la
    // migration 1778400000000 qui ne retire pas non plus son seed
    // individuellement — le down `DROP TABLE` de cette dernière les
    // supprimerait de toute façon si les deux migrations sont annulées).
  }
}
