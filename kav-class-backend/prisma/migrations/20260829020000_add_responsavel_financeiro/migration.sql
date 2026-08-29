-- ============================================================================
-- Fase 1 (S1.1) — Responsável financeiro + matrícula formal.
--
-- 100% aditivo: nova tabela ResponsavelFinanceiro e duas colunas NULLABLE em
-- Aluno (responsavelId, vinculoResponsavel). Sem backfill — aluno existente
-- continua sem responsável até alguém preencher via
-- PUT /api/alunos/:id/responsavel. Nenhuma coluna existente é alterada.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE "VinculoResponsavel" AS ENUM ('CONTRATANTE', 'DEPENDENTE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ResponsavelFinanceiro" (
  "id"        TEXT NOT NULL,
  "nome"      TEXT NOT NULL,
  "cpf"       TEXT,
  "email"     TEXT,
  "telefone"  TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "escolaId"  TEXT NOT NULL,

  CONSTRAINT "ResponsavelFinanceiro_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ResponsavelFinanceiro_escolaId_idx" ON "ResponsavelFinanceiro"("escolaId");
CREATE INDEX IF NOT EXISTS "ResponsavelFinanceiro_escolaId_cpf_idx" ON "ResponsavelFinanceiro"("escolaId", "cpf");

DO $$ BEGIN
  ALTER TABLE "ResponsavelFinanceiro" ADD CONSTRAINT "ResponsavelFinanceiro_escolaId_fkey"
    FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Aluno" ADD COLUMN IF NOT EXISTS "responsavelId" TEXT;
ALTER TABLE "Aluno" ADD COLUMN IF NOT EXISTS "vinculoResponsavel" "VinculoResponsavel";

CREATE INDEX IF NOT EXISTS "Aluno_responsavelId_idx" ON "Aluno"("responsavelId");

-- ON DELETE SET NULL: apagar um responsável não pode travar por causa dos
-- alunos vinculados a ele (mesma regra já usada em Material.alunoId).
DO $$ BEGIN
  ALTER TABLE "Aluno" ADD CONSTRAINT "Aluno_responsavelId_fkey"
    FOREIGN KEY ("responsavelId") REFERENCES "ResponsavelFinanceiro"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
