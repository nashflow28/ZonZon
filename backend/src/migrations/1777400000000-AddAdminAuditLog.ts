import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdminAuditLog1777400000000 implements MigrationInterface {
  name = 'AddAdminAuditLog1777400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`admin_audit_logs\` (` +
        `\`id\` varchar(36) NOT NULL, ` +
        `\`adminId\` varchar(36) NULL, ` +
        `\`action\` varchar(64) NOT NULL, ` +
        `\`targetType\` varchar(64) NOT NULL, ` +
        `\`targetId\` varchar(64) NOT NULL, ` +
        `\`metadata\` json NULL, ` +
        `\`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ` +
        `INDEX \`IDX_admin_audit_logs_admin_created\` (\`adminId\`, \`createdAt\`), ` +
        `INDEX \`IDX_admin_audit_logs_target\` (\`targetType\`, \`targetId\`), ` +
        `PRIMARY KEY (\`id\`)` +
        `) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`admin_audit_logs\` ADD CONSTRAINT \`FK_admin_audit_logs_admin\` FOREIGN KEY (\`adminId\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`admin_audit_logs\` DROP FOREIGN KEY \`FK_admin_audit_logs_admin\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_admin_audit_logs_target\` ON \`admin_audit_logs\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_admin_audit_logs_admin_created\` ON \`admin_audit_logs\``,
    );
    await queryRunner.query(`DROP TABLE \`admin_audit_logs\``);
  }
}
