# Runbook — INSTITUTION Sprint 6: Logística + remoção da aba Matrículas

**Sem migration nesta sprint** — decisão de arquitetura deliberada, ver abaixo.

Sexta sprint do plano de 11 (`docs/institution-briefing-2026-09-08.md`, seção 7).

## Decisão de arquitetura — por que não precisou de schema novo

O plano original (briefing seção 7, Sprint 6) previa "novo campo em `Aula` ou tabela de regra recorrente simples" pra marcar uma troca de sala como "só hoje" vs "a partir de agora". Investigando o schema/backend existentes antes de codar, achei que os dois mecanismos **já existem**:

- **"A partir de agora" (recorrente)** = `Turma.salaId`, campo que já existia, editável via `PATCH /api/turmas/:id` (já existente, tela Catálogo). Uma turma sempre teve uma sala "padrão" — mudar isso já era exatamente "aplica dali em diante".
- **"Só hoje" (pontual)** = `Aula.salaId` por aula individual, editável via `PUT /api/aulas/:id/trocar-sala` (já existente desde S1.4).

Ou seja, o mecanismo pedido já estava construído — só faltava a **tela de visualização em grade** pra usar os dois de forma organizada. Registrando aqui pra não duplicar infraestrutura numa sprint futura achando que "não existe".

## Rota nova

| Rota | Quem | O que faz |
|---|---|---|
| `GET /api/escola/logistica/grade?data=AAAA-MM-DD` | DONO/GESTOR | Lê as aulas do dia (default hoje) com sala/turma/professor/aluno, mais a lista de salas ativas da Escola — só leitura agregada, pra montar a grade visual. |

## Frontend

- `catalogo.tsx` → renomeado pra `configuracoes-catalogo.tsx` (`git mv`, preserva histórico). Removido de `NAV_ESCOLA` — acessível só pelo link "Abrir Planos, Modalidades e Cursos" em `perfil-instituicao.tsx` (Sprint 1), que foi atualizado pra apontar pra rota nova.
- `logistica.tsx` (novo) ocupa o slot de menu que era "Catálogo" (mesma posição, rótulo agora "Logística"): grade do dia agrupada por sala, com ação "Mudar sala" por aula abrindo um seletor com dois botões — "Só hoje" (`trocar-sala`) e "A partir de agora (turma)" (`PATCH /turmas/:id`, desabilitado se a aula não tiver turma vinculada — aula avulsa não tem onde persistir uma regra recorrente).
- `matriculas.tsx` **removido** (não arquivado) — toda a lógica de criar matrícula e gerenciar contrato digital já foi migrada pra dentro da ficha do aluno no Sprint 5, usando as mesmas rotas de backend (`POST /api/matriculas`, `POST /api/matriculas/:id/contrato`, `PUT /api/contratos/:id/cancelar`), que continuam intactas. Nenhuma referência solta à rota antiga (`grep` confirmado).

## Validado nesta sessão

- `node -c server.js` — sintaxe OK; boot local sem erro.
- `npx tsc --noEmit -p .` — sem erros novos.
- `grep` confirma que nenhuma tela ainda referencia `/(escola)/matriculas` ou `/(escola)/catalogo`.
- **Pendente de teste manual**: abrir Logística no app e trocar a sala de uma aula nos dois modos.

## O que essa sprint deliberadamente NÃO faz

- Validação de choque de horário (duas aulas na mesma sala no mesmo horário) — isso é o escopo completo de S8.1 do roadmap mestre (`Equipamento`, conflito de agenda), fora do pedido de hoje, que era só "organização simples".
- Interface de arrastar-e-soltar — a troca de sala é por botão/seleção, não drag-and-drop.
