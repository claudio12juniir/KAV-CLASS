-- ============================================================================
-- Cobrança automática Aluno → Escola via Asaas (Pix/Boleto/Cartão), somada
-- ao Stripe Connect já existente (migration
-- 20260902000000_add_cobranca_automatica_stripe_connect). 100% aditivo:
-- colunas nullable/com default em Escola, Matricula e Pagamento. Nenhuma
-- coluna existente muda de tipo, sem backfill.
--
-- Diferença de modelo pro Stripe: aqui cada Escola traz a própria conta
-- Asaas (API Key própria, sem subconta/split via plataforma) — por isso
-- asaasApiKeyCriptografada guarda um SEGREDO cifrado (AES-256-GCM, chave
-- mestra em ASAAS_ENCRYPTION_KEY), não só um ID como stripeConnectAccountId.
-- asaasWebhookToken é o que o endpoint único /asaas/webhook usa pra
-- descobrir de qual Escola veio o evento (cada Escola cola esse token no
-- próprio painel Asaas dela).
-- ============================================================================

-- CreateEnum
CREATE TYPE "GatewayCobranca" AS ENUM ('STRIPE', 'ASAAS');

ALTER TABLE "Escola" ADD COLUMN IF NOT EXISTS "asaasApiKeyCriptografada" TEXT;
ALTER TABLE "Escola" ADD COLUMN IF NOT EXISTS "asaasApiKeyUltimos4" TEXT;
ALTER TABLE "Escola" ADD COLUMN IF NOT EXISTS "asaasWebhookToken" TEXT;

ALTER TABLE "Matricula" ADD COLUMN IF NOT EXISTS "gatewayCobranca" "GatewayCobranca";
ALTER TABLE "Matricula" ADD COLUMN IF NOT EXISTS "asaasCustomerId" TEXT;
ALTER TABLE "Matricula" ADD COLUMN IF NOT EXISTS "asaasSubscriptionId" TEXT;

ALTER TABLE "Pagamento" ADD COLUMN IF NOT EXISTS "asaasPaymentId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Escola_asaasWebhookToken_key" ON "Escola"("asaasWebhookToken");
CREATE INDEX IF NOT EXISTS "Matricula_asaasSubscriptionId_idx" ON "Matricula"("asaasSubscriptionId");
CREATE INDEX IF NOT EXISTS "Pagamento_asaasPaymentId_idx" ON "Pagamento"("asaasPaymentId");
