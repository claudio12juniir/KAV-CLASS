-- ============================================================================
-- Fase 5 (S5.5) — Estoque simples de produtos + link de aula online.
--
-- 100% aditivo: um enum novo, duas tabelas novas (Produto,
-- MovimentacaoEstoque) e uma coluna nova nullable em Aula (linkOnline).
-- Nenhuma coluna existente é alterada de tipo, sem backfill.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE "TipoMovimentacaoEstoque" AS ENUM ('ENTRADA', 'SAIDA', 'EMPRESTIMO', 'DEVOLUCAO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Aula" ADD COLUMN IF NOT EXISTS "linkOnline" TEXT;

CREATE TABLE IF NOT EXISTS "Produto" (
  "id"                TEXT NOT NULL,
  "nome"              TEXT NOT NULL,
  "descricao"         TEXT,
  "quantidadeEstoque" INTEGER NOT NULL DEFAULT 0,
  "ativo"             BOOLEAN NOT NULL DEFAULT true,
  "escolaId"          TEXT NOT NULL,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Produto_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MovimentacaoEstoque" (
  "id"         TEXT NOT NULL,
  "tipo"       "TipoMovimentacaoEstoque" NOT NULL,
  "quantidade" INTEGER NOT NULL,
  "observacao" TEXT,
  "produtoId"  TEXT NOT NULL,
  "alunoId"    TEXT,
  "escolaId"   TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MovimentacaoEstoque_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Produto_escolaId_idx" ON "Produto"("escolaId");
CREATE INDEX IF NOT EXISTS "MovimentacaoEstoque_produtoId_idx" ON "MovimentacaoEstoque"("produtoId");
CREATE INDEX IF NOT EXISTS "MovimentacaoEstoque_escolaId_idx" ON "MovimentacaoEstoque"("escolaId");
CREATE INDEX IF NOT EXISTS "MovimentacaoEstoque_alunoId_idx" ON "MovimentacaoEstoque"("alunoId");

DO $$ BEGIN
  ALTER TABLE "Produto" ADD CONSTRAINT "Produto_escolaId_fkey"
    FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "MovimentacaoEstoque" ADD CONSTRAINT "MovimentacaoEstoque_produtoId_fkey"
    FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "MovimentacaoEstoque" ADD CONSTRAINT "MovimentacaoEstoque_alunoId_fkey"
    FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "MovimentacaoEstoque" ADD CONSTRAINT "MovimentacaoEstoque_escolaId_fkey"
    FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
