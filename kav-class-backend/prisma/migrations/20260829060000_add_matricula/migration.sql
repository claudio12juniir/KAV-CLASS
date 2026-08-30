-- ============================================================================
-- Fase 2 (S2.2) — Matrícula como entidade própria, faturas agrupadas por
-- matrícula.
--
-- 100% aditivo: tabela Matricula nova e uma coluna NULLABLE em Pagamento
-- (matriculaId). O vínculo "implícito" que Aluno já carrega (professorId,
-- curso, valorMensalidade) e os Pagamento gerados por
-- /api/configurar-aluno continuam existindo exatamente como sempre
-- existiram, sem matriculaId — essa migration não toca em nenhum deles.
-- Matricula é o jeito novo de um mesmo Aluno ter mais de um vínculo
-- simultâneo, cada um com seu próprio conjunto de faturas.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "Matricula" (
  "id"               TEXT NOT NULL,
  "valorMensalidade" DOUBLE PRECISION NOT NULL,
  "diaVencimento"    INTEGER NOT NULL DEFAULT 10,
  "status"           "StatusAluno" NOT NULL DEFAULT 'ATIVO',
  "dataInicio"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "alunoId"          TEXT NOT NULL,
  "professorId"      TEXT NOT NULL,
  "escolaId"         TEXT NOT NULL,
  "turmaId"          TEXT,
  "planoPagamentoId" TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Matricula_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Pagamento" ADD COLUMN IF NOT EXISTS "matriculaId" TEXT;

CREATE INDEX IF NOT EXISTS "Matricula_alunoId_idx" ON "Matricula"("alunoId");
CREATE INDEX IF NOT EXISTS "Matricula_professorId_idx" ON "Matricula"("professorId");
CREATE INDEX IF NOT EXISTS "Matricula_escolaId_idx" ON "Matricula"("escolaId");
CREATE INDEX IF NOT EXISTS "Matricula_turmaId_idx" ON "Matricula"("turmaId");
CREATE INDEX IF NOT EXISTS "Pagamento_matriculaId_idx" ON "Pagamento"("matriculaId");

DO $$ BEGIN
  ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_matriculaId_fkey"
    FOREIGN KEY ("matriculaId") REFERENCES "Matricula"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Matricula" ADD CONSTRAINT "Matricula_alunoId_fkey"
    FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Matricula" ADD CONSTRAINT "Matricula_professorId_fkey"
    FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Matricula" ADD CONSTRAINT "Matricula_escolaId_fkey"
    FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Matricula" ADD CONSTRAINT "Matricula_turmaId_fkey"
    FOREIGN KEY ("turmaId") REFERENCES "Turma"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Matricula" ADD CONSTRAINT "Matricula_planoPagamentoId_fkey"
    FOREIGN KEY ("planoPagamentoId") REFERENCES "PlanoPagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
