# Runbook — S4.3: Aula experimental + conversão

Migration: `kav-class-backend/prisma/migrations/20260830040000_add_aula_experimental/migration.sql`

Terceira e última sprint da Fase 4 (CRM comercial). Fecha o funil aberto
em S4.1/S4.2: agora dá pra medir se a captação está virando aluno de
verdade.

## O que essa migration faz

100% aditivo: duas colunas novas (`Escola.regraConversaoExperimental`, com
`DEFAULT`, e `Matricula.leadId`, nullable) e uma tabela nova
(`AulaExperimental`). Nenhuma coluna existente muda de tipo, sem backfill.

- **`AulaExperimental`**: aula-teste vinculada a um `Lead` (não a um
  `Aluno` — ele ainda não é aluno). Tem `status` (`AGENDADA` →
  `REALIZADA`/`NAO_COMPARECEU`/`CANCELADA`), `cursoId` e `professorId`
  opcionais (pra reportar por curso/professor depois, se quiser).
- **`Matricula.leadId`** (nullable, `@unique`): quando uma matrícula nasce
  da conversão de um Lead, `POST /api/matriculas` aceita esse campo
  opcional pra registrar o vínculo. `@unique` garante que um Lead não vira
  "matriculado" duas vezes.
- **`Escola.regraConversaoExperimental`**: `QUALQUER_MATRICULA` (default)
  ou `MESMO_CURSO_PROFESSOR` — é a "regra configurável" pedida no
  roadmap.

## Como a conversão é calculada (não é um campo, é derivado)

Não existe um booleano "convertida" gravado em lugar nenhum — o relatório
calcula na hora: para cada `AulaExperimental` no período, olha se
`Lead.matricula` existe (via `Matricula.leadId`) **e** se
`matricula.createdAt >= aulaExperimental.dataHora` (só conta como
conversão da experimental se a matrícula foi feita depois dela — evita
atribuir uma matrícula antiga e sem relação a uma experimental
qualquer). Se a regra da Escola for `MESMO_CURSO_PROFESSOR`, também exige
que `matricula.professorId` bata (quando a experimental tinha um
professor definido) e que o curso da turma da matrícula bata com o
`cursoId` da experimental (quando ela tinha um curso definido — sem
curso na experimental, esse lado da checagem é pulado, só o professor
importa).

## Rotas novas

| Rota | Quem | O que faz |
|---|---|---|
| `POST /api/leads/:id/aula-experimental` | professor | agenda a aula-teste pro lead |
| `GET /api/aulas-experimentais?status=` | professor | lista da Escola |
| `PUT /api/aulas-experimentais/:id/status` | professor | atualiza status |
| `PUT /api/escola/regra-conversao` | DONO/GESTOR | configura `QUALQUER_MATRICULA` ou `MESMO_CURSO_PROFESSOR` |
| `GET /api/relatorios/conversao-experimental?de=&ate=` | professor | o critério de pronto: taxa de conversão por período |
| `POST /api/matriculas` (estendida) | professor | agora aceita `leadId` opcional pra registrar a conversão |

## Frontend

Card "Conversão experimental → matrícula" em `(professor)/escola.tsx`,
últimos 30 dias, só aparece quando há pelo menos uma experimental no
período (evita mostrar "0/0 = 0%" sem sentido pra quem ainda não usa o
recurso). **Não entrou** nesta sprint uma tela de agendar/gerenciar aula
experimental — mesmo motivo de S4.2: ainda não existe uma tela de
lista/detalhe de lead no app pra pendurar esse fluxo. As três rotas
(agendar, listar, atualizar status) estão prontas e testadas; falta só o
lugar natural na UI, que faz mais sentido nascer junto quando essa tela
de lead for construída.

## Validado em staging — ponta a ponta

1. `POST /api/leads/:id/aula-experimental` sem `dataHora` → **400**.
   Com curso/professor inválido → **400**. Válido → **201**, `professorId`
   default cai no professor autenticado quando não informado.
2. `PUT .../status` com valor fora do enum → **400**; `REALIZADA` →
   aplica certo.
3. Relatório **antes** da matrícula → `convertidas: 0`. `POST
   /api/matriculas` com `leadId` → matrícula criada e vinculada.
   Tentar vincular um **segundo** aluno ao mesmo lead → **400** (já
   convertido, `@unique` respeitado).
4. **Achado direto no primeiro teste**: criei a experimental com
   `dataHora` no futuro (`2026-09-01`, só pra ter uma data qualquer) e a
   matrícula saiu com `createdAt` de hoje (`2026-08-30`) — mais cedo que
   a experimental. Pela regra `matricula.createdAt >= dataHora`, isso
   corretamente **não** contou como conversão: no mundo real a matrícula
   é criada *depois* que a experimental acontece, e o teste só não
   refletia isso. Refeito com uma `dataHora` no passado (`2026-08-25`) →
   `convertida: true`, `taxaConversao: 100`. Não foi um bug de código,
   foi um dado de teste mal construído — mas validou que a regra de
   ordenação temporal está funcionando como projetado.
5. Regra `MESMO_CURSO_PROFESSOR`: experimental **sem** curso definido +
   matrícula sem turma → ainda conta (só o professor é checado, que
   bateu). Depois, experimental **com** curso definido (`Violão`) +
   matrícula sem turma (sem curso nenhum) → **não** conta — o lado do
   curso da checagem bloqueou corretamente a conversão "fraca".
6. **Isolamento entre escolas**: professor de outra escola vê
   `GET /api/aulas-experimentais` vazio e `GET
   /api/relatorios/conversao-experimental` com `totalExperimentais: 0`,
   mesmo com experimentais existindo na outra escola.

Dados de teste apagados do staging ao final (não removi o `Curso`
"Violão" de teste — tinha uma `Turma` dependente de outro teste antigo e
apagá-lo não valia o risco de mexer em dado de sprint anterior; é dado
claramente fictício, sem efeito colateral).

## Verificação pós-deploy em produção

```sql
SELECT count(*) FROM "AulaExperimental";                    -- esperado: 0
SELECT count(*) FROM "Matricula" WHERE "leadId" IS NOT NULL; -- esperado: 0
SELECT "regraConversaoExperimental", count(*) FROM "Escola" GROUP BY 1; -- tudo QUALQUER_MATRICULA
```

## Rollback

```sql
ALTER TABLE "AulaExperimental" DROP CONSTRAINT IF EXISTS "AulaExperimental_leadId_fkey";
ALTER TABLE "AulaExperimental" DROP CONSTRAINT IF EXISTS "AulaExperimental_cursoId_fkey";
ALTER TABLE "AulaExperimental" DROP CONSTRAINT IF EXISTS "AulaExperimental_professorId_fkey";
ALTER TABLE "AulaExperimental" DROP CONSTRAINT IF EXISTS "AulaExperimental_escolaId_fkey";
DROP TABLE IF EXISTS "AulaExperimental";
DROP TYPE IF EXISTS "StatusAulaExperimental";
ALTER TABLE "Matricula" DROP CONSTRAINT IF EXISTS "Matricula_leadId_fkey";
ALTER TABLE "Matricula" DROP COLUMN IF EXISTS "leadId";
ALTER TABLE "Escola" DROP COLUMN IF EXISTS "regraConversaoExperimental";
DROP TYPE IF EXISTS "RegraConversaoExperimental";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20260830040000_add_aula_experimental';
```

Reverter o deploy do backend também é necessário — `POST /api/matriculas`
passa a mandar `leadId` pro Prisma, que quebraria sem a coluna.

---

## Fase 4 — status: ✅ concluída

- **S4.1 (Leads e funil):** ✅
- **S4.2 (Captação de leads):** ✅
- **S4.3 (Aula experimental + conversão):** ✅ (esta sprint)

Próxima é a **Fase 5 — Avançado & diferenciação** (comunicados em escala,
e o que mais o roadmap listar). S3.1 (cobrança automática via Stripe
Connect vs. conta única) segue pendente da decisão de negócio.
