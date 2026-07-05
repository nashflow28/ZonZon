import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Priorité 3 backlog V1 (Lot 1) : tarif au km configurable par l'admin.
 *
 * `pricing_config` est un singleton (une seule ligne, id=1). Le service
 * applicatif fait un get-or-create sur cette ligne ; on l'insère aussi ici
 * pour que la config soit disponible dès le déploiement (200 FCFA/km,
 * remplace la constante en dur `PRICE_PER_KM = 150` de `orders.service.ts`).
 */
export class AddPricingConfig1778300000000 implements MigrationInterface {
  name = 'AddPricingConfig1778300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`pricing_config\` (
        \`id\` INT NOT NULL,
        \`pricePerKm\` INT NOT NULL DEFAULT 200,
        \`minPriceFcfa\` INT NULL,
        \`updatedAt\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB`,
    );

    await queryRunner.query(
      `INSERT INTO \`pricing_config\` (\`id\`, \`pricePerKm\`, \`minPriceFcfa\`) VALUES (1, 200, NULL)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`pricing_config\``);
  }
}
