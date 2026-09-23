# Runbook — INSTITUTION Sprint 17: Grupo interno dos professores

Migration: `kav-class-backend/prisma/migrations/20260922020000_add_mensagem_equipe/migration.sql`

Sexta sprint do plano de 22/09/2026 (`docs/institution-briefing-2026-09-22.md`, seção 4). Item novo de verdade — sem equivalente no roadmap mestre nem no briefing de 08/09 (que só tinha "chat da turma", professor↔alunos).

## O que essa sprint faz

- Novo model `MensagemEquipe` (id, texto, `fixado` boolean, escolaId, autorId, createdAt) — tabela nova, 100% aditiva.
- **Distinto do chat da turma** (`Mensagem`/`MensagemTurma`, professor↔alunos dele): este é um grupo só entre **DONO/GESTOR/PROFESSOR da mesma Escola** — sem alunos, sem secretaria/funcionário. Participante é implícito (qualquer `Professor` daquela `escolaId` com um desses 3 papéis), sem tabela de membros, mesmo padrão já usado no chat da turma.
- **Mensagem fixada** (pedido explícito do usuário: "link fixo de aulas ao vivo via Meet, por exemplo") — campo `fixado`, só DONO/GESTOR fixa/desfixa; qualquer um do grupo pode postar. `GET` retorna fixadas primeiro (`orderBy: [{fixado:'desc'},{createdAt:'asc'}]`), frontend separa numa seção própria no topo.

### Rotas

| Rota | Quem | O que faz |
|---|---|---|
| `GET /api/escola/mensagens-equipe` | DONO/GESTOR/PROFESSOR | Lista mensagens do grupo da própria Escola. |
| `POST /api/escola/mensagens-equipe` | idem | Envia mensagem. |
| `PUT /api/escola/mensagens-equipe/:id/fixar` | DONO/GESTOR | Fixa/desfixa. |

**Decisão de escopo importante**: as 3 rotas chamam `exigirPapelNaEscola` **sem `chaveModulo`** — de propósito. Isso significa SECRETARIA/FUNCIONARIO nunca entram aqui, nem que o DONO tente liberar via permissão (não existe uma chave `'grupo-equipe'` em `CHAVES_PERMISSAO_SECRETARIA`). É coerente com o pedido: "grupo interno DOS PROFESSORES", não um módulo de gestão configurável pra qualquer staff.

### Frontend

- `my-app/app/(escola)/grupo-equipe.tsx` (novo): lista de mensagens com seção "Fixadas" no topo quando existem, campo de texto pra postar, botão Fixar/Desafixar visível só pra DONO/GESTOR (`useEscolaContexto().papel`).
- Item de menu novo em `NAV_ESCOLA` (`_ui.tsx`), grupo "Gestão": `grupo-equipe` → `/(escola)/grupo-equipe`. Sem chave de permissão associada (ver decisão de escopo acima) — some da lista de SECRETARIA/FUNCIONARIO automaticamente (`filtrarPorPermissao` só mostra itens cuja chave está nas permissões concedidas).

## Validado nesta sessão

- `node -c server.js` — sintaxe OK; boot local sem erro.
- `npx tsc --noEmit -p .` em `my-app/` — zero erros no projeto inteiro.
- Migration aplicada com sucesso contra o banco real.
- **Pendente de teste manual**: postar mensagem como PROFESSOR, fixar como DONO, confirmar que SECRETARIA (mesmo com todas as outras permissões liberadas) não vê o item de menu nem consegue chamar a API direto (403 esperado).

## O que essa sprint deliberadamente NÃO faz

- Nenhum upload de mídia — só texto (o "link fixo" do pedido do usuário é colado como texto/URL na própria mensagem, sem componente de anexo). Mesma regra já usada no chat da turma ("só texto e links, nada de mídia") reaproveitada aqui por analogia, embora não tenha sido pedida explicitamente pra este grupo.
- Nenhuma paginação — lista tudo de uma vez, mesmo padrão simples já usado no chat da turma (aceitável no volume esperado de um grupo interno de equipe, não uma timeline pública).
- Nenhuma notificação push ao postar — fica pra uma sprint de polimento futura se o volume de uso justificar.
