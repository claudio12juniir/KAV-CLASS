# Runbook — S5.5: Estoque simples, renovação em lote e link de aula online

Migration: `kav-class-backend/prisma/migrations/20260831000000_add_estoque_link_online/migration.sql`

Última sprint da Fase 5. Três itens de cauda longa, agrupados por não
terem dependência forte entre si — só de S1.3 (já concluída).

## O que essa migration faz

100% aditivo: um enum novo (`TipoMovimentacaoEstoque`), duas tabelas
novas (`Produto`, `MovimentacaoEstoque`) e uma coluna nova nullable em
`Aula` (`linkOnline`). Nenhuma coluna existente muda de tipo, sem
backfill.

## 1. Estoque simples de produtos

`Produto.quantidadeEstoque` é o saldo atual, atualizado atomicamente
(numa transação, junto com o registro da `MovimentacaoEstoque`) a cada
`ENTRADA`/`SAIDA`/`EMPRESTIMO`/`DEVOLUCAO` — não é recalculado do zero a
cada consulta.

**"Simples" é uma decisão de escopo, não uma limitação esquecida**: sem
categoria de produto, sem fornecedor, sem preço de custo/venda. Empréstimo
não tem um registro formal de "empréstimo em aberto" — `GET
/api/estoque/emprestimos-ativos` **deriva** quem está com o quê somando
`EMPRESTIMO` menos `DEVOLUCAO` por produto+aluno, só devolvendo quem tem
saldo positivo. Simples de implementar e de auditar (o histórico completo
de movimentações continua em `GET /api/produtos/:id/movimentacoes`), sem
precisar de um estado de "ativo/devolvido" pra manter sincronizado.

### Rotas novas

| Rota | Quem | O que faz |
|---|---|---|
| `GET/POST /api/produtos` | qualquer professor | lista / cria (mesmo padrão de Curso/Sala, sem gate de DONO/GESTOR) |
| `PATCH /api/produtos/:id` | qualquer professor | edita nome/descrição/ativo |
| `POST /api/produtos/:id/movimentacoes` | qualquer professor | registra movimentação, atualiza o saldo na mesma transação |
| `GET /api/produtos/:id/movimentacoes` | qualquer professor | histórico completo |
| `GET /api/estoque/emprestimos-ativos` | qualquer professor | quem está com o quê, agora |

## 2. Renovação de matrícula em lote

Reaproveita a **mesma fórmula de "fim de contrato"** já usada pelo cron
`verificarContratosExpirados` (pré-existente): `Aluno.dataInicioContrato +
Aluno.tempoContrato` meses. Não criei um conceito novo de "vencimento" —
essa é a única noção de expiração de contrato que existe de verdade no
sistema hoje (a `Matricula` de S2.2 não tem data de fim).

**Renovar = reiniciar a contagem a partir de hoje** (`dataInicioContrato
= now()`), com `valorMensalidade` atualizado (já o valor final, com
desconto aplicado ou não — não existe uma entidade "desconto" separada,
o GESTOR só digita o valor que quer cobrar dali pra frente) e
`tempoContrato` opcionalmente redefinido (senão, mantém o mesmo).

**Fora de escopo, de propósito**: isto não gera `Pagamento`/fatura nova.
A rotina de cobrança baseada em `Aluno.diaVencimento`/`valorMensalidade`
já existente continua sendo a fonte de verdade das faturas — renovação
aqui só estende a janela do contrato.

**Limitação pré-existente, encontrada por causa desta sprint (não
corrigida — fora de escopo)**: a checagem de duplicidade do cron
(`jaExiste`, dentro de `verificarContratosExpirados`) é por `alunoId`
sem nenhum limite de tempo — uma vez que a notificação
`CONTRATO_EXPIRADO` existe pra um aluno, o cron nunca mais cria outra
pra ele, **mesmo depois de renovado e o novo contrato expirar de
novo**. Isso já existia antes desta sprint; só ficou visível agora
porque renovação em lote é o primeiro fluxo que efetivamente "reabre" um
contrato depois de expirado. Registrado aqui pra não virar surpresa
depois — corrigir isso é um trabalho separado (provavelmente:
`dadosExtra` guardar a data do fim do contrato daquele ciclo específico,
não só o `alunoId`).

### Rotas novas

| Rota | Quem | O que faz |
|---|---|---|
| `GET /api/renovacoes/vencendo?dias=30` | DONO/GESTOR | alunos cujo contrato vence dentro de N dias (inclui quem já venceu) |
| `POST /api/renovacoes/lote` | DONO/GESTOR | renova vários de uma vez, tolerante a falha por item (um aluno inválido não derruba os outros) |

## 3. Link de aula online

`Aula.linkOnline`, nullable. **Não é geração automática via Google
Calendar API** — isso exigiria OAuth adicional e é uma decisão de
negócio em aberto, do mesmo tipo já sinalizada pra outras integrações
externas nesta série. O professor cria o link no Meet (ou qualquer outro
serviço) fora do app e cola aqui; a presença do campo é o que decide se
o app mostra um botão de "Entrar na aula" — sem precisar de um
tipo/enum novo pra distinguir aula presencial de online.

### Rotas

| Rota | Quem | O que faz |
|---|---|---|
| `POST /api/aulas` (estendida) | professor | aceita `linkOnline` opcional na criação |
| `PUT /api/aulas/:id/link-online` | professor (dono da aula) | seta ou remove (string vazia) |

## Frontend

- **Estoque**: seção em `(professor)/escola.tsx` — criar produto, ver
  saldo, registrar movimentação (com seletor de aluno inline pra
  empréstimo/devolução, reaproveitando a lista de alunos já carregada
  pela tela) e ver empréstimos ativos.
- **Renovação em lote**: seção com checkbox por aluno vencendo + campo de
  valor editável (default: valor atual), confirmação explícita antes de
  disparar (`Alert`), só visível a DONO/GESTOR.
- **Link de aula online**: **sem UI nesta sprint** — mesma decisão de
  escopo já registrada em S1.4/S4.2/S4.3: não existe hoje uma tela de
  detalhe/edição de uma `Aula` específica no app pra pendurar um campo
  de "colar link do Meet". Rotas prontas e testadas via curl.

## Validado em staging — ponta a ponta

**Estoque:**
1. Criar produto sem quantidade inicial → saldo `0`. `ENTRADA` de 10 →
   `10`. `SAIDA` de 3 → `7`. `SAIDA` de 100 (maior que o saldo) →
   **400**, saldo continua `7`.
2. `EMPRESTIMO` sem `alunoId` → **400**. Com `alunoId` válido, 2
   unidades → saldo desconta, aparece em `emprestimos-ativos` com
   `saldo: 2`. `DEVOLUCAO` parcial (1) → `emprestimos-ativos` mostra
   `saldo: 1`. Devolução total → some da lista.
3. Histórico (`GET .../movimentacoes`) reflete as 5 movimentações do
   teste, em ordem.

**Renovação em lote:**
4. Aluno com contrato vencendo em 11 dias aparece em
   `?dias=30`; aluno com contrato vencendo em ~330 dias não aparece.
5. `POST /api/renovacoes/lote` com um aluno válido + um `alunoId`
   inexistente → **200** com `1/2 renovada(s)`, resultado por item
   discriminando sucesso/falha — o item inválido não derrubou o válido.
6. Depois de renovado, o aluno some de `GET .../vencendo` (contrato
   reiniciado a partir de hoje). `valorMensalidade` confirmado atualizado
   no banco.

**Link online:**
7. `POST /api/aulas` com `linkOnline` → salvo. `PUT .../link-online`
   edita; mandando `""` remove (confirmado `NULL` no banco). Editar aula
   de outro professor → **404**.

**Permissão e isolamento (todas as três frentes):**
8. `GET/POST /api/renovacoes/*` com professor `papel: PROFESSOR` (não
   DONO/GESTOR) → **403** nas duas rotas.
9. Professor de outra escola não vê os produtos desta (`GET
   /api/produtos` retorna vazio).

Dados de teste apagados do staging ao final.

## Verificação pós-deploy em produção

```sql
SELECT count(*) FROM "Produto";              -- esperado: 0
SELECT count(*) FROM "MovimentacaoEstoque";  -- esperado: 0
SELECT count(*) FROM "Aula" WHERE "linkOnline" IS NOT NULL; -- esperado: 0
```

## Rollback

```sql
ALTER TABLE "MovimentacaoEstoque" DROP CONSTRAINT IF EXISTS "MovimentacaoEstoque_produtoId_fkey";
ALTER TABLE "MovimentacaoEstoque" DROP CONSTRAINT IF EXISTS "MovimentacaoEstoque_alunoId_fkey";
ALTER TABLE "MovimentacaoEstoque" DROP CONSTRAINT IF EXISTS "MovimentacaoEstoque_escolaId_fkey";
ALTER TABLE "Produto" DROP CONSTRAINT IF EXISTS "Produto_escolaId_fkey";
DROP TABLE IF EXISTS "MovimentacaoEstoque";
DROP TABLE IF EXISTS "Produto";
DROP TYPE IF EXISTS "TipoMovimentacaoEstoque";
ALTER TABLE "Aula" DROP COLUMN IF EXISTS "linkOnline";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20260831000000_add_estoque_link_online';
```

Reverter o deploy do backend também é necessário.

---

## Fase 5 — status: ✅ completa no que não depende de S3.1

- **S5.1 (Comunicados):** ✅
- **S5.2 (Painel de métricas):** pendente (depende de S3.1).
- **S5.3 (QR Code de presença + Salas):** ✅
- **S5.4 (Nota fiscal + antecipação):** pendente (depende de S3.1).
- **S5.5 (Estoque, renovação em lote, aula online):** ✅ (esta sprint).

Com S5.5 concluída, **todo o roadmap (Fases 0–5) está feito**, exceto o
que trava na decisão pendente de S3.1 (Stripe Connect vs. conta única —
ver memória `project_gateway_cobranca_stripe`): S3.1, S5.2 e S5.4.
