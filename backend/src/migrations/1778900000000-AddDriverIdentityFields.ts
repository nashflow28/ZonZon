import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Complète le profil livreur pour la conformité V1 : photo de pièce
 * d'identité (users.idCardPhotoUrl) et zone habituelle (vehicles.usualZoneId,
 * FK vers zones). Postérieure à la migration Zones (1778400000000), requise
 * pour la FK.
 */
export class AddDriverIdentityFields1778900000000
  implements MigrationInterface
{
  name = 'AddDriverIdentityFields1778900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD COLUMN \`idCardPhotoUrl\` VARCHAR(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`vehicles\` ADD COLUMN \`usualZoneId\` VARCHAR(36) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`vehicles\` ADD CONSTRAINT \`FK_vehicles_usualZoneId\` ` +
        `FOREIGN KEY (\`usualZoneId\`) REFERENCES \`zones\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`vehicles\` DROP FOREIGN KEY \`FK_vehicles_usualZoneId\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`vehicles\` DROP COLUMN \`usualZoneId\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`idCardPhotoUrl\``,
    );
  }
}
