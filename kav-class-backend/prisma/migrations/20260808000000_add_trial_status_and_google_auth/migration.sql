-- ============================================================================
-- Teste grátis de 15 dias (Professor) + campos para login com Google.
-- 100% aditivo: novo valor de enum + colunas nullable. Não altera nem
-- remove nada que já existe, não afeta professores ATIVO/VITALICIO atuais.
-- ============================================================================

-- AlterEnum
ALTER TYPE "StatusAssinaturaProfessor" ADD VALUE IF NOT EXISTS 'TESTE';

-- AlterTable: Professor
ALTER TABLE "Professor" ADD COLUMN IF NOT EXISTS "dataNascimento" TIMESTAMP(3);
ALTER TABLE "Professor" ADD COLUMN IF NOT EXISTS "googleId" TEXT;

-- AlterTable: Aluno
ALTER TABLE "Aluno" ADD COLUMN IF NOT EXISTS "dataNascimento" TIMESTAMP(3);
ALTER TABLE "Aluno" ADD COLUMN IF NOT EXISTS "googleId" TEXT;

-- Índices únicos (nullable — múltiplos NULL são permitidos pelo Postgres)
CREATE UNIQUE INDEX IF NOT EXISTS "Professor_googleId_key" ON "Professor"("googleId");
CREATE UNIQUE INDEX IF NOT EXISTS "Aluno_googleId_key" ON "Aluno"("googleId");
