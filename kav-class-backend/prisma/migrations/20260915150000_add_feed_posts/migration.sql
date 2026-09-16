-- ============================================================================
-- Feed / Rede Social Fase 4 — 3 tabelas novas, 100% aditivo (não toca
-- nenhuma tabela existente). Tabelas vazias recém-criadas: nenhum índice
-- aqui precisa de CONCURRENTLY (não há linha nenhuma pra travar).
-- ============================================================================

CREATE TABLE "Post" (
    "id"               TEXT NOT NULL,
    "conteudo"         TEXT NOT NULL,
    "midiaUrl"         TEXT,
    "autorProfessorId" TEXT,
    "autorEscolaId"    TEXT,
    "escolaId"         TEXT NOT NULL,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PostCurtida" (
    "id"               TEXT NOT NULL,
    "postId"           TEXT NOT NULL,
    "autorProfessorId" TEXT,
    "autorAlunoId"     TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PostCurtida_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PostComentario" (
    "id"               TEXT NOT NULL,
    "conteudo"         TEXT NOT NULL,
    "postId"           TEXT NOT NULL,
    "autorProfessorId" TEXT,
    "autorAlunoId"     TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PostComentario_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Post_escolaId_createdAt_idx" ON "Post"("escolaId", "createdAt");
CREATE INDEX "Post_autorProfessorId_idx" ON "Post"("autorProfessorId");

CREATE UNIQUE INDEX "PostCurtida_postId_autorProfessorId_key" ON "PostCurtida"("postId", "autorProfessorId");
CREATE UNIQUE INDEX "PostCurtida_postId_autorAlunoId_key" ON "PostCurtida"("postId", "autorAlunoId");
CREATE INDEX "PostCurtida_postId_idx" ON "PostCurtida"("postId");

CREATE INDEX "PostComentario_postId_idx" ON "PostComentario"("postId");

ALTER TABLE "Post" ADD CONSTRAINT "Post_autorProfessorId_fkey" FOREIGN KEY ("autorProfessorId") REFERENCES "Professor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Post" ADD CONSTRAINT "Post_autorEscolaId_fkey" FOREIGN KEY ("autorEscolaId") REFERENCES "Escola"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Post" ADD CONSTRAINT "Post_escolaId_fkey" FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PostCurtida" ADD CONSTRAINT "PostCurtida_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PostCurtida" ADD CONSTRAINT "PostCurtida_autorProfessorId_fkey" FOREIGN KEY ("autorProfessorId") REFERENCES "Professor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PostCurtida" ADD CONSTRAINT "PostCurtida_autorAlunoId_fkey" FOREIGN KEY ("autorAlunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PostComentario" ADD CONSTRAINT "PostComentario_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PostComentario" ADD CONSTRAINT "PostComentario_autorProfessorId_fkey" FOREIGN KEY ("autorProfessorId") REFERENCES "Professor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PostComentario" ADD CONSTRAINT "PostComentario_autorAlunoId_fkey" FOREIGN KEY ("autorAlunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;
