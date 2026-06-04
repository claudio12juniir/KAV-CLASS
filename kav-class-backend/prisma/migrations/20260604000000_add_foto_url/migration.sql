-- AlterTable: add fotoUrl to Professor and Aluno
ALTER TABLE "Professor" ADD COLUMN IF NOT EXISTS "fotoUrl" TEXT;
ALTER TABLE "Aluno" ADD COLUMN IF NOT EXISTS "fotoUrl" TEXT;
