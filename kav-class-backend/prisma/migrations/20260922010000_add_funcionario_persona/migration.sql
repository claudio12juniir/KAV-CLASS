-- Funcionário genérico (INSTITUTION Sprint 16, briefing 22/09/2026) —
-- escrita à mão, mesmo fluxo de db execute + migrate resolve já registrado
-- em feedback_prisma_migrate_dev_broken (prisma migrate dev continua
-- quebrado neste projeto).
ALTER TYPE "PapelUsuario" ADD VALUE 'FUNCIONARIO';

ALTER TABLE "Professor" ADD COLUMN "cargo" TEXT;
