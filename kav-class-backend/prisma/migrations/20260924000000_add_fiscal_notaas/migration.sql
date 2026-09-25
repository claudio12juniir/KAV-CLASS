-- Fiscal — emissão de NFS-e via Notaas (INSTITUTION Sprints 27/28, briefing
-- 24/09/2026). 100% aditivo. Escrita à mão + db execute + migrate resolve,
-- mesmo fluxo já registrado em feedback_prisma_migrate_dev_broken.

CREATE TYPE "TipoNotaFiscal" AS ENUM ('ALUNO_PARA_ESCOLA', 'PROFESSOR_PARA_ESCOLA');
CREATE TYPE "StatusNotaFiscal" AS ENUM ('PENDENTE', 'EMITIDA', 'ERRO', 'CANCELADA');

ALTER TABLE "Escola" ADD COLUMN "notaasApiKeyCriptografada" TEXT;
ALTER TABLE "Escola" ADD COLUMN "notaasApiKeyUltimos4" TEXT;
ALTER TABLE "Escola" ADD COLUMN "notaasWebhookToken" TEXT;
ALTER TABLE "Escola" ADD COLUMN "notaasCodigoServicoPadrao" TEXT;
ALTER TABLE "Escola" ADD COLUMN "notaasAliquotaIssPadrao" DOUBLE PRECISION;
ALTER TABLE "Escola" ADD COLUMN "cnpj" TEXT;
ALTER TABLE "Escola" ADD COLUMN "inscricaoMunicipal" TEXT;
ALTER TABLE "Escola" ADD COLUMN "regimeTributario" TEXT;
ALTER TABLE "Escola" ADD COLUMN "exigeNotaProfessor" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "Escola_notaasWebhookToken_key" ON "Escola"("notaasWebhookToken");

ALTER TABLE "Professor" ADD COLUMN "cnpj" TEXT;
ALTER TABLE "Professor" ADD COLUMN "notaasApiKeyCriptografada" TEXT;
ALTER TABLE "Professor" ADD COLUMN "notaasApiKeyUltimos4" TEXT;
ALTER TABLE "Professor" ADD COLUMN "notaasWebhookToken" TEXT;
CREATE UNIQUE INDEX "Professor_notaasWebhookToken_key" ON "Professor"("notaasWebhookToken");

CREATE TABLE "NotaFiscal" (
    "id" TEXT NOT NULL,
    "tipo" "TipoNotaFiscal" NOT NULL,
    "status" "StatusNotaFiscal" NOT NULL DEFAULT 'PENDENTE',
    "valor" DOUBLE PRECISION NOT NULL,
    "notaasInvoiceId" TEXT,
    "numeroNota" TEXT,
    "chaveAcesso" TEXT,
    "pdfUrl" TEXT,
    "xmlUrl" TEXT,
    "erro" TEXT,
    "escolaId" TEXT NOT NULL,
    "professorId" TEXT,
    "pagamentoId" TEXT,
    "folhaPagamentoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emitidaEm" TIMESTAMP(3),

    CONSTRAINT "NotaFiscal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotaFiscal_notaasInvoiceId_key" ON "NotaFiscal"("notaasInvoiceId");
CREATE UNIQUE INDEX "NotaFiscal_pagamentoId_key" ON "NotaFiscal"("pagamentoId");
CREATE UNIQUE INDEX "NotaFiscal_folhaPagamentoId_key" ON "NotaFiscal"("folhaPagamentoId");
CREATE INDEX "NotaFiscal_escolaId_status_idx" ON "NotaFiscal"("escolaId", "status");
CREATE INDEX "NotaFiscal_professorId_status_idx" ON "NotaFiscal"("professorId", "status");

ALTER TABLE "NotaFiscal" ADD CONSTRAINT "NotaFiscal_escolaId_fkey"
  FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NotaFiscal" ADD CONSTRAINT "NotaFiscal_professorId_fkey"
  FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NotaFiscal" ADD CONSTRAINT "NotaFiscal_pagamentoId_fkey"
  FOREIGN KEY ("pagamentoId") REFERENCES "Pagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NotaFiscal" ADD CONSTRAINT "NotaFiscal_folhaPagamentoId_fkey"
  FOREIGN KEY ("folhaPagamentoId") REFERENCES "FolhaPagamentoProfessor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
