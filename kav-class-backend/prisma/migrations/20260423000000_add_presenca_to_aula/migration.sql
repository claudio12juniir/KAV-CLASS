-- Adiciona a coluna presenca na tabela Aula
ALTER TABLE "Aula" ADD COLUMN IF NOT EXISTS "presenca" TEXT;
