-- ============================================================================
-- Paywall / conteúdo premium — Rede Social Fase 5. 100% aditivo: colunas
-- novas nullable/default + 1 tabela nova. Nenhuma tabela existente muda de
-- comportamento (Post.exclusivo nasce false, professor sem
-- precoAssinaturaPremium não muda em nada).
-- ============================================================================

ALTER TABLE "Professor" ADD COLUMN IF NOT EXISTS "precoAssinaturaPremium" DOUBLE PRECISION;

ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "exclusivo" BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE "StatusAssinaturaPremium" AS ENUM ('PENDENTE', 'ATIVA', 'CANCELADA');

CREATE TABLE "AssinaturaPremium" (
    "id"                   TEXT NOT NULL,
    "alunoId"              TEXT NOT NULL,
    "professorId"          TEXT NOT NULL,
    "status"               "StatusAssinaturaPremium" NOT NULL DEFAULT 'PENDENTE',
    "stripeCustomerId"     TEXT,
    "stripeSubscriptionId" TEXT,
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"            TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssinaturaPremium_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssinaturaPremium_alunoId_professorId_key" ON "AssinaturaPremium"("alunoId", "professorId");
CREATE INDEX "AssinaturaPremium_professorId_idx" ON "AssinaturaPremium"("professorId");
CREATE INDEX "AssinaturaPremium_stripeSubscriptionId_idx" ON "AssinaturaPremium"("stripeSubscriptionId");

ALTER TABLE "AssinaturaPremium" ADD CONSTRAINT "AssinaturaPremium_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssinaturaPremium" ADD CONSTRAINT "AssinaturaPremium_professorId_fkey" FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
