import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ajoute 'COMMERCANT' à l'enum `delivery_orders.cancelledBy`.
 *
 * Le commerçant qui crée une livraison de type 1 pour un client identifié par
 * téléphone (donc sans compte) ne pouvait pas l'annuler : `updateStatus` ne
 * reconnaissait que client / livreur / admin. Personne d'autre ne le pouvait
 * non plus tant qu'aucun livreur n'avait accepté — la commande restait PENDING
 * et continuait d'être proposée jusqu'à intervention d'un admin.
 *
 * La valeur est ajoutée EN FIN de liste : TiDB n'accepte de modifier un ENUM
 * que par ajout terminal, réordonner les valeurs existantes est rejeté.
 */
export class AddCommercantCancelledBy1780900000000 implements MigrationInterface {
  name = 'AddCommercantCancelledBy1780900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` MODIFY \`cancelledBy\` ENUM('CLIENT', 'LIVREUR', 'ADMIN', 'COMMERCANT') NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Les lignes déjà marquées 'COMMERCANT' ne pourraient plus tenir dans
    // l'enum restreint : on les repasse à NULL avant de réduire la colonne.
    await queryRunner.query(
      `UPDATE \`delivery_orders\` SET \`cancelledBy\` = NULL WHERE \`cancelledBy\` = 'COMMERCANT'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`delivery_orders\` MODIFY \`cancelledBy\` ENUM('CLIENT', 'LIVREUR', 'ADMIN') NULL`,
    );
  }
}
