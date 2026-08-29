# Runbook — S0.2: RBAC + convite de professor + Pacote Escola

Migration: `kav-class-backend/prisma/migrations/20260829010000_add_convite_professor/migration.sql`

Continuação da Fase 0 do [roadmap](../roadmap-escola.md). Adiciona só a tabela
`ConviteProfessor` (vazia, sem backfill) e um conjunto de rotas novas —
nenhuma rota/coluna existente foi alterada além de duas adições de campo
`select` (`/api/professor/perfil` passou a devolver `papel` e `escola.pacote`
também).

## O que essa sprint entrega

- **Convite de professor pra Escola** — `POST /api/escola/convites` (DONO/
  GESTOR, só com `pacote = PACOTE_ESCOLA`), `POST /api/escola/convites/aceitar`
  (mesmo padrão de código digitado que já existia pra aluno entrar via
  `codigoConvite`).
- **Rotas de gestor** — `GET /api/escola/professores` e `GET /api/escola/alunos`,
  escopadas por `escolaId`, só acessíveis a DONO/GESTOR.
- **Pacote Escola sob consulta** — `POST /api/admin/escola/pacote`, protegida
  por `ADMIN_SECRET` (mesmo padrão de `/api/admin/reset-senha`). Não existe
  checkout self-serve pra esse pacote: preço varia por escola, então é o time
  interno que ativa depois de fechar comercialmente — igual ao modelo
  observado na Emusys pra esse segmento.
- **App**: tela `aceitar-convite-professor.tsx`, item de menu "Minha Escola"
  (`(professor)/escola.tsx`, só visível pra DONO/GESTOR), card de Pacote
  Escola em `escolher-plano.tsx`.

## Aplicando em produção

Mesmo checklist da migration anterior — ver
[s0-1-escola-runbook.md](s0-1-escola-runbook.md#antes-de-rodar-em-produção).
Como não há backfill nessa migration (tabela nova e vazia), o risco é bem
menor que o de S0.1, mas backup antes de qualquer deploy continua sendo a
regra, não exceção.

```bash
cd kav-class-backend
npx prisma migrate deploy   # já roda automaticamente no build do Render (render.yaml)
```

## Ativando o Pacote Escola pra uma conta (depois de fechar comercialmente)

```bash
curl -X POST https://kav-class-1.onrender.com/api/admin/escola/pacote \
  -H "Content-Type: application/json" \
  -d '{"adminSecret": "<ADMIN_SECRET do Render>", "email": "dono@escola.com", "pacote": "PACOTE_ESCOLA"}'
```

O `email` precisa ser o do Professor com `papel = DONO` daquela Escola (quem
criou a conta originalmente). Depois disso, o item "Minha Escola" aparece pra
ele no próximo login/refresh do app, e ele já consegue convidar outros
professores.

## Verificação pós-deploy

```sql
SELECT count(*) FROM "ConviteProfessor"; -- esperado: 0 logo após o deploy (tabela nova)
```

No app: DONO de uma escola com `pacote = PACOTE_ESCOLA` cria um convite pela
tela "Minha Escola", recebe o código, e um segundo professor consegue aceitar
esse código em `aceitar-convite-professor.tsx` e cair direto no app já
vinculado à mesma Escola.

## Rollback

Sem backfill nessa migration — reverter é só desfazer a tabela nova:

```sql
ALTER TABLE "ConviteProfessor" DROP CONSTRAINT IF EXISTS "ConviteProfessor_escolaId_fkey";
DROP TABLE IF EXISTS "ConviteProfessor";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20260829010000_add_convite_professor';
```

Reverter o deploy do backend/app pra uma revisão anterior a este commit
também é necessário — as rotas novas dependem da tabela e do campo `papel` em
`Professor` (já existente desde S0.1).

---

## Achado de segurança — IDOR pré-existente em toda a API legada

**Encontrado durante esta sprint, não introduzido por ela.** Nenhuma das
~55 rotas do Kav Class anteriores a esta sprint chama `jwt.verify`. Todas
confiam no `professorId`/`alunoId` que o próprio cliente manda em query
string ou body — o app até envia o header `Authorization: Bearer <token>`
corretamente (via `apiFetch` em `my-app/app/api.ts`), mas o backend nunca lê
nem valida esse header fora do webhook do Stripe.

**Impacto concreto:** qualquer pessoa com um `professorId` ou `alunoId`
(UUID) consegue ler e escrever dados daquela conta — alunos, aulas,
pagamentos, materiais, mensagens, notificações — sem estar autenticada como
aquela pessoa. Como parte dos dados envolve menores de idade (`dataNascimento`
de alunos dependentes) e dados financeiros, é um risco real, não teórico.

**O que esta sprint fez a respeito:** as rotas novas (`/api/escola/*`) usam
verificação real de JWT (`autenticarProfessor`/`exigirPapelNaEscola` em
`server.js`) e nunca confiam em id vindo do cliente — só no id decodificado
do token. Isso evita que o RBAC de GESTOR/DONO seja só decorativo. As ~55
rotas legadas **não foram tocadas** — mudar autorização em produção espalhada
por tantas rotas de uma vez é, ela própria, uma operação de alto risco, e
sair do escopo de "convite + gestor" desta sprint.

**Recomendação:** tratar isso como prioridade de segurança, candidato a
entrar na frente de S1.x — não é um item do roadmap de produto, é uma
correção de uma vulnerabilidade já em produção. Abordagem sugerida: rota por
rota (ou por grupo), trocar `req.query.professorId`/`req.body.professorId`
pelo id que sai de `autenticarProfessor(req, res)`, com o mesmo cuidado de
staging→produção usado nas migrations desta fase — validar que o app não
quebra porque hoje ele já manda o token certo, só não é cobrado por isso.

---

## ATUALIZAÇÃO — achado corrigido

Todas as ~40 rotas afetadas (professor, aluno, mural, mensagens, reposições,
presença/materiais, cursos, aulas, relatórios, assinatura) agora passam por
um middleware real de autenticação (`autenticar`/`exigirProfessor`/
`exigirAluno` em `server.js`, perto do topo do arquivo, logo após
`SEGREDO_JWT`) e usam `req.auth.id` — nunca mais o `professorId`/`alunoId`
solto em query/body. Rotas com um segundo id em jogo (aluno dentro de uma
rota de professor, pagamento, reposição, notificação, aula) ganharam checagem
de dono, geralmente reescrevendo `update`/`delete` por `updateMany`/
`deleteMany` com o id do dono no `where`, checando `count` — evita o padrão
"acha por id solto, confia, atualiza".

Casos especiais tratados à parte:
- **`POST /checkout`** — rota semi-pública (roda antes/durante o login), não
  dá pra exigir JWT sem quebrar o fluxo de "teste venceu, escolha um plano".
  Em vez disso, quando um `professorId` é passado, agora exige que o `email`
  do corpo bata com o e-mail cadastrado daquele id — fecha o IDOR sem exigir
  token.
- **`GET /checkout/verify/:sessionId`** — sem mudança; o próprio `sessionId`
  opaco do Stripe já funciona como credencial.
- **`GET /checkout/sucesso`** — de quebra, corrigido um XSS refletido pequeno
  (o `session_id` da query era reinterpolado sem escapar dentro de um
  `<script>`); agora só aceita o formato alfanumérico real de um session id
  do Stripe.
- **`/api/admin/*`** — sem mudança; já usam `ADMIN_SECRET` como modelo de
  confiança separado (operador interno com segredo compartilhado, não
  usuário final).
- **Rotas de auth/cadastro** (`/api/login`, `/api/*/cadastro`,
  `/api/auth/google/*`, `/api/forgot-password`, `/api/reset-password`) — sem
  mudança; são o ponto de entrada antes de existir qualquer token.

**Validado:** `node --check` (sintaxe), `npx prisma validate`, e smoke test
manual com `curl` contra o servidor rodando localmente — sem token (401), com
token inválido (401), com token válido de papel errado (403), com token
válido de id inexistente (404, prova que a checagem de auth passa e chega
até a consulta ao banco). Nenhuma rota nova foi testada com dado real de
produção — só leitura de rotas que devolvem 404 pra id inexistente, sem
nenhuma escrita.
