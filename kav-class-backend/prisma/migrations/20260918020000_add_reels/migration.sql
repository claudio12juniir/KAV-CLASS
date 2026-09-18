-- ============================================================================
-- Roadmap "Rede Social real" — Epic D: Reels. 3 tabelas novas + 1 enum,
-- 100% aditivo (mesmo padrão de PostCurtida/PostComentario em
-- 20260915150000_add_feed_posts). Tabelas vazias recém-criadas: nenhum
-- índice aqui precisa de CONCURRENTLY.
-- ============================================================================

CREATE TYPE "StatusReel" AS ENUM ('PROCESSANDO', 'PRONTO', 'ERRO');

CREATE TABLE "Reel" (
    "id"                 TEXT NOT NULL,
    "videoId"            TEXT NOT NULL,
    "thumbnailUrl"       TEXT,
    "duracaoSegundos"    INTEGER,
    "descricao"          TEXT,
    "status"             "StatusReel" NOT NULL DEFAULT 'PROCESSANDO',
    "totalVisualizacoes" INTEGER NOT NULL DEFAULT 0,
    "autorProfessorId"   TEXT,
    "autorEscolaId"      TEXT,
    "escolaId"           TEXT NOT NULL,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Reel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReelCurtida" (
    "id"               TEXT NOT NULL,
    "reelId"           TEXT NOT NULL,
    "autorProfessorId" TEXT,
    "autorAlunoId"     TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReelCurtida_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReelComentario" (
    "id"               TEXT NOT NULL,
    "conteudo"         TEXT NOT NULL,
    "reelId"           TEXT NOT NULL,
    "autorProfessorId" TEXT,
    "autorAlunoId"     TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReelComentario_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Reel_videoId_key" ON "Reel"("videoId");
CREATE INDEX "Reel_escolaId_createdAt_idx" ON "Reel"("escolaId", "createdAt");
CREATE INDEX "Reel_autorProfessorId_idx" ON "Reel"("autorProfessorId");

CREATE UNIQUE INDEX "ReelCurtida_reelId_autorProfessorId_key" ON "ReelCurtida"("reelId", "autorProfessorId");
CREATE UNIQUE INDEX "ReelCurtida_reelId_autorAlunoId_key" ON "ReelCurtida"("reelId", "autorAlunoId");
CREATE INDEX "ReelCurtida_reelId_idx" ON "ReelCurtida"("reelId");

CREATE INDEX "ReelComentario_reelId_idx" ON "ReelComentario"("reelId");

ALTER TABLE "Reel" ADD CONSTRAINT "Reel_autorProfessorId_fkey" FOREIGN KEY ("autorProfessorId") REFERENCES "Professor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Reel" ADD CONSTRAINT "Reel_autorEscolaId_fkey" FOREIGN KEY ("autorEscolaId") REFERENCES "Escola"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Reel" ADD CONSTRAINT "Reel_escolaId_fkey" FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReelCurtida" ADD CONSTRAINT "ReelCurtida_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReelCurtida" ADD CONSTRAINT "ReelCurtida_autorProfessorId_fkey" FOREIGN KEY ("autorProfessorId") REFERENCES "Professor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReelCurtida" ADD CONSTRAINT "ReelCurtida_autorAlunoId_fkey" FOREIGN KEY ("autorAlunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReelComentario" ADD CONSTRAINT "ReelComentario_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReelComentario" ADD CONSTRAINT "ReelComentario_autorProfessorId_fkey" FOREIGN KEY ("autorProfessorId") REFERENCES "Professor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReelComentario" ADD CONSTRAINT "ReelComentario_autorAlunoId_fkey" FOREIGN KEY ("autorAlunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;
