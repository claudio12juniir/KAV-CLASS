-- ============================================================================
-- Fundação de identidade unificada (Rede Social Fase 1, Step 1) — 100%
-- aditivo. Nenhuma constraint/coluna existente é alterada de forma
-- destrutiva; Aluno.email/Professor.email continuam @unique globais nesta
-- Step (o relaxamento pra @@unique([email, escolaId]), que desbloqueia de
-- verdade múltiplos vínculos, é a Step 2 — migration separada, só depois
-- desta rodar em produção sem problema por um tempo).
--
-- Aluno.senha/Professor.senha viram nullable só pra permitir que uma futura
-- segunda linha (Step 2, ex: professor SELF) não precise de senha própria —
-- login passa a autenticar via Conta.senha; as linhas existentes continuam
-- com senha preenchida, sem rewrite de dado nenhum.
--
-- FKs criadas com NOT VALID: evita lock/scan completo das tabelas Aluno/
-- Professor agora. Ficam plenamente válidas pra escritas novas (Postgres já
-- aplica NOT VALID em INSERT/UPDATE, só pula a varredura do dado existente).
-- Não há migration de VALIDATE CONSTRAINT separada — como contaId nasce
-- NULL em toda linha existente, validar a constraint depois do backfill
-- (scripts/backfill-conta.js) é só uma otimização de planner, não uma
-- correção necessária; documentado como passo manual opcional no próprio
-- script de backfill.
-- ============================================================================

CREATE TABLE "Conta" (
    "id"        TEXT NOT NULL,
    "email"     TEXT NOT NULL,
    "senha"     TEXT,
    "googleId"  TEXT,
    "nome"      TEXT,
    "fotoUrl"   TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Conta_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Professor" ADD COLUMN IF NOT EXISTS "contaId" TEXT;
ALTER TABLE "Professor" ADD COLUMN IF NOT EXISTS "visivelBuscaSelf" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Professor" ALTER COLUMN "senha" DROP NOT NULL;

ALTER TABLE "Aluno" ADD COLUMN IF NOT EXISTS "contaId" TEXT;
ALTER TABLE "Aluno" ALTER COLUMN "senha" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "Professor_contaId_idx" ON "Professor"("contaId");
CREATE INDEX IF NOT EXISTS "Aluno_contaId_idx" ON "Aluno"("contaId");

ALTER TABLE "Professor" ADD CONSTRAINT "Professor_contaId_fkey"
  FOREIGN KEY ("contaId") REFERENCES "Conta"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
ALTER TABLE "Aluno" ADD CONSTRAINT "Aluno_contaId_fkey"
  FOREIGN KEY ("contaId") REFERENCES "Conta"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
