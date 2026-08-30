-- ============================================================================
-- Fase 4 (S4.1) — CRM de leads: funil configurável, lead, tarefa de
-- follow-up.
--
-- 100% aditivo: três tabelas novas (EstagioFunil, Lead, TarefaLead).
-- Nenhuma coluna existente é alterada, sem backfill.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "EstagioFunil" (
  "id"        TEXT NOT NULL,
  "nome"      TEXT NOT NULL,
  "ordem"     INTEGER NOT NULL,
  "ativo"     BOOLEAN NOT NULL DEFAULT true,
  "escolaId"  TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EstagioFunil_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Lead" (
  "id"                 TEXT NOT NULL,
  "nome"               TEXT NOT NULL,
  "telefone"           TEXT,
  "email"              TEXT,
  "origem"             TEXT,
  "arquivado"          BOOLEAN NOT NULL DEFAULT false,
  "motivoArquivamento" TEXT,
  "estagioId"          TEXT NOT NULL,
  "professorId"        TEXT,
  "escolaId"           TEXT NOT NULL,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TarefaLead" (
  "id"            TEXT NOT NULL,
  "descricao"     TEXT NOT NULL,
  "dataPrevista"  TIMESTAMP(3) NOT NULL,
  "concluida"     BOOLEAN NOT NULL DEFAULT false,
  "concluidaEm"   TIMESTAMP(3),
  "leadId"        TEXT NOT NULL,
  "responsavelId" TEXT,
  "escolaId"      TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TarefaLead_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EstagioFunil_escolaId_idx" ON "EstagioFunil"("escolaId");
CREATE INDEX IF NOT EXISTS "Lead_escolaId_arquivado_idx" ON "Lead"("escolaId", "arquivado");
CREATE INDEX IF NOT EXISTS "Lead_estagioId_idx" ON "Lead"("estagioId");
CREATE INDEX IF NOT EXISTS "TarefaLead_escolaId_concluida_idx" ON "TarefaLead"("escolaId", "concluida");
CREATE INDEX IF NOT EXISTS "TarefaLead_leadId_idx" ON "TarefaLead"("leadId");

DO $$ BEGIN
  ALTER TABLE "EstagioFunil" ADD CONSTRAINT "EstagioFunil_escolaId_fkey"
    FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Lead" ADD CONSTRAINT "Lead_estagioId_fkey"
    FOREIGN KEY ("estagioId") REFERENCES "EstagioFunil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Lead" ADD CONSTRAINT "Lead_professorId_fkey"
    FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Lead" ADD CONSTRAINT "Lead_escolaId_fkey"
    FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TarefaLead" ADD CONSTRAINT "TarefaLead_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TarefaLead" ADD CONSTRAINT "TarefaLead_responsavelId_fkey"
    FOREIGN KEY ("responsavelId") REFERENCES "Professor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TarefaLead" ADD CONSTRAINT "TarefaLead_escolaId_fkey"
    FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
