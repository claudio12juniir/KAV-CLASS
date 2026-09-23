# Runbook — INSTITUTION Sprint 15: Tela de Reposição em 3 colunas

Sem migration nova — só rotas + tela. Quarta sprint do plano de 22/09/2026 (`docs/institution-briefing-2026-09-22.md`, seção 4).

## O que essa sprint faz

Backend já era maduro (2 fluxos completos de `Reposicao`/`StatusReposicao`/`OrigemReposicao`, ver `docs/migrations/s2-1-reposicao-aluno-runbook.md`) — faltava só a tela dedicada e um jeito de olhar os dois fluxos juntos.

### Categorização (nova, `GET /api/escola/reposicoes-quadro`)

- **Para repor**: `AGUARDANDO` / `SOLICITANDO_OUTRO` (fluxo professor→aluno, ainda sem data travada) + `SOLICITADA` (fluxo aluno→professor, aguardando aprovação).
- **Reposições agendadas**: `CONFIRMADA` (aluno já confirmou a data proposta pelo professor) + `AUTORIZADA` (professor já aprovou o pedido do aluno, falta a escola concluir).
- **Reposições concluídas**: só `FINALIZADA`.

**Decisão de escopo importante**: antes desta sprint, `PUT /api/reposicoes/:id/finalizar` só aceitava `origem: ALUNO, status: AUTORIZADA` — o fluxo iniciado pelo professor (`CONFIRMADA`) não tinha NENHUMA etapa de "concluir", ficava pendurado ali pra sempre. A rota foi ampliada pra aceitar também `origem: PROFESSOR, status: CONFIRMADA`, unificando os dois fluxos num único status terminal (`FINALIZADA`) — é o que torna a coluna "Concluídas" possível sem duplicar lógica.

**Limitação conhecida, não escondida**: "professor que lecionou" na coluna Concluídas mostra `Reposicao.professor.nome` — o professor original dono do registro. `Reposicao` não tem (e esta sprint não adiciona) um campo de substituição equivalente ao `Aula.professorSubstitutoId` do Sprint 12, porque finalizar uma `Reposicao` **não cria uma `Aula`** — são modelos desconectados hoje (`finalizar` só troca o status). Se uma reposição foi coberta por outro professor, isso não aparece aqui a menos que exista uma `Aula` real daquele dia com `professorSubstitutoId` marcado à parte (Grade de hoje). Registrado como lacuna de produto, não como bug — juntar os dois modelos é uma decisão de schema maior, fora do escopo desta sprint.

### Rotas

| Rota | Quem | O que faz |
|---|---|---|
| `GET /api/escola/reposicoes-quadro` | DONO/GESTOR ou SECRETARIA com permissão `reposicoes` | Todas as reposições da Escola, já categorizadas nas 3 colunas. |
| `PUT /api/reposicoes/:id/finalizar` | idem | Ampliada pra aceitar os dois fluxos terminais (ver acima). |

`GET /api/escola/reposicoes` (a rota antiga, só `origem:ALUNO, status:AUTORIZADA`) **não foi tocada** — continua alimentando o KPI "Reposições pra finalizar" do Painel como já fazia.

### Frontend

- `my-app/app/(escola)/reposicoes.tsx` (novo): 3 `SectionCard` lado a lado. "Para repor" é só leitura (as ações de aprovar/negar/confirmar continuam nos apps de professor/aluno, como já era). "Agendadas" ganha o botão "Marcar como concluída". "Concluídas" é só leitura.
- Item de menu novo em `NAV_ESCOLA` (`_ui.tsx`), grupo "Gestão": `reposicoes` → `/(escola)/reposicoes`.
- `NEGADA` (pedido do aluno recusado pelo professor) fica de fora das 3 colunas de propósito — não é nem pendente nem concluída, é um beco sem saída do fluxo; a tela não perde esse dado (continua no banco, só não aparece no quadro).

## Validado nesta sessão

- `node -c server.js` — sintaxe OK; boot local sem erro.
- `npx tsc --noEmit -p .` em `my-app/` — zero erros no projeto inteiro.
- **Pendente de teste manual**: abrir a tela nova, finalizar uma reposição de cada fluxo (professor e aluno) e conferir que ela migra pra "Concluídas".

## O que essa sprint deliberadamente NÃO faz

- Não cria vínculo entre `Reposicao` e `Aula` (ver limitação conhecida acima).
- Não adiciona ação de aprovar/negar/confirmar na tela da escola — essas continuam sendo ação de professor/aluno pelos apps deles, a tela da escola é observação + conclusão.
- Não mostra `NEGADA` em nenhuma coluna.
