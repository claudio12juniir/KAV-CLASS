-- ============================================================================
-- Fase 2 (S2.3) — Avaliação do professor + crédito de horas / reserva de
-- sala.
--
-- 100% aditivo: quatro tabelas novas (Avaliacao, PacoteCredito,
-- CompraCredito, ReservaSala). Nenhuma coluna existente é alterada, sem
-- backfill — tudo nasce vazio.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "Avaliacao" (
  "id"          TEXT NOT NULL,
  "nota"        INTEGER NOT NULL,
  "comentario"  TEXT,
  "alunoId"     TEXT NOT NULL,
  "professorId" TEXT NOT NULL,
  "aulaId"      TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Avaliacao_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PacoteCredito" (
  "id"        TEXT NOT NULL,
  "nome"      TEXT NOT NULL,
  "horas"     DOUBLE PRECISION NOT NULL,
  "ativo"     BOOLEAN NOT NULL DEFAULT true,
  "escolaId"  TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PacoteCredito_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CompraCredito" (
  "id"              TEXT NOT NULL,
  "horas"           DOUBLE PRECISION NOT NULL,
  "alunoId"         TEXT NOT NULL,
  "pacoteCreditoId" TEXT NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CompraCredito_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ReservaSala" (
  "id"             TEXT NOT NULL,
  "dataHoraInicio" TIMESTAMP(3) NOT NULL,
  "horas"          DOUBLE PRECISION NOT NULL,
  "ativa"          BOOLEAN NOT NULL DEFAULT true,
  "alunoId"        TEXT NOT NULL,
  "salaId"         TEXT NOT NULL,
  "escolaId"       TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ReservaSala_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Avaliacao_professorId_idx" ON "Avaliacao"("professorId");
CREATE INDEX IF NOT EXISTS "Avaliacao_alunoId_idx" ON "Avaliacao"("alunoId");
CREATE INDEX IF NOT EXISTS "PacoteCredito_escolaId_idx" ON "PacoteCredito"("escolaId");
CREATE INDEX IF NOT EXISTS "CompraCredito_alunoId_idx" ON "CompraCredito"("alunoId");
CREATE INDEX IF NOT EXISTS "ReservaSala_alunoId_idx" ON "ReservaSala"("alunoId");
CREATE INDEX IF NOT EXISTS "ReservaSala_salaId_dataHoraInicio_idx" ON "ReservaSala"("salaId", "dataHoraInicio");
CREATE INDEX IF NOT EXISTS "ReservaSala_escolaId_idx" ON "ReservaSala"("escolaId");

DO $$ BEGIN
  ALTER TABLE "Avaliacao" ADD CONSTRAINT "Avaliacao_alunoId_fkey"
    FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Avaliacao" ADD CONSTRAINT "Avaliacao_professorId_fkey"
    FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Avaliacao" ADD CONSTRAINT "Avaliacao_aulaId_fkey"
    FOREIGN KEY ("aulaId") REFERENCES "Aula"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PacoteCredito" ADD CONSTRAINT "PacoteCredito_escolaId_fkey"
    FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CompraCredito" ADD CONSTRAINT "CompraCredito_alunoId_fkey"
    FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CompraCredito" ADD CONSTRAINT "CompraCredito_pacoteCreditoId_fkey"
    FOREIGN KEY ("pacoteCreditoId") REFERENCES "PacoteCredito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ReservaSala" ADD CONSTRAINT "ReservaSala_alunoId_fkey"
    FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ReservaSala" ADD CONSTRAINT "ReservaSala_salaId_fkey"
    FOREIGN KEY ("salaId") REFERENCES "Sala"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ReservaSala" ADD CONSTRAINT "ReservaSala_escolaId_fkey"
    FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
