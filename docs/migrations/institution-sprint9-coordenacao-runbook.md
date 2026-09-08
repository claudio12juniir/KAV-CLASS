# Runbook — INSTITUTION Sprint 9: Coordenação

Migration: `kav-class-backend/prisma/migrations/20260908150000_add_coordenacao_cronograma_avaliacao/migration.sql`

Nona sprint do plano de 11 (`docs/institution-briefing-2026-09-08.md`, seção 7).

## O que essa migration faz

- Novo enum `TipoCronograma { UNIVERSAL PESSOAL }` e nova tabela `CronogramaConteudo` (cursoId, tipo, professorId nullable — obrigatório só quando PESSOAL, anexoUrl, titulo).
- Novo enum `AutorRelatorioAluno { PROFESSOR COORDENACAO }` e nova tabela `RelatorioAluno`.
- `Aula.assuntoTratado String?` — preenchido na confirmação de presença.
- `Avaliacao` ganha `notaEscola Int?` e `mesReferencia String?` ("YYYY-MM") — distintos da `nota` já existente (que é sobre o professor, de avaliações pontuais por aula).
- `Matricula.avaliacaoPendenteAte DateTime?` — pausa de cobrança.
- 100% aditivo.

## Decisões de escopo

- **Avaliação mensal é um endpoint novo** (`POST /api/aluno/avaliacao-mensal`), separado de `POST /api/aluno/avaliacoes` (já existente, avaliação pontual de uma aula específica). O mensal sempre avalia `Aluno.professorId` (vínculo principal) + a Escola, uma vez por mês (checado por `mesReferencia` único por aluno/mês), e ao responder marca `avaliacaoPendenteAte = 1º dia do mês seguinte` em **todas** as `Matricula` do aluno (pragmático pra multi-matrícula, que é caso raro).
- **"Cronograma vigente"** é sempre o mais recente por `(cursoId, tipo)` — não existe um campo "ativo" separado, ordenação por `createdAt` já resolve.
- **Coordenação "Universal"**: cronogramas UNIVERSAL/PESSOAL de um curso são visíveis pra qualquer professor da Escola (não só DONO/GESTOR) via `GET /api/escola/cronograma-conteudo`, porque o professor precisa saber o conteúdo vigente pra confirmar presença — sem RBAC granular nesta fase (mesma decisão do resto do projeto).
- **Relatório do aluno**: `autorTipo` é derivado automaticamente do papel de quem chama a rota (`DONO`/`GESTOR` → `COORDENACAO`, senão `PROFESSOR`) — não é um campo escolhido manualmente no formulário.

## Rotas novas

| Rota | Quem | O que faz |
|---|---|---|
| `POST /api/aluno/avaliacao-mensal` | Aluno | Avaliação mensal (nota professor + nota escola), pausa cobrança até o mês seguinte. |
| `GET/POST/DELETE /api/escola/cronograma-conteudo` | Professor (GET) / DONO-GESTOR (POST/DELETE) | CRUD do cronograma por curso. |
| `GET/POST /api/escola/relatorios-aluno` | Professor (dono do aluno ou gestão) | Relatórios de progresso. |
| `GET /api/escola/coordenacao/resumo` | DONO/GESTOR | Agregador por curso: cronograma vigente, médias de avaliação, contagem de relatórios. |
| `POST /api/aulas/:id/checkin-professor` (estendida) | Professor | Aceita `assuntoTratado` opcional no body — conecta o check-in do Sprint 2 com o cronograma desta sprint. |

## Frontend

- `coordenacao.tsx` (novo, item de menu "Coordenação"): sessões por curso com médias de avaliação (professor/escola, em estrelas), cronograma vigente (universal + pessoais), contador de relatórios, modal de novo cronograma e modal de novo relatório.
- `my-app/app/(professor)/checkin-presenca.tsx` (Sprint 2): cada aula ganhou um campo opcional "Assunto dado na aula" antes do botão de confirmar — conecta diretamente com `Aula.assuntoTratado` desta sprint.

## Validado nesta sessão

- `node -c server.js` — sintaxe OK; boot local sem erro.
- `npx tsc --noEmit -p .` — sem erros novos.
- Migration aplicada com sucesso contra o banco real.
- **Pendente de teste manual**: avaliação mensal completa (checar que bloqueia segunda tentativa no mesmo mês), upload de cronograma universal vs pessoal, relatório de aluno.

## O que essa sprint deliberadamente NÃO faz

- Modal amigável recorrente no app do aluno pedindo a avaliação mensal (sugestão do briefing) — só o endpoint existe; a UI de prompt no app do aluno fica pra uma sessão futura fora do escopo dos 11 sprints (que são só INSTITUTION).
- Checagem ativa de `avaliacaoPendenteAte` na régua de cobrança/lembrete — o campo existe e é preenchido, mas nenhuma rota de cobrança hoje lê esse campo pra de fato pausar o lembrete (fica registrado como pendência de integração).
- Trilhas de evolução/graduação (S8.4 do roadmap mestre) — conceito diferente de cronograma de conteúdo, não confundir, não implementado aqui.
