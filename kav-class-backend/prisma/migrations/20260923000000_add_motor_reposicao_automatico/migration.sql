-- Motor automático de reposição (INSTITUTION Sprint 20, briefing
-- 23/09/2026) — liga Reposicao a Aula de verdade (data original perdida +
-- data de reposição), pra fechar o ciclo entre a Grade de hoje e a tela de
-- Reposições. Escrita à mão + db execute + migrate resolve, mesmo fluxo já
-- registrado em feedback_prisma_migrate_dev_broken.

ALTER TYPE "StatusReposicao" ADD VALUE 'PENDENTE_AGENDAMENTO';
ALTER TYPE "StatusReposicao" ADD VALUE 'AGENDADA';
ALTER TYPE "OrigemReposicao" ADD VALUE 'ESCOLA';

-- dataProposta deixa de ser obrigatório: uma reposição automática (origem
-- ESCOLA) nasce sem data — é exatamente o que fica em "Para repor".
ALTER TABLE "Reposicao" ALTER COLUMN "dataProposta" DROP NOT NULL;

ALTER TABLE "Reposicao" ADD COLUMN "aulaOriginalId" TEXT;
ALTER TABLE "Reposicao" ADD COLUMN "aulaReposicaoId" TEXT;

CREATE UNIQUE INDEX "Reposicao_aulaReposicaoId_key" ON "Reposicao"("aulaReposicaoId");
CREATE INDEX "Reposicao_aulaOriginalId_idx" ON "Reposicao"("aulaOriginalId");

ALTER TABLE "Reposicao" ADD CONSTRAINT "Reposicao_aulaOriginalId_fkey"
  FOREIGN KEY ("aulaOriginalId") REFERENCES "Aula"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Reposicao" ADD CONSTRAINT "Reposicao_aulaReposicaoId_fkey"
  FOREIGN KEY ("aulaReposicaoId") REFERENCES "Aula"("id") ON DELETE SET NULL ON UPDATE CASCADE;
