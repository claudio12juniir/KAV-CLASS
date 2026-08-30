# Runbook — S3.2: Contrato digital

Migration: `kav-class-backend/prisma/migrations/20260830000000_add_contrato/migration.sql`

Primeira sprint da Fase 3 do [roadmap](../roadmap-escola.md). S3.1
(cobrança automática) ficou **pendente** — depende de uma decisão de
negócio ainda em aberto (Stripe Connect vs. conta única, ver
`project_gateway_cobranca_stripe` na memória) — então pulei direto pra S3.2,
que não depende disso.

## ⚠️ Aviso de escopo — leia antes de vender isso como "assinatura digital"

Isto é **confirmação por código enviado por e-mail**, o mesmo modelo de
confiança que já existe em `TokenRedefinicaoSenha` e `ConviteProfessor`.
**NÃO é assinatura eletrônica com validade jurídica plena** (ICP-Brasil,
carimbo de tempo, cadeia de custódia) — é o que um parceiro como Clicksign
ou D4Sign entrega de verdade, e é a recomendação original do roadmap.
Integrar um parceiro desses continua em aberto como decisão de negócio
(conta, custo por contrato assinado — R$2,90 no modelo da Emusys).

O que **isso já resolve de verdade**, sem depender de nenhuma decisão
pendente: **cobrança só sai depois que as duas partes confirmaram** — o
gate está em `POST /api/matriculas/:id/faturas`, não em papel.

## O que essa migration faz

- Uma tabela nova: `Contrato`. Sem coluna alterada, sem backfill.
- Ciclo de vida: `ENVIADO` → `PREENCHIDO` (responsável confirmou) →
  `ASSINADO` (Escola confirmou) — ou `CANCELADO` a qualquer momento antes
  de `ASSINADO`.

## Rotas novas

| Rota | Quem | O que faz |
|---|---|---|
| `POST /api/matriculas/:id/contrato` | professor | cria e envia o contrato (código por e-mail pro responsável, ou pro próprio aluno se for CONTRATANTE) |
| `GET /api/contratos/:id?token=X` | público (código é a credencial) | consulta os dados antes de assinar |
| `POST /api/contratos/:id/assinar-responsavel` | público (código é a credencial) | responsável confirma → `PREENCHIDO` |
| `POST /api/contratos/:id/assinar-representante` | DONO/GESTOR | Escola confirma → `ASSINADO`. Só funciona se já estiver `PREENCHIDO` — ordem obrigatória, igual ao padrão de aprovação em duas camadas de S2.1 |
| `PUT /api/contratos/:id/cancelar` | professor | cancela, exceto se já `ASSINADO` |

## Achado + correção nesta sprint: `require('nodemailer')` antes da checagem de credenciais

Testando em staging, achei que as duas funções de e-mail que fazem
`require('nodemailer')` **antes** de checar se `EMAIL_USER`/`EMAIL_PASS`
existem (`enviarEmailConviteProfessor`, de S0.2, e a nova
`enviarEmailContrato`) — e também a pré-existente `enviarEmailRedefinicao`.
Isso não é o achado do sandbox local travando (documentado em
`staging-validation-2026-08-29.md`) — é uma ordem de execução
desnecessariamente arriscada: carregar um módulo antes de saber se ele vai
ser usado. Corrigido nas três: agora a checagem de credenciais vem
**antes** do `require`, falha rápido e claro quando `EMAIL_USER`/`EMAIL_PASS`
não estão configurados, sem tentar carregar nada. Isso também foi o que
destravou testar esse fluxo em staging sem o travamento do `require`.

## Validado em staging — o critério de pronto, ponta a ponta

1. Fatura gerada **sem** nenhum contrato vinculado → funciona normal
   (comportamento antigo de S2.2, intocado).
2. Contrato criado (`ENVIADO`) → gerar fatura agora → **400**, bloqueado.
3. Responsável assina com o código → `PREENCHIDO` → gerar fatura → **ainda
   400**, bloqueado (falta a Escola).
4. Representante (DONO) assina → `ASSINADO` → gerar fatura → **201**,
   funciona.
5. Em outra matrícula: contrato cancelado (`CANCELADO`) → gerar fatura →
   **400**, bloqueado permanentemente.
6. Tentativa de cancelar um contrato já `ASSINADO` → rejeitada (**404**,
   "já está assinado").
7. Consulta pública com código errado → **404**, não vaza dado nenhum do
   contrato.

## Verificação pós-deploy em produção

```sql
SELECT count(*) FROM "Contrato"; -- esperado: 0 logo após o deploy
```

## Rollback

```sql
ALTER TABLE "Contrato" DROP CONSTRAINT IF EXISTS "Contrato_matriculaId_fkey";
ALTER TABLE "Contrato" DROP CONSTRAINT IF EXISTS "Contrato_escolaId_fkey";
DROP TABLE IF EXISTS "Contrato";
DROP TYPE IF EXISTS "StatusContrato";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20260830000000_add_contrato';
```

Reverter o deploy do backend também é necessário — a checagem em
`POST /api/matriculas/:id/faturas` depende da tabela existir.
