-- =============================================================================
-- Migration: add_missing_fields_and_tables
-- Sincroniza o banco de dados com o schema.prisma atual.
-- Resolve o schema drift acumulado desde a migração inicial (20260410210833_init).
-- =============================================================================

-- ── Professor ─────────────────────────────────────────────────────────────────
-- codigoConvite era NOT NULL na init; schema.prisma atual define como String?
ALTER TABLE "Professor" ALTER COLUMN "codigoConvite" DROP NOT NULL;

ALTER TABLE "Professor" ADD COLUMN "expoPushToken"       TEXT;
ALTER TABLE "Professor" ADD COLUMN "chavePix"            TEXT;
ALTER TABLE "Professor" ADD COLUMN "linkPagamentoCartao" TEXT;

-- ── Aluno ─────────────────────────────────────────────────────────────────────
-- dataNascimento existia na init mas foi removida do schema.prisma
ALTER TABLE "Aluno" DROP COLUMN IF EXISTS "dataNascimento";

ALTER TABLE "Aluno" ADD COLUMN "curso"               TEXT;
ALTER TABLE "Aluno" ADD COLUMN "expoPushToken"       TEXT;
ALTER TABLE "Aluno" ADD COLUMN "status"              TEXT NOT NULL DEFAULT 'PENDENTE';
ALTER TABLE "Aluno" ADD COLUMN "valorMensalidade"    DOUBLE PRECISION;
ALTER TABLE "Aluno" ADD COLUMN "diaVencimento"       INTEGER;
ALTER TABLE "Aluno" ADD COLUMN "recorrenciaAula"     TEXT;
ALTER TABLE "Aluno" ADD COLUMN "diaSemanaAula"       TEXT;
ALTER TABLE "Aluno" ADD COLUMN "diaSemanaNumero"     INTEGER;
ALTER TABLE "Aluno" ADD COLUMN "horarioAula"         TEXT;
ALTER TABLE "Aluno" ADD COLUMN "tempoContrato"       INTEGER;
ALTER TABLE "Aluno" ADD COLUMN "dataInicioContrato"  TIMESTAMP(3);

-- ── Material ──────────────────────────────────────────────────────────────────
-- Adiciona a FK para Aula (relação Material → Aula)
ALTER TABLE "Material" ADD COLUMN "aulaId" TEXT;

ALTER TABLE "Material" ADD CONSTRAINT "Material_aulaId_fkey"
  FOREIGN KEY ("aulaId") REFERENCES "Aula"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Mensagem ──────────────────────────────────────────────────────────────────
CREATE TABLE "Mensagem" (
    "id"        TEXT         NOT NULL,
    "texto"     TEXT         NOT NULL,
    "remetente" TEXT         NOT NULL,
    "alunoId"   TEXT         NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mensagem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Mensagem" ADD CONSTRAINT "Mensagem_alunoId_fkey"
  FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Notificacao ───────────────────────────────────────────────────────────────
CREATE TABLE "Notificacao" (
    "id"          TEXT         NOT NULL,
    "tipo"        TEXT         NOT NULL,
    "titulo"      TEXT         NOT NULL,
    "mensagem"    TEXT         NOT NULL,
    "lida"        BOOLEAN      NOT NULL DEFAULT false,
    "dadosExtra"  TEXT,
    "professorId" TEXT         NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notificacao_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Notificacao" ADD CONSTRAINT "Notificacao_professorId_fkey"
  FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── TokenRedefinicaoSenha ─────────────────────────────────────────────────────
CREATE TABLE "TokenRedefinicaoSenha" (
    "id"        TEXT         NOT NULL,
    "email"     TEXT         NOT NULL,
    "token"     TEXT         NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usado"     BOOLEAN      NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenRedefinicaoSenha_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TokenRedefinicaoSenha_token_key" ON "TokenRedefinicaoSenha"("token");

-- ── Reposicao ─────────────────────────────────────────────────────────────────
CREATE TABLE "Reposicao" (
    "id"           TEXT         NOT NULL,
    "professorId"  TEXT         NOT NULL,
    "alunoId"      TEXT         NOT NULL,
    "dataOriginal" TEXT,
    "dataProposta" TEXT         NOT NULL,
    "motivo"       TEXT         NOT NULL,
    "status"       TEXT         NOT NULL DEFAULT 'AGUARDANDO',
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reposicao_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Reposicao" ADD CONSTRAINT "Reposicao_professorId_fkey"
  FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Reposicao" ADD CONSTRAINT "Reposicao_alunoId_fkey"
  FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
