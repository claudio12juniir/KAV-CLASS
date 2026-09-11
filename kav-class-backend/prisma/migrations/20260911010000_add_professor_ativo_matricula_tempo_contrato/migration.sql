-- ============================================================================
-- Pendências da auditoria de conexão INSTITUTION (11/09/2026): 100% aditivo,
-- nenhuma coluna existente muda de tipo, sem backfill.
--
-- Professor.ativoNaEscola: soft delete de "remover professor da Equipe" —
-- professorId é obrigatório em 11 tabelas (Aula, Matricula, Pagamento,
-- Avaliacao, FolhaPagamentoProfessor etc), então desligar só marca esta
-- flag, nunca apaga a linha.
--
-- Matricula.tempoContrato: espelha o campo legado Aluno.tempoContrato, mas
-- por Matricula — um Aluno pode ter mais de uma Matricula ativa (Sprint 5),
-- então "duração do contrato" também precisa ser por matrícula. Usado pela
-- renovação em lote, que deixa de ler/gravar em Aluno.
-- ============================================================================

ALTER TABLE "Professor" ADD COLUMN IF NOT EXISTS "ativoNaEscola" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Matricula" ADD COLUMN IF NOT EXISTS "tempoContrato" INTEGER;
