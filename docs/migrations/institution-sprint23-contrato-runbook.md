# Runbook — INSTITUTION Sprint 23: Contrato visível (escola + aluno)

Sem migration nova — 1 rota + 3 telas. Quarta sprint da rodada de 23/09/2026.

## Achado importante desta sprint: correção retroativa do Sprint 13

Ao investigar onde adicionar a aba do aluno, descobri que **existe um app inteiro separado pro aluno de Escola de verdade**: `my-app/app/(aluno-escola)/`, com seu próprio `_layout.tsx`, `_nav.ts`, tema ERP e `index.tsx`. `(aluno)/` é só o app do **SELF** (aluno de professor autônomo). Um aluno com `Escola.pacote === 'PACOTE_ESCOLA'` é **redirecionado automaticamente** pra `(aluno-escola)` antes de qualquer tela de `(aluno)/` renderizar (`RedirecionadorEscolaAluno` em `(aluno)/_layout.tsx`).

Isso significa que **o card de confirmação de presença 24h antes, implementado no Sprint 13 só em `(aluno)/index.tsx`, nunca apareceu pra nenhum aluno de uma Escola de verdade** — só pra alunos de professor autônomo. Corrigido nesta sprint: o mesmo card (mesma rota `PUT /api/aulas/:id/confirmar-presenca-previa`, já existente e já funcional) foi portado pra `(aluno-escola)/index.tsx`. **Lição registrada**: daqui pra frente, toda mudança pedida como "no app/login do aluno" precisa ser conferida nos dois grupos (`(aluno)` e `(aluno-escola)`), não só um.

## O que essa sprint faz (pedido original: aba Contrato)

- `GET /api/aluno/contrato` (nova, `exigirAluno`) — devolve `{ contratoUrl }` do próprio aluno logado. Não é rota de escrita nova: quem sobe o contrato continua sendo a escola (`Aluno.contratoUrl`, já editável no modal dela desde o Sprint 5/18). Funciona pra aluno de qualquer pacote — o campo não distingue SELF de Escola.
- **Escola**: aba "Contrato" nova no modal do aluno (`alunos.tsx`, 6ª aba) — mostra botão "Abrir contrato" (usa o `contratoUrl` já carregado na aba Dados) ou aviso de que nada foi anexado ainda.
- **Aluno SELF**: tela nova `(aluno)/contrato.tsx`, registrada como rota oculta em `_layout.tsx` e item novo em `mais.tsx`.
- **Aluno de Escola**: tela nova `(aluno-escola)/contrato.tsx` (mesmo padrão de `materiais.tsx` deste grupo — `MobileErpShell` + `NAV_ALUNO_ESCOLA`), item novo em `_nav.ts`.

## Pegadinha de ambiente: tipos de rota do Expo Router

Depois de criar `contrato.tsx` nos dois grupos, `tsc` falhou com "Argument of type '/(aluno)/contrato' is not assignable" — o Expo Router com `typedRoutes: true` gera `.expo/types/router.d.ts` (lista literal de todas as rotas) e esse arquivo só é regenerado pelo Metro bundler rodando de verdade (dev server), **não** por `tsc` nem por `expo export --platform web` sozinho. Resolvido rodando `npx expo start --web` em background por ~20s (tempo suficiente pro Metro escanear `app/` e reescrever o arquivo) e encerrando o processo antes de rodar `tsc` de novo. Registrado aqui porque toda tela nova em `my-app/app/` vai precisar desse passo antes do typecheck fechar limpo.

## Validado nesta sessão

- `node -c server.js` — sintaxe OK; boot local sem erro.
- `npx tsc --noEmit -p .` em `my-app/` — zero erros no projeto inteiro (depois de regenerar os tipos de rota).
- **Pendente de teste manual**: abrir a aba Contrato como escola (com e sem `contratoUrl`), e como aluno nos dois apps (SELF e Escola); confirmar que o card de confirmação de presença 24h antes aparece agora também no app do aluno de Escola.

## O que essa sprint deliberadamente NÃO faz

- Não corrige retroativamente os Sprints 12 (badge de substituição) nem outros detalhes visuais que só existem em `(escola)/index.tsx` (visão da escola) — esses nunca precisaram existir do lado do aluno. Só o Sprint 13 (confirmação prévia) era uma funcionalidade **do aluno** que ficou no app errado; foi essa a corrigida.
- Não adiciona upload real de arquivo — é leitura do mesmo campo de URL que já existia.
