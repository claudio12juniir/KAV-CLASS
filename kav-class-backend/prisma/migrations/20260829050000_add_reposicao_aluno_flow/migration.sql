-- ============================================================================
-- Fase 2 (S2.1) — Reposição iniciada pelo aluno, em duas camadas de
-- aprovação (professor autoriza, depois a Escola finaliza).
--
-- 100% aditivo: 4 novos valores de enum em StatusReposicao (mantém os 3 que
-- já existiam pro fluxo "professor propõe, aluno confirma"), um enum novo
-- (OrigemReposicao) e uma coluna NOT NULL com DEFAULT constante em
-- Reposicao — segura mesmo com linhas existentes porque o default é fixo
-- (Postgres aplica via fast default, sem reescrever a tabela) e semanticamente
-- correto: toda Reposicao de antes desta sprint era mesmo iniciada pelo
-- professor.
-- ============================================================================

ALTER TYPE "StatusReposicao" ADD VALUE IF NOT EXISTS 'SOLICITADA';
ALTER TYPE "StatusReposicao" ADD VALUE IF NOT EXISTS 'AUTORIZADA';
ALTER TYPE "StatusReposicao" ADD VALUE IF NOT EXISTS 'NEGADA';
ALTER TYPE "StatusReposicao" ADD VALUE IF NOT EXISTS 'FINALIZADA';

DO $$ BEGIN
  CREATE TYPE "OrigemReposicao" AS ENUM ('PROFESSOR', 'ALUNO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Reposicao" ADD COLUMN IF NOT EXISTS "origem" "OrigemReposicao" NOT NULL DEFAULT 'PROFESSOR';
