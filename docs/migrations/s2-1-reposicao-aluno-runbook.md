# Runbook — S2.1: Reposição iniciada pelo aluno, em duas camadas

Migration: `kav-class-backend/prisma/migrations/20260829050000_add_reposicao_aluno_flow/migration.sql`

Primeira sprint da Fase 2 do [roadmap](../roadmap-escola.md). Fecha um gap
real: até aqui só o professor conseguia propor uma reposição (aluno só
confirmava ou pedia outra data) — não existia jeito do aluno pedir uma
reposição por conta própria, que é exatamente o fluxo que a Emusys descreve
("Solicitações de reagendamento pedidas pelo aluno").

## O que essa migration faz

- 4 valores novos no enum `StatusReposicao` (`SOLICITADA`, `AUTORIZADA`,
  `NEGADA`, `FINALIZADA`) — os 3 valores antigos (`AGUARDANDO`,
  `CONFIRMADA`, `SOLICITANDO_OUTRO`) continuam existindo, intocados, pro
  fluxo "professor propõe" que já existia.
- Enum novo `OrigemReposicao` (`PROFESSOR` | `ALUNO`).
- Coluna `origem` em `Reposicao`, `NOT NULL DEFAULT 'PROFESSOR'` — seguro
  mesmo com linhas existentes (default fixo, Postgres aplica via fast
  default) e semanticamente correto: toda `Reposicao` de antes desta sprint
  era mesmo iniciada pelo professor.

## Os dois fluxos, lado a lado

| | Fluxo antigo (continua igual) | Fluxo novo (S2.1) |
|---|---|---|
| Quem inicia | Professor propõe uma data | Aluno pede uma reposição |
| Status | `AGUARDANDO` → `CONFIRMADA`/`SOLICITANDO_OUTRO` | `SOLICITADA` → `AUTORIZADA`/`NEGADA` → `FINALIZADA` |
| Quem decide | Aluno confirma ou pede outra data | Professor aprova/nega, **depois** a Escola finaliza |

**Ordem obrigatória no fluxo novo**: só dá pra finalizar uma reposição que já
foi autorizada pelo professor — a rota de finalizar filtra
`status: 'AUTORIZADA'` explicitamente, então tentar finalizar direto (sem
passar por aprovar) dá 404, não um bypass silencioso.

## Rotas novas

| Rota | Quem | O que faz |
|---|---|---|
| `POST /api/aluno/reposicoes` | aluno | pede uma reposição (`dataProposta`, `motivo`) → nasce `SOLICITADA` |
| `PUT /api/reposicoes/:id/aprovar` | professor dono | `SOLICITADA` → `AUTORIZADA` |
| `PUT /api/reposicoes/:id/negar` | professor dono | `SOLICITADA` → `NEGADA` |
| `PUT /api/reposicoes/:id/finalizar` | DONO/GESTOR da Escola | `AUTORIZADA` → `FINALIZADA` (só reposições de professores da mesma Escola) |
| `GET /api/escola/reposicoes` | DONO/GESTOR | lista o que está `AUTORIZADA`, esperando finalizar |
| `GET /api/relatorios/aulas-sem-presenca` | professor | "faltas duplas" da Emusys — aulas cujo horário já passou e `presenca` nunca foi registrada |

Note que `finalizar` usa `exigirPapelNaEscola`, não `exigirProfessor` puro —
por isso funciona igual pra quem está no Pacote Professor (o professor solo
é `DONO` da própria Escola de 1 pessoa, então ele mesmo aprova *e* finaliza,
sem perceber que são dois papéis diferentes por baixo) e pra quem está no
Pacote Escola de verdade (um GESTOR separado finaliza).

## Frontend

- `(aluno)/reposicoes.tsx`: card "Precisa repor uma aula?" com formulário
  inline (data desejada + motivo), e uma nova seção "Meus pedidos de
  reposição" com o status de cada um.
- `(professor)/reposicoes.tsx`: nova seção "Pedidos de Alunos" no topo, com
  botões Autorizar/Negar — só aparece quando há pedido `SOLICITADA`
  pendente.
- `(professor)/escola.tsx`: nova seção "Reposições pra finalizar", com botão
  Finalizar — só aparece quando há algo `AUTORIZADA` esperando.

## Validado em staging — ponta a ponta

1. Aluno solicita → nasce `SOLICITADA`, `origem: ALUNO`.
2. Professor tenta finalizar direto → **404** (ordem obrigatória confirmada).
3. Professor aprova → `AUTORIZADA`.
4. Professor tenta aprovar de novo o mesmo id → **404** (não é mais
   `SOLICITADA`, sem duplo-processamento).
5. DONO finaliza → `FINALIZADA`. Conferido no banco.
6. Caminho de negar testado separadamente → `NEGADA`.
7. `GET /api/escola/reposicoes` some da lista assim que finalizada.
8. `GET /api/relatorios/aulas-sem-presenca` responde 200 (vazio no cenário
   de teste, sem aula com horário passado).

## Verificação pós-deploy em produção

```sql
SELECT origem, count(*) FROM "Reposicao" GROUP BY origem;
-- esperado: todo mundo em PROFESSOR (nenhuma linha ALUNO ainda existe)
```

## Rollback

Reverter os 4 valores novos de enum não é trivial em Postgres (não dá pra
remover valor de enum com `ALTER TYPE DROP VALUE`), então o rollback real é
"parar de usar" — reverter o deploy do backend/app pra uma revisão anterior
a este commit é suficiente, já que nenhuma linha existente foi alterada.
Pra desfazer de fato a coluna nova:

```sql
ALTER TABLE "Reposicao" DROP COLUMN IF EXISTS "origem";
DROP TYPE IF EXISTS "OrigemReposicao";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20260829050000_add_reposicao_aluno_flow';
```
