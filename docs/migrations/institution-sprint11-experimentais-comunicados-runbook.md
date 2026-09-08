# Runbook — INSTITUTION Sprint 11: Experimentais + Comunicados com push

Migration: `kav-class-backend/prisma/migrations/20260908170000_add_leitura_push_envio_comunicado/migration.sql`

Décima primeira e última sprint do plano de 11 (`docs/institution-briefing-2026-09-08.md`, seção 7).

## O que essa migration faz

- `EnvioComunicado` ganha `alunoId String?` (FK pra `Aluno`, `onDelete: SetNull`) e `lidoEm DateTime?` — reaproveita a tabela que já rastreava entrega de e-mail por destinatário, em vez de criar uma tabela nova só pra push/leitura.
- 100% aditivo.

## Decisões de escopo

- **Menu "Captação" → "Experimentais"**: só o rótulo mudou em `NAV_ESCOLA` (`_ui.tsx`). O arquivo continua `captacao.tsx` de propósito — ele hospeda 3 sub-abas (Funil/Leads/Experimentais), e só a última é "experimentais" de verdade; renomear o arquivo inteiro (como foi feito com `catalogo.tsx` no Sprint 6) seria enganoso aqui, porque Funil/Leads continuam sendo conceitos de CRM, não de experimentais.
- **Experimental na Grade de hoje**: `GET /api/escola/grade-hoje` (Sprint 3) passou a incluir `AulaExperimental` do dia junto com `Aula` — é ajuste de leitura, sem schema novo, porque `AulaExperimental` já tinha `professorId`+`dataHora`. Ações de reposição/override manual ficam escondidas pra essas linhas (`experimental: true`) porque não fazem sentido pra um Lead que ainda não é Aluno.
- **Checkin biométrico da experimental**: rota própria (`PUT /api/aulas-experimentais/:id/checkin-biometrico`), porque `AulaExperimental` não é `Aula` — não dá pra reusar `checkin-professor` do Sprint 2 diretamente.
- **Push de comunicado**: disparado em paralelo ao e-mail já existente (não bloqueia a resposta se falhar), só pra alunos com `expoPushToken` cadastrado. O mesmo registro de `EnvioComunicado` criado pro e-mail agora também carrega `alunoId`, servindo tanto de rastro de entrega quanto de "caixa de entrada" pro aluno consultar depois.

## Rotas novas/alteradas

| Rota | O que mudou/faz |
|---|---|
| `GET /api/escola/grade-hoje` | Agora mescla `Aula` + `AulaExperimental` do dia. |
| `PUT /api/aulas-experimentais/:id/checkin-biometrico` | Nova — professor confirma presença da experimental. |
| `GET /api/aulas-experimentais?apenasMeu=1` | Parâmetro novo, opcional — filtra só as experimentais do professor logado (usado pelo app mobile); sem o parâmetro, comportamento idêntico ao de antes (usado por `captacao.tsx`, vê tudo da Escola). |
| `POST /api/comunicados/:id/enviar` | Além do e-mail já disparado, agora chama `enviarPushNotificacao` pra cada aluno com token, e grava `alunoId` no `EnvioComunicado`. |
| `GET /api/aluno/comunicados` | Nova — lista os comunicados recebidos pelo aluno (mais recentes primeiro). |
| `PUT /api/aluno/comunicados/:envioId/lido` | Nova — marca como lido. |

## Frontend

- `_ui.tsx`: rótulo do menu "Captação" → "Experimentais".
- `index.tsx` (Painel): `ModalGradeProfessor` ganhou o badge "Experimental" e esconde as ações de reposição/override pra essas linhas.
- `my-app/app/(professor)/checkin-presenca.tsx` (Sprint 2): nova seção "Experimentais de hoje", com o mesmo fluxo de biometria, chamando o endpoint próprio.
- **Não construído nesta sessão**: tela no app do aluno pra ver a lista de comunicados recebidos e marcar como lido — as duas rotas (`GET`/`PUT`) existem e estão prontas, mas a UI consumindo elas fica pra uma sessão futura fora do escopo dos 11 sprints (que são só INSTITUTION, e essa tela é 100% SELF/app do aluno).

## Validado nesta sessão

- `node -c server.js` — sintaxe OK; boot local sem erro.
- `npx tsc --noEmit -p .` — sem erros novos.
- Migration aplicada com sucesso contra o banco real.
- **Pendente de teste manual**: enviar um comunicado de verdade e confirmar que o push chega (precisa de um `expoPushToken` real de dispositivo); confirmar presença de uma experimental pelo app do professor.

## O que essa sprint deliberadamente NÃO faz

- Tela de "comunicados recebidos" no app do aluno (rotas prontas, UI pendente — ver acima).
- Qualquer mudança nas sub-abas Funil/Leads de `captacao.tsx` — só a Experimentais e o rótulo do menu foram tocados.

---

## Fim do plano de 11 sprints

Com esta sprint, o plano de 11 sprints do briefing `docs/institution-briefing-2026-09-08.md` está implementado (schema + backend + frontend web, em todas as 11). Pendências conhecidas, registradas nos runbooks individuais e não escondidas:
- Telas mobile faltando: chat da turma (Sprint 4), avaliação mensal + comunicados recebidos no app do aluno (Sprints 9/11).
- Nenhum teste manual ponta a ponta no app de verdade (Expo Go/build) foi executado nesta sessão — só smoke tests de backend (`node -c`, boot local) e `tsc --noEmit`. Recomendado testar cada fluxo principal antes de considerar as sprints "prontas" de verdade.
- Upload real de arquivo (logo, contratos, comprovantes, anexos de cronograma/relatório) continua sendo campo de texto (URL) em todas as sprints — decisão repetida e registrada, não esquecida; depende de um serviço de storage que o projeto ainda não tem.
