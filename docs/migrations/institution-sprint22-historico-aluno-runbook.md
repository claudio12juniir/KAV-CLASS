# Runbook — INSTITUTION Sprint 22: Modal do aluno com histórico completo

Sem migration nova — 3 rotas novas + restruturação de tela. Terceira sprint da rodada de 23/09/2026.

## O que essa sprint faz

Antes: o modal de aluno (`my-app/app/(escola)/alunos.tsx`) era um único formulário de edição de cadastro — sem histórico de aulas, materiais, relatórios ou pagamentos visível ali. Agora vira uma ficha completa com abas (`SubAbasSimples`, componente que já existia em `_ui.tsx` mas nunca tinha sido usado nesta tela).

### Abas (só aparecem editando um aluno existente — "+ novo aluno" continua só com "Dados")

| Aba | Fonte de dado |
|---|---|
| **Dados** | O formulário que já existia (cadastro, contrato, responsável, professor, matrículas) — ganhou campo novo **Foto de perfil (URL)**. |
| **Histórico** | `GET /api/escola/alunos/:id/historico-aulas` (nova) — todas as aulas do aluno, com o badge de 3 cores do Sprint 21 (verde/amarelo/vermelho/cinza) e, quando é uma aula de reposição, "Repondo a aula de [data]" (usa `Reposicao.aulaOriginal` do Sprint 20 — é exatamente o "mostrando sempre de que dia aquela reposição está pagando" pedido pelo usuário). |
| **Conteúdos** | `GET /api/escola/alunos/:id/materiais` (nova) — todo `Material` que esse aluno específico recebeu. Antes só existia a visão do próprio aluno (`GET /api/aluno/materiais`); faltava a visão da escola por aluno. |
| **Relatórios** | `GET /api/escola/relatorios-aluno?alunoId=` — **já existia** e já aceitava esse filtro (nenhuma rota nova aqui), só nunca tinha sido consumida por aluno específico fora da Coordenação. |
| **Pagamentos** | `GET /api/escola/alunos/:id/pagamentos` (nova) — histórico de faturas do aluno com status colorido (Pago/Atrasado/Pendente/Em análise/Cancelado). |

Cada aba busca os próprios dados **sob demanda** (`useAbaAluno`, hook local com `useEffect` guardado por `ativa`) — abrir a ficha não dispara 5 requisições de uma vez, só a de "Dados" (que já vem no `aluno` recebido da lista).

### Foto de perfil

`Aluno.fotoUrl` já existia no schema (usado no SELF), mas o cadastro/edição pela escola nunca expunha isso. Agora: campo na aba Dados, aceito em `POST /api/escola/alunos/criar` e `PUT /api/escola/alunos/:id`, e a lista de alunos (`Tabela`) mostra a foto de verdade em vez da inicial quando `fotoUrl` está preenchido. Mesmo padrão do resto do projeto — é um campo de texto (URL), sem upload de arquivo integrado.

## Validado nesta sessão

- `node -c server.js` — sintaxe OK; boot local sem erro.
- `npx tsc --noEmit -p .` em `my-app/` — zero erros no projeto inteiro.
- **Pendente de teste manual**: abrir a ficha de um aluno com aulas/materiais/relatórios/pagamentos reais e conferir cada aba; cadastrar foto de perfil e ver aparecendo na lista.

## O que essa sprint deliberadamente NÃO faz

- Não adiciona upload real de imagem (câmera/galeria) — é só um campo de URL, mesmo padrão já usado em `contratoUrl`/`fotoUrl` de professor.
- Não pagina o histórico de aulas/materiais/pagamentos — lista tudo de uma vez. Aceitável no volume esperado por aluno; pode virar pendência se algum aluno acumular centenas de aulas.
- Não inclui a aba **Contrato** ainda — fica pra Sprint 23 (próxima), que também mexe no app do aluno.
