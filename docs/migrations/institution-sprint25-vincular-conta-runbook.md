# Runbook — INSTITUTION Sprint 25: Vincular conta existente como aluno

Migration: `kav-class-backend/prisma/migrations/20260923010000_add_convite_aluno_conta/migration.sql`

Sexta e última sprint da rodada de 23/09/2026 (`docs/institution-briefing-2026-09-22.md` não cobria esta rodada — pedido novo do usuário em 23/09/2026, sem doc de briefing prévio).

## ⚠️ Decisão pendente antes de funcionar em produção

O KAV Class já tem uma flag de rollout **`MULTI_VINCULO_HABILITADO`** (`server.js:1248`, `=== 'true'`) que controla se um e-mail já cadastrado pode ganhar um segundo vínculo de Aluno em outra Escola — é o mesmo mecanismo que já existe (mas está OFF) no cadastro self-service (`POST /api/alunos/cadastro`, Rede Social Fase 1 Step 2). **Essa variável não está definida nem no `.env` local nem no `render.yaml`** — hoje é `false` em todo lugar. Esta sprint reaproveita a mesma flag (é literalmente o mesmo tipo de operação: uma Conta ganhando mais um vínculo de Aluno) — **enquanto ninguém setar `MULTI_VINCULO_HABILITADO=true` no ambiente do Render, a rota nova responde 400 "Recurso ainda não habilitado"**. Não liguei essa flag sozinho porque é uma mudança de configuração de produção que afeta outro fluxo já existente (o cadastro self-service) além deste novo — fica pra o usuário decidir quando ligar.

## Achado importante: `ConviteProfessor` e `aceitar-convite-professor.tsx` não existem no código

Os docs antigos (briefing 08/09) descreviam um fluxo de convite de professor por e-mail com tela `aceitar-convite-professor.tsx` como algo "já implementado". Ao procurar um padrão pra reaproveitar nesta sprint, não achei nem o uso do model `ConviteProfessor` em nenhuma rota, nem o arquivo da tela em `my-app/app/`. Ou foi removido depois, ou nunca chegou a ser implementado apesar do documento dizer que sim — **não é algo desta sprint corrigir**, só fica registrado pra não confundir uma sessão futura que for procurar esse fluxo.

## O que essa sprint faz

Design escolhido: **o Aluno só é criado no aceite da pessoa** — nunca antes. Isso evita qualquer estado "fantasma" se ela nunca responder, e dispensa qualquer flag tipo `confirmadoPeloAluno` na tabela `Aluno` (desenho mais simples do que o cogitado inicialmente).

### Schema

- Novo model `ConviteAlunoConta`: `token` (`@unique`, mesmo padrão `gerarTokenPublico()` do `LinkCaptacao`), `status` (`PENDENTE`/`ACEITO`/`RECUSADO`), `contaId`, `escolaId`, `professorId`, `curso`, `alunoId` (`@unique`, preenchido só no aceite).

### Rotas novas

| Rota | Quem | O que faz |
|---|---|---|
| `POST /api/escola/alunos/convidar-conta` | DONO/GESTOR | Busca `Conta` pelo e-mail (404 se não existir — "cadastre normalmente"). Cria o convite. Notifica por push qualquer vínculo existente da Conta (Professor ou Aluno de outra escola) que tenha `expoPushToken`. |
| `GET /api/escola/convites-aluno` | DONO/GESTOR | Lista convites da própria Escola (pendente/aceito/recusado). |
| `GET /api/publico/convite-aluno/:token` | Ninguém (token é a credencial) | Dados pra tela de confirmação (nome da escola/professor/curso). |
| `POST /api/publico/convite-aluno/:token/aceitar` | Ninguém | `{ aceitar: boolean }`. Recusar só marca `RECUSADO`. Aceitar cria o `Aluno` (copiando nome/e-mail/senha/foto da `Conta` — **mesma senha que ela já usa**, sem senha nova pra decorar) e devolve um **JWT de login direto pra esse vínculo novo** — não depende de `USAR_CONTA_NO_LOGIN` (outra flag também OFF por padrão) nem de sessão prévia nesta Escola. |

### Frontend

- `my-app/app/(escola)/alunos.tsx`: botão novo "Vincular conta existente" ao lado de "Novo aluno", abre modal (e-mail + professor + curso opcional) chamando a rota de convite.
- `my-app/app/convite-aluno/[token].tsx` (nova, rota pública top-level, registrada em `app/_layout.tsx`): tela de aceitar/recusar. Ao aceitar, salva `kav_token`/`kav_papel`/`kav_aluno_id` (mesmas chaves do login normal) e `router.replace('/(aluno)')` — o redirecionador que já existe em `(aluno)/_layout.tsx` manda pro app certo (SELF ou Escola) sozinho.

## Validado nesta sessão

- `node -c server.js` — sintaxe OK; boot local sem erro.
- `npx tsc --noEmit -p .` em `my-app/` — zero erros no projeto inteiro.
- Migration aplicada com sucesso contra o banco real.
- **Pendente de teste manual** (e depende de `MULTI_VINCULO_HABILITADO=true`): convidar um e-mail que já é Conta, receber o push, abrir o link, aceitar e cair logado no app certo.

## O que essa sprint deliberadamente NÃO faz

- Não envia e-mail (só push) — quem não tem nenhum vínculo com push token salvo (ex.: só usou o KAV Class uma vez, há muito tempo, sem notificação ativa) não é alcançado automaticamente hoje. Ficaria pra uma sprint futura reaproveitar `enviarEmailContrato`-like como canal secundário.
- Não dá pra escola "cancelar" um convite pendente (só existe criar e listar) — remover exigiria uma rota `DELETE` nova, não pedida explicitamente.
- Não resolve o caso de login normal (`/api/login` sem `USAR_CONTA_NO_LOGIN`) mostrar TODOS os vínculos de uma Conta — só o token emitido no aceite dá acesso imediato ao vínculo novo. Descobrir os outros vínculos por login normal depende da flag `USAR_CONTA_NO_LOGIN` (também OFF), que é decisão de rollout separada, não desta sprint.
