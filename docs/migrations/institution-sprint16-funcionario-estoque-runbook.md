# Runbook — INSTITUTION Sprint 16: Funcionário genérico + trava de acesso ao Estoque

Migration: `kav-class-backend/prisma/migrations/20260922010000_add_funcionario_persona/migration.sql`

Quinta sprint do plano de 22/09/2026 (`docs/institution-briefing-2026-09-22.md`, seção 4). Aplicada com o fluxo já registrado (`db execute` + `migrate resolve --applied` + `generate`).

## Parte 1 — Funcionário genérico

- `PapelUsuario` ganha `FUNCIONARIO` (`ALTER TYPE ... ADD VALUE`, migration isolada — Postgres não deixa usar um valor de enum novo na mesma transação que o cria, mesmo padrão já usado em `20260921000000_add_secretaria_persona`).
- `Professor` ganha `cargo` (String?, texto livre — "Financeiro", "Recepção", "Limpeza" etc.) — só rótulo informativo, não controla nenhuma permissão.
- **Decisão de escopo**: o campo `permissoesSecretaria` (nome preservado, não renomeado — evita migração + busca-e-troca arriscada em dezenas de lugares) passa a valer igual pras duas personas de staff não-professor. Toda checagem de permissão que antes testava só `papel === 'SECRETARIA'` agora testa `['SECRETARIA','FUNCIONARIO'].includes(papel)`:
  - `exigirPapelNaEscola` (server.js) — usado por dezenas de rotas já existentes.
  - `filtrarPorPermissao` (`my-app/app/(escola)/_ui.tsx`) — esconde item de menu.
  - `GET/PUT /api/escola/secretarias*` — listam e editam permissão de SECRETARIA e FUNCIONARIO juntos.
- `POST /api/escola/professores/criar` aceita `papel: 'FUNCIONARIO'` + `cargo` opcional, além do já existente `papel: 'SECRETARIA'`.
- Frontend: `my-app/app/(escola)/secretarias.tsx` (arquivo e rota mantidos por compatibilidade, tela renomeada visualmente pra "Funcionários") ganhou seletor "Secretaria" / "Outro segmento" no modal de criação; "Outro segmento" libera o campo "Cargo/segmento". Item de menu em `_ui.tsx` renomeado de "Secretaria" pra "Funcionários".
- `Papel` (union type em `_contexto.tsx`) ganhou `'FUNCIONARIO'`.

## Parte 2 — Trava de acesso ao Estoque (e Salas)

**Achado da auditoria de 22/09/2026**: as rotas de Salas e Produtos/Estoque (`/api/salas*`, `/api/produtos*`, `/api/estoque/emprestimos-ativos`) usavam só `exigirProfessor + carregarEscolaDoProfessor` — sem checar papel nem `permissoesSecretaria` nenhum. Isso quebrava a promessa do resto do painel (onde `exigirPapelNaEscola` já bloqueia SECRETARIA sem permissão de módulo): uma SECRETARIA sem "Recursos" liberado ainda conseguia chamar a API direto e ver o estoque da escola, só não via o botão no menu.

- Novo middleware `exigirModuloEscola(chaveModulo)` (server.js, ao lado de `carregarEscolaDoProfessor`) — substitui `carregarEscolaDoProfessor` como segundo middleware nas 9 rotas de Salas/Produtos/Estoque. Mesma responsabilidade (seta `req.auth.escolaId`) + bloqueia quem não tem acesso: DONO/GESTOR/PROFESSOR sempre passam (**PROFESSOR continua com acesso direto de propósito** — é a convenção já usada em todo o painel hoje, só SECRETARIA/FUNCIONARIO são restritos por módulo; não é uma trava nova pra quem já podia usar isso, só fecha a brecha de quem deveria estar restrito e não estava); SECRETARIA/FUNCIONARIO só se `'recursos'` estiver em `permissoesSecretaria`.
- **Decisão de escopo**: Salas e Estoque compartilham a mesma chave `'recursos'` (não criei uma chave `'estoque'` separada) porque já são a mesma tela com sub-abas (`recursos.tsx`) e o mesmo item de menu — separar a permissão exigiria também separar a UI em duas abas com visibilidade independente, fora do escopo pedido.
- `CHAVES_PERMISSAO_SECRETARIA` ganhou `'reposicoes'` — omissão da Sprint 15 (a rota nova daquela sprint já checava esse `chaveModulo`, mas a lista de chaves liberáveis pro DONO escolher nunca foi atualizada, então nenhuma secretaria/funcionário conseguiria receber essa permissão pela UI). `ROTULOS_PERMISSAO` (frontend) ganhou a mesma chave.

**Gap conhecido, não corrigido nesta sprint (fora do pedido)**: o mesmo padrão frágil (`exigirProfessor + carregarEscolaDoProfessor`, sem checar módulo) existe em dezenas de outras rotas do painel (Cursos, Turmas, Modalidades, Tabelas de Valores, Cronograma de Conteúdo, Pacotes de Crédito, Reservas de Sala, Caixa/Contas a Pagar, CRM de Leads/Funil, Links de Captação, Aulas Experimentais, Calendário). Só Salas e Produtos/Estoque foram corrigidos porque eram os únicos citados no pedido do usuário (itens 8 e 9). Uma auditoria de RBAC completa nessas rotas é essencialmente o que o roadmap mestre já registra como **S7.1** (RBAC granular) — não replicar esse trabalho aqui, tratar como pendência formal daquele item.

## Validado nesta sessão

- `node -c server.js` — sintaxe OK; boot local sem erro.
- `npx tsc --noEmit -p .` em `my-app/` — zero erros no projeto inteiro.
- Migration aplicada com sucesso contra o banco real.
- **Pendente de teste manual**: criar um funcionário "Outro segmento" com permissão só de `recursos`, logar como ele, confirmar que só a aba Recursos aparece e que as chamadas de API de Salas/Produtos funcionam; confirmar que uma secretaria SEM `recursos` recebe 403 ao tentar acessar a API diretamente (não só que o botão some do menu).
