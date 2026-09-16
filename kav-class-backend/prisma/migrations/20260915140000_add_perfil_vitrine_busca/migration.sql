-- ============================================================================
-- Rede Social Fase 3 (perfil vitrine + busca/descoberta) — 100% aditivo,
-- só colunas nullable novas, sem índice/constraint, sem CONCURRENTLY
-- necessário (nenhuma delas é única).
-- ============================================================================

ALTER TABLE "Professor" ADD COLUMN IF NOT EXISTS "bio" TEXT;
ALTER TABLE "Professor" ADD COLUMN IF NOT EXISTS "cidade" TEXT;
ALTER TABLE "Professor" ADD COLUMN IF NOT EXISTS "estado" TEXT;
ALTER TABLE "Professor" ADD COLUMN IF NOT EXISTS "videoApresentacaoUrl" TEXT;

ALTER TABLE "Escola" ADD COLUMN IF NOT EXISTS "bio" TEXT;
ALTER TABLE "Escola" ADD COLUMN IF NOT EXISTS "cidade" TEXT;
ALTER TABLE "Escola" ADD COLUMN IF NOT EXISTS "estado" TEXT;
