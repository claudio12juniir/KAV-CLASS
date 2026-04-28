-- Repair migration: add Stripe columns if they don't already exist (idempotent)
ALTER TABLE "Professor" ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;
ALTER TABLE "Professor" ADD COLUMN IF NOT EXISTS "assinaturaStatus" TEXT NOT NULL DEFAULT 'INATIVO';
ALTER TABLE "Professor" ADD COLUMN IF NOT EXISTS "assinaturaFim" TIMESTAMP(3);
ALTER TABLE "Professor" ADD COLUMN IF NOT EXISTS "stripeSessionId" TEXT;
