-- ============================================================================
-- Rede Social Fase 1, Step 2 (multi-vínculo de verdade) — parte 2/2.
--
-- Derruba os índices únicos de e-mail sozinho, agora que os compostos
-- (email, escolaId) da parte 1/2 já existem e estão validados. A partir
-- daqui, o mesmo e-mail PODE ter mais de uma linha Aluno/Professor, desde
-- que em escolaId diferentes — é isto que desbloqueia de verdade o "mesmo
-- login em várias escolas/professores" e o professor SELF + institucional.
--
-- DROP INDEX (não DROP CONSTRAINT): "Aluno_email_key"/"Professor_email_key"
-- nasceram como índice único simples (init migration, sem constraint de
-- tabela formal por trás) — ver prisma/migrations/20260410210833_init.
-- Operação rápida, metadado only, não escaneia a tabela.
--
-- IRREVERSÍVEL NA PRÁTICA a partir do momento em que uma segunda linha por
-- e-mail existir de verdade (POST /api/professor/self/ativar ou cadastro de
-- aluno anexando a uma Conta existente): reverter para @unique(email)
-- sozinho exigiria antes migrar/mesclar essas linhas. Rodar só depois da
-- checagem de pré-voo descrita em 20260915130000.
-- ============================================================================

DROP INDEX IF EXISTS "Aluno_email_key";
DROP INDEX IF EXISTS "Professor_email_key";
