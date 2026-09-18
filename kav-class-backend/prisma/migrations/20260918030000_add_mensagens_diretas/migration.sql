-- ============================================================================
-- Rede Social — Mensagens diretas abertas (estilo Instagram, 18/09/2026).
-- 100% aditivo: enum novo + 2 tabelas novas. Não toca em "Mensagem"
-- (continua servindo só o mural de turma) nem em nenhuma tabela existente.
-- ============================================================================

CREATE TYPE "TipoParticipanteDM" AS ENUM ('PROFESSOR', 'ALUNO');

CREATE TABLE "ConversaDireta" (
    "id"                TEXT NOT NULL,
    "participanteATipo" "TipoParticipanteDM" NOT NULL,
    "participanteAId"   TEXT NOT NULL,
    "participanteBTipo" "TipoParticipanteDM" NOT NULL,
    "participanteBId"   TEXT NOT NULL,
    "ultimaMensagemEm"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConversaDireta_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MensagemDireta" (
    "id"         TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "autorTipo"  "TipoParticipanteDM" NOT NULL,
    "autorId"    TEXT NOT NULL,
    "texto"      TEXT NOT NULL,
    "lida"       BOOLEAN NOT NULL DEFAULT false,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MensagemDireta_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConversaDireta_participanteATipo_participanteAId_participan_key" ON "ConversaDireta"("participanteATipo", "participanteAId", "participanteBTipo", "participanteBId");
CREATE INDEX "ConversaDireta_participanteATipo_participanteAId_ultimaMens_idx" ON "ConversaDireta"("participanteATipo", "participanteAId", "ultimaMensagemEm");
CREATE INDEX "ConversaDireta_participanteBTipo_participanteBId_ultimaMens_idx" ON "ConversaDireta"("participanteBTipo", "participanteBId", "ultimaMensagemEm");

CREATE INDEX "MensagemDireta_conversaId_createdAt_idx" ON "MensagemDireta"("conversaId", "createdAt");

ALTER TABLE "MensagemDireta" ADD CONSTRAINT "MensagemDireta_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "ConversaDireta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
