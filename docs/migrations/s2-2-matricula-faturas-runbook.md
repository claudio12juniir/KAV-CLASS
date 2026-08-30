# Runbook — S2.2: Matrícula e faturas agrupadas

Migration: `kav-class-backend/prisma/migrations/20260829060000_add_matricula/migration.sql`

Segunda sprint da Fase 2 do [roadmap](../roadmap-escola.md). Introduz
`Matricula` como entidade própria — até aqui, "aluno" e "matrícula" eram a
mesma coisa (um Aluno só podia ter um professor, um curso, um valor). Agora
um mesmo Aluno pode ter mais de uma Matricula simultânea, cada uma com seu
próprio conjunto de faturas.

## O que essa migration faz

- Tabela nova `Matricula` (aluno, professor, escola, turma opcional, plano
  de pagamento opcional, valor, dia de vencimento, status).
- Coluna **nullable** `matriculaId` em `Pagamento`.
- Sem backfill: os `Pagamento` gerados por `/api/configurar-aluno` (o fluxo
  que já existia) continuam exatamente como estão, sem `matriculaId`. Essa
  migration não toca em nenhum deles.

## Por que isso é aditivo de verdade

O vínculo "implícito" que `Aluno` já carrega (`professorId`, `curso`,
`valorMensalidade`, e os `Pagamento` gerados a partir dele) **não foi
tocado nesta sprint** — continua sendo o jeito como a esmagadora maioria
dos professores usa o app hoje, sem nenhuma mudança de comportamento.
`Matricula` é um sistema novo, opt-in, que roda em paralelo: um professor
só começa a usá-lo quando cria a primeira `Matricula` pra um aluno — o que
faz sentido sobretudo quando o mesmo aluno tem mais de um vínculo (dois
cursos, dois professores na mesma Escola).

## Rotas novas

| Rota | Quem | O que faz |
|---|---|---|
| `GET/POST /api/matriculas` | professor | lista/cria matrículas próprias |
| `GET /api/aluno/matriculas` | aluno | lista as próprias matrículas |
| `GET /api/matriculas/:id/faturas` | dono (professor ou aluno) | faturas agrupadas em `abertas`/`atrasadas`/`pagas`/`outras` |
| `POST /api/matriculas/:id/faturas` | professor | gera uma fatura nova pra aquela matrícula |
| `PUT /api/pagamentos/:id/dividir` | professor | corta uma fatura em N partes — soma precisa bater com o valor original (tolerância de 1 centavo); original vira `CANCELADO` (fica no histórico), N novas nascem `PENDENTE` |
| `GET /api/pagamentos/:id/recibo` | dono (professor ou aluno) | recibo estruturado, só de fatura `PAGO` |

Sem gerador de PDF — nenhuma outra parte do app gera PDF hoje (nem boleto,
nem contrato), então o recibo devolve dados estruturados prontos pra tela
montar/compartilhar, consistente com o resto do produto.

## Escopo desta sprint — sem tela nova

Mesma decisão de S1.2/S1.3: entrega de backend completa e testada, sem UI
nova. Como `Matricula` é 100% opt-in e não existe nenhuma linha até alguém
decidir usar, não há gap de experiência sendo deixado pela metade — a tela
de pagamento do aluno que já existe continua servindo perfeitamente o fluxo
atual. Uma tela de "Faturas por Matrícula" fica natural numa sprint futura,
quando o fluxo de matrícula tiver uma tela de criação também (hoje só
existe via API).

## Validado em staging — o critério de pronto, ao pé da letra

> "um aluno com 2 matrículas na mesma escola vê 2 conjuntos de fatura
> separados"

1. Criadas 2 `Matricula` pro mesmo aluno (violão R$150, piano R$200).
2. Gerada 1 fatura em cada.
3. Aluno consulta `GET /api/matriculas/:id/faturas` de cada uma
   separadamente — **cada resposta só mostra a fatura daquela matrícula**,
   nunca a da outra.

Também testado:
- `dividir` com soma errada → 400, com a diferença explicada na mensagem.
- `dividir` com soma certa → fatura original `CANCELADO`, N novas
  `PENDENTE` com vencimentos próprios.
- `recibo` de fatura `PENDENTE` → 400 ("só dá pra emitir de fatura paga").
- `recibo` de fatura `PAGO` → 200, acessível tanto pelo professor quanto
  pelo aluno dono, negado pra qualquer outro.

## Verificação pós-deploy em produção

```sql
SELECT count(*) FROM "Matricula"; -- esperado: 0 logo após o deploy
SELECT count(*) FROM "Pagamento" WHERE "matriculaId" IS NOT NULL; -- esperado: 0
```

## Rollback

```sql
ALTER TABLE "Pagamento" DROP CONSTRAINT IF EXISTS "Pagamento_matriculaId_fkey";
DROP INDEX IF EXISTS "Pagamento_matriculaId_idx";
ALTER TABLE "Pagamento" DROP COLUMN IF EXISTS "matriculaId";
DROP TABLE IF EXISTS "Matricula";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20260829060000_add_matricula';
```
