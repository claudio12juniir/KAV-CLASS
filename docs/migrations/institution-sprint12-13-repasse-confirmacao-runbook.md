# Runbook — INSTITUTION Sprints 12 e 13: Repasse de aula + Confirmação de presença 24h antes

Migration: `kav-class-backend/prisma/migrations/20260922000000_add_repasse_aula_confirmacao_aluno/migration.sql`

Primeiras duas sprints do plano de 22/09/2026 (`docs/institution-briefing-2026-09-22.md`, seção 4). Aplicada com o mesmo fluxo já registrado em `feedback_prisma_migrate_dev_broken`: SQL escrito à mão, `prisma db execute` + `prisma migrate resolve --applied` + `prisma generate` — `prisma migrate dev` continua quebrado neste projeto (shadow DB falha replayando `20260801000000_harden_indices_enums_fk_fixes` do zero).

## O que essa migration faz

- `Aula` ganha `professorSubstitutoId` (FK opcional pra `Professor`, `onDelete: SetNull`) — Sprint 12.
- `Aula` ganha `confirmacaoAlunoSolicitadaEm`, `confirmacaoAlunoEm`, `confirmacaoAlunoResposta` (todos nullable) — Sprint 13.
- `Professor` ganha relação reversa `aulasSubstituidas` (`@relation("AulaProfessorSubstituto")`).
- 2 índices novos: `(professorSubstitutoId, presenca, dataHora)` e `(confirmacaoAlunoResposta, dataHora)`.
- 100% aditivo, nenhuma coluna existente muda — nenhuma linha de produção afetada até a escola/aluno usar as rotas novas.

## Sprint 12 — Repasse de aula

**Decisão de escopo**: `Aula.professorId` continua sendo o dono da grade/vínculo com o aluno (não muda — dezenas de rotas dependem disso pra escopo/autenticação). `professorSubstitutoId` é só um marcador de "quem efetivamente lecionou esta aula específica", editável só pela escola. Quando preenchido, a folha de pagamento credita o substituto, não o dono original.

- `calcularOuAtualizarFolha` (server.js): o `count` de aulas no modo `POR_AULA` agora usa `OR: [{ professorId, professorSubstitutoId: null }, { professorSubstitutoId: professorId }]` em vez de só `{ professorId }`. Modo `POR_ALUNO_MES` não muda — paga por base de alunos ativos, não por aula individual, repasse não se aplica a ele.
- `PUT /api/aulas/:id/substituto` (novo, DONO/GESTOR): `{ professorSubstitutoId: string|null }`. Valida que o substituto é da mesma Escola e diferente do professor original. `null` remove a substituição.
- `GET /api/escola/grade-hoje`: passou a incluir `professorSubstituto: { id, nome }` em cada aula.
- Frontend: `my-app/app/(escola)/index.tsx`, `ModalGradeProfessor` — botão "Outro professor lecionou" abre uma lista de chips com os outros professores da Escola; escolher um chama a rota nova. Badge "Lecionada por X" aparece quando há substituto.

## Sprint 13 — Confirmação de presença do aluno 24h antes

**Decisão de escopo**: distinto do check-in biométrico já existente (`presencaAlunoEm`, Sprint 2 — acontece NO momento da aula). Isto é um pedido de confirmação antecipado, com resposta sim/não rastreável, pra escola se organizar com antecedência. Vale pra aula oficial e reposição igualmente — ambas são só um registro de `Aula`, sem rota separada.

- Novo cron `solicitarConfirmacaoAlunos24h` (server.js), `cron.schedule('0 * * * *', ...)` — roda a cada hora cheia (diferente do lembrete existente `verificarAulasAmanha`, que é 1x/dia às 08h e não pede resposta). Janela de 1h (`agora+23h` a `agora+24h`) casada com a cadência horária, então cada aula cai numa única execução. Marca `confirmacaoAlunoSolicitadaEm` pra não reenviar.
- `PUT /api/aulas/:id/confirmar-presenca-previa` (novo, aluno autenticado): `{ confirma: boolean }`. Grava `confirmacaoAlunoEm`/`confirmacaoAlunoResposta`.
- Frontend: `my-app/app/(aluno)/index.tsx` — card "Você confirma presença?" aparece na Próxima Aula quando `confirmacaoAlunoSolicitadaEm` existe e `confirmacaoAlunoResposta` ainda é `null`. Depois de responder, mostra "✓ Você confirmou presença" / "✕ Você avisou que não vai".
- **Decisão de escopo**: essa tela é compartilhada entre SELF e INSTITUTION (mesmo dashboard de aluno pros dois pacotes) — aditivo, sem alterar nenhum fluxo SELF existente, mesmo padrão já usado no Sprint 2 (checkin-presenca.tsx).

## Validado nesta sessão

- `node -c server.js` — sintaxe OK.
- Boot local sem erro (`[DB] Conexão com o banco de dados estabelecida.`), duas vezes (após cada sprint).
- `npx tsc --noEmit -p .` em `my-app/` — sem erros novos em `(escola)/index.tsx` nem `(aluno)/index.tsx`.
- Migration aplicada com sucesso contra o banco real via `prisma db execute` + registrada via `migrate resolve --applied`.
- **Pendente de teste manual**: fluxo completo no app (marcar substituto na Grade de hoje e conferir folha recalculada; aluno responder ao card de confirmação e ver o badge atualizar na Grade de hoje da escola).

## O que essas sprints deliberadamente NÃO fazem

- Nenhuma trava que impeça marcar substituto numa aula que já tem `presenca=PRESENTE` com histórico de folha já fechada (`FolhaPagamentoProfessor.status=FECHADA`) — `calcularOuAtualizarFolha` só recalcula `valorCalculado` na leitura (`GET /api/escola/folha-pagamento`), preservando `valorAjustado`/status como já documentado; folha fechada não é reaberta automaticamente por uma substituição tardia. Fica registrado como comportamento aceito, não esquecido.
- Nenhuma notificação pra escola quando o aluno responde "não vou" na confirmação prévia (Sprint 13) — só fica visível como badge na Grade de hoje. Um alerta ativo (push/e-mail pra escola) fica pra Sprint 18 (Alertas vermelhos), que já tem esse tipo de item no escopo.
- Nenhuma ação automática (cancelar aula, sugerir reposição) quando o aluno recusa a confirmação — a decisão continua manual da escola, na Grade de hoje.
