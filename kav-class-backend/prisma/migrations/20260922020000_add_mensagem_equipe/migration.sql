-- Grupo interno dos professores (INSTITUTION Sprint 17, briefing
-- 22/09/2026) — tabela nova, 100% aditiva. Escrita à mão + db execute +
-- migrate resolve, mesmo fluxo já registrado em
-- feedback_prisma_migrate_dev_broken.
CREATE TABLE "MensagemEquipe" (
    "id" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "fixado" BOOLEAN NOT NULL DEFAULT false,
    "escolaId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MensagemEquipe_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MensagemEquipe_escolaId_fixado_createdAt_idx" ON "MensagemEquipe"("escolaId", "fixado", "createdAt");

ALTER TABLE "MensagemEquipe" ADD CONSTRAINT "MensagemEquipe_escolaId_fkey"
  FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MensagemEquipe" ADD CONSTRAINT "MensagemEquipe_autorId_fkey"
  FOREIGN KEY ("autorId") REFERENCES "Professor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
