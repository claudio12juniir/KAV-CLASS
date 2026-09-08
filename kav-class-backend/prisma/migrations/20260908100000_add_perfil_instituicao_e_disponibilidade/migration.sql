-- ============================================================================
-- INSTITUTION Sprint 1 — Perfil da Instituição + Equipe (briefing 08/09/2026)
-- 100% aditivo: novas colunas nullable/com default, novos enums, nova tabela.
-- Escrita à mão em vez de `prisma migrate diff` porque o shadow database
-- local não reflete o drift real de produção (ver 20260801000000), então
-- diff automático arriscaria propor algo destrutivo por engano.
-- ============================================================================

-- ─── ENUMS ──────────────────────────────────────────────────────────────
CREATE TYPE "TipoRemuneracaoProfessor" AS ENUM ('POR_AULA', 'POR_ALUNO_MES');
CREATE TYPE "TipoDisponibilidade" AS ENUM ('DISPONIVEL', 'PAUSA');

-- ─── ESCOLA ─────────────────────────────────────────────────────────────
ALTER TABLE "Escola" ADD COLUMN "horarioFuncionamento" JSONB;
ALTER TABLE "Escola" ADD COLUMN "logoUrl" TEXT;
ALTER TABLE "Escola" ADD COLUMN "email" TEXT;
ALTER TABLE "Escola" ADD COLUMN "valorPorAula" DOUBLE PRECISION;
ALTER TABLE "Escola" ADD COLUMN "tipoRemuneracaoProfessor" "TipoRemuneracaoProfessor" NOT NULL DEFAULT 'POR_AULA';
ALTER TABLE "Escola" ADD COLUMN "diaFechamento" INTEGER;

-- ─── PROFESSOR ──────────────────────────────────────────────────────────
ALTER TABLE "Professor" ADD COLUMN "contatoEmergencia" TEXT;
ALTER TABLE "Professor" ADD COLUMN "dataPagamento" INTEGER;
ALTER TABLE "Professor" ADD COLUMN "contratoUrl" TEXT;

-- ─── DISPONIBILIDADE PROFESSOR (nova) ────────────────────────────────────
CREATE TABLE "DisponibilidadeProfessor" (
    "id" TEXT NOT NULL,
    "diaSemana" INTEGER NOT NULL,
    "horaInicio" TEXT NOT NULL,
    "horaFim" TEXT NOT NULL,
    "tipo" "TipoDisponibilidade" NOT NULL DEFAULT 'DISPONIVEL',
    "professorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisponibilidadeProfessor_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DisponibilidadeProfessor_professorId_diaSemana_idx" ON "DisponibilidadeProfessor"("professorId", "diaSemana");

ALTER TABLE "DisponibilidadeProfessor" ADD CONSTRAINT "DisponibilidadeProfessor_professorId_fkey"
  FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
