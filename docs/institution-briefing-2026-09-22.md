# Briefing de sessão — KAV CLASS INSTITUTION (22/09/2026)

> Documento de handoff pra iniciar uma sessão nova do zero e continuar exatamente daqui. Escrito pra ser lido sozinho, sem precisar da conversa anterior.

## 1. Contexto

Esta sessão parte de uma nova lista de 11 pedidos do usuário pro painel INSTITUTION, mandada em 22/09/2026. Antes de planejar, os dois documentos anteriores foram lidos (`docs/institution-briefing-2026-09-08.md`, plano de 11 sprints; `docs/roadmap-escola.md`, roadmap mestre Fases 0–8) e uma auditoria de código foi feita pra confirmar **o que dessas sprints já foi de fato implementado** vs. o que ainda é só documento. Achado principal: **boa parte das Sprints 1–11 do briefing de 08/09 já está implementada no schema e nas telas** (`DisponibilidadeProfessor`, `Escola.valorPorAula`/`tipoRemuneracaoProfessor`, `Aula.presencaProfessorEm`/`presencaAlunoEm`/`decisaoReposicao`/`assuntoTratado`, `FolhaPagamentoProfessor`, `DespesaFixa`, telas `logistica.tsx`, `perfil-instituicao.tsx`, `coordenacao.tsx`, `secretarias.tsx`, `mensagens.tsx`, `chats.tsx`, `recursos.tsx`) — mas várias ficaram **parciais**: UI mais simples do que o pedido original, ou peça de trás pra frente faltando (ex.: cálculo de folha existe, mas sem suporte a substituição de professor).

**Esta sessão trabalha só em INSTITUTION.** SELF não deve ser tocado a menos que explicitamente pedido.

## 2. Pedido do usuário — transcrição por tema (22/09/2026)

1. Contabilizar presença automaticamente pra pagar o professor por aula (não só fixo), com biometria/Face ID, e permitir que a escola marque quando outro professor cobriu a aula de alguém — nesse caso o valor daquela aula vai pro professor que efetivamente lecionou. Controle 100% da escola (falta de professor/aluno, reposição, repasse) na grade de aulas do dia.
2. Notificação de confirmação de presença do aluno 24h antes da aula agendada (oficial ou reposição) — precisa ser confirmação com resposta rastreável, não só lembrete.
3. Planilha/calendário da grade semanal do professor, 06h às 23h, segunda a segunda. A escola regula os alunos daquele professor por esse calendário; trocar um aluno de horário, com confirmação, atualiza todo o sistema.
4. Tela dedicada de reposição com 3 colunas: Para repor / Reposições agendadas / Reposições concluídas (com data, horário, professor que lecionou).
5. Grupo interno dos professores (equipe, não alunos) com opção de mídia/mensagem fixada (ex.: link fixo de aula ao vivo via Meet).
6. Funil de captação: link rastreável que a escola divulga, apontando pra uma landing page com formulário feito pela própria escola; ao responder, a resposta do formulário deve ser enviada direto pro WhatsApp daquela escola.
7. Cadastrar qualquer funcionário/segmento/associado, não só "secretária".
8. Salas: assim que configuradas, virar uma planilha de horários das 06h às 23h, com nome do professor e do aluno na aula marcada.
9. Estoque: setor deve ser liberado só pro funcionário que a escola autorizar (controle de acesso).
10. Alertas em vermelho, sempre, destacando o que é importante (alunos atrasados, pendência de reposição, etc.) — em todas as telas, não só onde já existe.
11. Revisar/ampliar os campos de entrada nos cadastros de pessoas e itens.

Instrução geral (herdada do briefing de 08/09, ainda vale): onde a especificação for omissa, resolver por inferência de caso de uso consistente com o resto do sistema, registrando a decisão tomada em comentário no schema.

## 3. Auditoria de código — estado real em 22/09/2026

Feita por leitura direta de `kav-class-backend/server.js`, `kav-class-backend/prisma/schema.prisma` e `my-app/app/(escola)/*.tsx` — não por suposição a partir dos docs anteriores.

| # | Item | Status | Evidência |
|---|---|---|---|
| 1 | Repasse de pagamento por substituição | 🔴 **Ausente** | `calcularOuAtualizarFolha` (server.js:6700-6719) soma `Aula` só por `professorId` fixo + `presenca:'PRESENTE'`. Não existe `professorSubstitutoId` nem qualquer campo de "quem efetivamente lecionou" em `Aula`. |
| 2 | Confirmação de presença do aluno 24h antes | 🟡 **Parcial** | `verificarAulasAmanha()` (server.js:738-767), cron `0 8 * * *`, só avisa (push) e marca `Aula.lembreteEnviado=true`. Não pede confirmação, não grava resposta, não roda 24h exatas antes (roda 08h fixo do dia anterior). |
| 3 | Grade semanal do professor 06h-23h | 🟡 **Parcial** | `DisponibilidadeProfessor` existe e é usado. UI em `equipe.tsx` (`GradeDisponibilidade`, linhas 13-78) é formulário de texto (horaInicio/horaFim), não planilha clicável — comentário no próprio código já registra a ideia de "grid de 24 células" como pendente. |
| 4 | Tela de reposição 3 colunas | 🟡 **Backend pronto, tela ausente** | `StatusReposicao` com os 2 fluxos completos, rotas maduras em `/api/reposicoes*` (server.js:3329-3726) e `/api/escola/reposicoes` (9934). Não existe tela dedicada em `(escola)/` — só aparece como item de KPI em `index.tsx`. |
| 5 | Grupo interno de professores + mensagem fixada | 🔴 **Ausente** | `chats.tsx` é read-only pra Secretaria acompanhar chat da turma (professor↔alunos). `mensagens.tsx` é chat 1:1. Nenhum model tem campo de pinned/fixado. Grupo só-entre-professores não existe. |
| 6 | Funil: link → landing externa → WhatsApp | 🟡 **Parcial, direção diferente do pedido** | `LinkCaptacao` gera link rastreável, mas aponta pra formulário **hospedado pelo próprio KAV** (HTML embutido em server.js ~7366/7434) — não uma landing externa da escola. Nenhuma integração de WhatsApp (`wa.me`, Business API, Twilio, Z-API) existe hoje; resposta vira só `Lead` no banco. |
| 7 | Funcionário genérico | 🔴 **Ausente** | `PapelUsuario` trava em `DONO\|GESTOR\|PROFESSOR\|SECRETARIA` (schema.prisma:162-172). `secretarias.tsx` hardcoda `papel:'SECRETARIA'` (linha 98). Já existe infra reaproveitável: `Professor.permissoesSecretaria: String[]` + `exigirPapelNaEscola(req,res,papeis,chaveModulo)` (server.js:9080-9110), gate por módulo. |
| 8 | Salas como planilha 06h-23h | 🟡 **Parcial** | `logistica.tsx` mostra `professor.nome`+`aluno.nome` por sala (linha 151), salvo automaticamente (linha 95) — mas é lista de cards agrupados por sala, não planilha hora-a-hora. Rota `PUT /api/aulas/:id/trocar-sala` já existe. |
| 9 | Estoque com acesso restrito | 🟡 **Falha de controle de acesso** | `recursos.tsx`/`/api/produtos*` (server.js:8233-8335) funcional, mas só usa `exigirProfessor` — sem `exigirPapelNaEscola(...,'estoque')`. Qualquer professor da escola acessa hoje, mesmo a infra de módulo já existindo (ver item 7). |
| 10 | Alertas vermelhos | 🟡 **Parcial** | Componente pronto: `Kpi tom='alerta'` (`ERP.perigo #D92D20`) e `Badge tom='alerta'` em `_ui.tsx` (linhas 234-266), já usado em `index.tsx`, `alunos.tsx`, `financeiro.tsx`, `calendario.tsx`, `captacao.tsx`, `relatorios.tsx`. Ausente em `equipe.tsx`, `logistica.tsx`, `recursos.tsx`, `coordenacao.tsx`, `comunicados.tsx`. |
| 11 | Campos de cadastro | — | **Aluno** (`alunos.tsx` ~408-508): nome, email, senha, telefone, dataNascimento, tempoContrato, dataInicioContrato, contratoUrl (link), responsável (nome/CPF/telefone/email), plano personalizado. Sem CPF do próprio aluno, sem endereço. **Professor** (`equipe.tsx` 464-473): nome, email, senha, telefone, contatoEmergencia, dataNascimento, dataPagamento, contratoUrl (link), cursos (texto livre), fotoUrl. Sem CPF, sem dados bancários/Pix, sem endereço. **Produto** (`recursos.tsx` 199/214): só nome + quantidade em movimentação. Sem descrição, categoria, valor, fornecedor, estoque mínimo. |

## 4. Sprints planejadas (ordem recomendada)

### Sprint 12 — Pagamento por presença com repasse de aula
**Prioridade:** 🔴 Crítica — "coração do sistema" (mesma frase usada pelo usuário em 08/09 pro Financeiro)
- **Schema**: `Aula` ganha `professorSubstitutoId` (nullable, FK pra `Professor`) — quando preenchido, é quem efetivamente lecionou aquela aula específica; `professorId` continua sendo o dono da grade/vínculo com o aluno.
- **Backend**: `calcularOuAtualizarFolha` passa a agrupar por `COALESCE(professorSubstitutoId, professorId)` em vez de só `professorId`. Reposição de mês anterior continua contando no mês em que a aula efetivamente ocorreu (já correto hoje via `Aula.dataHora` — não regredir).
- **Frontend**: na Grade de hoje / Logística, opção "outro professor lecionou esta aula" (select de professor da escola), editável só pela escola. Aparece no card da aula quando preenchido.
- **Depende de:** nada (schema aditivo, rotas já existem pra estender).

### Sprint 13 — Confirmação de presença do aluno 24h antes
**Prioridade:** 🔴 Crítica
- **Schema**: `Aula` ganha `confirmacaoAlunoEm` (DateTime?) e `confirmacaoAlunoResposta` (Boolean?) — distinto de `presencaAlunoEm` (que é o check-in biométrico no momento da aula).
- **Backend**: novo cron (ou ajuste do existente) rodando com granularidade horária, calculando `dataHora - 24h` por aula em vez de disparo fixo às 08h. Push com ação de confirmar/recusar, gravando a resposta. Vale tanto pra aula oficial quanto reposição.
- **Frontend**: tela/modal de confirmação no app do aluno; quem não respondeu até X horas antes vira item de alerta no painel da escola (linka com Sprint 18).
- **Depende de:** nada.

### Sprint 14 — Grade visual 06h–23h (Equipe + Salas)
**Prioridade:** 🟡 Alta — resolve pedidos 3 e 8 com um componente único
- **Frontend**: componente de planilha reutilizável (7 dias × horas 06-23), substituindo o formulário de texto atual em `equipe.tsx` (`GradeDisponibilidade`) por grid clicável com os 3 estados já previstos (Disponível/Pausa/Em aula — este último derivado por join com `Aula`, não persistido). Mesmo componente aplicado em `logistica.tsx` pra grade sala×horário.
- Troca de aluno de horário no grid dispara modal de confirmação e propaga a mudança pra `Aula` correspondente (like already partially done via `trocar-sala`).
- **Depende de:** nada — schema já suporta (`DisponibilidadeProfessor`, `Sala`, `Aula.salaId`).

### Sprint 15 — Tela de Reposição em 3 colunas
**Prioridade:** 🟡 Alta — só front-end, backend maduro
- Nova tela em `(escola)/` consumindo `/api/escola/reposicoes`. Colunas: **Para repor** (AGUARDANDO/SOLICITADA), **Agendadas** (CONFIRMADA/AUTORIZADA com data futura), **Concluídas** (FINALIZADA — mostrando data, horário e professor que lecionou, puxando `professorSubstitutoId` da Sprint 12 quando aplicável).
- Link direto a partir do KPI "Reposição para finalizar" do Painel.
- **Depende de:** Sprint 12 pra mostrar corretamente "professor que lecionou" quando houve substituição (mas pode nascer sem isso e complementar depois).

### Sprint 16 — Funcionário genérico + trava de acesso ao Estoque
**Prioridade:** 🟡 Alta — inclui correção de falha de controle de acesso existente
- **Schema**: generalizar cadastro de staff além de SECRETARIA — reaproveitar `permissoesSecretaria: String[]` (renomear ou manter, avaliar impacto de migração) como lista de módulos liberados por funcionário, com um campo `segmento`/`cargo` (texto livre) pra identificar a função sem precisar de enum fechado.
- `secretarias.tsx` → `funcionarios.tsx`: formulário genérico com seleção de módulos (financeiro, coordenacao, logistica, alunos, **estoque** — novo).
- **Backend**: rotas `/api/produtos*` e `/api/estoque*` passam a checar `exigirPapelNaEscola(...,'estoque')` (hoje só `exigirProfessor` — qualquer professor acessa).
- **Depende de:** nada — infra de permissão por módulo já existe, é extensão.

### Sprint 17 — Grupo interno dos professores
**Prioridade:** ⚪ Média — item novo, sem equivalente no roadmap mestre
- **Schema**: novo tipo de mensagem/grupo escopado por `escolaId`, participantes = todos os professores ativos da escola (não alunos). Campo `fixado: Boolean` na mensagem, pra permitir DONO/GESTOR fixar um item (ex.: link do Meet) no topo.
- **Frontend**: nova aba "Grupo da Equipe" dentro de `mensagens.tsx` ou tela própria.
- **Depende de:** nada.

### Sprint 18 — Alertas vermelhos consistentes + campos de cadastro
**Prioridade:** ⚪ Média — polimento transversal, maior valor depois que os dados novos das sprints acima existirem
- Aplicar `Kpi`/`Badge tom='alerta'` (já existe em `_ui.tsx`) nas 5 telas que ainda não usam: `equipe.tsx`, `logistica.tsx`, `recursos.tsx`, `coordenacao.tsx`, `comunicados.tsx`.
- **Schema**: `Aluno` e `Professor` ganham CPF e endereço; `Professor` ganha dados bancários/chave Pix (pré-requisito real pra pagar via Pix na Sprint 12, hoje ausente). `Produto` ganha descrição, categoria, valor de custo/venda, fornecedor, estoque mínimo (que também vira gatilho de alerta vermelho quando abaixo do mínimo).
- **Depende de:** Sprint 12 (dados bancários fazem mais sentido já com o cálculo de repasse rodando).

### Sprint 19 — Funil de captação: WhatsApp
**Prioridade:** 🟡 Alta — **decisão de negócio pendente antes de começar**

Ponto que não se resolve só programando: se a landing page for feita **fora do KAV Class** pela própria escola, o sistema não tem visibilidade sobre o que foi respondido no formulário dela — só consegue contar cliques no link rastreável (`LinkCaptacao` já suporta isso). Pra a resposta do formulário chegar automaticamente no WhatsApp da escola, duas rotas possíveis:

- **v1 recomendada (sem custo/homologação)**: manter o formulário hospedado pelo próprio KAV Class (como já é hoje), e ao ser enviado, abrir automaticamente um link `wa.me/<numero-da-escola>` pré-preenchido com os dados do lead, pra a escola confirmar o contato com 1 toque. Não é 100% automático (exige 1 clique humano do lado da escola), mas não depende de conta de WhatsApp Business API paga nem homologação.
- **v2 (mais robusta, com custo)**: integrar WhatsApp Business Cloud API (Meta) ou parceiro (Twilio/Z-API) pra enviar a mensagem sozinho, sem intervenção humana — mesma decisão em aberto já registrada no roadmap mestre como pré-requisito de S8.5.
- Se a exigência de **landing 100% externa** (feita pela escola, fora do domínio do KAV) for inegociável, adicionar como v1.1 um webhook receiver genérico (`POST /api/leads/webhook/:linkId`) que qualquer formulário externo (Google Forms + Zapier/Make, por ex.) possa chamar — mas isso exige que a escola configure essa automação por fora, o KAV não controla o forms em si.

**Decisão pendente:** confirmar com o usuário qual das rotas acima antes de iniciar esta sprint.
**Depende de:** nada tecnicamente, mas bloqueada por decisão de negócio.

## 5. Ordem de execução recomendada

Sprint 12 → 13 → 14 → 15 → 16 → 17 → 18 → 19.

Sprints 12 e 13 não têm dependência entre si e podem rodar em paralelo se houver duas frentes de trabalho. Sprint 19 fica por último por depender de uma decisão de negócio externa ao código (ver seção 4). As demais seguem a ordem de valor percebido pelo usuário (pagamento e presença primeiro, polimento de UI depois).

## 6. Verificação (por sprint, ao implementar)

Mesmo padrão já estabelecido no briefing de 08/09: `npx prisma migrate dev` limpo, `tsc --noEmit` sem erros nas telas tocadas, teste manual do fluxo principal no app (web ou Expo Go).
