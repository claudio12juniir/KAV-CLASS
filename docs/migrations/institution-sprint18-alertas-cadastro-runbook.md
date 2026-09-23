# Runbook — INSTITUTION Sprint 18: Alertas vermelhos consistentes + campos de cadastro

Migration: `kav-class-backend/prisma/migrations/20260922030000_add_cpf_endereco_pix_estoque/migration.sql`

Sétima sprint do plano de 22/09/2026 (`docs/institution-briefing-2026-09-22.md`, seção 4).

## Parte 1 — Alertas vermelhos nas 5 telas que faltavam

Cobertura da auditoria de 22/09/2026: `equipe.tsx`, `logistica.tsx`, `recursos.tsx`, `coordenacao.tsx`, `comunicados.tsx` não usavam `Kpi`/`Badge tom='alerta'` nenhuma vez. Cada uma ganhou um sinal real (dado já carregado pela própria tela, sem endpoint novo):

| Tela | Alerta adicionado |
|---|---|
| `equipe.tsx` | Badge vermelho "Sem contrato" por professor sem `contratoUrl` — risco jurídico/administrativo. |
| `logistica.tsx` | Badge vermelho "Pendente" no cabeçalho da seção "Sem sala definida". |
| `recursos.tsx` | Badge do estoque muda de cor: vermelho quando `quantidadeEstoque === 0`, laranja (`aviso`) quando ≤ 5 — mesma lógica já usada no Painel. |
| `coordenacao.tsx` | `Estrelas` (média de avaliação) fica vermelha quando a nota é menor que 3 — a própria razão de existir da aba é vigiar qualidade de ensino. |
| `comunicados.tsx` | Badge de "Rascunho" passou de tom neutro pra `aviso` (laranja) — **decisão de escopo**: não virou vermelho (`alerta`) porque um rascunho não é necessariamente um erro (pode ser intencional), diferente dos outros 4 casos que são sinais de problema real. |

## Parte 2 — Revisão de cadastro (campos novos)

- `Aluno` ganha `cpf`, `endereco` (nullable).
- `Professor` ganha `cpf`, `endereco` (nullable). **`chavePix` já existia** desde `20260422000000_add_missing_fields_and_tables` (pro professor RECEBER de aluno via Pix) — não duplicado; passa a ser reaproveitável também como o dado de Pix pra Escola pagar o repasse de aula (Sprint 12), embora o pagamento em si continue manual (comprovante anexado) por enquanto.
- `Produto` ganha `categoria`, `valorCusto`, `valorVenda`, `estoqueMinimo` (todos nullable).

### Rotas atualizadas (aceitam os campos novos, todos opcionais)

`POST/PUT` de aluno (`/api/escola/alunos/criar`, `/api/escola/alunos/:id`), `POST/PUT` de professor (`/api/escola/professores/criar`, `/api/escola/professores/:id`), `POST/PATCH` de produto (`/api/produtos`, `/api/produtos/:id`) — e os `GET` de listagem correspondentes (`/api/escola/alunos`, `/api/escola/professores`) passaram a incluir os campos novos no `select`, senão o formulário de edição nunca veria o valor já salvo.

### `Produto.estoqueMinimo` fecha um TODO do Sprint 3

`my-app/app/(escola)/index.tsx` tinha um limiar fixo (`LIMIAR_ESTOQUE_BAIXO = 5`) com comentário explícito dizendo "sem campo configurável no schema ainda". Agora o widget "Estoque baixo" do Painel usa `Produto.estoqueMinimo` quando definido, caindo pro padrão de 5 só quando o produto nunca teve um mínimo configurado (`estaComEstoqueBaixo`, `p.quantidadeEstoque <= (p.estoqueMinimo ?? 5)`).

### Frontend

- `alunos.tsx`: campos CPF + Endereço no modal de cadastro/edição (editável nos dois modos, igual ao resto da ficha).
- `equipe.tsx`: campos CPF + Endereço no formulário de criação de professor.
- `recursos.tsx`: campos Categoria, Valor de custo, Valor de venda, Estoque mínimo no modal "Novo produto".

**Gap conhecido, não corrigido nesta sprint**: `equipe.tsx` nunca teve uma tela de "editar ficha completa" de um professor já existente (só existe edição de `papel` via `modalPapel`) — o `PUT /api/escola/professores/:id` já aceitava telefone/contatoEmergencia/dataPagamento/contratoUrl/cursos/fotoUrl há sprints e nunca teve UI pra isso além da criação. CPF/Endereço entram no mesmo barco: só editáveis na criação por ora. Registrado como pendência, não escondido — não é regressão desta sprint, é uma lacuna pré-existente.

## Achado corrigido de passagem (bug da Sprint 16)

`GET /api/escola/professores` filtrava só `papel: { not: 'SECRETARIA' }` — depois da Sprint 16 (papel `FUNCIONARIO`), isso deixaria funcionários genéricos vazarem pra lista da aba Equipe. Corrigido pra `papel: { notIn: ['SECRETARIA', 'FUNCIONARIO'] }` nesta sprint, junto da adição de `contratoUrl`/`cpf`/`endereco` ao mesmo `select` (que também estava faltando `contratoUrl`, usado pelo alerta "Sem contrato" da Parte 1).

## Validado nesta sessão

- `node -c server.js` — sintaxe OK; boot local sem erro.
- `npx tsc --noEmit -p .` em `my-app/` — zero erros no projeto inteiro.
- Migration aplicada com sucesso contra o banco real (numa segunda tentativa — a primeira falhou por tentar recriar `Professor.chavePix`, que já existia; corrigida antes de reaplicar, nenhuma coluna ficou pela metade porque `prisma db execute` roda o arquivo inteiro numa transação só).
- **Pendente de teste manual**: cadastrar aluno/professor/produto com os campos novos preenchidos e conferir que voltam certos na edição; conferir visualmente os 5 alertas vermelhos/laranja nas telas listadas.
