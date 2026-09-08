# Runbook — INSTITUTION Sprint 7: Financeiro I (faturamento + folha de pagamento + despesas)

Migration: `kav-class-backend/prisma/migrations/20260908140000_add_folha_pagamento_despesa_fixa/migration.sql`

Sétima sprint do plano de 11 (`docs/institution-briefing-2026-09-08.md`, seção 7) — "o coração do sistema", nas palavras do usuário.

## O que essa migration faz

- Novo enum `StatusFolhaPagamento { ABERTA FECHADA }` e nova tabela `FolhaPagamentoProfessor` (mes, ano, valorCalculado, valorAjustado nullable, comprovantes String[], status, `@@unique([professorId, mes, ano])`).
- Nova tabela `DespesaFixa` (descricao, valor, recorrente, ativa).
- 100% novo, nenhuma tabela existente tocada.

## Decisões de escopo

- **Faturamento atual "via API da Stripe"**: em vez de chamar a API do Stripe ao vivo toda vez que o Painel/Financeiro carrega, a rota soma `Pagamento.status = PAGO` do mês corrente — a mesma fonte que o DRE já existente usa, e que já é sincronizada pelo webhook/cron de cobrança automática do Stripe Connect (S3.1). Evita uma dependência de rede externa por carregamento de tela sem perder exatidão.
- **Cálculo de folha** (`calcularOuAtualizarFolha`, reaproveitada por 2 rotas): nº de aulas com `presenca = PRESENTE` no mês × `Escola.valorPorAula`, ou nº de alunos ativos × `valorPorAula` se `tipoRemuneracaoProfessor = POR_ALUNO_MES` (ambos de `Escola`, Sprint 1). Reposição paga no mês em que ocorreu de fato **sem precisar de lógica especial**: cada `Aula` já tem uma única `dataHora` real (a da ocorrência), então não existe um segundo registro "original" que arriscasse contar em dobro.
- `valorCalculado` é sempre recalculado a cada leitura (upsert); `valorAjustado`/`comprovantes`/`status` são preservados entre leituras — só mudam quando a escola explicitamente ajusta/anexa/fecha.
- v1 pragmática de S8.3 do roadmap mestre (`RegraPagamentoProfessor` por professor individual) — aqui a regra é global por Escola, sem RBAC. Decisão já registrada no briefing §6.

## Rotas novas

| Rota | Quem | O que faz |
|---|---|---|
| `GET /api/escola/faturamento-atual` | DONO/GESTOR | Soma de mensalidades pagas no mês corrente. |
| `GET /api/escola/folha-pagamento?mes=&ano=` | DONO/GESTOR | Recalcula e devolve a folha de todo professor da Escola (default mês corrente). |
| `PUT /api/escola/folha-pagamento/:id/ajustar` | DONO/GESTOR | Define `valorAjustado` (ou `null` pra voltar a usar o calculado). |
| `POST /api/escola/folha-pagamento/:id/comprovantes` | DONO/GESTOR | Anexa uma URL (máx. 3). |
| `PUT /api/escola/folha-pagamento/:id/status` | DONO/GESTOR | Abre/fecha a folha do mês. |
| `GET /api/professor/folha-pagamento?mes=&ano=` | Professor (própria) | Réplica no login do professor — vê exatamente o que a escola vê sobre ele. |
| `GET/POST/PUT/DELETE /api/escola/despesas-fixas` | DONO/GESTOR | CRUD simples. |

## Frontend

- `financeiro.tsx`: card verde "Faturamento atual (mês)" fixo no topo (visível em qualquer sub-aba); nova sub-aba "Pagamento professores" (tabela calculado/ajustado/status/comprovantes, modal de ajuste + anexo); sub-aba "Caixa" ganhou a seção "Despesas fixas" (CRUD simples, toggle ativa/inativa) acima de "Contas a pagar" (despesas avulsas, já existente).
- `my-app/app/(professor)/pagamento.tsx`: card escuro "Sua folha de pagamento este mês" logo abaixo do resumo de mensalidades — só aparece quando `escola.pacote === 'PACOTE_ESCOLA'` (SELF/Pacote Professor nunca vê essa seção, intocado).

## Validado nesta sessão

- `node -c server.js` — sintaxe OK; boot local sem erro.
- `npx tsc --noEmit -p .` — sem erros novos.
- Migration aplicada com sucesso contra o banco real.
- **Pendente de teste manual**: fechar um mês de folha, ajustar valor, anexar 3 comprovantes (checar o limite), criar/desativar despesa fixa.

## O que essa sprint deliberadamente NÃO faz

- Upload real de arquivo pra comprovante — continua texto (URL), mesma decisão de sprints anteriores.
- Incluir `DespesaFixa` no cálculo do DRE (`GET /api/escola/dre`) — o DRE hoje só soma `LancamentoCaixa`/`Pagamento`; ligar `DespesaFixa` ali fica pro Sprint 8, quando o relatório for reforçado.
- Qualquer chamada de rede ao Stripe pra "faturamento atual" — decisão explícita acima.
