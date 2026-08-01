-- ============================================================================
-- FASE 1 — hardening: enums tipados, índices de performance, FK do Material
-- e correção de drift (Professor.codigoConvite sem índice único no banco).
--
-- Escrita à mão em vez de usar o SQL que `prisma migrate diff` gerou
-- automaticamente: o gerador propôs DROP COLUMN + ADD COLUMN para cada
-- coluna que virou enum, o que apagaria os dados reais dessas colunas
-- (status de aula, pagamento, assinatura etc.). Aqui usamos
-- ALTER COLUMN ... TYPE ... USING para converter preservando os valores.
--
-- Verificado antes de escrever isto (somente leitura, produção):
--   - Todos os valores distintos hoje em cada coluna batem com os enums abaixo.
--   - Professor.codigoConvite não tem valores duplicados.
--   - Material.alunoId não tem nenhum órfão (todos apontam pra um Aluno real).
-- ============================================================================

-- ─── ENUMS ──────────────────────────────────────────────────────────────
CREATE TYPE "StatusAluno" AS ENUM ('PENDENTE', 'ATIVO', 'INATIVO');
CREATE TYPE "StatusAssinaturaProfessor" AS ENUM ('PENDENTE', 'ATIVO', 'INATIVO', 'VITALICIO', 'CANCELADO');
CREATE TYPE "RecorrenciaAula" AS ENUM ('SEMANAL', 'QUINZENAL', 'MENSAL');
CREATE TYPE "StatusAula" AS ENUM ('AGENDADA', 'CONCLUIDA', 'CANCELADA');
CREATE TYPE "TipoAula" AS ENUM ('REGULAR', 'REPOSICAO', 'GRUPO');
CREATE TYPE "PresencaAula" AS ENUM ('PRESENTE', 'AUSENCIA_PROFESSOR', 'AUSENCIA_ALUNO', 'PENDENTE_REPOSICAO');
CREATE TYPE "StatusPagamento" AS ENUM ('PENDENTE', 'PAGO', 'ATRASADO', 'EM_ANALISE', 'CANCELADO');
CREATE TYPE "MetodoPagamento" AS ENUM ('PIX', 'CARTAO', 'BOLETO');
CREATE TYPE "TipoMaterial" AS ENUM ('TEXTO', 'LINK', 'VIDEO', 'IMAGEM', 'ARQUIVO', 'AUDIO');
CREATE TYPE "TipoNotificacao" AS ENUM ('CONTRATO_EXPIRADO', 'CONTRATO_EXPIRANDO', 'NOVO_ALUNO', 'ALUNO_ATIVADO');
CREATE TYPE "StatusReposicao" AS ENUM ('AGUARDANDO', 'CONFIRMADA', 'SOLICITANDO_OUTRO');

-- ─── ALUNO ──────────────────────────────────────────────────────────────
-- Coluna nova: precisa de um valor temporário pra não quebrar as linhas existentes.
ALTER TABLE "Aluno" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Aluno" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Aluno" ALTER COLUMN "status" TYPE "StatusAluno" USING ("status"::text::"StatusAluno");
ALTER TABLE "Aluno" ALTER COLUMN "status" SET DEFAULT 'PENDENTE';

ALTER TABLE "Aluno" ALTER COLUMN "recorrenciaAula" TYPE "RecorrenciaAula" USING ("recorrenciaAula"::text::"RecorrenciaAula");

-- ─── AULA ───────────────────────────────────────────────────────────────
ALTER TABLE "Aula" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Aula" ALTER COLUMN "status" TYPE "StatusAula" USING ("status"::text::"StatusAula");
ALTER TABLE "Aula" ALTER COLUMN "status" SET DEFAULT 'AGENDADA';

ALTER TABLE "Aula" ALTER COLUMN "tipo" DROP DEFAULT;
ALTER TABLE "Aula" ALTER COLUMN "tipo" TYPE "TipoAula" USING ("tipo"::text::"TipoAula");
ALTER TABLE "Aula" ALTER COLUMN "tipo" SET DEFAULT 'REGULAR';

ALTER TABLE "Aula" ALTER COLUMN "presenca" TYPE "PresencaAula" USING ("presenca"::text::"PresencaAula");

-- ─── PAGAMENTO ──────────────────────────────────────────────────────────
ALTER TABLE "Pagamento" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Pagamento" ALTER COLUMN "status" TYPE "StatusPagamento" USING ("status"::text::"StatusPagamento");
ALTER TABLE "Pagamento" ALTER COLUMN "status" SET DEFAULT 'PENDENTE';

ALTER TABLE "Pagamento" ALTER COLUMN "metodo" TYPE "MetodoPagamento" USING ("metodo"::text::"MetodoPagamento");

-- ─── MATERIAL ───────────────────────────────────────────────────────────
ALTER TABLE "Material" ALTER COLUMN "tipo" TYPE "TipoMaterial" USING ("tipo"::text::"TipoMaterial");

-- ─── NOTIFICACAO ────────────────────────────────────────────────────────
ALTER TABLE "Notificacao" ALTER COLUMN "tipo" TYPE "TipoNotificacao" USING ("tipo"::text::"TipoNotificacao");

-- ─── PROFESSOR ──────────────────────────────────────────────────────────
ALTER TABLE "Professor" ALTER COLUMN "assinaturaStatus" DROP DEFAULT;
ALTER TABLE "Professor" ALTER COLUMN "assinaturaStatus" TYPE "StatusAssinaturaProfessor" USING ("assinaturaStatus"::text::"StatusAssinaturaProfessor");
ALTER TABLE "Professor" ALTER COLUMN "assinaturaStatus" SET DEFAULT 'INATIVO';

-- Drift: a migration inicial criava esse índice único, mas ele não existe
-- mais no banco (foi removido em algum momento fora do controle do Prisma).
-- Já verificado: nenhum codigoConvite duplicado hoje.
CREATE UNIQUE INDEX "Professor_codigoConvite_key" ON "Professor"("codigoConvite");

-- ─── REPOSICAO ──────────────────────────────────────────────────────────
ALTER TABLE "Reposicao" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Reposicao" ALTER COLUMN "status" TYPE "StatusReposicao" USING ("status"::text::"StatusReposicao");
ALTER TABLE "Reposicao" ALTER COLUMN "status" SET DEFAULT 'AGUARDANDO';

-- ─── ÍNDICES DE PERFORMANCE ─────────────────────────────────────────────
CREATE INDEX "Aluno_professorId_status_idx" ON "Aluno"("professorId", "status");
CREATE INDEX "Aluno_status_idx" ON "Aluno"("status");

CREATE INDEX "Aula_professorId_dataHora_idx" ON "Aula"("professorId", "dataHora");
CREATE INDEX "Aula_alunoId_dataHora_idx" ON "Aula"("alunoId", "dataHora");
CREATE INDEX "Aula_alunoId_status_idx" ON "Aula"("alunoId", "status");
CREATE INDEX "Aula_professorId_presenca_dataHora_idx" ON "Aula"("professorId", "presenca", "dataHora");

CREATE INDEX "Material_professorId_idx" ON "Material"("professorId");
CREATE INDEX "Material_alunoId_idx" ON "Material"("alunoId");
CREATE INDEX "Material_aulaId_idx" ON "Material"("aulaId");

CREATE INDEX "Mensagem_alunoId_createdAt_idx" ON "Mensagem"("alunoId", "createdAt");
CREATE INDEX "Mensagem_professorId_remetente_idx" ON "Mensagem"("professorId", "remetente");

CREATE INDEX "Notificacao_professorId_lida_idx" ON "Notificacao"("professorId", "lida");
CREATE INDEX "Notificacao_professorId_tipo_idx" ON "Notificacao"("professorId", "tipo");

CREATE INDEX "Pagamento_professorId_status_idx" ON "Pagamento"("professorId", "status");
CREATE INDEX "Pagamento_professorId_vencimento_idx" ON "Pagamento"("professorId", "vencimento");
CREATE INDEX "Pagamento_alunoId_vencimento_idx" ON "Pagamento"("alunoId", "vencimento");

CREATE INDEX "Professor_stripeCustomerId_idx" ON "Professor"("stripeCustomerId");

CREATE INDEX "Reposicao_professorId_idx" ON "Reposicao"("professorId");
CREATE INDEX "Reposicao_alunoId_idx" ON "Reposicao"("alunoId");

CREATE INDEX "TokenRedefinicaoSenha_email_usado_idx" ON "TokenRedefinicaoSenha"("email", "usado");

-- ─── FK QUE FALTAVA (Material.alunoId era string solta, sem relação real) ─
-- Verificado: nenhum órfão hoje (todo alunoId aponta pra um Aluno existente).
ALTER TABLE "Material" ADD CONSTRAINT "Material_alunoId_fkey"
  FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE SET NULL ON UPDATE CASCADE;
