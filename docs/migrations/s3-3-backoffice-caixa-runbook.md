# Runbook — S3.3: Backoffice financeiro mínimo (caixa)

Migration: `kav-class-backend/prisma/migrations/20260830010000_add_caixa_backoffice/migration.sql`

Terceira sprint da Fase 3. **Ajuste de escopo**: o roadmap original listava
S3.3 como dependente de S3.1 (cobrança automática). Revendo, não é
dependência técnica real — o caixa reconcilia com `Pagamento`/`Matricula`
manuais que já existem desde S2.2, e S3.1 segue pendente (decisão de
gateway em aberto, ver memória `project_gateway_cobranca_stripe`).

## O que essa migration faz

Três tabelas novas — `LancamentoCaixa`, `FechamentoCaixa`, `ContaPagar` —
sem tocar em nada existente, sem backfill. Versão enxuta do módulo de caixa
da Emusys: sem tesouraria, sem conciliação bancária, sem repasse de cartão.

## Rotas novas

| Rota | O que faz |
|---|---|
| `GET/POST /api/caixa/lancamentos` | lançamento avulso (entrada/saída), lista por dia |
| `POST /api/caixa/fechamento` | fecha um dia — soma congelada, não recalcula depois |
| `GET /api/caixa/fechamentos` | histórico |
| `GET/POST /api/contas-pagar` | despesas da escola |
| `PUT /api/contas-pagar/:id/pagar` | marca paga **e** gera o lançamento de saída no caixa na mesma transação |

## Dois bugs reais achados e corrigidos testando em staging

**1. Fuso horário no cálculo de "início/fim do dia".** `new Date("2026-09-01")`
(string sem hora) é interpretado como meia-noite **UTC**, não meia-noite
local — em qualquer fuso do Brasil (UTC-3) isso cai três horas dentro do
dia anterior. Meu código original fazia `new Date(str)` e depois
`.setHours()` (que opera em hora **local**), então a janela do "dia" ficava
inteira deslocada: lançamentos de "2026-09-01" simplesmente não apareciam
na consulta do dia, e o fechamento saía com `totalEntradas`/`totalSaidas`
zerados. Corrigido: strings `"YYYY-MM-DD"` agora são parseadas manualmente
(`new Date(ano, mes-1, dia)`) antes de calcular início/fim do dia, sem
depender de como o motor JS interpreta o fuso do texto.

**2. Saldo inicial pegava "o fechamento mais recente que existe", não "o
mais recente antes do dia sendo fechado".** Sem o filtro `data: { lt: inicio }`,
fechar um dia atrasado depois de já ter fechado um dia futuro (cenário de
teste, mas também um cenário real de acerto de backlog) puxava o
`saldoFinal` de um fechamento posterior — errado. Corrigido com esse filtro
explícito.

Nenhum dos dois foi pego só lendo o código — só apareceram rodando o fluxo
de verdade contra dados reais em staging, exatamente o tipo de coisa que a
validação ponta a ponta desta sprint existe pra pegar.

## Validado em staging — o critério de pronto, com números reais

Três dias seguidos, cada um fechado depois do anterior:

| Dia | Lançamentos | saldoInicial | saldoFinal |
|---|---|---|---|
| 01/09 | +500, -120 | 0 | **380** |
| 02/09 | +200 | **380** ✓ | 580 |
| 03/09 | -80 | **580** ✓ | 500 |

Cada saldo bate exatamente com a soma dos lançamentos daquele dia mais o
saldo herdado do fechamento anterior — o critério de pronto ("GESTOR fecha
o caixa do dia e vê o saldo bater com o financeiro do app"), confirmado com
números reais, não só lido no código.

Também testado: pagar uma `ContaPagar` gera automaticamente o lançamento
de saída correspondente, que aparece no fechamento do dia sem nenhum passo
manual extra; tentar pagar a mesma conta duas vezes é rejeitado; tentar
fechar o mesmo dia duas vezes é rejeitado.

## Verificação pós-deploy em produção

```sql
SELECT count(*) FROM "LancamentoCaixa"; -- esperado: 0
SELECT count(*) FROM "FechamentoCaixa"; -- esperado: 0
SELECT count(*) FROM "ContaPagar";      -- esperado: 0
```

## Rollback

```sql
ALTER TABLE "LancamentoCaixa" DROP CONSTRAINT IF EXISTS "LancamentoCaixa_escolaId_fkey";
ALTER TABLE "LancamentoCaixa" DROP CONSTRAINT IF EXISTS "LancamentoCaixa_contaPagarId_fkey";
ALTER TABLE "FechamentoCaixa" DROP CONSTRAINT IF EXISTS "FechamentoCaixa_escolaId_fkey";
ALTER TABLE "ContaPagar" DROP CONSTRAINT IF EXISTS "ContaPagar_escolaId_fkey";
DROP TABLE IF EXISTS "LancamentoCaixa";
DROP TABLE IF EXISTS "FechamentoCaixa";
DROP TABLE IF EXISTS "ContaPagar";
DROP TYPE IF EXISTS "TipoLancamentoCaixa";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20260830010000_add_caixa_backoffice';
```

---

## Fase 3 — status

- **S3.1 (cobrança automática):** pendente, aguardando decisão de negócio
  (Stripe Connect vs. conta única).
- **S3.2 (contrato digital):** ✅ concluída.
- **S3.3 (backoffice mínimo):** ✅ concluída (esta sprint).

Fase 3 está completa no que não dependia da decisão de gateway. Próxima é a
**Fase 4 (CRM comercial)** — mas vale considerar retomar a decisão de S3.1
antes, já que financeiro é o núcleo que mais entrega valor imediato.
