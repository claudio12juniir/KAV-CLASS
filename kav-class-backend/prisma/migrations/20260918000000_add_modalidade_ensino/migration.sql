-- ============================================================================
-- Roadmap "Rede Social real" — Epic A: modalidade de ensino
-- (Presencial/Remoto/Online) em Professor e Escola. 100% aditivo: enum novo
-- + coluna array NOT NULL com default ['PRESENCIAL'], preserva o
-- comportamento atual pra todo mundo já cadastrado.
-- ============================================================================

CREATE TYPE "ModalidadeEnsino" AS ENUM ('PRESENCIAL', 'REMOTO', 'ONLINE');

ALTER TABLE "Professor" ADD COLUMN IF NOT EXISTS "modalidadeEnsino" "ModalidadeEnsino"[] NOT NULL DEFAULT ARRAY['PRESENCIAL']::"ModalidadeEnsino"[];

ALTER TABLE "Escola" ADD COLUMN IF NOT EXISTS "modalidadeEnsino" "ModalidadeEnsino"[] NOT NULL DEFAULT ARRAY['PRESENCIAL']::"ModalidadeEnsino"[];
