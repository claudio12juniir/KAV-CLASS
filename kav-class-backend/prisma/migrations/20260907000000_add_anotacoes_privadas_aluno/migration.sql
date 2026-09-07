-- Anotação privada do professor sobre o aluno (ideia nova, S6.x) — coluna
-- nullable, 100% aditiva, sem efeito em nenhum aluno existente.

ALTER TABLE "Aluno" ADD COLUMN IF NOT EXISTS "anotacoesPrivadas" TEXT;
