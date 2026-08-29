# Validação em staging — 29/08/2026

Registro da primeira validação real das 4 migrations acumuladas na branch
`feat/fase-0-escola` (S0.1 → S1.2), feita depois do achado de que nenhuma
delas tinha rodado contra um banco de verdade ainda.

## Como o staging foi montado

1. Postgres 17 local via Docker (`docker run ... postgres:17`), mesma versão
   major do banco de produção (Supabase roda 17.6).
2. `pg_dump --schema-only` do banco de produção real — **só estrutura, zero
   linha de dado de usuário** copiada. Restaurado no container local.
3. Dados de teste claramente fictícios inseridos à mão (`staging-prof-1`,
   `e2e.prof1@teste.local` etc.) — nenhum dado real de professor/aluno foi
   copiado ou usado em momento nenhum.
4. `npx prisma migrate deploy` rodado contra esse staging, aplicando as 4
   migrations em sequência.

O container fica disponível em `localhost:5433` (usuário `postgres`, senha
`staging`, banco `kavclass_staging`) pra reuso em validações futuras. Pra
remover: `docker rm -f kavclass-staging`.

## Resultado: as 4 migrations aplicam limpo

```
Applying migration `20260829000000_add_escola_multi_tenant`
Applying migration `20260829010000_add_convite_professor`
Applying migration `20260829020000_add_responsavel_financeiro`
Applying migration `20260829030000_add_curso_sala_turma`
All migrations have been successfully applied.
```

Verificação pós-backfill (as mesmas queries dos runbooks individuais) —
todas bateram exatamente com o esperado: zero professor/aluno sem
`escolaId`, zero Escola com id diferente do Professor que a originou, zero
Aluno com `escolaId` diferente do professor dele, todos os professores
existentes viraram `DONO`/`PACOTE_PROFESSOR`, nenhuma tabela nova
(`ConviteProfessor`, `ResponsavelFinanceiro`, `Curso`, `Sala`, `Turma`) ficou
com linha nenhuma (como esperado, sem backfill).

## Resultado: fluxos ponta a ponta testados com o servidor de verdade

Com o `server.js` real rodando contra esse staging (não mocks), testado via
HTTP:

| Fluxo | Resultado |
|---|---|
| Cadastro de professor (cria Escola aninhada) | ✅ |
| `GET /api/dashboard` autenticado (lê `escolaId`) | ✅ 200 |
| `GET /api/professor/perfil` (traz `papel: DONO`, `escola.pacote`) | ✅ |
| Cadastro de aluno menor **sem** responsável → bloqueado | ✅ 400 |
| Cadastro de aluno menor **com** responsável → `DEPENDENTE` | ✅ 201, conferido no banco |
| Cadastro de aluno maior de idade → `CONTRATANTE` automático | ✅ 201, conferido no banco |
| `POST /api/cursos`, `POST /api/salas`, `POST /api/turmas` (com vínculo entre eles) | ✅ |
| `PUT /api/admin/escola/pacote` (upgrade pra Pacote Escola) | ✅ |
| `POST /api/escola/convites` sem Pacote Escola → bloqueado | ✅ 403 |

## O que não foi possível testar via HTTP nesta sessão

O fluxo completo de **convite de professor** (`POST /api/escola/convites` →
aceitar) trava neste ambiente de sandbox especificamente no envio de e-mail:
isolei o problema e confirmei que é o próprio `require('nodemailer')` que
nunca retorna nesta máquina/sandbox — não é um bug de lógica, é algo
específico deste ambiente de teste (Node ou o pacote instalado aqui). Fora
disso:

- A criação do convite no banco (`prisma.conviteProfessor.create`) foi
  testada isoladamente, fora do HTTP, e funcionou normalmente.
- A lógica de `POST /api/escola/convites/aceitar` foi validada por leitura
  de código, não por execução — é o mesmo padrão já testado e funcionando
  em `/api/alunos/cadastro` (código digitado, verificação de e-mail,
  criação de conta vinculada).

**Ganho real dessa investigação:** os dois pontos onde o app manda e-mail
(`enviarEmailRedefinicao` e `enviarEmailConviteProfessor`) ganharam
`connectionTimeout`/`greetingTimeout`/`socketTimeout` no transporte Gmail —
sem isso, uma falha de rede genuína em produção prenderia a requisição (e
com ela, o event loop do Node) indefinidamente. Isso é uma correção real e
válida independente do enigma do `require()` neste sandbox.

## Conclusão

As migrations estão prontas para produção do ponto de vista estrutural — a
migration mais arriscada de todas (S0.1, com backfill em cima de dados
reais) se comporta exatamente como o runbook previu, testada agora contra
uma cópia real da estrutura de produção. Antes de aplicar em produção de
verdade, ainda vale rodar o mesmo teste de convite de professor num
ambiente sem essa peculiaridade do `require('nodemailer')` (ex.: direto no
Render, ou localmente numa outra máquina) — não porque haja suspeita de bug,
mas porque é o único trecho que não pôde ser exercitado ponta a ponta aqui.
