-- "Puxar" login existente pra virar aluno (INSTITUTION Sprint 25, briefing
-- 23/09/2026) — tabela nova, 100% aditiva. Escrita à mão + db execute +
-- migrate resolve, mesmo fluxo já registrado em
-- feedback_prisma_migrate_dev_broken.

CREATE TYPE "StatusConviteAlunoConta" AS ENUM ('PENDENTE', 'ACEITO', 'RECUSADO');

CREATE TABLE "ConviteAlunoConta" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "StatusConviteAlunoConta" NOT NULL DEFAULT 'PENDENTE',
    "curso" TEXT,
    "contaId" TEXT NOT NULL,
    "escolaId" TEXT NOT NULL,
    "professorId" TEXT NOT NULL,
    "alunoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondidoEm" TIMESTAMP(3),

    CONSTRAINT "ConviteAlunoConta_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConviteAlunoConta_token_key" ON "ConviteAlunoConta"("token");
CREATE UNIQUE INDEX "ConviteAlunoConta_alunoId_key" ON "ConviteAlunoConta"("alunoId");
CREATE INDEX "ConviteAlunoConta_contaId_status_idx" ON "ConviteAlunoConta"("contaId", "status");
CREATE INDEX "ConviteAlunoConta_escolaId_idx" ON "ConviteAlunoConta"("escolaId");

ALTER TABLE "ConviteAlunoConta" ADD CONSTRAINT "ConviteAlunoConta_contaId_fkey"
  FOREIGN KEY ("contaId") REFERENCES "Conta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConviteAlunoConta" ADD CONSTRAINT "ConviteAlunoConta_escolaId_fkey"
  FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConviteAlunoConta" ADD CONSTRAINT "ConviteAlunoConta_professorId_fkey"
  FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConviteAlunoConta" ADD CONSTRAINT "ConviteAlunoConta_alunoId_fkey"
  FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE SET NULL ON UPDATE CASCADE;
