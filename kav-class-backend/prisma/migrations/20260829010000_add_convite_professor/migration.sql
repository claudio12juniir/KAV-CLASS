-- ============================================================================
-- Fase 0 (S0.2) — Convite de professor pra dentro de uma Escola existente.
--
-- 100% aditivo: cria só a tabela ConviteProfessor, nova e vazia. Não toca em
-- nenhuma tabela/coluna existente (Escola, Professor e Aluno já foram
-- alterados na migration anterior, 20260829000000_add_escola_multi_tenant).
-- Sem backfill necessário — tabela nasce sem linhas.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "ConviteProfessor" (
  "id"        TEXT NOT NULL,
  "email"     TEXT NOT NULL,
  "token"     TEXT NOT NULL,
  "papel"     "PapelUsuario" NOT NULL DEFAULT 'PROFESSOR',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "aceitoEm"  TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "escolaId"  TEXT NOT NULL,

  CONSTRAINT "ConviteProfessor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ConviteProfessor_token_key" ON "ConviteProfessor"("token");
CREATE INDEX IF NOT EXISTS "ConviteProfessor_escolaId_aceitoEm_idx" ON "ConviteProfessor"("escolaId", "aceitoEm");
CREATE INDEX IF NOT EXISTS "ConviteProfessor_email_idx" ON "ConviteProfessor"("email");

DO $$ BEGIN
  ALTER TABLE "ConviteProfessor" ADD CONSTRAINT "ConviteProfessor_escolaId_fkey"
    FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
