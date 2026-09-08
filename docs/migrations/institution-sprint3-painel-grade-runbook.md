# Runbook — INSTITUTION Sprint 3: Painel (Grade de hoje + KPIs reformulados)

Sem migration nesta sprint — só leitura/composição de dados que já existem (incluindo os campos novos de `Aula` do Sprint 2).

Terceira sprint do plano de 11 (`docs/institution-briefing-2026-09-08.md`, seção 7). Fica mais completa depois de Sprint 1 (disponibilidade) e Sprint 2 (presença dupla/decisaoReposicao), que são os dados que ela expõe.

## Rotas novas

| Rota | Quem | O que faz |
|---|---|---|
| `GET /api/escola/grade-hoje` | DONO/GESTOR | Professores com aula hoje, cada um com a lista de aulas do dia (aluno, horário, presença dupla, `decisaoReposicao`). A grade de disponibilidade em si continua vindo de `GET /api/escola/professores/:id/disponibilidade` (Sprint 1) — não duplicada aqui. |
| `GET /api/escola/inadimplentes` | DONO/GESTOR | Alunos com pelo menos uma mensalidade `ATRASADO`, distinct por aluno. |
| `GET /api/escola/aulas-para-reposicao` | DONO/GESTOR | Aulas dos últimos 60 dias com `presenca=PENDENTE_REPOSICAO` OU `decisaoReposicao=true`. |
| `POST /api/escola/alunos/:id/notificar-vencimento` | DONO/GESTOR | Dispara push (`enviarPushNotificacao`, já usada em outros 15 pontos) avisando o aluno que o contrato está vencendo. |

`GET /api/escola/professores` e `GET /api/renovacoes/vencendo` tiveram o `select` estendido (campos `dataNascimento` e `expoPushToken`, respectivamente) — aditivo, não quebra nenhum consumidor existente.

## Decisões de escopo

- **"Cobranças com erro" → "Inadimplentes"**: além de renomear, troquei a fonte de dado. O KPI antigo vinha de `/api/escola/cobranca-automatica/resumo` (só erros de cobrança automática via Stripe — um universo mais estreito). O novo KPI conta `Pagamento.status = ATRASADO` de verdade, porque esse é o mesmo critério que a sub-aba Pagamentos do Financeiro (Sprint 8) vai usar — evita duas definições diferentes de "inadimplente" convivendo no produto.
- **"Acompanhamentos pendentes" não existia como conceito no código** (o card equivalente hoje, "Follow-ups pendentes", é sobre tarefas de CRM/leads — outra coisa). Interpretei "Acompanhamentos pendentes → Aulas que devem ter reposição" como um card novo, não um rename do card de CRM, que continua existindo em paralelo sem mudança.
- **Grade de hoje**: a interação de "escola marca reposição" usa a rota `PUT /api/aulas/:id/reposicao` do Sprint 2 (campo `decisaoReposicao`, independente do fluxo de aprovação de `Reposicao`). O override manual de presença (exigindo senha de quem está sendo marcado) também está nesse mesmo modal, usando `PUT /api/aulas/:id/override-manual`.
- Aniversário de professor: calculado no client a partir de `Professor.dataNascimento` (próximos 7 dias, considerando virada de ano), sem endpoint dedicado — a lista de professores já carrega esse campo.

## Frontend

- `my-app/app/(escola)/index.tsx`: reescrita. KPI row reduzida a 3 (Professores, Alunos matriculados, Inadimplentes). Novo card "Grade de hoje" (lista de professores com aula hoje → clique abre `ModalGradeProfessor`, componente local com a grade em horas, toggle de reposição e override manual). "Matrículas vencendo" e "Aulas que devem ter reposição" viraram cards de lista (antes eram KPI numérico). "Follow-ups pendentes" e "Reposições pra finalizar" mantidos como estavam.
- Banner de aniversário de professor (próximos 7 dias) quando aplicável.

## Validado nesta sessão

- `node -c server.js` — sintaxe OK; boot local sem erro.
- `npx tsc --noEmit -p .` — sem erros novos.
- **Pendente de teste manual**: fluxo completo no app (abrir grade de um professor, marcar/desmarcar reposição, override manual com senha real).

## O que essa sprint deliberadamente NÃO faz

- Nenhuma edição da grade de disponibilidade a partir do Painel — isso é feito em Equipe (Sprint 1/4).
- Nenhuma paginação/filtro nas listas novas (inadimplentes, aulas pra reposição) — aceitável no volume esperado de uma escola; revisar se a base crescer muito.
