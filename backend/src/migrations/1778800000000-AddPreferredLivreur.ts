import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Priorité 3 (Lot 3, item 1) : attribution manuelle d'un livreur à la
 * création d'une course (réservation). `preferredLivreurId` reste NULL par
 * défaut → comportement de broadcast inchangé (rétro-compatibilité totale).
 * FK ON DELETE SET NULL : si le livreur préféré est supprimé, la course
 * retombe simplement en broadcast normal au lieu d'être bloquée.
 */
export class AddPreferredLivreur1778800000000 implements MigrationInterface {
  name = 'AddPreferredLivreur1778800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` ADD COLUMN \`preferredLivreurId\` VARCHAR(36) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` ADD CONSTRAINT \`FK_delivery_orders_preferredLivreurId\` ` +
        `FOREIGN KEY (\`preferredLivreurId\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` DROP FOREIGN KEY \`FK_delivery_orders_preferredLivreurId\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` DROP COLUMN \`preferredLivreurId\``,
    );
  }
}
