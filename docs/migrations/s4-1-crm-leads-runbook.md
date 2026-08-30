# Runbook — S4.1: CRM de leads (funil configurável)

Migration: `kav-class-backend/prisma/migrations/20260830020000_add_crm_leads/migration.sql`

Primeira sprint da Fase 4 do [roadmap](../roadmap-escola.md). O roadmap
original listava S4.1 como parte do bloco comercial, sequenciado depois de
S3.1 (cobrança automática). Assim como em S3.3, não há dependência técnica
real — o funil de leads não toca em `Pagamento`/`Matricula` — e S3.1 segue
pendente (decisão de gateway em aberto, ver memória
`project_gateway_cobranca_stripe`). Segui direto pra S4.1.

## O que essa migration faz

Três tabelas novas — `EstagioFunil`, `Lead`, `TarefaLead` — 100% aditivas,
sem alterar nenhuma coluna existente, sem backfill.

- `EstagioFunil`: estágios do funil são configuráveis por Escola (não um
  enum fixo), cada um com `ordem` pra desenhar o funil visualmente.
- `Lead`: contato em prospecção, opcionalmente vinculado a um professor
  específico (`professorId`, nullable — útil pro professor solo que
  também quer registrar seus próprios leads sem depender de "Escola").
  `arquivado` + `motivoArquivamento` no lugar de excluir de verdade.
- `TarefaLead`: follow-up com `dataPrevista`, vinculado a um `Lead` e
  opcionalmente a um professor responsável.

**Escopo explícito da sprint** (comentário no próprio código, não é
suposição silenciosa): "sem refresh manual" no critério de pronto é
atendido pelo mesmo padrão que toda tela do app já usa —
`useFocusEffect` refetch ao focar a tela. Notificação em tempo real via
websocket/push fica fora de escopo desta sprint.

**Sem gate de pacote**: diferente de "convidar professor" (exclusivo do
Pacote Escola), o CRM de leads funciona pra qualquer professor —
inclusive solo, Escola-de-1. Rotas usam `exigirProfessor` +
`carregarEscolaDoProfessor`, sem checagem de `PacoteAssinatura`. Decisão:
captação de aluno é um problema tanto do professor autônomo quanto da
escola, então não faz sentido travar atrás do pacote pago.

## Rotas novas

| Rota | O que faz |
|---|---|
| `GET/POST /api/estagios-funil` | lista/cria estágios do funil da Escola |
| `GET/POST /api/leads` | lista (por `arquivado`)/cria lead — sem `estagioId`, cai no primeiro estágio (menor `ordem`) |
| `PUT /api/leads/:id/estagio` | move o lead entre estágios |
| `PUT /api/leads/:id/arquivar` / `desarquivar` | arquiva com motivo opcional / reverte |
| `POST /api/leads/:id/tarefas` | cria tarefa de follow-up (responsável default: quem está autenticado) |
| `GET /api/tarefas-lead` | lista tarefas por `concluida` (default: pendentes) |
| `PUT /api/tarefas-lead/:id/concluir` | marca concluída |
| `GET /api/funil/resumo` | contagem de leads ativos por estágio + total de tarefas pendentes — pensado pra alimentar a tela do gestor num único request |

## Frontend

Nova seção em `(professor)/escola.tsx`: cards de estágio (total de leads
por estágio, lado a lado) + lista de follow-ups pendentes com botão
"Concluir". Sem tela de criação/gestão de lead ainda (fica pra uma
próxima sprint de captação, S4.2) — esta sprint entrega a visão
consolidada pro gestor, que é o critério de pronto do roadmap para S4.1.

## Validado em staging — ponta a ponta via curl

Todos os passos confirmados contra o container `kavclass-staging`
(schema-only, sem dado real):

1. `GET /api/estagios-funil` vazio → criei 3 estágios (Novo Contato,
   Aula Experimental, Matriculado).
2. `POST /api/leads` sem `estagioId` → caiu automaticamente no de menor
   `ordem` ("Novo Contato"). ✓
3. `PUT /api/leads/:id/estagio` moveu pro segundo estágio →
   `GET /api/funil/resumo` refletiu a contagem corretamente (0/1/0). ✓
4. Criei tarefa de follow-up → apareceu em `GET /api/tarefas-lead` e em
   `tarefasPendentes` do resumo (1). ✓
5. `PUT /api/tarefas-lead/:id/concluir` → tarefa some da lista de
   pendentes, `tarefasPendentes` volta a 0. ✓
6. `PUT /api/leads/:id/arquivar` → lead some da contagem do estágio no
   resumo (arquivado não conta). `desarquivar` reverte. ✓
7. Mover lead pra estágio inexistente → **400**. Concluir tarefa
   inexistente → **404**. Sem token → **401**. ✓
8. **Isolamento entre escolas** (o mesmo tipo de checagem que motivou a
   correção de IDOR no início do projeto): gerei um segundo token pra um
   professor de outra Escola (`staging-prof-2`) e confirmei que ele (a)
   não vê nenhum lead da primeira Escola em `GET /api/leads`, (b) recebe
   **404** ao tentar arquivar um lead que não é da escola dele, (c) vê
   `funil/resumo` com estágios vazios, mesmo com estágios existindo na
   outra Escola. Nenhum vazamento entre tenants. ✓

Dados de teste apagados do staging ao final (`DELETE FROM "TarefaLead"`,
`"Lead"`, `"EstagioFunil"`).

## Verificação pós-deploy em produção

```sql
SELECT count(*) FROM "EstagioFunil"; -- esperado: 0
SELECT count(*) FROM "Lead";         -- esperado: 0
SELECT count(*) FROM "TarefaLead";   -- esperado: 0
```

## Rollback

```sql
ALTER TABLE "TarefaLead" DROP CONSTRAINT IF EXISTS "TarefaLead_leadId_fkey";
ALTER TABLE "TarefaLead" DROP CONSTRAINT IF EXISTS "TarefaLead_responsavelId_fkey";
ALTER TABLE "TarefaLead" DROP CONSTRAINT IF EXISTS "TarefaLead_escolaId_fkey";
ALTER TABLE "Lead" DROP CONSTRAINT IF EXISTS "Lead_estagioId_fkey";
ALTER TABLE "Lead" DROP CONSTRAINT IF EXISTS "Lead_professorId_fkey";
ALTER TABLE "Lead" DROP CONSTRAINT IF EXISTS "Lead_escolaId_fkey";
ALTER TABLE "EstagioFunil" DROP CONSTRAINT IF EXISTS "EstagioFunil_escolaId_fkey";
DROP TABLE IF EXISTS "TarefaLead";
DROP TABLE IF EXISTS "Lead";
DROP TABLE IF EXISTS "EstagioFunil";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20260830020000_add_crm_leads';
```

Reverter o deploy do backend também é necessário — o frontend
(`escola.tsx`) chama `/api/funil/resumo` e `/api/tarefas-lead`
incondicionalmente ao carregar a tela.

---

## Fase 4 — status

- **S4.1 (CRM de leads — funil configurável):** ✅ concluída (esta sprint).
- **S4.2 (Captação de leads):** próxima.
- **S4.3 (Aula experimental + conversão):** pendente.
