-- ============================================================================
-- Fix: "erro ao abrir arquivo" em Materiais (modo SELF) — guarda o nome do
-- arquivo original (com extensão de verdade) em vez de tentar adivinhar a
-- extensão pelo MIME type ao reabrir. 100% aditivo, coluna nullable nova.
-- ============================================================================

ALTER TABLE "Material" ADD COLUMN IF NOT EXISTS "nomeArquivo" TEXT;
