# Runbook — INSTITUTION Sprint 2: Presença dupla + decisão de reposição pela escola

Migration: `kav-class-backend/prisma/migrations/20260908110000_add_presenca_dupla_aula/migration.sql`

Segunda sprint do plano de 11 sprints (`docs/institution-briefing-2026-09-08.md`, seção 7). Pré-requisito de dado pra Grade de hoje (Sprint 3) e Experimentais (Sprint 11) mostrarem status correto de presença.

## O que essa migration faz

- `Aula` ganha 5 colunas, todas nullable: `presencaProfessorEm`, `presencaAlunoEm` (timestamps de confirmação independente de cada lado), `confirmadoManualmentePor` (texto livre "PROFESSOR"|"ALUNO", auditoria de override), `motivoManual` (texto livre), `decisaoReposicao` (boolean).
- 100% aditivo — o enum `PresencaAula` e a coluna `presenca` existentes não mudam de forma nenhuma; as rotas novas continuam escrevendo nesse mesmo campo quando os dois lados confirmam, pra não quebrar nenhum relatório que já lê `Aula.presenca`.
- Aplicada com o mesmo fluxo do Sprint 1 (`db execute` + `migrate resolve --applied` — `prisma migrate dev` continua quebrado neste projeto, ver `feedback_prisma_migrate_dev_broken` na memória de longo prazo e o runbook do Sprint 1).

## Decisão de escopo (importante — não confundir dois conceitos parecidos)

O model `Reposicao` já tem um fluxo de aprovação em duas camadas completo desde S2.1 (`SOLICITADA→AUTORIZADA→FINALIZADA`, ver `docs/migrations/s2-1-reposicao-aluno-runbook.md`). Essa sprint **não mexe nesse fluxo**. `Aula.decisaoReposicao` é um conceito ortogonal: uma marcação simples e direta, editável só pela escola, sobre uma aula específica na Grade de hoje ("essa aula que já aconteceu foi/vai ser uma reposição ou não") — sem pedido, sem aprovação, sem ligação com o model `Reposicao`. As duas coisas podem coexistir na mesma tela sem se sobrepor.

## Rotas novas

| Rota | Quem | O que faz |
|---|---|---|
| `POST /api/aulas/:id/checkin-professor` | Professor dono da aula | Grava `presencaProfessorEm = now()`. Se o aluno já tinha confirmado, marca `presenca: PRESENTE` e `status: CONCLUIDA`. Idempotente (chamar de novo não faz nada, devolve a aula como está). |
| `POST /api/aulas/:id/checkin-aluno` | Aluno da aula | Mesma lógica, do lado do aluno. |
| `PUT /api/aulas/:id/override-manual` | DONO/GESTOR | Marca presença manualmente quando professor ou aluno não conseguiram usar o celular. Exige `{ alvo: 'PROFESSOR'\|'ALUNO', senha, motivo? }` — a senha tem que ser a de quem está sendo marcado (checada com `bcrypt.compare` contra `Professor.senha`/`Aluno.senha`), nunca a senha de quem está logado como escola. Grava `confirmadoManualmentePor` e `motivoManual` como auditoria. |
| `PUT /api/aulas/:id/reposicao` | DONO/GESTOR | Seta `decisaoReposicao` (true/false) numa aula da própria Escola. |

## Frontend

- `my-app/app/(professor)/checkin-presenca.tsx` (novo, registrado no Drawer como "Confirmar Presença"): lista as aulas de hoje do professor logado, botão de confirmar com prompt biométrico (`expo-local-authentication`, já era dependência) antes de chamar o check-in.
- `my-app/app/(aluno)/checkin-presenca.tsx` (novo, mesmo registro no Drawer do aluno): mostra a próxima aula (reaproveita `GET /api/aluno/dashboard`, que já retornava `proximaAula` completo — não foi preciso endpoint novo de listagem) com o mesmo botão biométrico.
- **Decisão de escopo**: essas duas telas são a única parte desta sprint que toca fora de `(escola)/` — é aditivo (tela nova, item de menu novo), sem alterar nenhuma tela SELF existente.
- A UI de override manual (senha + motivo) e de editar `decisaoReposicao` **não foi construída ainda** — as rotas já existem e estão testadas (boot smoke test), mas a tela que as consome é a Grade de hoje, que é o Sprint 3.

## Validado nesta sessão

- `node -c server.js` — sintaxe OK; boot local sem erro (`[DB] Conexão com o banco de dados estabelecida.`).
- `npx tsc --noEmit -p .` — sem erros novos (os mesmos 2 erros pré-existentes de `escolher-plano.tsx`, não relacionados).
- Migration aplicada com sucesso contra o banco real.
- **Pendente de teste manual**: fluxo completo ponta a ponta no app (checkin biométrico real professor+aluno, override manual com senha errada/certa) — não executado nesta sessão.

## O que essa sprint deliberadamente NÃO faz

- Nenhum cron/job agendado que marque `AUSENCIA_PROFESSOR`/`AUSENCIA_ALUNO` automaticamente quando só um lado confirmou e o horário já passou — isso ficaria pra uma sprint futura de job agendado. Por ora, `presenca` só muda quando os dois lados confirmam (ou via override manual da escola).
- UI de override manual e de edição de `decisaoReposicao` no painel da escola — vem no Sprint 3 (Grade de hoje).
- Qualquer mudança no fluxo já existente de `Reposicao`/`StatusReposicao` (S2.1) — deliberadamente intocado.
