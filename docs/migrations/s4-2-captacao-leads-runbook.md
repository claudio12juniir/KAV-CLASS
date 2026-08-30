# Runbook — S4.2: Captação de leads

Migration: `kav-class-backend/prisma/migrations/20260830030000_add_link_captacao/migration.sql`

Segunda sprint da Fase 4. O roadmap listava S4.2 como dependente só de
S4.1 (não de S3.1) — sem ajuste de sequenciamento desta vez.

## ⚠️ Decisão de escopo — leia antes de divulgar isso como "página no site da escola"

O app Expo **não tem deploy web** (`render.yaml` só publica o backend). Pra
cumprir o critério de pronto do roadmap — *"alguém sem conta e sem app
agenda uma aula experimental por um link público"* — sem depender de uma
decisão de infraestrutura nova (novo serviço no Render, domínio, deploy do
Expo Web), o formulário público é servido como **HTML simples direto pelo
próprio backend** (`GET /captacao/:token` e `GET /cadastro-lead/:token`),
sem build, sem dependência nova, funcionando tanto acessado direto quanto
embutido via `<iframe>` — o que também é literalmente o "formulário
embutível" pedido no roadmap. Isso roda hoje, no serviço que já está no ar.
Uma versão com a cara/marca de cada Escola fica pra decidir depois, sem
mudar o contrato da API pública usada por trás.

**Também ficou de fora desta sprint** (não é omissão silenciosa, é
priorização): botão de "gerar link de auto-cadastro" por lead individual
não entrou na tela do gestor — a rota (`POST /api/leads/:id/link-cadastro`)
existe e está testada, mas o app ainda não tem uma tela de lista/detalhe de
lead pra pendurar esse botão (só o resumo agregado por estágio, de S4.1).
Fica natural de adicionar quando existir essa tela.

## O que essa migration faz

100% aditivo: uma coluna nova (`Lead.tokenPublico`, nullable, unique) e uma
tabela nova (`LinkCaptacao`). Nenhuma coluna existente é alterada, sem
backfill.

- **`Lead.tokenPublico`**: token de um lead específico já existente, pra
  ele mesmo completar telefone/e-mail sem conta.
- **`LinkCaptacao`**: link reutilizável (não expira, só via `ativo`) que
  cria leads **novos** — `CADASTRO` (formulário simples) ou
  `AGENDAMENTO_EXPERIMENTAL` (formulário + campo de preferência de
  horário, que também gera automaticamente uma `TarefaLead` de follow-up
  pro professor confirmar). Pode ser da Escola em geral ou de um professor
  específico (`professorId` opcional — útil pra link pessoal no Instagram
  do próprio professor).

**"Aula experimental" nesta sprint é só um Lead + uma TarefaLead de
follow-up**, não uma entidade própria. Formalizar isso (vínculo real com
aula-teste, regra de conversão, relatório) é escopo explícito de **S4.3**,
não desta sprint — registrado no roadmap, não é suposição silenciosa.

## Segurança das rotas públicas

Token de 48 caracteres hex (`crypto.randomBytes(24)`), não sequencial, não
adivinhável — bem mais forte que os códigos de 4 caracteres já usados em
convite/contrato (que só saem por e-mail; aqui o link pode ser divulgado
publicamente, então precisa de mais entropia).

**Rate limiting em memória, sem dependência nova**: `limitarTaxaPublica`
(chave `IP + método + rota`) — 10 escritas / 10 min nas rotas `POST`/`PUT`
públicas, 30 leituras / 10 min nas `GET`. Em memória: reseta a cada
restart do processo e não é compartilhado entre instâncias — adequado pro
jeito que este serviço roda hoje (single instance no Render); se escalar
horizontalmente, precisa virar um store compartilhado (Redis) —
registrado aqui, não é suposição silenciosa.

## Rotas novas

| Rota | Quem | O que faz |
|---|---|---|
| `POST /api/leads/:id/link-cadastro` | professor | gera (idempotente) o token público daquele lead |
| `GET/POST /api/links-captacao` | professor | lista/cria links reutilizáveis |
| `PUT /api/links-captacao/:id/desativar` \| `/reativar` | professor | liga/desliga sem trocar a URL |
| `GET/PUT /api/publico/lead/:token` | público | lead existente consulta/completa o próprio contato |
| `GET/POST /api/publico/captacao/:token` | público | consulta o link / cria lead novo |
| `GET /captacao/:token` | público | página HTML do link reutilizável |
| `GET /cadastro-lead/:token` | público | página HTML do link individual |

## Bug achado e corrigido testando em staging

**Rate limiter contava GET e POST juntos.** A chave original era só
`IP + rota` — sem o método HTTP. Isso significa que uma leitura (`GET
/api/publico/captacao/:token`, usada pela própria página HTML pra saber
que formulário mostrar) consumia o mesmo orçamento da escrita (`POST` que
cria o lead). No teste de 12 `POST`s seguidos (limite configurado: 10), o
`429` chegou no 7º, não no 11º — porque 4 `GET`s feitos minutos antes
(passos anteriores do próprio teste) já tinham consumido parte do
orçamento. Corrigido incluindo `req.method` na chave. Reconfirmado depois:
10 `POST`s passam, o 11º recebe `429`, e `GET`s no mesmo link não afetam
mais esse contador. Só apareceu rodando o rate limit de verdade contra
múltiplas chamadas em sequência — não seria pego só lendo o código.

## Validado em staging — ponta a ponta

1. Criei um link `CADASTRO` e um `AGENDAMENTO_EXPERIMENTAL`.
2. `POST /api/publico/captacao/:token` em cada um → lead criado, caiu no
   primeiro estágio do funil, `origem` preenchida automaticamente
   (`"Formulário público"` / `"Agendamento de aula experimental"`).
3. No link de `AGENDAMENTO_EXPERIMENTAL` com `mensagem` preenchida →
   `TarefaLead` criada automaticamente com a mensagem embutida na
   descrição, aparece em `GET /api/tarefas-lead`. ✓
4. `POST /api/leads/:id/link-cadastro` → token gerado; chamando de novo →
   **mesmo token** (idempotente, não gera um novo a cada clique). ✓
5. `GET`/`PUT /api/publico/lead/:token` → lead completou o e-mail sozinho;
   confirmado no `GET /api/leads` autenticado que o dado bateu. ✓
6. `PUT .../desativar` → formulário público passa a **404**;
   `.../reativar` → volta a **200**, mesma URL. ✓
7. **Isolamento entre escolas**: professor de outra escola recebe **404**
   ao tentar desativar um link que não é dele. ✓
8. Escola sem nenhum estágio de funil configurado → `POST
   /api/publico/captacao/:token` responde **503** com mensagem clara, em
   vez de 500 ou de criar um lead "solto" sem estágio. ✓
9. `nome` vazio → **400**. E-mail mal formatado (público) → **400**. Token
   inexistente em qualquer rota pública → **404**. ✓
10. Páginas HTML (`/captacao/:token`, `/cadastro-lead/:token`) respondem
    **200** com `Content-Type: text/html`. ✓
11. Rate limit: ver bug acima — corrigido e reconfirmado. ✓

Dados de teste apagados do staging ao final.

## Verificação pós-deploy em produção

```sql
SELECT count(*) FROM "LinkCaptacao";                          -- esperado: 0
SELECT count(*) FROM "Lead" WHERE "tokenPublico" IS NOT NULL; -- esperado: 0
```

## Rollback

```sql
ALTER TABLE "LinkCaptacao" DROP CONSTRAINT IF EXISTS "LinkCaptacao_escolaId_fkey";
ALTER TABLE "LinkCaptacao" DROP CONSTRAINT IF EXISTS "LinkCaptacao_professorId_fkey";
DROP TABLE IF EXISTS "LinkCaptacao";
DROP TYPE IF EXISTS "TipoLinkCaptacao";
ALTER TABLE "Lead" DROP COLUMN IF EXISTS "tokenPublico";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20260830030000_add_link_captacao';
```

Reverter o deploy do backend também é necessário — as páginas
`/captacao/:token` e `/cadastro-lead/:token` dependem das rotas públicas
existirem.

---

## Fase 4 — status

- **S4.1 (Leads e funil):** ✅ concluída.
- **S4.2 (Captação de leads):** ✅ concluída (esta sprint).
- **S4.3 (Aula experimental + conversão):** próxima — formaliza o que hoje
  é só "Lead + TarefaLead" numa entidade real de aula-teste com relatório
  de conversão.
