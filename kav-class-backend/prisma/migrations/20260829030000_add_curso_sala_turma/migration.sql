-- ============================================================================
-- Fase 1 (S1.2) — Cursos, salas e turmas como entidades de verdade.
--
-- 100% aditivo: três tabelas novas (Curso, Sala, Turma) e duas colunas
-- NULLABLE em Aula (turmaId, salaId). Nenhuma coluna existente é alterada;
-- aula avulsa (o modo de hoje, sem turma/sala) continua funcionando
-- idêntico. Sem backfill — Professor.cursos (lista livre) e Aluno.curso
-- (texto livre) continuam existindo, migrar pra apontar pra Curso é
-- trabalho de uma sprint futura.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "Curso" (
  "id"        TEXT NOT NULL,
  "nome"      TEXT NOT NULL,
  "ativo"     BOOLEAN NOT NULL DEFAULT true,
  "escolaId"  TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Curso_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Sala" (
  "id"        TEXT NOT NULL,
  "nome"      TEXT NOT NULL,
  "descricao" TEXT,
  "ativa"     BOOLEAN NOT NULL DEFAULT true,
  "escolaId"  TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Sala_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Turma" (
  "id"           TEXT NOT NULL,
  "nome"         TEXT NOT NULL,
  "limiteAlunos" INTEGER,
  "ativa"        BOOLEAN NOT NULL DEFAULT true,
  "cursoId"      TEXT NOT NULL,
  "salaId"       TEXT,
  "professorId"  TEXT NOT NULL,
  "escolaId"     TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Turma_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Curso_escolaId_idx" ON "Curso"("escolaId");
CREATE INDEX IF NOT EXISTS "Sala_escolaId_idx" ON "Sala"("escolaId");
CREATE INDEX IF NOT EXISTS "Turma_escolaId_idx" ON "Turma"("escolaId");
CREATE INDEX IF NOT EXISTS "Turma_professorId_idx" ON "Turma"("professorId");
CREATE INDEX IF NOT EXISTS "Turma_cursoId_idx" ON "Turma"("cursoId");
CREATE INDEX IF NOT EXISTS "Turma_salaId_idx" ON "Turma"("salaId");

DO $$ BEGIN
  ALTER TABLE "Curso" ADD CONSTRAINT "Curso_escolaId_fkey"
    FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Sala" ADD CONSTRAINT "Sala_escolaId_fkey"
    FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Turma" ADD CONSTRAINT "Turma_cursoId_fkey"
    FOREIGN KEY ("cursoId") REFERENCES "Curso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Turma" ADD CONSTRAINT "Turma_salaId_fkey"
    FOREIGN KEY ("salaId") REFERENCES "Sala"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Turma" ADD CONSTRAINT "Turma_professorId_fkey"
    FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Turma" ADD CONSTRAINT "Turma_escolaId_fkey"
    FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Aula" ADD COLUMN IF NOT EXISTS "turmaId" TEXT;
ALTER TABLE "Aula" ADD COLUMN IF NOT EXISTS "salaId" TEXT;

CREATE INDEX IF NOT EXISTS "Aula_turmaId_idx" ON "Aula"("turmaId");
CREATE INDEX IF NOT EXISTS "Aula_salaId_idx" ON "Aula"("salaId");

DO $$ BEGIN
  ALTER TABLE "Aula" ADD CONSTRAINT "Aula_turmaId_fkey"
    FOREIGN KEY ("turmaId") REFERENCES "Turma"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Aula" ADD CONSTRAINT "Aula_salaId_fkey"
    FOREIGN KEY ("salaId") REFERENCES "Sala"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
