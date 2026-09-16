-- ============================================================================
-- Rede Social Fase 1, Step 2 (multi-vínculo de verdade) — parte 1/2.
--
-- Índices compostos novos, em arquivo PRÓPRIO por causa de CONCURRENTLY
-- (mesmo motivo de 20260915120001_add_conta_indices_concurrently: `prisma
-- db execute --file` roda o arquivo inteiro numa transação implícita, e
-- CONCURRENTLY não roda dentro de transação).
--
-- Seguros de criar agora, ANTES de derrubar os índices antigos (ver parte
-- 2/2): como "Aluno_email_key"/"Professor_email_key" ainda garantem e-mail
-- único globalmente nesse momento, e-mail+escolaId já é trivialmente único
-- também — CREATE UNIQUE INDEX CONCURRENTLY não pode falhar por duplicata
-- aqui.
--
-- SÓ RODAR ISSO EM PRODUÇÃO DEPOIS de:
--   1. A Step 1 (Conta) já estar rodando estável há um tempo
--      (USAR_CONTA_NO_LOGIN=true, backfill feito).
--   2. Ter confirmado (auditoria de código) que NENHUM lugar no server.js
--      ainda faz findUnique/update em Aluno/Professor usando só `email` —
--      esses pontos passam a ser inválidos assim que a parte 2/2 rodar,
--      independente de qualquer env var (é o Prisma Client que rejeita a
--      consulta, não uma checagem condicional). Ver MULTI_VINCULO_HABILITADO
--      no server.js pra saber o que É gateado por env var (criação de um
--      segundo vínculo) — isto aqui não é.
-- ============================================================================

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "Aluno_email_escolaId_key" ON "Aluno"("email", "escolaId");
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "Professor_email_escolaId_key" ON "Professor"("email", "escolaId");
