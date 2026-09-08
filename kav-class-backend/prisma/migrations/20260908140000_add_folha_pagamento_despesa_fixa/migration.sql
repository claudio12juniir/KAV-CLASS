-- ============================================================================
-- INSTITUTION Sprint 7 — Financeiro I: folha de pagamento + despesas fixas
-- (briefing 08/09/2026). 100% novo, sem tocar em tabelas existentes.
-- ============================================================================

CREATE TYPE "StatusFolhaPagamento" AS ENUM ('ABERTA', 'FECHADA');

CREATE TABLE "FolhaPagamentoProfessor" (
    "id" TEXT NOT NULL,
    "mes" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "valorCalculado" DOUBLE PRECISION NOT NULL,
    "valorAjustado" DOUBLE PRECISION,
    "comprovantes" TEXT[],
    "status" "StatusFolhaPagamento" NOT NULL DEFAULT 'ABERTA',
    "professorId" TEXT NOT NULL,
    "escolaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FolhaPagamentoProfessor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FolhaPagamentoProfessor_professorId_mes_ano_key" ON "FolhaPagamentoProfessor"("professorId", "mes", "ano");
CREATE INDEX "FolhaPagamentoProfessor_escolaId_mes_ano_idx" ON "FolhaPagamentoProfessor"("escolaId", "mes", "ano");

ALTER TABLE "FolhaPagamentoProfessor" ADD CONSTRAINT "FolhaPagamentoProfessor_professorId_fkey"
  FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FolhaPagamentoProfessor" ADD CONSTRAINT "FolhaPagamentoProfessor_escolaId_fkey"
  FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "DespesaFixa" (
    "id" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "recorrente" BOOLEAN NOT NULL DEFAULT true,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "escolaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DespesaFixa_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DespesaFixa_escolaId_ativa_idx" ON "DespesaFixa"("escolaId", "ativa");

ALTER TABLE "DespesaFixa" ADD CONSTRAINT "DespesaFixa_escolaId_fkey"
  FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
