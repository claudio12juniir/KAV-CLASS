# Runbook — S1.1: Responsável financeiro + matrícula formal

Migration: `kav-class-backend/prisma/migrations/20260829020000_add_responsavel_financeiro/migration.sql`

Primeira sprint da Fase 1 do [roadmap](../roadmap-escola.md). Introduz a
entidade `ResponsavelFinanceiro` — a peça que faltava pra separar "quem
frequenta a aula" de "quem paga por ela", igual à Emusys ("nome do aluno e
do responsável, se menor de idade").

## O que essa migration faz

- Cria a tabela `ResponsavelFinanceiro` (nome, CPF, e-mail, telefone,
  escopada por Escola).
- Adiciona duas colunas **nullable** em `Aluno`: `responsavelId` e
  `vinculoResponsavel` (`CONTRATANTE` | `DEPENDENTE`).
- Sem backfill: alunos cadastrados antes desta sprint continuam com
  `responsavelId = NULL` até alguém preencher via
  `PUT /api/alunos/:id/responsavel`. Nenhuma coluna existente foi tocada.

## Regra de negócio

- **Maior de idade** → `CONTRATANTE`: o próprio aluno é o responsável
  financeiro (um `ResponsavelFinanceiro` é criado automaticamente com os
  dados de cadastro dele).
- **Menor de idade** (calculado a partir de `dataNascimento`) → `DEPENDENTE`:
  exige nome do responsável no cadastro; CPF e telefone ficam opcionais.
- Se `dataNascimento` não for informada no cadastro por e-mail/senha (campo
  não é obrigatório nessa rota, ao contrário do fluxo Google), o aluno fica
  sem responsável — mesmo comportamento de antes desta sprint, só que agora
  corrigível depois pela rota de edição.

## Rotas novas/alteradas

| Rota | O que mudou |
|---|---|
| `POST /api/alunos/cadastro` | aceita `responsavel: { nome, cpf, email, telefone }` no corpo; obrigatório só quando o aluno é menor. |
| `POST /api/auth/google/cadastrar` (papel aluno) | idem — nessa rota `dataNascimento` já era obrigatória, então o vínculo é sempre determinado. |
| `PUT /api/alunos/:id/responsavel` **(nova)** | professor dono do aluno cria/substitui o responsável financeiro dele. Não tenta reaproveitar um responsável existente por CPF — evita linkar a pessoa errada silenciosamente; isso fica pra uma sprint com busca dedicada. |
| `GET /api/meus-alunos` | passa a incluir `responsavel` no retorno. |
| `GET /api/aluno/perfil` | passa a incluir `responsavel` e `vinculoResponsavel`. |

## Aplicando em produção

Mesmo checklist das migrations anteriores — backup, staging primeiro,
`npx prisma migrate deploy` (já roda automaticamente no build do Render).
Como não há backfill, o risco é baixo: só cria tabela nova e colunas
nullable.

## Verificação pós-deploy

```sql
SELECT count(*) FROM "ResponsavelFinanceiro"; -- esperado: 0 logo após o deploy
SELECT count(*) FROM "Aluno" WHERE "responsavelId" IS NOT NULL; -- esperado: 0 (sem backfill)
```

No app: cadastrar um aluno menor de idade sem preencher o nome do
responsável deve bloquear no próprio formulário (`register.tsx`) antes de
chamar a API; cadastrar preenchendo deve criar o `ResponsavelFinanceiro` e
vincular como `DEPENDENTE`. Cadastrar um aluno maior de idade deve criar um
responsável `CONTRATANTE` automaticamente, sem pedir nada extra na tela.

## Rollback

Sem backfill — reverter é só desfazer a tabela e as colunas novas:

```sql
ALTER TABLE "Aluno" DROP CONSTRAINT IF EXISTS "Aluno_responsavelId_fkey";
DROP INDEX IF EXISTS "Aluno_responsavelId_idx";
ALTER TABLE "Aluno" DROP COLUMN IF EXISTS "responsavelId";
ALTER TABLE "Aluno" DROP COLUMN IF EXISTS "vinculoResponsavel";
DROP TABLE IF EXISTS "ResponsavelFinanceiro";
DROP TYPE IF EXISTS "VinculoResponsavel";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20260829020000_add_responsavel_financeiro';
```

## O que essa sprint deliberadamente NÃO faz

- Não impede duplicidade de `ResponsavelFinanceiro` por CPF (dois irmãos
  cadastrados separadamente geram dois responsáveis, mesmo com o mesmo CPF).
  Reaproveitar por busca é trabalho de UI, não só de schema — fica pra
  depois.
- Não dá login/acesso ao app para o responsável — ele continua sendo só um
  registro financeiro; app de responsável com conta própria é escopo maior,
  fora desta sprint.
- Não constrói o restante da "matrícula formal" da Emusys (curso, modalidade,
  sala como entidades selecionáveis) — isso é S1.2 (Cursos, turmas e salas),
  que ainda não rodou. Por isso o cadastro continua usando os campos livres
  de curso que já existiam (`Aluno.curso`, `Professor.cursos`), sem mudança
  aqui.
