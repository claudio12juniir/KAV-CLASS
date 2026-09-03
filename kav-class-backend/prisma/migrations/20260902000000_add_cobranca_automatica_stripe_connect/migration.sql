-- ============================================================================
-- Fase 3 (S3.1) — Cobrança automática Aluno → Escola via Stripe Connect
-- Express. 100% aditivo: colunas nullable/com default em Escola, Matricula
-- e Pagamento. Nenhuma coluna existente muda de tipo, sem backfill.
--
-- Não confundir com as colunas Stripe já existentes em "Professor"
-- (stripeCustomerId/assinaturaStatus/...): aquelas são a assinatura SaaS
-- Escola→Kav Class, na conta Stripe da própria plataforma. As colunas daqui
-- são Aluno→Escola, roteadas pra conta CONECTADA de cada Escola.
-- ============================================================================

ALTER TABLE "Escola" ADD COLUMN IF NOT EXISTS "stripeConnectAccountId" TEXT;
ALTER TABLE "Escola" ADD COLUMN IF NOT EXISTS "stripeConnectOnboardingCompleto" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Matricula" ADD COLUMN IF NOT EXISTS "cobrancaAutomaticaAtiva" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Matricula" ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;
ALTER TABLE "Matricula" ADD COLUMN IF NOT EXISTS "stripePaymentMethodId" TEXT;
ALTER TABLE "Matricula" ADD COLUMN IF NOT EXISTS "cobrancaUltimoErro" TEXT;
ALTER TABLE "Matricula" ADD COLUMN IF NOT EXISTS "cobrancaUltimaTentativa" TIMESTAMP(3);

ALTER TABLE "Pagamento" ADD COLUMN IF NOT EXISTS "viaCobrancaAutomatica" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Pagamento" ADD COLUMN IF NOT EXISTS "stripePaymentIntentId" TEXT;

CREATE INDEX IF NOT EXISTS "Matricula_stripeCustomerId_idx" ON "Matricula"("stripeCustomerId");
CREATE INDEX IF NOT EXISTS "Pagamento_stripePaymentIntentId_idx" ON "Pagamento"("stripePaymentIntentId");
