-- ============================================================================
-- INSTITUTION Sprint 9 — Coordenação (briefing 08/09/2026). 100% aditivo.
-- ============================================================================

CREATE TYPE "TipoCronograma" AS ENUM ('UNIVERSAL', 'PESSOAL');
CREATE TYPE "AutorRelatorioAluno" AS ENUM ('PROFESSOR', 'COORDENACAO');

ALTER TABLE "Aula" ADD COLUMN "assuntoTratado" TEXT;

ALTER TABLE "Avaliacao" ADD COLUMN "notaEscola" INTEGER;
ALTER TABLE "Avaliacao" ADD COLUMN "mesReferencia" TEXT;

ALTER TABLE "Matricula" ADD COLUMN "avaliacaoPendenteAte" TIMESTAMP(3);

CREATE TABLE "CronogramaConteudo" (
    "id" TEXT NOT NULL,
    "tipo" "TipoCronograma" NOT NULL,
    "anexoUrl" TEXT,
    "titulo" TEXT,
    "cursoId" TEXT NOT NULL,
    "professorId" TEXT,
    "escolaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CronogramaConteudo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CronogramaConteudo_cursoId_tipo_idx" ON "CronogramaConteudo"("cursoId", "tipo");
CREATE INDEX "CronogramaConteudo_professorId_idx" ON "CronogramaConteudo"("professorId");

ALTER TABLE "CronogramaConteudo" ADD CONSTRAINT "CronogramaConteudo_cursoId_fkey"
  FOREIGN KEY ("cursoId") REFERENCES "Curso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CronogramaConteudo" ADD CONSTRAINT "CronogramaConteudo_professorId_fkey"
  FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CronogramaConteudo" ADD CONSTRAINT "CronogramaConteudo_escolaId_fkey"
  FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "RelatorioAluno" (
    "id" TEXT NOT NULL,
    "autorTipo" "AutorRelatorioAluno" NOT NULL,
    "descricao" TEXT,
    "anexoUrl" TEXT,
    "alunoId" TEXT NOT NULL,
    "escolaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RelatorioAluno_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RelatorioAluno_alunoId_createdAt_idx" ON "RelatorioAluno"("alunoId", "createdAt");

ALTER TABLE "RelatorioAluno" ADD CONSTRAINT "RelatorioAluno_alunoId_fkey"
  FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RelatorioAluno" ADD CONSTRAINT "RelatorioAluno_escolaId_fkey"
  FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
