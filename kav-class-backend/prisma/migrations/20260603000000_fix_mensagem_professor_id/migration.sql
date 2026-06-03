-- Corrige schema drift: adiciona professorId à tabela Mensagem
-- e torna alunoId nullable (schema.prisma define como String? para ambos)
ALTER TABLE "Mensagem" ADD COLUMN "professorId" TEXT;

ALTER TABLE "Mensagem"
  ADD CONSTRAINT "Mensagem_professorId_fkey"
  FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Mensagem" ALTER COLUMN "alunoId" DROP NOT NULL;
