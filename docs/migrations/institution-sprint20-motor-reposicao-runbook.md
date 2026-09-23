# Runbook — INSTITUTION Sprint 20: Motor automático de reposição

Migration: `kav-class-backend/prisma/migrations/20260923000000_add_motor_reposicao_automatico/migration.sql`

Primeira sprint da segunda rodada de pedidos (23/09/2026). Achado da auditoria que motivou esta sprint: marcar falta na Grade de hoje e a tela de Reposições eram **dois mundos completamente desconectados** — nenhuma rota lia `Aula.decisaoReposicao` pra criar uma `Reposicao`, e `Reposicao.dataProposta` era obrigatório mesmo quando ainda não havia data nenhuma.

## O que essa migration faz

- `StatusReposicao` ganha `PENDENTE_AGENDAMENTO` (falta marcada, precisa repor, sem data ainda) e `AGENDADA` (escola já marcou data/horário — aponta pra uma `Aula` de verdade).
- `OrigemReposicao` ganha `ESCOLA` (nasce direto de uma falta marcada na Grade de hoje, sem negociação professor↔aluno).
- `Reposicao.dataProposta` vira nullable (era `NOT NULL`) — uma reposição `PENDENTE_AGENDAMENTO` nasce sem data.
- `Reposicao` ganha `aulaOriginalId` (a aula que foi perdida) e `aulaReposicaoId` (`@unique` — a aula de verdade que cobre essa reposição, criada quando a escola agenda).

## O motor (server.js)

- **`sincronizarReposicaoAutomatica(aula, decisaoReposicao)`**: chamado sempre que `Aula.decisaoReposicao` é definido. `true` → cria (idempotente) uma `Reposicao` `origem:ESCOLA, status:PENDENTE_AGENDAMENTO` ligada via `aulaOriginalId`. `false` → remove essa pendência automática **só se ainda não tinha sido agendada** (uma reposição já `AGENDADA`/`FINALIZADA` não é apagada por uma reclassificação retroativa — evita perder histórico; fica pra escola cancelar na mão se for o caso).
- **`finalizarReposicaoSeAplicavel(aulaId)`**: chamado sempre que uma Aula recebe presença `PRESENTE` — se essa Aula é a que cobre uma `Reposicao` (`aulaReposicaoId`), vira `FINALIZADA` sozinha. Plugado em **todos** os pontos que já marcavam presença: `checkin-professor`, `checkin-aluno`, `override-manual`, o `registrar-presenca` legado (SELF) e `POST /api/presenca/qrcode` (S5.3) — nenhum caminho de confirmar presença ficou de fora.

### Rotas novas/alteradas

| Rota | O que mudou |
|---|---|
| `PUT /api/aulas/:id/reposicao` | Já existia (Sprint 2) — agora chama `sincronizarReposicaoAutomatica` depois de gravar `decisaoReposicao`. |
| `PUT /api/aulas/:id/registrar-falta` | **Nova.** DONO/GESTOR marca falta (aluno ou professor) direto na Grade de hoje — **sem senha** (registrar ausência não tem o mesmo risco de fraude que reivindicar presença de alguém, por isso não usa o mesmo gate de `override-manual`). Seta `presenca`, `status:CANCELADA` e `decisaoReposicao` numa tacada, já sincronizando a `Reposicao`. |
| `PUT /api/reposicoes/:id/agendar` | **Nova.** Funciona pros 3 fluxos (`ESCOLA`/`PROFESSOR`/`ALUNO`) — unifica o agendamento. Cria a `Aula` de reposição de verdade (`tipo:REPOSICAO`, `status:AGENDADA`), liga via `aulaReposicaoId`, marca a `Reposicao` como `AGENDADA`. |
| `GET /api/escola/reposicoes-quadro` | Buckets ampliados (`PENDENTE_AGENDAMENTO`→Para repor, `AGENDADA`→Agendadas) + `include` de `aulaOriginal`/`aulaReposicao` (mostra "Faltou em X" e "lecionada por Y" de verdade, não só o professor original). |

### Frontend

`my-app/app/(escola)/reposicoes.tsx`: botão "Agendar reposição" na coluna "Para repor" (modal simples de data/horário); coluna "Agendadas" mostra "Fecha sozinha quando a aula acontecer" pra reposições já ligadas a uma Aula real (sem botão manual de finalizar nesse caso); "Concluídas" mostra "Repondo a aula de X" usando `aulaOriginal`.

## Fecha uma lacuna documentada no Sprint 15

O runbook do Sprint 15 registrava como limitação conhecida: *"'professor que lecionou' na coluna Concluídas mostra o professor original... `Reposicao` não tem um campo de substituição."* Com `aulaReposicaoId` ligando a uma Aula de verdade (que por sua vez pode ter `professorSubstitutoId` do Sprint 12), a coluna "Concluídas" agora mostra corretamente quem *efetivamente* lecionou a reposição, não mais o professor original do registro.

## Validado nesta sessão

- `node -c server.js` — sintaxe OK; boot local sem erro.
- `npx tsc --noEmit -p .` em `my-app/` — zero erros no projeto inteiro.
- Migration aplicada com sucesso contra o banco real.
- **Pendente de teste manual**: marcar falta com "precisa repor" na Grade de hoje e confirmar que aparece em "Para repor"; agendar e confirmar que vira uma Aula de verdade visível pro professor/aluno; dar check-in nessa aula e confirmar que a Reposicao fecha sozinha.

## O que essa sprint deliberadamente NÃO faz

- Não apaga nem migra dados de `Reposicao` já existentes (linhas antigas continuam com `aulaOriginalId`/`aulaReposicaoId` nulos, funcionando exatamente como antes).
- Não valida choque de horário/sala ao agendar (mesma lacuna já registrada no roadmap mestre, S8.1) — agendar uma reposição no mesmo horário de outra aula do professor não é bloqueado.
- Não cancela automaticamente a `Reposicao` quando alguém apaga manualmente a `Aula` de reposição criada — o `onDelete:SetNull` na FK garante que a `Reposicao` não trava, mas ela fica "órfã" (status `AGENDADA` sem `aulaReposicaoId`), precisando de reagendamento manual.
