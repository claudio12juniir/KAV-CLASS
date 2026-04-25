-- AlterTable: add Stripe subscription fields to Professor
ALTER TABLE "Professor"
  ADD COLUMN "stripeCustomerId" TEXT,
  ADD COLUMN "assinaturaStatus" TEXT NOT NULL DEFAULT 'INATIVO',
  ADD COLUMN "assinaturaFim" TIMESTAMP(3),
  ADD COLUMN "stripeSessionId" TEXT;
