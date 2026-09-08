-- ============================================================================
-- INSTITUTION Sprint 4 — Chat da turma (briefing 08/09/2026). 100% novo,
-- sem tocar em tabelas existentes.
-- ============================================================================

CREATE TYPE "AutorMensagemTurma" AS ENUM ('PROFESSOR', 'ALUNO');

CREATE TABLE "MensagemTurma" (
    "id" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "autorTipo" "AutorMensagemTurma" NOT NULL,
    "autorId" TEXT NOT NULL,
    "professorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MensagemTurma_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MensagemTurma_professorId_createdAt_idx" ON "MensagemTurma"("professorId", "createdAt");

ALTER TABLE "MensagemTurma" ADD CONSTRAINT "MensagemTurma_professorId_fkey"
  FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
