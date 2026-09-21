-- Secretaria: terceira persona da Escola (INSTITUTION, 21/09/2026).
-- Escrita à mão em vez de `prisma migrate dev` — ver
-- kav_class_deployment / feedback_prisma_migrate_dev_broken: o histórico
-- de migrations deste projeto não roda limpo num shadow DB, então toda
-- mudança de schema é escrita direto e aplicada com `prisma db execute`.
ALTER TYPE "PapelUsuario" ADD VALUE 'SECRETARIA';

ALTER TABLE "Professor" ADD COLUMN "permissoesSecretaria" TEXT[] NOT NULL DEFAULT '{}';
