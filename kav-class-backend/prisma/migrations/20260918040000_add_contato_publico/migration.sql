-- ============================================================================
-- Rede Social — contato público no perfil vitrine (WhatsApp/e-mail),
-- 18/09/2026. 100% aditivo, colunas nullable novas.
-- ============================================================================

ALTER TABLE "Professor" ADD COLUMN IF NOT EXISTS "whatsapp" TEXT;
ALTER TABLE "Professor" ADD COLUMN IF NOT EXISTS "emailContato" TEXT;

ALTER TABLE "Escola" ADD COLUMN IF NOT EXISTS "whatsapp" TEXT;
