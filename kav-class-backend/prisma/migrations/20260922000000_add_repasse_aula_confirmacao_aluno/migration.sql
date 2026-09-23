-- Repasse de aula + confirmação de presença do aluno 24h antes
-- (INSTITUTION Sprints 12 e 13, briefing 22/09/2026).
-- Escrita à mão em vez de `prisma migrate dev` — o histórico de migrations
-- deste projeto não roda limpo num shadow DB (ver
-- feedback_prisma_migrate_dev_broken na memória de longo prazo). Aplicada
-- com `prisma db execute` + registrada com `prisma migrate resolve --applied`.
-- 100% aditivo, todas as colunas nullable — nenhuma linha existente muda.

ALTER TABLE "Aula" ADD COLUMN "professorSubstitutoId" TEXT;
ALTER TABLE "Aula" ADD COLUMN "confirmacaoAlunoSolicitadaEm" TIMESTAMP(3);
ALTER TABLE "Aula" ADD COLUMN "confirmacaoAlunoEm" TIMESTAMP(3);
ALTER TABLE "Aula" ADD COLUMN "confirmacaoAlunoResposta" BOOLEAN;

ALTER TABLE "Aula" ADD CONSTRAINT "Aula_professorSubstitutoId_fkey"
  FOREIGN KEY ("professorSubstitutoId") REFERENCES "Professor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Aula_professorSubstitutoId_presenca_dataHora_idx"
  ON "Aula"("professorSubstitutoId", "presenca", "dataHora");

CREATE INDEX "Aula_confirmacaoAlunoResposta_dataHora_idx"
  ON "Aula"("confirmacaoAlunoResposta", "dataHora");
