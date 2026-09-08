# Runbook — INSTITUTION Sprint 5: Alunos (ficha 100% editável, multi-curso/multi-professor)

Migration: `kav-class-backend/prisma/migrations/20260908130000_add_contrato_url_plano_personalizado/migration.sql`

Quinta sprint do plano de 11 (`docs/institution-briefing-2026-09-08.md`, seção 7).

## O que essa migration faz

- `Aluno.contratoUrl String?` — anexo do contrato fechado (upload de arquivo, texto livre por enquanto — sem storage integrado, mesma decisão do Sprint 1 pra `logoUrl`/`contratoUrl` de professor).
- `Matricula.planoPersonalizadoDescricao String?` — descrição livre de um plano que não é um `PlanoPagamento` global.
- 100% aditivo.

## Decisões de arquitetura (reafirmando a decisão já registrada no briefing seção 7.1)

- Multi-curso/multi-professor **não** reformula `Aluno.professorId`/`Aluno.curso` — eles continuam sendo o vínculo principal (usado em dezenas de rotas como "dono" pro app do aluno/professor). Vínculos adicionais usam `Matricula`, que já tinha os campos certos.
- `POST /api/matriculas` agora aceita `professorId` no body (só DONO/GESTOR pode escolher um professor diferente do `Aluno.professorId`) e `planoPersonalizadoDescricao`. `PATCH /api/matriculas/:id` (novo) edita um vínculo existente; `DELETE /api/matriculas/:id` (novo) remove, com uma mensagem clara se houver `Contrato` vinculado (violação de FK `P2003` convertida em 400, não 500).

## Rotas novas/alteradas

| Rota | Quem | O que faz |
|---|---|---|
| `GET /api/escola/alunos` | DONO/GESTOR | `select` bem mais rico: telefone, nascimento, tempo/início de contrato, `contratoUrl`, responsável, e a lista completa de `matriculas` (professor, turma/curso, plano ou plano personalizado, contrato mais recente). |
| `PUT /api/escola/alunos/:id` | DONO/GESTOR | Novo. Edição completa (nome, e-mail, nova senha opcional, telefone, curso, professor principal, nascimento, contrato, e upsert do responsável financeiro). |
| `POST /api/escola/alunos/criar` | DONO/GESTOR | Estendida com os mesmos campos novos, mais criação do responsável já no cadastro. |
| `POST /api/matriculas` | Professor / DONO-GESTOR | Aceita `professorId` (override, só gestão) e `planoPersonalizadoDescricao`. |
| `PATCH /api/matriculas/:id` | Professor dono ou DONO/GESTOR | Edita valor, vencimento, turma, plano/personalizado; troca de professor só por DONO/GESTOR. |
| `DELETE /api/matriculas/:id` | DONO/GESTOR | Remove o vínculo. |

## Frontend

- `alunos.tsx`: reescrita. Filtros (nome, tempo de contrato via chips, intervalo de início e de término de contrato — término calculado no client a partir de `dataInicioContrato + tempoContrato`, sem endpoint novo). Um único componente `FichaAluno` (modal) serve tanto pra "+ Novo aluno" quanto pra editar (clique na linha da tabela) — mesma tela, conforme nota do próprio briefing. Dentro da ficha: dados pessoais, contrato (tempo/início/anexo), responsável financeiro (com cálculo de idade pra sugerir CONTRATANTE/DEPENDENTE, mas sem travar a escolha), professor principal, e a seção "Cursos, professores e planos" com os vínculos `Matricula` adicionais — cada um com plano global ou personalizado, e o fluxo de contrato digital (enviar/ver status) reaproveitado das rotas já existentes de `matriculas.tsx`.
- `matriculas.tsx` **não foi removida ainda** — isso é o Sprint 6 (remoção da aba + garantir que nada dependia só dela). Nesta sprint as duas UIs de criar/editar matrícula coexistem (a antiga em `matriculas.tsx`, a nova embutida na ficha do aluno), sem conflito, porque usam as mesmas rotas de backend.

## Validado nesta sessão

- `node -c server.js` — sintaxe OK; boot local sem erro.
- `npx tsc --noEmit -p .` — sem erros novos.
- Migration aplicada com sucesso contra o banco real.
- **Pendente de teste manual**: fluxo completo (criar aluno com responsável menor de idade, adicionar segundo vínculo com plano personalizado, enviar contrato, filtrar por tempo de contrato).

## O que essa sprint deliberadamente NÃO faz

- Upload real de arquivo pra `contratoUrl` — continua sendo campo de texto (URL), mesma decisão já registrada no Sprint 1.
- Deduplicação de `ResponsavelFinanceiro` por CPF ao editar — cada aluno mantém seu próprio registro; juntar duplicados é trabalho futuro, já registrado como dívida técnica no runbook original de S1.1.
- Remover a aba/tela `matriculas.tsx` — isso é o Sprint 6.
