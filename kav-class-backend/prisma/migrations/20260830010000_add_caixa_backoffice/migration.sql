-- ============================================================================
-- Fase 3 (S3.3) — Backoffice financeiro mínimo (caixa + contas a pagar).
--
-- 100% aditivo: três tabelas novas (LancamentoCaixa, FechamentoCaixa,
-- ContaPagar). Nenhuma coluna existente é alterada, sem backfill.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE "TipoLancamentoCaixa" AS ENUM ('ENTRADA', 'SAIDA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ContaPagar" (
  "id"         TEXT NOT NULL,
  "descricao"  TEXT NOT NULL,
  "valor"      DOUBLE PRECISION NOT NULL,
  "vencimento" TIMESTAMP(3) NOT NULL,
  "paga"       BOOLEAN NOT NULL DEFAULT false,
  "pagoEm"     TIMESTAMP(3),
  "escolaId"   TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ContaPagar_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LancamentoCaixa" (
  "id"           TEXT NOT NULL,
  "tipo"         "TipoLancamentoCaixa" NOT NULL,
  "descricao"    TEXT NOT NULL,
  "valor"        DOUBLE PRECISION NOT NULL,
  "data"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "escolaId"     TEXT NOT NULL,
  "contaPagarId" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LancamentoCaixa_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FechamentoCaixa" (
  "id"            TEXT NOT NULL,
  "data"          TIMESTAMP(3) NOT NULL,
  "saldoInicial"  DOUBLE PRECISION NOT NULL,
  "totalEntradas" DOUBLE PRECISION NOT NULL,
  "totalSaidas"   DOUBLE PRECISION NOT NULL,
  "saldoFinal"    DOUBLE PRECISION NOT NULL,
  "escolaId"      TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FechamentoCaixa_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LancamentoCaixa_escolaId_data_idx" ON "LancamentoCaixa"("escolaId", "data");
CREATE INDEX IF NOT EXISTS "FechamentoCaixa_escolaId_idx" ON "FechamentoCaixa"("escolaId");
CREATE UNIQUE INDEX IF NOT EXISTS "FechamentoCaixa_escolaId_data_key" ON "FechamentoCaixa"("escolaId", "data");
CREATE INDEX IF NOT EXISTS "ContaPagar_escolaId_paga_idx" ON "ContaPagar"("escolaId", "paga");

DO $$ BEGIN
  ALTER TABLE "LancamentoCaixa" ADD CONSTRAINT "LancamentoCaixa_escolaId_fkey"
    FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "LancamentoCaixa" ADD CONSTRAINT "LancamentoCaixa_contaPagarId_fkey"
    FOREIGN KEY ("contaPagarId") REFERENCES "ContaPagar"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "FechamentoCaixa" ADD CONSTRAINT "FechamentoCaixa_escolaId_fkey"
    FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_escolaId_fkey"
    FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
