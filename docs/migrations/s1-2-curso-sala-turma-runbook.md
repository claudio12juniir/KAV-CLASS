# Runbook — S1.2: Curso, Sala e Turma

Migration: `kav-class-backend/prisma/migrations/20260829030000_add_curso_sala_turma/migration.sql`

Segunda sprint da Fase 1 do [roadmap](../roadmap-escola.md). Dá existência
própria a curso, sala e turma — hoje aula é sempre 1 professor : 1 aluno,
sem noção de sala compartilhada ou turma nomeada.

## O que essa migration faz

- Três tabelas novas: `Curso`, `Sala`, `Turma` (todas escopadas por
  `escolaId`).
- Duas colunas **nullable** em `Aula`: `turmaId`, `salaId`. Aula avulsa (o
  modo de hoje, sem turma/sala) continua funcionando idêntico — nada nela
  foi alterado, só adicionado.
- Sem backfill.

## Simplificação de escopo desta sprint

O roadmap original previa "múltiplos professores por turma (config.
opcional)". Implementei `Turma.professorId` como **obrigatório e único**
(mesmo modelo que `Aula` já usa hoje) — múltiplos professores por turma via
tabela de vínculo dedicada fica pra uma sprint futura, pra não misturar essa
complexidade extra na primeira versão de Turma.

`Professor.cursos` (lista de texto livre) e `Aluno.curso` (texto livre)
continuam existindo sem mudança — migrar esses campos pra apontar pra
`Curso` de verdade é trabalho de UI de uma sprint futura, não desta.

## Rotas novas

Todas exigem professor autenticado (`exigirProfessor`); Curso e Sala são
catálogo da própria Escola (qualquer professor da Escola vê e cria —
inclusive quem está sozinho no Pacote Professor, que também é uma Escola de
1 pessoa); Turma é sempre criada em nome de quem está autenticado.

| Rota | O que faz |
|---|---|
| `GET/POST /api/cursos`, `PATCH /api/cursos/:id` | catálogo de cursos da Escola |
| `GET/POST /api/salas`, `PATCH /api/salas/:id` | catálogo de salas da Escola |
| `GET/POST /api/turmas`, `PATCH /api/turmas/:id` | turmas do professor autenticado, vinculadas a um Curso (e opcionalmente uma Sala) da mesma Escola |

Nenhuma tela nova no app nesta sprint — é trabalho de backend/dados. Uma UI
de gestão de cursos/salas/turmas fica natural junto de S1.4 (Agenda geral),
que já vai precisar de UI de sala mesmo.

## ⚠️ Achado importante: nada disso funciona em produção ainda

Testando localmente contra o banco real (mesmo `DATABASE_URL` de sempre — ver
runbook S0.1), qualquer rota que tenta ler `Professor.escolaId` falha com:

```
PrismaClientKnownRequestError: The column `Professor.escolaId` does not exist
in the current database. code: 'P2022'
```

Isso é **esperado, não é bug**: nenhuma das migrations desta Fase 0/Fase 1
(`20260829000000` a `20260829030000`) foi aplicada em produção ainda — por
design, seguindo o próprio runbook de S0.1 (backup → staging → só depois
produção). O Prisma Client local foi gerado a partir do schema novo, mas o
banco real ainda está no schema antigo.

**Consequência prática:** a branch `feat/fase-0-escola` como um todo — não
só esta sprint — **não pode ir pro ar sem antes rodar as 4 migrations em
produção**, na ordem:

1. `20260829000000_add_escola_multi_tenant`
2. `20260829010000_add_convite_professor`
3. `20260829020000_add_responsavel_financeiro`
4. `20260829030000_add_curso_sala_turma`

O `render.yaml` já roda `npx prisma migrate deploy` no build, então um
deploy normal do Render aplica as 4 em sequência automaticamente — mas isso
só deve acontecer depois do backup + teste em staging, exatamente como
descrito no runbook de S0.1. Até lá, esta branch não deve ser mergeada em
`main` nem deployada.

## Verificação pós-deploy

```sql
SELECT count(*) FROM "Curso"; -- esperado: 0
SELECT count(*) FROM "Sala";  -- esperado: 0
SELECT count(*) FROM "Turma"; -- esperado: 0
SELECT count(*) FROM "Aula" WHERE "turmaId" IS NOT NULL; -- esperado: 0 (sem backfill)
```

## Rollback

```sql
ALTER TABLE "Aula" DROP CONSTRAINT IF EXISTS "Aula_turmaId_fkey";
ALTER TABLE "Aula" DROP CONSTRAINT IF EXISTS "Aula_salaId_fkey";
DROP INDEX IF EXISTS "Aula_turmaId_idx";
DROP INDEX IF EXISTS "Aula_salaId_idx";
ALTER TABLE "Aula" DROP COLUMN IF EXISTS "turmaId";
ALTER TABLE "Aula" DROP COLUMN IF EXISTS "salaId";
DROP TABLE IF EXISTS "Turma";
DROP TABLE IF EXISTS "Sala";
DROP TABLE IF EXISTS "Curso";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20260829030000_add_curso_sala_turma';
```
