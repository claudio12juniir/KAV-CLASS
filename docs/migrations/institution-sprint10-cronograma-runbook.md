# Runbook — INSTITUTION Sprint 10: Cronograma (ex-Calendário)

Migration: `kav-class-backend/prisma/migrations/20260908160000_add_evento_intervalo_curso/migration.sql`

Décima sprint do plano de 11 (`docs/institution-briefing-2026-09-08.md`, seção 7).

## O que essa migration faz

- `TipoDiaNaoLetivo` ganha 5 valores novos: `PALESTRA`, `PASSEIO`, `FESTIVAL`, `APRESENTACAO`, `FERIAS` (mantém `FERIADO`/`RECESSO`, via `ALTER TYPE ... ADD VALUE IF NOT EXISTS`, mesmo padrão já usado em `20260829050000_add_reposicao_aluno_flow`).
- `DiaNaoLetivo.dataFim DateTime?` — nullable: evento de 1 dia (o caso de sempre) continua sem preencher.
- Nova tabela de junção `DiaNaoLetivoCurso` (N:N com `Curso`) — evento sem nenhuma linha aqui continua valendo pra escola inteira, comportamento idêntico ao que já existia antes desta sprint.
- 100% aditivo.

## Decisão de escopo — limitação registrada, não escondida

O cruzamento "este evento afeta o curso do aluno X" na checagem de bloqueio (`POST /api/aulas`) é feito **por nome**, comparando `Aluno.curso` (campo de texto livre, legado — comentário no próprio `model Curso` já registra isso: "convive por enquanto com... `Aluno.curso` (texto livre)") com `Curso.nome` (case-insensitive), porque não existe uma FK entre `Aluno` e `Curso` — só `Aluno.professorId`/`Aluno.curso` (texto) de um lado, e `Matricula`→`Turma`→`Curso` de outro, que este endpoint legado de criação de aula avulsa nunca usou. Migrar esse cruzamento pra ser por relação de banco de verdade é trabalho de uma sprint futura (a mesma dívida técnica já registrada no comentário original do `Curso`), não desta.

## Rotas alteradas

| Rota | O que mudou |
|---|---|
| `GET /api/escola/calendario` | Agora inclui `cursos` (join com `Curso.nome`) em cada evento. |
| `POST /api/escola/calendario` | Aceita `dataFim` (opcional) e `cursosIds` (opcional, array) além dos campos já existentes; `tipo` aceita os 7 valores agora. |
| `POST /api/aulas` | A checagem de bloqueio (já existente desde S1.4) virou intervalo (`data <= alvo <= dataFim`) e passou a considerar `cursosIds` do evento — evento sem curso vinculado continua bloqueando a escola inteira, como sempre. |

## Frontend

- `calendario.tsx` renomeado internamente pra "Cronograma" (arquivo mantido — troca é só de rótulo no menu e no título da tela, conforme o padrão do briefing "renomear rota"); formulário ganhou campo de data fim, os 7 tipos como chips, e seletor multi-curso (nenhum selecionado = escola inteira). Tabela mostra intervalo de datas e cursos afetados.
- Reaproveita o mesmo padrão de UI de chips/campo já usado em outras telas — não foi necessário construir um componente de calendário-planilha novo (o briefing original sugeria isso, mas o padrão de lista+formulário já em uso é suficiente e mais simples de manter).

## Validado nesta sessão

- `node -c server.js` — sintaxe OK; boot local sem erro.
- `npx tsc --noEmit -p .` — sem erros novos.
- Migration aplicada com sucesso contra o banco real (incluindo os `ALTER TYPE ADD VALUE`, que só funcionam fora de transação — confirmado que `db execute` lida com isso corretamente, igual já tinha acontecido no S2.1).
- **Pendente de teste manual**: criar evento em intervalo com curso específico, tentar agendar aula avulsa dentro do intervalo pra um aluno daquele curso (deve bloquear) e pra um aluno de outro curso (não deve bloquear).

## O que essa sprint deliberadamente NÃO faz

- UI de calendário-planilha visual (tipo grade de mês) — mantido o padrão de lista já usado no resto do painel, mais simples de entregar e manter consistente.
- Migrar `Aluno.curso` pra uma relação de verdade com `Curso` — dívida técnica pré-existente, só documentada de novo aqui por afetar diretamente a precisão do bloqueio por curso.
