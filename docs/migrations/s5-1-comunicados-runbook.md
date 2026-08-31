# Runbook — S5.1: Comunicados em escala de escola

Migration: `kav-class-backend/prisma/migrations/20260830060000_add_comunicados/migration.sql`

Primeira sprint da Fase 5. Não depende de S3.1 (cobrança automática,
ainda pendente da decisão de gateway) nem de S1.4 — foi a entrada natural
pra Fase 5.

## O que essa migration faz

100% aditivo: dois enums novos (`StatusComunicado`, `PublicoComunicado`) e
duas tabelas novas (`Comunicado`, `EnvioComunicado`). Nenhuma coluna
existente é alterada, sem backfill.

Não existia nada parecido no app antes: `Mensagem` é chat 1:1
professor↔aluno; `Notificacao` é push só pro professor. Este é o primeiro
recurso de broadcast — por e-mail, escopado pela Escola inteira.

- **`Comunicado`**: `titulo`, `corpo`, `publico` (`ALUNOS`/`PROFESSORES`/
  `TODOS` — quem recebe é calculado automaticamente, não uma seleção
  manual de destinatário por destinatário), `status`
  (`RASCUNHO`→`ENVIADO`).
- **`EnvioComunicado`**: uma linha por destinatário de cada envio —
  nome, e-mail, tipo, sucesso/erro. É a entrega "histórico completo de
  e-mails enviados" do roadmap: dá pra auditar quem recebeu e quem não.

## Irreversibilidade (o critério de pronto do roadmap)

- `PUT`/`DELETE /api/comunicados/:id` só funcionam com `status: RASCUNHO`
  no `WHERE` da query — um comunicado `ENVIADO` responde **404** pra
  ambos, nunca existe um caminho de código que edita ou apaga um
  já-enviado.
- `POST .../enviar` **não existe** de novo pro mesmo `id` depois de
  `ENVIADO` — responde **400** explicando pra usar "duplicar". Reenviar de
  verdade sempre passa por criar uma cópia nova (`RASCUNHO`), nunca reabre
  o original.
- A transição pra `ENVIADO` só acontece **depois** de confirmar que dá
  pra tentar mandar de verdade (checagem de `EMAIL_USER`/`EMAIL_PASS`
  configurados) — se não tiver, responde **503** e o rascunho continua
  intocado, editável. Isso evita marcar algo como "enviado" quando, na
  prática, zero e-mail teria saído.

## Rotas novas

| Rota | Quem | O que faz |
|---|---|---|
| `GET/POST /api/comunicados` | DONO/GESTOR | lista / cria rascunho |
| `PUT/DELETE /api/comunicados/:id` | DONO/GESTOR | só em `RASCUNHO` |
| `POST /api/comunicados/:id/duplicar` | DONO/GESTOR | cria um novo rascunho a partir de qualquer comunicado |
| `POST /api/comunicados/:id/enviar` | DONO/GESTOR | dispara os e-mails, marca `ENVIADO`, grava `EnvioComunicado` por destinatário |
| `GET /api/comunicados/:id/envios` | DONO/GESTOR | histórico detalhado por destinatário |

Pra `ALUNOS`, o e-mail vai pro responsável quando existe (mesmo critério
já usado em Contrato, S3.2), senão pro do próprio aluno.

## Frontend

Seção "Comunicados" em `(professor)/escola.tsx`, visível só a
DONO/GESTOR (a rota já bloqueia 403 pra `PROFESSOR` comum, a UI nem
mostra a seção pra não sugerir um recurso que a conta não pode usar).
Formulário de título/texto/público, lista com badge de status, e as
ações contextuais certas por estado: rascunho tem Editar/Apagar/Enviar,
enviado só tem "Duplicar pra reenviar". O botão Enviar passa por uma
confirmação explícita (`Alert` com aviso de "não dá pra desfazer") antes
de disparar — o app não deixa a ação irreversível acontecer com um único
toque acidental.

## Limitação conhecida de teste nesta sprint (mesma de S3.2)

`require('nodemailer')` trava indefinidamente neste sandbox local
(confirmado de novo agora, com `setTimeout` + `process.exit` que nunca
disparou — o `require` bloqueia o event loop inteiro, não é só uma
promise pendurada). Isso é uma peculiaridade **deste ambiente de teste**,
já documentada desde `staging-validation-2026-08-29.md`, não um problema
do código. Por causa disso, não deu pra validar o envio de e-mail de
ponta a ponta (a chamada real ao Gmail) nesta sprint — mas toda a lógica
até esse ponto, e o que acontece independente dele, foi validada:

## Validado em staging — ponta a ponta

1. Criar rascunho sem `publico` → **400**. Válido → **201**.
2. Editar rascunho → aplica. `GET` reflete a mudança.
3. **Enviar sem `EMAIL_USER` configurado** → **503**, status continua
   `RASCUNHO`, nenhuma linha em `EnvioComunicado` foi criada — confirma
   que a checagem de credencial vem antes de qualquer efeito colateral.
4. Duplicar → cria um novo `RASCUNHO` com os mesmos dados.
5. Apagar rascunho → **200**.
6. **Guard de irreversibilidade**: marquei um comunicado como `ENVIADO`
   direto no banco (simulando o resultado de um envio real, já que o
   envio de verdade não dá pra rodar neste sandbox) e confirmei: `PUT`
   → **404**, `DELETE` → **404**, `POST .../enviar` de novo → **400**
   ("já foi enviado, use duplicar"). As três proteções de irreversibilidade
   fazem exatamente o que deveriam.
7. **Isolamento entre escolas**: professor de outra escola não vê os
   comunicados desta.
8. **Permissão dentro da mesma Escola**: professor com `papel: PROFESSOR`
   (não `DONO`/`GESTOR`) recebe **403** tanto pra listar quanto pra criar.

**Pendente de verificação** (não bloqueante, mesma situação de S3.2):
testar o envio real de e-mail (chamada ao Gmail de fato) direto em
produção ou num ambiente sem essa peculiaridade do sandbox, antes de
anunciar o recurso pros usuários. A lógica de negócio ao redor do envio
está coberta; só a chamada de rede em si não foi.

Dados de teste apagados do staging ao final.

## Verificação pós-deploy em produção

```sql
SELECT count(*) FROM "Comunicado";      -- esperado: 0
SELECT count(*) FROM "EnvioComunicado"; -- esperado: 0
```

## Rollback

```sql
ALTER TABLE "EnvioComunicado" DROP CONSTRAINT IF EXISTS "EnvioComunicado_comunicadoId_fkey";
ALTER TABLE "Comunicado" DROP CONSTRAINT IF EXISTS "Comunicado_escolaId_fkey";
ALTER TABLE "Comunicado" DROP CONSTRAINT IF EXISTS "Comunicado_autorId_fkey";
DROP TABLE IF EXISTS "EnvioComunicado";
DROP TABLE IF EXISTS "Comunicado";
DROP TYPE IF EXISTS "StatusComunicado";
DROP TYPE IF EXISTS "PublicoComunicado";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20260830060000_add_comunicados';
```

Reverter o deploy do backend também é necessário.

---

## Fase 5 — status

- **S5.1 (Comunicados em escala):** ✅ concluída (esta sprint).
- **S5.2 (Painel de métricas):** próxima, mas depende de S3.1 (cobrança
  automática) — pode ficar parcialmente bloqueada até essa decisão.
- **S5.3 (QR Code de presença + app do gestor completo):** não depende
  de S3.1, só de S1.4 (✅ já feita) — pode vir antes de S5.2 se S3.1
  continuar pendente.
- **S5.4, S5.5:** pendentes.
