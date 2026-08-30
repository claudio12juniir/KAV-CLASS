# Runbook — S1.4: Agenda geral da Escola + calendário letivo

Migration: `kav-class-backend/prisma/migrations/20260830050000_add_calendario_escola/migration.sql`

## ⚠️ Achado antes de começar: sprint pulada, não é sequência normal

Revendo o roadmap antes de seguir da Fase 4 pra Fase 5, achei que **S1.4
nunca foi feita** — a Fase 1 "terminou" em S1.3 (tabela de valores) e a
Fase 2 começou direto, sem registro do porquê S1.4 ficou de fora. Isso só
apareceu porque **S5.2** e **S5.3**, no roadmap, dependem explicitamente
de S1.4 — ou seja, ir direto pra Fase 5 teria construído em cima de uma
base que não existe. Voltei e fiz S1.4 agora, antes da Fase 5.

## O que essa migration faz

100% aditivo: um enum novo (`TipoDiaNaoLetivo`) e uma tabela nova
(`DiaNaoLetivo`). Nenhuma coluna existente é alterada, sem backfill.

## Decisões de escopo (leia antes de estender isso)

O roadmap pede: *"Calendário da Escola (feriados/recessos) que agenda e
matrícula respeitam automaticamente."* Duas decisões registradas aqui, não
assumidas em silêncio:

1. **"Agenda respeita automaticamente" foi aplicado só em `POST
   /api/aulas`** (a rota de agendamento avulso). Não existe neste código
   nenhum motor que gera `Aula` automaticamente a partir de `Turma` ou
   `Matricula` numa rotina/cron — toda `Aula` nasce de um `POST` explícito.
   Então não há "outro lugar" pra aplicar a regra além desse ponto de
   criação.
2. **Não toquei nas rotas de reposição de S2.1** (`POST /api/reposicoes`,
   `POST /api/aluno/reposicoes`), mesmo elas também carregando uma data
   (`dataProposta`). São rotas já em produção, usadas por usuários reais
   pagantes hoje — retrofitar uma nova regra de bloqueio nelas exigiria
   pensar com calma na experiência de quem já usa (que mensagem o aluno
   vê, se o professor pode contornar, etc.), o que não é o escopo desta
   sprint. Registrado aqui como próximo passo natural, não como omissão.
3. **"Matrícula respeita automaticamente"**: `Matricula` não tem nenhum
   passo de geração de aula recorrente pra "respeitar" — criar uma
   matrícula num feriado não bloqueia nada nesta sprint, porque não faz
   sentido operacional bloquear alguém de formalizar uma matrícula
   administrativa num dia específico. O efeito prático dessa cláusula do
   roadmap é coberto pelo bloqueio em `POST /api/aulas`, que é onde
   "agenda" de verdade acontece.

## Rotas novas

| Rota | Quem | O que faz |
|---|---|---|
| `GET /api/escola/calendario` | qualquer professor da Escola | lista feriados/recessos |
| `POST /api/escola/calendario` | DONO/GESTOR | adiciona (data `YYYY-MM-DD`, descrição, tipo) |
| `DELETE /api/escola/calendario/:id` | DONO/GESTOR | remove |
| `GET /api/escola/agenda?de=&ate=` | DONO/GESTOR | grade completa da Escola (todos os professores), agrupável por professor/sala no cliente |
| `PUT /api/aulas/:id/trocar-professor` | DONO/GESTOR | reatribui sem precisar do app do professor original |
| `PUT /api/aulas/:id/trocar-sala` | DONO/GESTOR | idem, pra sala |
| `PUT /api/aulas/:id/cancelar` | DONO/GESTOR | cancela; com `comReposicao=true`, já cria a solicitação (fluxo `PROFESSOR` de S2.1 — aluno ainda confirma a data) |
| `POST /api/aulas` (existente) | professor | agora rejeita **400** se a data cair num feriado/recesso da Escola |

## Frontend

Seção "Calendário da Escola" em `(professor)/escola.tsx`: lista de
feriados/recessos, formulário de adicionar (só DONO/GESTOR vê o
formulário e o botão de remover; qualquer professor vê a lista). **Não
entrou** nesta sprint a visão de grade/agenda completa nem as ações
inline de trocar professor/sala/cancelar — essas três rotas de gestão
fina de aula fazem mais sentido numa tela própria de "Agenda da Escola"
(grade visual, não uma lista simples como as outras seções desta tela),
que é um investimento de UI maior que o cabido aqui. Rotas prontas e
testadas, aguardando essa tela.

## Cuidado de fuso horário nesta sprint

`DiaNaoLetivo.data` é gravada com o mesmo helper `ancorarNoDia` já usado
no módulo de caixa (S3.3) — parseia `"YYYY-MM-DD"` manualmente em vez de
confiar em `new Date(string)`, evitando o mesmo bug de fuso já documentado
naquela sprint. A checagem dentro de `POST /api/aulas` foi feita
**usando os mesmos acessores de data local que a própria rota já usa**
pra decidir "que dia é esse" (antes da conversão UTC+3 que essa rota já
fazia só pro horário) — de propósito, pra não herdar nem criar uma nova
inconsistência de fuso. Não mexi na lógica de horário pré-existente dessa
rota (fora de escopo, rota em produção).

## Validado em staging — ponta a ponta

1. Criei feriado em `2026-08-31`; data mal formatada → **400**; duplicar
   a mesma data → **400** (constraint `@@unique([escolaId, data])`).
2. `POST /api/aulas` pedindo a segunda-feira (que caía em `31/08`) →
   **400** com mensagem clara citando o feriado. Pedindo terça (`01/09`,
   sem feriado) → **201**, funciona normal.
3. `GET /api/escola/agenda` retornou a aula com `professor`/`aluno`
   inclusos.
4. `trocar-sala` com sala inexistente → **400**; com sala válida →
   aplicado. `trocar-professor` pra um professor de **outra escola** →
   **400** (não vaza id de professor de fora do tenant).
5. `cancelar` sem `comReposicao` → só cancela. Com `comReposicao: true`
   sem `dataProposta`/`motivo` → **400**. Completo → cancela **e** cria a
   `Reposicao` (`status: AGUARDANDO`, `origem: PROFESSOR`, exatamente o
   fluxo que já existia desde S2.1 — o aluno confirma a data proposta
   como sempre).
6. **Permissão dentro da mesma Escola**: criei um segundo professor com
   `papel: PROFESSOR` (não `DONO`/`GESTOR`) na mesma Escola de teste —
   `GET /api/escola/agenda` e `POST /api/escola/calendario` responderam
   **403** pra ele, mas `GET /api/escola/calendario` (leitura) funcionou
   normalmente — confirma que a leitura é aberta a qualquer professor e
   só escrita/gestão fina é DONO/GESTOR, como desenhado.
7. **Isolamento entre escolas**: professor de outra escola não viu nem a
   agenda nem o calendário desta.

Dados de teste apagados do staging ao final.

## Verificação pós-deploy em produção

```sql
SELECT count(*) FROM "DiaNaoLetivo"; -- esperado: 0
```

## Rollback

```sql
ALTER TABLE "DiaNaoLetivo" DROP CONSTRAINT IF EXISTS "DiaNaoLetivo_escolaId_fkey";
DROP TABLE IF EXISTS "DiaNaoLetivo";
DROP TYPE IF EXISTS "TipoDiaNaoLetivo";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20260830050000_add_calendario_escola';
```

Reverter o deploy do backend também é necessário — `POST /api/aulas`
agora consulta `DiaNaoLetivo`, que quebraria sem a tabela.

---

## Fase 1 — status: ✅ completa agora (com atraso)

- S1.1, S1.2, S1.3: ✅ (sprints originais)
- **S1.4 (Agenda geral + calendário letivo): ✅ (esta sprint, retomada)**

Com isso, **S5.2** e **S5.3** (que dependiam de S1.4) não têm mais
bloqueio de pré-requisito pra quando a Fase 5 começar.
