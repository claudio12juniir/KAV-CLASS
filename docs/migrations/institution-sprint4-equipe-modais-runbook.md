# Runbook — INSTITUTION Sprint 4: Equipe (modais de ação por professor)

Migration: `kav-class-backend/prisma/migrations/20260908120000_add_mensagem_turma/migration.sql`

Quarta sprint do plano de 11 (`docs/institution-briefing-2026-09-08.md`, seção 7).

## O que essa migration faz

- Novo enum `AutorMensagemTurma { PROFESSOR ALUNO }` e nova tabela `MensagemTurma` (id, texto, autorTipo, autorId, professorId FK `ON DELETE CASCADE`, createdAt), índice `(professorId, createdAt)`.
- 100% novo — nenhuma tabela existente tocada.

## Decisão de escopo — chat da turma

- Distinto de `Mensagem` (1:1 professor↔aluno) e de `/api/mural` (broadcast 1-via) — ver decisão já registrada no briefing seção 7.3.
- Participantes calculados em tempo de consulta, sem tabela de membros: professor dono da turma, e alunos com `Aluno.professorId` igual ao professor, `status = ATIVO` e sem nenhum `Pagamento.status = ATRASADO` — mesma fonte de verdade do KPI "Inadimplentes" do Painel (Sprint 3), pra não ter duas definições de inadimplência.
- DONO/GESTOR da mesma Escola pode **ler** a conversa (acompanhamento), mas não pode **postar** — quem participa é só o professor e os alunos dele. Isso é checado no backend (`resolverAcessoChatTurma`), não só escondido na UI.
- Só texto — sem campo de anexo/mídia em lugar nenhum da rota ou do formulário (regra explícita do briefing).

## Rotas novas

| Rota | Quem | O que faz |
|---|---|---|
| `GET /api/professores/:id/chat-turma` | Professor dono, alunos ativos/em dia dele, ou DONO/GESTOR da mesma Escola | Lista mensagens em ordem cronológica. |
| `POST /api/professores/:id/chat-turma` | Professor dono ou aluno elegível (não DONO/GESTOR) | Cria mensagem (`{ texto }`). |

## Frontend

- `equipe.tsx`: cada linha de professor ganhou 3 botões — **Alunos** (modal com a base do professor, nome clicável navega pra `/(escola)/alunos` — deep-link direto pra ficha específica fica pra Sprint 5, quando a ficha 100% editável existir), **Grade** (reaproveita o componente `GradeDisponibilidade` já construído no Sprint 1 pra edição pós-cadastro, agora carregando/salvando a grade de um professor já existente via as rotas de disponibilidade do Sprint 1), **Chat** (modal somente-leitura pra escola, mostrando autor — nome do professor ou nome do aluno resolvido a partir da lista de alunos da turma já carregada).

## Validado nesta sessão

- `node -c server.js` — sintaxe OK; boot local sem erro.
- `npx tsc --noEmit -p .` — sem erros novos.
- Migration aplicada com sucesso contra o banco real (`db execute` + `migrate resolve --applied`).
- **Pendente de teste manual**: enviar mensagem como professor/aluno pelo app (a UI de composição de mensagem existe hoje só do lado do professor/aluno via chamada direta à API — as telas mobile de chat da turma em si, fora de `(escola)/`, não foram construídas nesta sessão).

## O que essa sprint deliberadamente NÃO faz

- Telas de chat da turma nos apps do professor/aluno (`(professor)/`, `(aluno)/`) — só o backend e a visão de acompanhamento da escola foram entregues. Sem isso, o chat existe mas ninguém do lado do professor/aluno tem UI pra usar ainda; registrado como pendência pra uma próxima sessão, fora do escopo dos 11 sprints originais (que são só INSTITUTION).
- Deep-link direto da lista de "Alunos" do modal pra ficha individual do aluno — aguarda a ficha 100% editável do Sprint 5.
- Notificação push de nova mensagem no chat da turma (o mural/mensagem 1:1 já dispara push; chat da turma ainda não).
