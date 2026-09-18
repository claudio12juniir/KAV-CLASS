-- ============================================================================
-- Roadmap "Rede Social real" — Epic C: planos em 2 níveis (Básico/Completo)
-- em Professor e Escola. 100% aditivo: enum novo + coluna NOT NULL com
-- default BASICO, preserva o comportamento atual (ninguém aparece na busca
-- até fazer upgrade pra Completo).
-- ============================================================================

CREATE TYPE "NivelPlano" AS ENUM ('BASICO', 'COMPLETO');

ALTER TABLE "Professor" ADD COLUMN IF NOT EXISTS "nivelPlano" "NivelPlano" NOT NULL DEFAULT 'BASICO';

ALTER TABLE "Escola" ADD COLUMN IF NOT EXISTS "nivelPlano" "NivelPlano" NOT NULL DEFAULT 'BASICO';
