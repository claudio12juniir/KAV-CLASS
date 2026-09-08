# Briefing de sessão — KAV CLASS INSTITUTION (08/09/2026)

> Documento de handoff pra iniciar uma sessão nova do zero e continuar exatamente daqui. Escrito pra ser lido sozinho, sem precisar da conversa anterior.

## 1. Convenção de nomes (nova, definida hoje)

O KAV CLASS é hoje dois produtos dentro do mesmo código:

- **KAV CLASS SELF** — professor autônomo e seus alunos. Rotas `(professor)/*` e `(aluno)/*` em `my-app/app/`, tema `constants/theme.ts` (`CORES`).
- **KAV CLASS INSTITUTION** — escola com equipe de professores e alunos. Rotas `(escola)/*` em `my-app/app/`, tema `constants/erpTheme.ts` (`ERP`). Em código/commits antigos aparece como "painel institucional" ou "Pacote Escola" — é a mesma coisa.

**Esta sessão trabalha só em INSTITUTION.** SELF não deve ser tocado a menos que explicitamente pedido.

## 2. Onde paramos

1. **Design system do painel INSTITUTION** — já entregue e em produção. `_ui.tsx` ganhou `PageHeader`, cabeçalhos de card, hover/elevação em `Kpi`/`Tabela`/`Botao`/menu lateral/`Modal`, tokens novos em `erpTheme.ts`. Aplicado nas 13 telas do grupo `(escola)`. Commit `f44ddf9`, push feito em `origin/main` (`github.com/claudio12juniir/KAV-CLASS`).
2. **Repositório e deploy**: o GitHub (`claudio12juniir/KAV-CLASS`, público) e o projeto Vercel (`my-app`, no time `claudio12juniirs-projects`, criado via `vercel link`/deploy manual) **existem mas não estão conectados** — não há Git integration nem webhook. Push pra `main` **não** dispara deploy automático hoje. Se o objetivo for ver mudanças no link Vercel, ou rodar `vercel --prod` manualmente a partir de `my-app/`, ou configurar a Git integration antes (`vercel git connect`, ou pelo dashboard). Isso ficou pendente de decisão do usuário — não fazer nada aqui sem perguntar de novo, porque na última vez o usuário cancelou o pedido por ter sido engano de projeto.
3. **Especificação funcional gigante pra INSTITUTION** — o usuário mandou uma mensagem única com requisitos detalhados pra quase todas as abas do painel (Painel, Equipe, Alunos, Catálogo→Logística, Matrículas, Financeiro, Coordenação, Calendário→Cronograma, Captação→Experimentais, Comunicados, Perfil da Instituição). Pedido explícito: organizar em sprints antes de codar. Transcrição fiel na seção 4.
4. Um plano de 11 sprints foi escrito e aprovado nesta sessão — **mas foi feito sem consultar o roadmap mestre do projeto** (`docs/roadmap-escola.md`), que já existia e já cobre parte do mesmo território com outra numeração (`S0.x`…`S8.x`). O plano completo está reproduzido na seção 7, e a seção 6 reconcilia os dois — **ler a seção 6 antes de seguir a seção 7 sprint a sprint.**

## 3. Documentos-fonte (ler nesta ordem antes de codar)

1. `docs/roadmap-escola.md` — arquitetura mestra do produto, Fases 0–8, sprints `S0.1`…`S8.6`. Fases 0–4 já implementadas (ver seção 12 do próprio documento, "Reauditoria 05/09/2026"). Fases 6–8 são as próximas oficialmente planejadas, com dependências entre si.
2. `docs/migrations/*-runbook.md` — um runbook por sprint já implementada (S0.1 até S5.5), útil pra ver o padrão de execução esperado (migração + rota + critério de pronto).
3. `kav-class-backend/prisma/schema.prisma` (1328 linhas) — fonte de verdade do modelo de dados. Leitura obrigatória antes de propor qualquer schema novo, pra não duplicar o que já existe (`Matricula`, `ResponsavelFinanceiro`, `Contrato`, `Reposicao`, `Avaliacao`, `Comunicado`, `DiaNaoLetivo`, `AulaExperimental`, `LancamentoCaixa`/`FechamentoCaixa`/`ContaPagar`, `Mensagem`, etc. já existem).
4. Seções 6 e 7 deste próprio briefing — plano de 11 sprints desta sessão (originalmente escrito em `.claude/plans/purrfect-swinging-yao.md`, que é local à máquina e não versionado; a cópia de verdade a partir de agora é a seção 7 aqui) já reconciliado com o roadmap mestre.

## 4. Pedido do usuário — transcrição organizada por aba (fidelidade alta, não resumir demais)

> Escopo: só INSTITUTION. Fonte: mensagem única do usuário em 08/09/2026, reorganizada por aba mas sem perder nenhuma regra de negócio.

### PAINEL

**Grade de hoje (novo card)** — mostra a grade de cada professor em formato de calendário em horas. As horas disponíveis nesse calendário são regidas pelo horário/dias de funcionamento configurados no Perfil da Instituição. Pra não ocupar muito espaço, mostrar os nomes dos professores que lecionam naquele dia em formato de **lista**; ao clicar no nome, abre a grade de horários daquele professor com os alunos que ele vai lecionar naquele dia, horários expostos. Nessa tela, **a escola** pode editar o status de cada aluno com a informação de "é reposição ou não" (alguns lugares só repõem com aviso de no mínimo 24h de antecedência) — **só a escola pode fazer essa alteração**. O professor só marca presença da aula (login mobile, Face ID/biometria); o aluno marca a dele também, independente. Se o professor marcar e o aluno não, fica registrado professor presente / aluno ausente (e vice-versa). Se algum dos dois não conseguiu levar o celular, a escola pode intervir manualmente marcando presença — **mas só com autorização de senha**: senha do professor se for necessidade do professor, senha do aluno se for necessidade do aluno.

**Professores ativos** — lista de professores com botões ao lado do nome, abrindo modais: (1) alunos na base daquele professor (clicar no aluno leva à aba Aluno com todas as infos); (2) calendário de aula específico daquele professor, editável; (3) chat da turma daquele professor — cada professor tem um chat pra tirar dúvidas e enviar documentos aos seus alunos dentro da plataforma; só entram no chat os alunos que a escola cadastrou e que **não estão com mensalidade/contrato vencido**; só texto e links, nada de mídia.

**Alunos matriculados** — categorizado por curso, com filtros: nome, data de início, data de término de contrato, tempo de contrato (2 meses/6 meses/1 ano/2 anos etc.). Clicar no aluno abre modal **100% editável** com: nome completo, email e senha de acesso, tempo de contrato fechado, idade do aluno, contato do aluno (se menor de idade, contato do responsável), curso(s) que cursa (pode ser mais de um), plano em que está inserido (plano é categoria **global** — a escola cadastra planos manualmente no perfil da escola —, com opção de plano **personalizado** com valor e descrição próprios), professor(es) responsável(is) (pode ser mais de um) — tudo 100% editável. Os mesmos campos entram no cadastro "+ novo aluno", mais um input de anexo do contrato fechado e o tempo desse contrato (pra o sistema contabilizar vencimento).

**KPIs — mudanças:**
- Leads sem funil e conversão (30d) → **remover da tela**.
- Cobranças com erro → renomear **"Inadimplentes"**.
- Matrículas vencendo → em vez de número, **lista de nomes** dos alunos com botão de enviar notificação.
- Acompanhamentos pendentes → renomear **"Aulas que devem ter reposição"**, em lista com nomes dos alunos.
- Reposição para finalizar → **lista** com nomes dos alunos.

### EQUIPE

Cadastro completo do professor: nome completo, número de contato, contato de emergência, data de nascimento (aniversário próximo → notificação no painel), data de pagamento (dia que a escola paga o professor), anexo do contrato, cursos que leciona, foto.

Depois do cadastro, **segunda etapa obrigatória**: grade horária do professor — planilha/calendário em horas, segunda a domingo, 24h por dia. A escola marca quais horários o professor tem disponível pra lecionar; pode marcar 1-2 horários de café/almoço. **Isso é regra global**: quando um aluno novo entra e a escola quer colocá-lo na grade daquele professor, só os horários disponíveis ficam clicáveis pra marcar aula. Estados do horário: **"Horário em aula"** (tem aluno marcado), **"Pausa técnica"** (café/almoço), **"Horário disponível"** (livre, sem aluno, sem ser pausa).

### ALUNOS

Mesma coisa descrita em PAINEL → Alunos matriculados — é a mesma aba, acessada por dois caminhos.

### CATÁLOGO → renomear "Logística"

Tirar a ideia de catálogo. A escola gerencia a organização das aulas do dia entre as salas de forma simples; a alteração feita hoje fica salva automaticamente pras próximas semanas, e cada nova alteração também fica salva daí em diante — sempre 100% editável.

### MATRÍCULAS

**Remover essa aba** (funcionalidade absorvida pela ficha do aluno, ver ALUNOS acima).

### FINANCEIRO (adicionar)

- **Faturamento atual**: valor em caixa daquele mês, contabilizado via API da Stripe, em **verde**.
- **Pagamento professores** — "o coração do sistema". Se o Perfil da Instituição define valor por aula (ex.: $25), e o professor deu 5 aulas no mês, salário = $125; se deu 4, $100. **Importante**: reposição de mês anterior não conta como salário daquele mês (mesmo virando reposição, a aula é paga normalmente, no mês em que efetivamente ocorreu). Campo de edição manual pela escola quando necessário. Anexo de comprovante de pagamento por professor, até **3 arquivos**. Esses dados também aparecem no login do professor, seção financeiro.
- **Despesas fixas**: inputs editáveis pela própria instituição (valor + descrição).
- **Despesas avulsas**: idem.
- **Relatório em formato de planilha** dos gastos/ganhos/lucros do mês, exportável em **PDF e Excel**. **CAPRICHAR**: foto da empresa no topo, formatação profissional de relatório, **sem** menção à KAV CLASS em lugar nenhum (motivo explícito do usuário: problema jurídico da escola não deve envolver a KAV CLASS).
- **Pagamentos** — "a pulsação financeira da empresa": lista de inadimplentes, lista de quem já pagou, lista de quem está em dia. Botão de WhatsApp ao lado do nome do aluno, abrindo direto pro número cadastrado (aluno ou responsável).

### COORDENAÇÃO (nova aba)

Sessões por curso lecionado. Duas opções de cronograma de conteúdo:
- **Universal**: a escola decide o cronograma, sobe o material em anexo por curso; o professor acessa esse material no login dele e, ao confirmar presença de aula, descreve/confirma qual assunto foi dado (com base no que a escola enviou).
- **Pessoal**: cada professor sobe seu próprio cronograma; a cada presença, descreve o que foi feito naquela aula, com base no próprio documento.
Isso serve pra escola ter controle de qualidade de ensino.

**Avaliação do aluno**: campo no menu do aluno onde ele avalia mensalmente a escola e o professor, até 5 estrelas. Entra aqui em Coordenação pra escola ver satisfação. Sugestão: modal amigável de aviso pedindo a avaliação; ao responder, **o sistema para de cobrar o aluno até o próximo mês**.

**Relatório dos alunos**: coordenador solicita aos professores, e a própria coordenação também sobe anexo.

### CALENDÁRIO → renomear "Cronograma"

A escola cria um evento específico (feriado, recesso, férias, palestra, passeio, festival, apresentação etc.), escolhe pra quais cursos vale, de qual data até qual data. Ao confirmar, o sistema inteiro passa a contabilizar aquele intervalo como evento pros grupos selecionados — bloqueia a agenda dos professores e alunos afetados. **Não conta como falta** — aparece com o nome do registro feito pela escola (ex.: "Feriado", "Festival").

### CAPTAÇÃO → renomear "Experimentais"

A escola marca uma experimental sem compromisso na agenda de um professor; entra automaticamente na grade daquele dia do professor, **sem repetir** nas semanas seguintes (só aquele dia). O professor confirma presença da experimental pelo app mobile, com Face ID/biometria.

### COMUNICADOS

O comunicado deve aparecer na tela principal/dashboard do app mobile do **aluno**, via notificação push.

### PERFIL DA INSTITUIÇÃO

- Planos
- Modalidades
- Cursos
- Horário de funcionamento (dias úteis, fim de semana, feriados) — **mesma UI de calendário/planilha do Cronograma**, pra facilitar edição.
- Input de logo da instituição.
- E-mail da instituição.
- Valor pago por aluno (opção: por mês ou por aula) — **importante**, é a base do cálculo de pagamento de professor.
- Data de fechamento/corte.

### Instrução geral do usuário (não perder)

> "Tem algumas relações no sistema que eu acabo esquecendo de citar na documentação, mas com sua inteligência de casos de uso, faça com que tudo se conecte entre si de forma que o sistema ganhe vida num todo."

Ou seja: onde a especificação for omissa, resolver por inferência de caso de uso consistente com o resto do sistema — não travar esperando confirmação pra cada detalhe pequeno, mas registrar a decisão tomada (igual ao padrão de comentário já usado no schema, ex.: `// Nullable de propósito: ...`).

## 5. Levantamento técnico (o que existe vs. o que é novo)

**Reaproveitável, já existe no schema/backend:**
- `Matricula` — já suporta 1 aluno com vários vínculos aluno×curso×professor×turma simultâneos (resolve "múltiplos professores/cursos por aluno" sem reestruturar `Aluno.professorId`).
- `ResponsavelFinanceiro` — contato do responsável de aluno menor de idade.
- `Contrato` — fluxo de assinatura por token (mas é o contrato de matrícula; contrato de professor e contrato de matrícula-com-anexo-de-arquivo são conceitos novos, ver seção 6).
- `Reposicao`, `Avaliacao` (aluno avalia professor, 1-5 estrelas — falta nota separada pra escola e o gate de cobrança).
- `Comunicado`/`EnvioComunicado`, `DiaNaoLetivo`, `AulaExperimental`, `LancamentoCaixa`/`FechamentoCaixa`/`ContaPagar`.
- `Mensagem` — chat 1:1 professor↔aluno já existe; rota `/api/mural` é broadcast professor→turma, **não** é chat de grupo bidirecional (chat da turma é novo).
- `enviarPushNotificacao()` (server.js, helper genérico) — já aceita qualquer `expoPushToken`, inclusive de `Aluno` (hoje só é chamado pra professor/mural).
- `expo-local-authentication` — já é dependência do `my-app` (biometria pronta pra usar, sem lib nova).

**100% novo, sem vestígio no código:**
- Grade de disponibilidade semanal do professor (nada parecido existe).
- Presença separada professor/aluno — hoje `Aula.presenca` é um único enum (`PRESENTE`/`AUSENCIA_PROFESSOR`/`AUSENCIA_ALUNO`/`PENDENTE_REPOSICAO`), não dá pra saber se só um dos dois confirmou.
- Chat de grupo real (turma inteira, bidirecional, filtrado por inadimplência).
- Cronograma de conteúdo (universal/pessoal) e vínculo com o assunto dado em cada aula.
- Avaliação mensal com pausa de cobrança.
- Geração de PDF/Excel — **nenhuma lib instalada hoje** (`grep` em `package.json` não achou `pdfkit`/`puppeteer`/`exceljs`/`xlsx`/`pdf-lib`/`jspdf`).
- Folha de pagamento de professor (hoje só existe `Pagamento` = aluno→escola; nunca escola→professor) — **mas isso já está no roadmap mestre como S8.3, ver seção 6**.
- Configurações de horário de funcionamento/logo/e-mail/valor-por-aula da instituição em `Escola`.

## 6. Reconciliação com `docs/roadmap-escola.md` (fazer isso ANTES de codar)

O plano de sprints desta sessão (originalmente em `.claude/plans/purrfect-swinging-yao.md`, reproduzido na íntegra na seção 7) foi escrito sem ler o roadmap mestre primeiro. Tabela de sobreposição:

| Item do pedido de hoje | Sprint do roadmap mestre já existente | Decisão recomendada pra próxima sessão |
|---|---|---|
| Folha de pagamento de professor (Financeiro, Sprint 7 abaixo) | **S8.3** (`RegraPagamentoProfessor`, HORA_AULA/COMISSÃO/VALOR_FIXO, depende de Fase 7 RBAC) | O pedido de hoje é mais simples (só valor-por-aula ou por-aluno/mês, configurado em `Escola`, sem RBAC granular). Decidir: implementar a versão simples agora (sem esperar Fase 7) e deixar `RegraPagamentoProfessor`/RBAC completo pra quando S7.1 vier — ou seja, tratar o pedido de hoje como uma v1 pragmática de S8.3. |
| Logística — grade de salas do dia (Sprint 6 abaixo) | **S8.1** (Quadro de aulas visual, `Equipamento`, choque de horário) | Pedido de hoje é mais simples (sem validação de choque nem `Equipamento`) — tratar como v1 de S8.1, sem bloquear em Fase 7. |
| Presença dupla biométrica + reposição só-escola (Sprint 2 abaixo) | Estende **S5.3** (QR Code/app do gestor) e **S2.1** (reposição em 2 camadas), ambos já "implementados" segundo a reauditoria — na prática o schema atual (`PresencaAula` único) não suporta a dupla confirmação pedida agora. Tratar como uma extensão de schema sobre S5.3/S2.1, não sprint nova solta. |
| Pagamentos com botão WhatsApp (Sprint 8 abaixo) | Parte de **S8.5** (régua de cobrança), mas S8.5 é infraestrutura pesada (WhatsApp Business API automática). O pedido de hoje é só um `wa.me/<numero>` manual — v1 muito mais simples que S8.5, não precisa da decisão de provedor de API. |
| Relatório PDF/Excel (Sprint 8 abaixo) | Parte de **S8.6** (DRE). Pedido de hoje pede caprichar visualmente e nunca citar KAV CLASS — indo além do escopo original de S8.6. |
| Cronograma — ex-Calendário, eventos por curso, intervalo de datas (Sprint 10 abaixo) | Estende **S1.4** (calendário letivo, hoje é `DiaNaoLetivo` de 1 dia só, escola inteira) |
| Alunos — ficha editável, multi-curso/multi-professor (Sprint 5 abaixo) | Refina **S1.1** (matrícula formal, `Matricula` já existe) — é UI e ajuste fino, não schema novo grande. |
| Coordenação — cronograma + avaliação mensal (Sprint 9 abaixo) | Sem equivalente direto. Tangente a **S8.4** (Trilhas de evolução) mas são conceitos diferentes (cronograma de conteúdo/aula ≠ trilha de graduação) — não confundir os dois ao implementar. |
| Chat da turma / grupo (Sprint 4 abaixo) | Sem equivalente no roadmap mestre — item novo de verdade. |
| Perfil da Instituição (Sprint 1 abaixo) | Sem equivalente direto — item novo de verdade, mas é pré-requisito de quase tudo acima. |

**Ponto de partida recomendado**, alinhando os dois planos: **Sprint 1** (Perfil da Instituição + Equipe) — é pré-requisito puro, sem sobreposição, e sem ele nem "Grade de hoje" nem "Pagamento professores" têm de onde ler dado.

## 7. Sprints planejadas — plano completo desta sessão

> Reprodução integral do plano aprovado em `.claude/plans/purrfect-swinging-yao.md`. Ler junto com a tabela de reconciliação da seção 6 — vários sprints abaixo são, na prática, uma v1 mais simples de um item já existente no roadmap mestre (S8.x), não um item paralelo.

### Decisões de arquitetura tomadas (pra não travar o roadmap em detalhe de schema)

1. **Múltiplos professores/cursos por aluno**: em vez de reformular `Aluno.professorId` (usado em dezenas de rotas como "dono" pra autenticação/escopo), ele continua como o professor principal/de login; os vínculos adicionais (outros professores, outros cursos, plano específico) usam `Matricula`, que já foi desenhada pra isso. Menor risco, reaproveita infraestrutura pronta.
2. **Presença dupla**: `Aula` ganha dois campos de confirmação independentes (professor/aluno, com timestamp de quando e se foi manual) em vez de forçar tudo no enum `presenca` único de hoje. A decisão de "é reposição ou não" vira um campo à parte, editável só pela escola — nunca derivado da presença.
3. **Chat da turma**: novo tipo de thread (grupo, escopado por `professorId`) distinto do `/api/mural` atual (que é só broadcast). Turma = alunos ativos daquele professor com mensalidade em dia (filtro em tempo de consulta, sem tabela de membros nova).
4. **Relatório financeiro PDF/Excel**: precisa de 2 libs novas no backend (ex.: `pdfkit` ou `puppeteer` pra PDF, `exceljs` pra Excel) — isolado em sprint próprio por ser infraestrutura nova, não só tela.

### Sprint 1 — Fundação: Perfil da Instituição + Equipe (cadastro completo + grade)
Sem isso, "Grade de hoje" (Sprint 3) e "Pagamento professores" (Sprint 7) não têm de onde ler horário de funcionamento nem valor por aula.
- **Schema**: campos novos em `Escola` (horário de funcionamento por dia útil/fds/feriado, `logoUrl`, `email`, `valorPorAula` + `tipoRemuneracaoProfessor` enum [`POR_AULA`|`POR_ALUNO_MES`], `diaFechamento`). Campos novos em `Professor` (contato de emergência, data de pagamento, `contratoUrl`). Novo model `DisponibilidadeProfessor` (professorId, diaSemana 0-6, horaInicio, horaFim, tipo [`DISPONIVEL`|`PAUSA`]) — grade semanal recorrente; "horário em aula" é derivado (join com `Aula` daquele dia/hora), não persistido.
- **Backend**: `PUT /api/escola/perfil` (campos novos), `GET/PUT /api/escola/professores/:id/disponibilidade`.
- **Frontend**: `perfil.tsx` (escola) ganha as sessões pedidas (Planos/Modalidades/Cursos já existem em Catálogo — só linkar; horário de funcionamento com UI tipo calendário, igual pedido). `equipe.tsx`: formulário de cadastro completo + segunda etapa (planilha 7×24 clicável pra marcar disponível/pausa). Notificação de aniversário do professor no Painel lê `Professor.dataNascimento` (já existe).

### Sprint 2 — Presença dupla biométrica + reposição controlada pela escola
Pré-requisito de dado pra Grade de hoje (Sprint 3) e Experimentais (Sprint 11) mostrarem status correto.
- **Schema**: `Aula` ganha `presencaProfessorEm`/`presencaAlunoEm` (DateTime?), `confirmadoManualmentePor`/`motivoManual` (auditoria de quando a escola faz override com senha), e um campo separado `decisaoReposicao` (bool/enum), só editável pela escola.
- **Backend**: `POST /api/aulas/:id/checkin-professor` e `.../checkin-aluno` (exige reautenticação biométrica local, token normal + endpoint dedicado), `PUT /api/aulas/:id/override-manual` (exige reenvio de senha do professor OU do aluno, conforme quem está sendo marcado), `PUT /api/aulas/:id/reposicao` (só escola).
- **Frontend**: telas de check-in no app professor/aluno usando `expo-local-authentication` (já instalado) na hora de confirmar presença.

### Sprint 3 — Painel: Grade de hoje + KPIs reformulados
- **Grade de hoje**: lista de professores com aula no dia → clique abre grade em horas daquele professor (baseada em `DisponibilidadeProfessor` + `Aula` do dia), com edição de reposição restrita à escola (usa rotas do Sprint 2).
- KPIs: remover Leads/Conversão; "Cobranças com erro" → "Inadimplentes"; "Matrículas vencendo" → lista de nomes + botão notificar (usa `enviarPushNotificacao`); "Acompanhamentos pendentes" → "Aulas que devem ter reposição" (lista); "Reposição para finalizar" → lista de nomes (já é dado existente, só muda o componente de `Kpi` pra lista).
- **Arquivos principais**: `my-app/app/(escola)/index.tsx`, `_ui.tsx` (novo componente de lista compacta), rotas agregadoras novas em `server.js`.

### Sprint 4 — Equipe: modais de ação por professor
- Botão "Alunos": modal com alunos da base daquele professor, nome clicável leva à ficha do aluno (Sprint 5).
- Botão "Grade": modal com a `DisponibilidadeProfessor` + aulas da semana, editável.
- Botão "Chat da turma": novo modelo de mensagem em grupo (`Mensagem.tipo = 'GRUPO'` ou tabela dedicada), participantes = alunos ativos daquele professor sem mensalidade vencida (filtro em runtime). Substitui o mural atual apenas nesse contexto — mural 1-via pode continuar existindo em paralelo se não atrapalhar.

### Sprint 5 — Alunos: ficha 100% editável, multi-curso/multi-professor, filtros
- **Schema**: `Aluno` ganha `contratoUrl`, `tempoContratoMeses` já existe (`tempoContrato`) — confirmar cálculo de vencimento a partir de `dataInicioContrato`. Plano personalizado usa `Matricula.valorMensalidade` + novo campo `planoPersonalizadoDescricao`.
- **Frontend**: modal de edição com todos os campos pedidos (nome, email, senha, tempo de contrato, idade/nascimento, contato — ou do responsável se menor via `ResponsavelFinanceiro` já existente —, cursos múltiplos, plano [global da instituição ou personalizado], professores múltiplos). Mesmo formulário no "+ novo aluno", incluindo anexo do contrato.
- Filtros: nome, data de início, data de término de contrato (derivada), tempo de contrato.
- **Nota**: esta aba é a mesma acessada a partir do Painel → "Alunos matriculados" — um único componente, sem duplicar tela.

### Sprint 6 — Logística (ex-Catálogo) + remoção da aba Matrículas
- Renomear Catálogo → Logística. Nova tela: grade diária sala×horário×turma, editável, com "salvar como recorrente" (aplica pras próximas semanas automaticamente até nova alteração pontual).
- **Schema**: reaproveita `Sala`/`Turma`/`Aula`; precisa de um jeito de marcar uma alteração como "só hoje" vs "a partir de agora" — provável novo campo em `Aula` ou tabela de regra recorrente simples.
- Aba Matrículas é removida da navegação (fluxo de nova matrícula migra pra dentro da ficha do aluno, Sprint 5).

### Sprint 7 — Financeiro I: faturamento real + folha de pagamento de professores + despesas
- **Faturamento atual**: soma via Stripe API (não só `LancamentoCaixa`) do mês corrente, destaque verde.
- **Pagamento professores** (o "coração do sistema", nas palavras do usuário): cálculo automático = nº de aulas com presença confirmada no mês × `Escola.valorPorAula` (ou por aluno/mês, conforme configurado no Sprint 1). Reposição paga no mês em que a aula efetivamente ocorreu, nunca duplicada no mês original. Campo de ajuste manual pela escola. Upload de até 3 comprovantes por professor/mês — mesmos dados replicados na aba financeiro do professor (`my-app/app/(professor)/pagamento.tsx`, já existe).
- **Despesas fixas** (novo model `DespesaFixa`, recorrente, editável) e **despesas avulsas** (reusa `ContaPagar`).
- **Schema novo**: `FolhaPagamentoProfessor` (mês/ano, professorId, valorCalculado, valorAjustado, comprovantes[] até 3, status).

### Sprint 8 — Financeiro II: relatório PDF/Excel profissional + tela de Pagamentos
- Novo endpoint de relatório mensal (receitas, despesas, lucro) com logo da escola no topo, **sem** menção à KAV CLASS em lugar nenhum, exportável em PDF e Excel (libs novas: avaliar `pdfkit`+`exceljs` vs `puppeteer`).
- **Pagamentos**: 3 listas (inadimplentes / pagos / em dia) a partir de `Pagamento`, com botão WhatsApp (`wa.me/<telefone>`) ao lado de cada aluno, puxando o telefone do aluno ou do `ResponsavelFinanceiro`.

### Sprint 9 — Coordenação (nova aba)
- **Schema novo**: `CronogramaConteudo` (cursoId, tipo [`UNIVERSAL`|`PESSOAL`], professorId opcional quando pessoal, anexo). `Aula` ganha `assuntoTratado` (texto, preenchido na confirmação de presença). `RelatorioAluno` (novo, upload por professor ou coordenação).
- **Avaliação mensal**: estende `Avaliacao` com nota separada pra escola, `mesReferencia`; modal amigável recorrente no app do aluno; ao responder, pausa cobrança/lembrete até o mês seguinte (flag em `Matricula` ou checagem direta na tela de cobrança).
- Sessões por curso agregando: cronograma vigente, relatórios, e média de avaliação.

### Sprint 10 — Cronograma (ex-Calendário)
- Estende `DiaNaoLetivo` → evento com `dataInicio`/`dataFim` (hoje é só uma data), tipo expandido (feriado, recesso, férias, palestra, passeio, festival, apresentação), relação N:N com `Curso` (hoje é escola inteira).
- Ao confirmar, bloqueia a agenda de professores/alunos dos cursos afetados no intervalo — aula naquele range não conta falta, aparece com o nome do evento (precisa de referência do evento na `Aula` ou checagem em tempo de leitura, igual ao padrão já usado pra feriado em `POST /api/aulas`).

### Sprint 11 — Experimentais (ex-Captação) + Comunicados com push
- Renomear Captação → Experimentais. Experimental agendada já aparece na Grade de hoje (Sprint 3) por já ter `professorId`+`dataHora` — ajuste é de leitura, não de schema. Presença da experimental via biometria no app do professor (reusa fluxo do Sprint 2).
- Comunicados: ao enviar, dispara push via `enviarPushNotificacao` pra `Aluno.expoPushToken` (hoje só usado pra professor/mural) e aparece em destaque na home do app do aluno — precisa de um jeito de o aluno "ver" o comunicado (campo de leitura ou tela dedicada consumindo `Comunicado` + `EnvioComunicado`).

### Ordem recomendada de execução

Sprint 1 → Sprint 2 são pré-requisito técnico de quase tudo (config da instituição + modelo de presença). Depois disso, Sprints 3–11 têm poucas dependências cruzadas fortes entre si e podem ser feitos na ordem listada (que segue a ordem em que o usuário descreveu as abas) ou reordenados por prioridade de negócio, sem risco técnico adicional — a não ser Sprint 3 (Painel) que fica mais completo depois de Sprint 1/2, e Sprint 9 (Coordenação) que se apoia no Sprint 5 (ficha do aluno) pra avaliação.

### Verificação (por sprint, ao implementar)

Cada sprint será fechado com: `npx prisma migrate dev` limpo, `tsc --noEmit` sem erros nas telas tocadas, e teste manual do fluxo principal daquele sprint no app (web ou Expo Go) — como já foi feito no aprimoramento de design anterior do painel.

## 8. Ambiente / comandos úteis

- Backend: `kav-class-backend/server.js` (monólito único, ~287KB) + `prisma/schema.prisma`. Migração: `npx prisma migrate dev` dentro de `kav-class-backend/`.
- Frontend: `my-app/` (Expo Router). Typecheck: `npx tsc --noEmit -p .` dentro de `my-app/`. Lint: `npx expo lint`. Build web de sanity-check: `npx expo export --platform web --output-dir <tmp>` (usado na sessão anterior pra validar sem precisar logar no app).
- Deploy: GitHub `claudio12juniir/KAV-CLASS` (remote `origin`, branch `main`) e Vercel `my-app` **não conectados** (ver seção 2.2) — confirmar com o usuário antes de qualquer ação de deploy/conexão.
- Memória de longo prazo já registrada (persiste entre sessões, ver `~/.claude/projects/.../memory/MEMORY.md`): mapa de deploy (Render `kav-class-1`, projeto Google Cloud `kav-class`), preferência do usuário por o agente executar mudanças de configuração sensíveis direto (depois de explicar riscos) em vez de só orientar passo a passo, detalhes do gateway de cobrança Stripe Connect (S3.1), e esta própria convenção SELF/INSTITUTION.
