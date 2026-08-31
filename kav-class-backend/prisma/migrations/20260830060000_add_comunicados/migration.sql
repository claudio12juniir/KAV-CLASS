-- ============================================================================
-- Fase 5 (S5.1) — Comunicados em escala de escola (broadcast por e-mail,
-- com histórico completo por destinatário).
--
-- 100% aditivo: dois enums novos e duas tabelas novas (Comunicado,
-- EnvioComunicado). Nenhuma coluna existente é alterada, sem backfill.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE "StatusComunicado" AS ENUM ('RASCUNHO', 'ENVIADO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PublicoComunicado" AS ENUM ('ALUNOS', 'PROFESSORES', 'TODOS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "Comunicado" (
  "id"        TEXT NOT NULL,
  "titulo"    TEXT NOT NULL,
  "corpo"     TEXT NOT NULL,
  "publico"   "PublicoComunicado" NOT NULL,
  "status"    "StatusComunicado" NOT NULL DEFAULT 'RASCUNHO',
  "enviadoEm" TIMESTAMP(3),
  "escolaId"  TEXT NOT NULL,
  "autorId"   TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Comunicado_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EnvioComunicado" (
  "id"                TEXT NOT NULL,
  "destinatarioNome"  TEXT NOT NULL,
  "destinatarioEmail" TEXT NOT NULL,
  "destinatarioTipo"  TEXT NOT NULL,
  "sucesso"           BOOLEAN NOT NULL,
  "erro"              TEXT,
  "comunicadoId"      TEXT NOT NULL,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EnvioComunicado_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Comunicado_escolaId_status_idx" ON "Comunicado"("escolaId", "status");
CREATE INDEX IF NOT EXISTS "EnvioComunicado_comunicadoId_idx" ON "EnvioComunicado"("comunicadoId");

DO $$ BEGIN
  ALTER TABLE "Comunicado" ADD CONSTRAINT "Comunicado_escolaId_fkey"
    FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Comunicado" ADD CONSTRAINT "Comunicado_autorId_fkey"
    FOREIGN KEY ("autorId") REFERENCES "Professor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "EnvioComunicado" ADD CONSTRAINT "EnvioComunicado_comunicadoId_fkey"
    FOREIGN KEY ("comunicadoId") REFERENCES "Comunicado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
