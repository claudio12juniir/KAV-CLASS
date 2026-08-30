# Runbook — S2.3: Avaliação do professor + crédito de horas

Migration: `kav-class-backend/prisma/migrations/20260829070000_add_avaliacao_credito_reserva/migration.sql`

Terceira e última sprint da Fase 2 do [roadmap](../roadmap-escola.md). Fecha
o ciclo de feedback do aluno (avaliação) e abre a reserva de sala fora do
horário de aula regular, usando crédito de horas — igual ao módulo de
"Pacotes de crédito de horas" da Emusys.

## O que essa migration faz

Quatro tabelas novas, todas vazias no início, sem tocar em nada existente:

- `Avaliacao` — nota (1-5) + comentário, opcionalmente amarrada a uma Aula.
- `PacoteCredito` — catálogo de pacotes vendáveis pela Escola (ex.: "5h Ensaio").
- `CompraCredito` — ledger de crédito concedido a um aluno (snapshot de
  horas no momento da concessão).
- `ReservaSala` — reserva usando o crédito; `ativa=false` é como se cancela.

## Como o saldo funciona

**Saldo nunca é guardado — é sempre computado na hora**: soma de
`CompraCredito.horas` menos soma de `ReservaSala.horas` onde `ativa=true`.
Isso evita um contador que pode dessincronizar do que realmente aconteceu.
Custo: duas agregações a mais por consulta de saldo — perfeitamente ok pro
volume desse app.

Ao reservar, o saldo é recalculado **dentro da própria transação** que cria
a reserva (não reaproveita um valor lido antes da chamada), reduzindo a
janela de corrida entre duas reservas simultâneas do mesmo aluno. Não é uma
garantia absoluta (exigiria lock explícito de linha), mas é proporcional ao
risco real desse tipo de uso.

## Rotas novas

| Rota | Quem | O que faz |
|---|---|---|
| `POST /api/aluno/avaliacoes` | aluno | avalia um professor (nota 1-5 + comentário), por `aulaId` (professor derivado da aula) ou `professorId` explícito — validado contra o vínculo real do aluno (professor principal ou qualquer Matricula) |
| `GET /api/professor/avaliacoes` | professor | lista + média das próprias avaliações |
| `GET/POST /api/pacotes-credito` | professor | catálogo de pacotes da Escola |
| `POST /api/alunos/:id/creditos` | professor | concede um pacote de crédito pro próprio aluno |
| `GET /api/aluno/creditos/saldo` | aluno | saldo atual (computado) |
| `GET /api/aluno/salas` | aluno | salas ativas da própria Escola, pra escolher onde reservar |
| `POST /api/aluno/reservas` | aluno | reserva sala — **bloqueia se `horas > saldo`** |
| `GET /api/aluno/reservas` | aluno | próprias reservas |
| `PUT /api/reservas/:id/cancelar` | aluno dono ou qualquer professor da Escola | cancela — devolve a hora automaticamente |
| `GET /api/escola/reservas` | professor | reservas ativas em salas da própria Escola |

## Escopo desta sprint — sem tela nova, sem checagem de conflito de horário

Mesma decisão de S1.2/S1.3/S2.2: backend completo e testado, sem UI nova.
Também **não valida conflito com o horário de aula regular do aluno**
("fora do horário de aula regular" é a intenção da Emusys, mas checar isso
exigiria cruzar com `Aula`/`Matricula`/`Turma` de um jeito que merece sprint
própria) — por ora a reserva só depende de crédito suficiente e a sala
existir e estar ativa. Registrado aqui pra não virar suposição silenciosa.

## Validado em staging — o critério de pronto, passo a passo

1. Aluno sem crédito tenta reservar 2h → **400**, "Crédito insuficiente.
   Saldo atual: 0h".
2. Professor cria pacote de 5h e concede pro aluno → saldo passa a **5**.
3. Aluno reserva 2h → sucesso, saldo cai pra **3**.
4. Aluno tenta reservar mais 4h (só tem 3) → **400**, rejeitado.
5. Aluno cancela a reserva de 2h → saldo volta pra **5**, crédito devolvido
   automaticamente.

Também testado: avaliação com `professorId` legítimo (o professor real do
aluno) aceita; avaliação com um `professorId` qualquer, sem vínculo, é
rejeitada com 400 — e a média do professor reflete a nota assim que aceita.

## Verificação pós-deploy em produção

```sql
SELECT count(*) FROM "Avaliacao";     -- esperado: 0
SELECT count(*) FROM "PacoteCredito"; -- esperado: 0
SELECT count(*) FROM "CompraCredito"; -- esperado: 0
SELECT count(*) FROM "ReservaSala";   -- esperado: 0
```

## Rollback

```sql
ALTER TABLE "ReservaSala" DROP CONSTRAINT IF EXISTS "ReservaSala_alunoId_fkey";
ALTER TABLE "ReservaSala" DROP CONSTRAINT IF EXISTS "ReservaSala_salaId_fkey";
ALTER TABLE "ReservaSala" DROP CONSTRAINT IF EXISTS "ReservaSala_escolaId_fkey";
ALTER TABLE "CompraCredito" DROP CONSTRAINT IF EXISTS "CompraCredito_alunoId_fkey";
ALTER TABLE "CompraCredito" DROP CONSTRAINT IF EXISTS "CompraCredito_pacoteCreditoId_fkey";
ALTER TABLE "PacoteCredito" DROP CONSTRAINT IF EXISTS "PacoteCredito_escolaId_fkey";
ALTER TABLE "Avaliacao" DROP CONSTRAINT IF EXISTS "Avaliacao_alunoId_fkey";
ALTER TABLE "Avaliacao" DROP CONSTRAINT IF EXISTS "Avaliacao_professorId_fkey";
ALTER TABLE "Avaliacao" DROP CONSTRAINT IF EXISTS "Avaliacao_aulaId_fkey";
DROP TABLE IF EXISTS "ReservaSala";
DROP TABLE IF EXISTS "CompraCredito";
DROP TABLE IF EXISTS "PacoteCredito";
DROP TABLE IF EXISTS "Avaliacao";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20260829070000_add_avaliacao_credito_reserva';
```

---

## Fase 2 completa

Com esta sprint, a Fase 2 do roadmap (App do aluno/responsável) está
inteira: S2.1 (reposição em duas camadas), S2.2 (matrícula e faturas
agrupadas) e S2.3 (avaliação + crédito de horas). Próxima é a Fase 3
(Financeiro transacional: cobrança automática, contrato digital).
