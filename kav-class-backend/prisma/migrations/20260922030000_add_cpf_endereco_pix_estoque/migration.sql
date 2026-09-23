-- Revisão de cadastro (INSTITUTION Sprint 18, briefing 22/09/2026) —
-- 100% aditivo, todas nullable. Escrita à mão + db execute + migrate
-- resolve, mesmo fluxo já registrado em feedback_prisma_migrate_dev_broken.

ALTER TABLE "Aluno" ADD COLUMN "cpf" TEXT;
ALTER TABLE "Aluno" ADD COLUMN "endereco" TEXT;

ALTER TABLE "Professor" ADD COLUMN "cpf" TEXT;
ALTER TABLE "Professor" ADD COLUMN "endereco" TEXT;
-- chavePix já existe (migration 20260422000000_add_missing_fields_and_tables) — reaproveitado, não duplicado aqui.

ALTER TABLE "Produto" ADD COLUMN "categoria" TEXT;
ALTER TABLE "Produto" ADD COLUMN "valorCusto" DOUBLE PRECISION;
ALTER TABLE "Produto" ADD COLUMN "valorVenda" DOUBLE PRECISION;
ALTER TABLE "Produto" ADD COLUMN "estoqueMinimo" INTEGER;
