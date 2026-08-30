-- ============================================================================
-- Fase 1 (S1.3) — Tabela de valores versionada.
--
-- 100% aditivo: cinco tabelas novas (Modalidade, PlanoPagamento,
-- TabelaValores, VersaoTabelaValores, ValorPlano) e uma coluna NULLABLE em
-- Curso (tabelaValoresId). Sem backfill.
--
-- Aluno.valorMensalidade continua sendo o que sempre foi — um valor gravado
-- na hora da matrícula/configuração, sem ligação nenhuma com esse motor
-- novo. Ativar uma versão de tabela não pode mudar valor de quem já está
-- matriculado, e essa migration garante isso simplesmente por não tocar em
-- nada relacionado a Aluno/Pagamento.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE "PeriodicidadePlano" AS ENUM ('MENSAL', 'SEMESTRAL', 'ANUAL', 'LIVRE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Curso" ADD COLUMN IF NOT EXISTS "tabelaValoresId" TEXT;

CREATE TABLE IF NOT EXISTS "Modalidade" (
  "id"             TEXT NOT NULL,
  "nome"           TEXT NOT NULL,
  "frequencia"     "RecorrenciaAula" NOT NULL,
  "duracaoMinutos" INTEGER NOT NULL,
  "padrao"         BOOLEAN NOT NULL DEFAULT false,
  "escolaId"       TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Modalidade_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PlanoPagamento" (
  "id"            TEXT NOT NULL,
  "nome"          TEXT NOT NULL,
  "periodicidade" "PeriodicidadePlano" NOT NULL,
  "escolaId"      TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PlanoPagamento_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TabelaValores" (
  "id"        TEXT NOT NULL,
  "nome"      TEXT NOT NULL,
  "escolaId"  TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TabelaValores_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "VersaoTabelaValores" (
  "id"        TEXT NOT NULL,
  "ativa"     BOOLEAN NOT NULL DEFAULT false,
  "tabelaId"  TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "VersaoTabelaValores_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ValorPlano" (
  "id"               TEXT NOT NULL,
  "metodo"           "MetodoPagamento",
  "valor"            DOUBLE PRECISION NOT NULL,
  "versaoId"         TEXT NOT NULL,
  "planoPagamentoId" TEXT NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ValorPlano_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Modalidade_escolaId_idx" ON "Modalidade"("escolaId");
CREATE INDEX IF NOT EXISTS "PlanoPagamento_escolaId_idx" ON "PlanoPagamento"("escolaId");
CREATE INDEX IF NOT EXISTS "TabelaValores_escolaId_idx" ON "TabelaValores"("escolaId");
CREATE INDEX IF NOT EXISTS "VersaoTabelaValores_tabelaId_ativa_idx" ON "VersaoTabelaValores"("tabelaId", "ativa");
CREATE INDEX IF NOT EXISTS "ValorPlano_versaoId_idx" ON "ValorPlano"("versaoId");
CREATE INDEX IF NOT EXISTS "ValorPlano_planoPagamentoId_idx" ON "ValorPlano"("planoPagamentoId");
CREATE UNIQUE INDEX IF NOT EXISTS "ValorPlano_versaoId_planoPagamentoId_metodo_key" ON "ValorPlano"("versaoId", "planoPagamentoId", "metodo");
CREATE INDEX IF NOT EXISTS "Curso_tabelaValoresId_idx" ON "Curso"("tabelaValoresId");

DO $$ BEGIN
  ALTER TABLE "Curso" ADD CONSTRAINT "Curso_tabelaValoresId_fkey"
    FOREIGN KEY ("tabelaValoresId") REFERENCES "TabelaValores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Modalidade" ADD CONSTRAINT "Modalidade_escolaId_fkey"
    FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PlanoPagamento" ADD CONSTRAINT "PlanoPagamento_escolaId_fkey"
    FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TabelaValores" ADD CONSTRAINT "TabelaValores_escolaId_fkey"
    FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "VersaoTabelaValores" ADD CONSTRAINT "VersaoTabelaValores_tabelaId_fkey"
    FOREIGN KEY ("tabelaId") REFERENCES "TabelaValores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ValorPlano" ADD CONSTRAINT "ValorPlano_versaoId_fkey"
    FOREIGN KEY ("versaoId") REFERENCES "VersaoTabelaValores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ValorPlano" ADD CONSTRAINT "ValorPlano_planoPagamentoId_fkey"
    FOREIGN KEY ("planoPagamentoId") REFERENCES "PlanoPagamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
