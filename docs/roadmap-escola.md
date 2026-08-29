# Kav Class — Roadmap de Evolução

> De app de professor a plataforma de escola, sem perder o professor autônomo no caminho.

Cruzamento entre o código real do Kav Class hoje (schema Prisma, ~55 rotas de API, telas de professor e aluno) e o levantamento funcional da Emusys, organizado em 20 sprints de duas semanas ao longo de 6 fases.

- **Levantamento em:** 29/08/2026
- **Fonte do benchmark:** `emusys-kavclass.md`
- **Fonte do estado atual:** leitura direta de `kav-class-backend/server.js`, `prisma/schema.prisma` e `my-app/app/**`

---

## Sumário

1. [O que existe hoje](#1-o-que-existe-hoje-de-fato)
2. [Cruzamento com a Emusys](#2-cruzamento-com-a-emusys)
3. [Decisão de arquitetura](#3-decisão-de-arquitetura-registrada)
4. [Fase 0 — Fundação multi-tenant](#fase-0--fundação-multi-tenant)
5. [Fase 1 — Camada de gestão](#fase-1--camada-de-gestão)
6. [Fase 2 — App do aluno / responsável](#fase-2--app-do-aluno--responsável)
7. [Fase 3 — Financeiro transacional](#fase-3--financeiro-transacional)
8. [Fase 4 — CRM comercial](#fase-4--crm-comercial)
9. [Fase 5 — Avançado & diferenciação](#fase-5--avançado--diferenciação)
10. [Linha do tempo completa](#10-linha-do-tempo-completa)
11. [Riscos e decisões em aberto](#11-riscos-e-decisões-em-aberto)

---

## 1. O que existe hoje, de fato

Lido direto do código — não do que o app "deveria" fazer. O Kav Class atual modela **um professor autônomo**: cada `Professor` é dono direto dos seus `Aluno`, `Aula` e `Pagamento`. Não existe uma entidade Escola nem papel de gestor.

| Domínio | O que existe | Como funciona na prática |
|---|---|---|
| Conta & assinatura | Cadastro professor/aluno, login Google, recuperação de senha, teste grátis | 15 dias grátis (`DIAS_TESTE_GRATIS`), bloqueio automático pós-vencimento sem plano, assinatura SaaS via Stripe Checkout — **o professor paga o Kav Class**, cancelável no perfil. |
| Agenda | Aula individual/grupo, recorrência, calendário | Semanal/quinzenal/mensal, presença em 4 estados, tipos REGULAR/REPOSIÇÃO/GRUPO. Sem noção de sala ou turma compartilhada. |
| Reposição | Aluno pede nova data, professor confirma | 3 estados (Aguardando/Confirmada/Solicitando outro) — mais simples que a Emusys porque aqui o professor *é* a escola. |
| Financeiro do aluno | Mensalidade fixa + comprovante manual | Aluno anexa foto/PDF do comprovante, professor aprova na mão. Sem boleto, sem Pix gerado, sem cobrança recorrente, sem nota fiscal. |
| Materiais | Upload por professor, 6 tipos de conteúdo | Texto, link, vídeo, imagem, arquivo, áudio — por aula ou em lote para vários alunos. |
| Comunicação | Chat 1:1 e mural | Conversa direta professor↔aluno, mais um mural de avisos. |
| Notificações | Push + 3 cron jobs diários | Contrato expirando, pagamento atrasado, lembrete de aula amanhã. |
| Relatórios | Tela única, básica | Sem drill-down, sem comparação de períodos. |

---

## 2. Cruzamento com a Emusys

Confirmado lendo o schema, as rotas e as dependências do app (não por suposição). O que aparece como **ausente** não tem nenhum vestígio no código — nem model, nem rota, nem lib.

| Frente | Emusys | Kav Class hoje | Status |
|---|---|---|---|
| Tenant / papéis | Escola com múltiplos professores + gestor | 1 Professor = 1 mini-negócio isolado | 🔴 ausente |
| Matrícula | Fluxo completo com responsável financeiro | Campo solto `curso` no Aluno | 🔴 ausente |
| Turmas / salas | Cadastro dedicado, multi-professor | Nada — aula é sempre 1 professor : 1 aluno | 🔴 ausente |
| Tabela de valores | Versionada, por modalidade/plano/forma de pgto | `valorMensalidade` fixo no Aluno | 🔴 ausente |
| Cobrança automática | Pix/boleto/cartão recorrente | Comprovante manual + aprovação manual | 🔴 ausente |
| Contrato digital | Assinatura eletrônica com token | — | 🔴 ausente |
| Nota fiscal | Emissão em 1 clique | — | 🔴 ausente |
| Antecipação de recebíveis | Via parceiro (Asaas) | — | 🔴 ausente |
| CRM de leads | Funil, formulários, aula experimental | — | 🔴 ausente |
| QR Code / biometria | Presença sem toque manual | Sem libs de câmera/scanner no app | 🔴 ausente |
| Aula online | Integração de videochamada | Sem lib de WebRTC/Meet | 🔴 ausente |
| Metrônomo / gravador | Ferramentas de prática nativas | Sem `expo-av` | 🔴 ausente |
| Crédito de horas / sala | Reserva de ensaio | — | 🔴 ausente |
| Estoque | Entradas/saídas de produto | — | 🔴 ausente |
| Agenda / presença | Grade única, presença 1 toque | Já existe, formato próprio | 🟢 existe |
| Reposição / faltas | 4 status + dupla aprovação | 3 status, aprovação única | 🟡 parcial |
| Materiais didáticos | Pastas por nível | Upload direto, sem níveis | 🟡 parcial |
| Comunicados | Broadcast + histórico de e-mail | Mural simples + chat | 🟡 parcial |

---

## 3. Decisão de arquitetura registrada

O Kav Class vai atender escola **sem deixar de ser, no fundo, a ferramenta do professor autônomo**. A saída é aditiva, não substitutiva: uma entidade `Escola` passa a ser o tenant raiz por baixo de qualquer conta — inclusive as de hoje. Mas isso é implementação, não é o produto: o que o usuário vê e escolhe são **dois pacotes comerciais distintos**, lado a lado na mesma tela de assinatura que já existe hoje (`escolher-plano.tsx`).

### Os dois pacotes

| Pacote | Pra quem | O que inclui |
|---|---|---|
| **Pacote Professor** | Professor autônomo, dá aula por conta própria | Exatamente o app de hoje — agenda, alunos, pagamento manual, chat, materiais, reposição. Tiers por nº de alunos, como já existe (35/60/70 alunos). Sem gestor, sem CRM, sem turma/sala compartilhada. |
| **Pacote Escola** | Escola de música com equipe, ou professor que quer crescer pra isso | Tudo do Pacote Professor + tudo que as Fases 1–5 constroem: múltiplos professores, gestor, matrícula formal, turma/sala, tabela de valores, cobrança automática, CRM, etc. |

### Por que isso muda o roadmap

A escolha de pacote é do usuário na tela de assinatura, não uma detecção automática por número de professores — um professor solo pode assinar o Pacote Escola se quiser as ferramentas de gestão, e uma escola pequena pode começar no Pacote Professor. Por isso a Escola-como-tenant (Fase 0) é *infraestrutura de todos*, mas os módulos de Fase 1 em diante ficam atrás de feature-gate por pacote assinado, não atrás de "tem mais de um professor".

Toda funcionalidade de "escola" (turma, sala, CRM, tabela de valores, financeiro centralizado) depende de ter uma entidade Escola pra pendurar em cima. Por isso a Fase 0 vem antes de qualquer feature nova visível — é troca de fundação, não é sprint de produto.

---

## Fase 0 — Fundação multi-tenant

**Duração:** 4 semanas · 2 sprints
**Objetivo da fase:** introduzir Escola como tenant raiz sem quebrar nenhum professor/aluno hoje em produção. Não entrega feature visível nova — é o alicerce de tudo que vem depois.

### S0.1 — Modelagem de Escola + migração de dados
**Prioridade:** 🔴 Crítica

Criar a entidade Escola e migrar toda a base de produção existente para o novo formato sem perda de acesso.

**Entregas:**
- Model `Escola` (nome, dados bancários, config)
- Model `Usuario`/papel: enum `PapelUsuario` (DONO, GESTOR, PROFESSOR) ligando Professor a Escola
- `Aluno` ganha `escolaId`
- `assinaturaStatus`/campos Stripe migram de Professor para Escola, e ganham `pacote`: enum `PACOTE_PROFESSOR` | `PACOTE_ESCOLA`
- Script de migração: 1 Escola por Professor existente, papel DONO, nome = nome do professor, `pacote = PACOTE_PROFESSOR` (ninguém muda de plano sem escolher)
- As ~55 rotas que hoje filtram por `professorId` passam a filtrar por `escolaId` (mantendo `professorId` onde ainda faz sentido: Aula, Mensagem)

**Critério de pronto:** todo professor/aluno hoje em produção continua logando e vendo exatamente os mesmos dados depois da migração. Script roda idempotente em staging antes de ir pra produção, com plano de rollback testado.

**Depende de:** nada — é o ponto de partida
**Risco:** maior risco técnico do roadmap inteiro (toca toda superfície de auth/rotas em produção)

### S0.2 — RBAC básico + convite de professor
**Prioridade:** 🔴 Crítica

Deixar uma Escola convidar mais professores para dentro do mesmo tenant, dar ao papel GESTOR uma visão consolidada, e abrir a escolha explícita entre os dois pacotes na tela de assinatura.

**Entregas:**
- `escolher-plano.tsx` ganha a opção Pacote Escola ao lado dos tiers atuais do Pacote Professor (35/60/70 alunos)
- Rota de convite (Escola → Professor por e-mail/código) — só disponível pra quem está no Pacote Escola
- Tela de aceite do convite no app
- Permissões mínimas: GESTOR vê todos os professores da escola; PROFESSOR continua vendo só o que é dele, como hoje
- Novo grupo de rotas `(gestor)` no expo-router — mobile-first, mesma base de código
- Feature-gate central por `escola.pacote`: rotas/telas de Fase 1+ checam o pacote assinado, não o nº de professores

**Critério de pronto:** um professor solo consegue assinar o Pacote Escola sozinho e já ver os módulos de gestão liberados. Quem fica no Pacote Professor não vê nem o convite de outro professor como opção.

**Depende de:** S0.1
**Decisão em aberto:** gestor no app mobile vs. painel web — ver seção de riscos

---

## Fase 1 — Camada de gestão

**Duração:** 8 semanas · 4 sprints
**Objetivo da fase:** cadastro formal de aluno, cursos/turmas/salas, tabela de valores versionada e agenda geral. Sem isso, CRM e financeiro de escola não têm onde se apoiar — é a ordem que a própria Emusys sugere.

### S1.1 — Cadastro de pessoas com matrícula formal
**Prioridade:** 🔴 Crítica

Substituir o campo solto de curso por um fluxo real de matrícula.

**Entregas:**
- Fluxo de Matrícula: curso, modalidade, professor, sala, responsável financeiro (CPF, dados)
- Vínculo contratante/dependente (aluno menor de idade)
- Cadastro sem matrícula (fornecedor/"Outros") registrado como débito técnico aceitável — fora do escopo mobile v1

**Critério de pronto:** uma nova matrícula gera Aluno + vínculo de responsável financeiro num único fluxo, sem editar campos soltos depois.

**Depende de:** S0.2

### S1.2 — Cursos, turmas e salas
**Prioridade:** 🔴 Crítica

Dar existência própria a curso, turma e sala — hoje aula é sempre 1 professor : 1 aluno.

**Entregas:**
- Model `Curso` (curso → disciplina, simplificado na v1 — sem árvore de módulos/tópicos ainda)
- Model `Turma` (limite de alunos, múltiplos professores opcional)
- Model `Sala` (nome, descrição, ativa/inativa)
- `Aula` ganha `turmaId` e `salaId` opcionais

**Critério de pronto:** uma turma com 2 professores e 8 alunos agenda aula única visível pros dois professores.

**Depende de:** S0.2

### S1.3 — Tabela de valores versionada
**Prioridade:** 🟡 Alta

Tirar o preço do campo solto e dar a ele histórico — reajuste anual não pode quebrar contrato ativo.

**Entregas:**
- Models `Modalidade` (frequência/duração), `PlanoPagamento`, `TabelaValores` com `Versao`
- Preço por forma de pagamento (cartão/boleto/Pix)
- Matrícula passa a puxar preço da versão ativa da tabela
- Nova versão só afeta matrícula/renovação nova — quem já está pagando mantém o valor da versão em que entrou

**Critério de pronto:** ativar uma nova versão de tabela não altera o valor de nenhum aluno já matriculado.

**Depende de:** S1.1, S1.2

### S1.4 — Agenda geral da escola + calendário letivo
**Prioridade:** 🟡 Alta

Dar ao GESTOR a visão de grade completa que hoje só existe por professor isolado.

**Entregas:**
- View de Agenda agrupável por professor ou por sala, escopo GESTOR
- Calendário da Escola (feriados/recessos) que agenda e matrícula respeitam automaticamente
- Ações inline: trocar professor, trocar sala, cancelar com/sem reposição

**Critério de pronto:** GESTOR troca o professor de uma aula agendada sem precisar abrir o app do professor original.

**Depende de:** S1.2

---

## Fase 2 — App do aluno / responsável

**Duração:** 6 semanas · 3 sprints
**Objetivo da fase:** maior salto de percepção de valor pra quem paga a mensalidade — a família passa a "ver" a escola, não só o professor.

### S2.1 — Reposição em duas camadas de aprovação
**Prioridade:** 🟡 Alta

Separar aprovação do professor da efetivação da escola, com relatório de faltas duplas.

**Entregas:**
- `Reposicao` ganha status: Solicitada → Autorizada/Negada → Finalizada
- Aprovação do professor obrigatória antes da efetivação da escola
- Relatório de aulas sem presença registrada de nenhum dos dois lados

**Critério de pronto:** uma reposição só vira "Finalizada" depois de passar por professor e escola, nessa ordem.

**Depende de:** S0.2

### S2.2 — Faturas por matrícula
**Prioridade:** 🟡 Alta

Evoluir a tela de pagamento do aluno de "mensalidade única" para faturas por matrícula/turma.

**Entregas:**
- Faturas agrupadas em Abertas / Pagas / Em Atraso, por matrícula
- Dividir fatura em partes
- Gerar recibo

**Critério de pronto:** um aluno com 2 matrículas na mesma escola vê 2 conjuntos de fatura separados.

**Depende de:** S1.3

### S2.3 — Avaliação do professor + crédito de horas
**Prioridade:** ⚪ Média

Fechar o ciclo de feedback do aluno e abrir a reserva de sala fora do horário regular.

**Entregas:**
- Model `Avaliacao` (nota + comentário por aula/professor)
- Model `PacoteCredito` (horas compradas)
- Reserva de sala usando crédito, fora do horário de aula regular

**Critério de pronto:** aluno sem crédito não consegue reservar sala; com crédito, reserva e o saldo é debitado.

**Depende de:** S1.2

---

## Fase 3 — Financeiro transacional

**Duração:** 6 semanas · 3 sprints
**Objetivo da fase:** cobrança automática antes de contrato digital — é o que mais economiza tempo de secretaria e reduz inadimplência.

### S3.1 — Cobrança automática Pix/boleto/cartão
**Prioridade:** 🟡 Alta

Substituir o fluxo de comprovante manual por recorrência de verdade.

**Entregas:**
- Integração com gateway de recorrência BR (decisão em aberto — ver riscos)
- Ativação por matrícula (no fim da matrícula ou depois, na ficha do aluno)
- Painel "Resumo da Cobrança Automática" isolando quem precisa de ação (cartão vencido, falha)
- Histórico em Financeiro → Cobranças por Recorrência

**Critério de pronto:** uma matrícula com cobrança automática ativa gera e cobra a fatura do mês seguinte sem intervenção manual.

**Depende de:** S1.3, S2.2
**Não confundir com:** a assinatura Stripe já existente é a Escola pagando o Kav Class — este item é o Aluno pagando a Escola. Fluxos separados, gateways possivelmente diferentes.

### S3.2 — Contrato digital
**Prioridade:** 🟡 Alta

Assinatura eletrônica do contrato de matrícula, com validade jurídica real.

**Entregas:**
- Model `Contrato` + envio por e-mail a partir da matrícula
- Preenchimento + token de confirmação por e-mail
- Assinatura do representante da escola + testemunhas configuráveis
- Cobrança só por contrato efetivamente assinado

**Critério de pronto:** contrato cancelado ou não assinado não gera cobrança nenhuma.

**Depende de:** S1.1
**Recomendação:** usar parceiro (Clicksign/D4Sign) em vez de construir assinatura eletrônica do zero

### S3.3 — Backoffice financeiro mínimo
**Prioridade:** ⚪ Média

Tirar a escola da planilha paralela sem construir o ERP completo da Emusys.

**Entregas:**
- Lançamentos avulsos de caixa
- Fechamento de caixa
- Contas a pagar simples (despesas da escola)

**Critério de pronto:** GESTOR fecha o caixa do dia e vê o saldo bater com o financeiro do app.

**Depende de:** S3.1

---

## Fase 4 — CRM comercial

**Duração:** 6 semanas · 3 sprints
**Objetivo da fase:** só compensa depois que matrícula e financeiro já existem — CRM sem back-office pronto pra converter o lead gera atrito, não receita.

### S4.1 — Leads e funil configurável
**Prioridade:** 🟡 Alta

Dar à escola um lugar pra rastrear interessados antes da matrícula.

**Entregas:**
- Model `Lead`
- Estágios de funil configuráveis por escola
- Tarefas de follow-up na tela inicial do gestor

**Critério de pronto:** um lead avança de estágio e a mudança aparece na tela inicial do gestor sem refresh manual.

**Depende de:** S1.1, S3.1

### S4.2 — Captação de leads
**Prioridade:** 🟡 Alta

Links públicos de auto-cadastro e agendamento de experimental, sem exigir app instalado.

**Entregas:**
- Link de auto-cadastro a partir de um lead existente
- Formulário embutível (site/redes/Google Ads)
- Link de agendamento de aula experimental (lead existente e novo)

**Critério de pronto:** alguém sem conta e sem app agenda uma aula experimental por um link público.

**Depende de:** S4.1

### S4.3 — Aula experimental + conversão
**Prioridade:** ⚪ Média

Fechar o funil com o relatório de conversão fim-a-fim.

**Entregas:**
- Aula-teste vinculada a Lead
- Regra "matriculado = mesmo curso/professor da experimental", configurável
- Relatório: leads novos que viraram matrícula pós-experimental

**Critério de pronto:** o relatório mostra a taxa de conversão de experimental → matrícula por período.

**Depende de:** S4.2

---

## Fase 5 — Avançado & diferenciação

**Duração:** 10 semanas · 5 sprints
**Objetivo da fase:** recursos de retenção e margem, não de aquisição — fazem sentido quando já existe uma base de escolas usando o core.

### S5.1 — Comunicados em escala de escola
**Prioridade:** ⚪ Média

Broadcast pra toda a escola, com histórico de e-mail.

**Entregas:**
- Comunicado escopado por escola (não só por professor)
- Duplicar pra reenvio, lista de destinatários
- Histórico completo de e-mails enviados

**Critério de pronto:** um comunicado enviado não pode ser desfeito; rascunho ainda edita/apaga livre.

**Depende de:** S0.2

### S5.2 — Painel de métricas interativo
**Prioridade:** ⚪ Média

Substituir a tela única de relatório por um painel de verdade.

**Entregas:**
- Clicar numa métrica explica como ela é calculada
- Clicar num mês abre a lista de alunos por trás do número
- Comparação de períodos (ano atual x ano anterior)

**Critério de pronto:** GESTOR compara matrícula do mês atual com o mesmo mês do ano anterior em 2 toques.

**Depende de:** S1.4, S3.1

### S5.3 — QR Code de presença + app do gestor completo
**Prioridade:** ⚪ Média

Presença sem toque manual e paridade mobile com o que a Emusys resolve no painel web.

**Entregas:**
- Geração de cartaz com QR Code por sala
- Presença lançada ao escanear pelo app (professor e aluno)
- App do gestor: matrícula completa, financeiro, agenda, salas, gestão de aulas — tudo no bolso

**Critério de pronto:** presença lançada por QR Code aparece no relatório sem toque manual de ninguém.

**Depende de:** S1.4

### S5.4 — Nota fiscal + antecipação de recebíveis
**Prioridade:** ⚪ Média

Os dois add-ons mais amarrados a burocracia externa — por isso ficam por último.

**Entregas:**
- Emissão de NF em 1 clique via provedor terceiro (varia por município)
- Antecipação de recebíveis de cartão via parceiro financeiro, com simulação prévia

**Critério de pronto:** NF emitida aparece anexada à fatura automaticamente; antecipação mostra taxa antes de confirmar, contratação é irreversível.

**Depende de:** S3.1

### S5.5 — Estoque, renovação em lote e aula online
**Prioridade:** ⚪ Média

Os três itens de cauda mais longa do roadmap, agrupados por não terem dependência forte entre si.

**Entregas:**
- Estoque simples de produtos (entrada/saída/empréstimo)
- Renovação de matrícula em lote (quem vence nos próximos 30 dias)
- Botão de videochamada (Google Meet) direto na aula online

**Critério de pronto:** GESTOR renova 10 alunos de uma vez ajustando parcela/desconto individualmente antes de confirmar.

**Depende de:** S1.3

---

## 10. Linha do tempo completa

20 sprints de 2 semanas · ~40 semanas ponta a ponta. Cada fase é utilizável sozinha — não precisa esperar a fase seguinte pra gerar retorno.

| Sprint | Entrega | Prioridade | Semana |
|---|---|---|---|
| S0.1 | Modelagem Escola + migração | 🔴 Crítica | 01–02 |
| S0.2 | RBAC + convite de professor | 🔴 Crítica | 03–04 |
| S1.1 | Matrícula formal | 🔴 Crítica | 05–06 |
| S1.2 | Cursos, turmas e salas | 🔴 Crítica | 07–08 |
| S1.3 | Tabela de valores versionada | 🟡 Alta | 09–10 |
| S1.4 | Agenda geral + calendário letivo | 🟡 Alta | 11–12 |
| S2.1 | Reposição em 2 camadas | 🟡 Alta | 13–14 |
| S2.2 | Faturas por matrícula | 🟡 Alta | 15–16 |
| S2.3 | Avaliação + crédito de horas | ⚪ Média | 17–18 |
| S3.1 | Cobrança automática | 🟡 Alta | 19–20 |
| S3.2 | Contrato digital | 🟡 Alta | 21–22 |
| S3.3 | Backoffice financeiro mínimo | ⚪ Média | 23–24 |
| S4.1 | Leads e funil | 🟡 Alta | 25–26 |
| S4.2 | Captação de leads | 🟡 Alta | 27–28 |
| S4.3 | Aula experimental + conversão | ⚪ Média | 29–30 |
| S5.1 | Comunicados em escala | ⚪ Média | 31–32 |
| S5.2 | Painel de métricas | ⚪ Média | 33–34 |
| S5.3 | QR Code + app do gestor | ⚪ Média | 35–36 |
| S5.4 | NF + antecipação | ⚪ Média | 37–38 |
| S5.5 | Estoque + renovação em lote + aula online | ⚪ Média | 39–40 |

---

## 11. Riscos e decisões em aberto

Coisas que não dá pra decidir só olhando o código — precisam de uma escolha de negócio antes da sprint correspondente chegar.

**Gateway de cobrança recorrente**
Pix/boleto/cartão automático (S3.1) exige escolher parceiro — Asaas, Pagar.me ou Iugu são os candidatos naturais no Brasil. Afeta taxa, prazo de repasse e o desenho do contrato com a escola. Decidir antes de S3.1 começar.

**Superfície do gestor: mobile ou painel web**
Hoje o Kav Class é só app Expo. A Emusys resolve o gestor num painel web pesado e deixa só um subconjunto no mobile. Este roadmap assume mobile-first (reaproveitando o expo-router, sem abrir uma segunda base de código) — mas se o público-alvo de escola maior preferir tela grande, vale reavaliar antes de S0.2.

**Migração de produção em S0.1**
Não é ambiente green-field — tem professor pagante hoje. S0.1 precisa de janela de manutenção definida e plano de rollback testado em staging antes de tocar produção.

**Assinatura eletrônica com validade jurídica**
Contrato digital (S3.2) não deve ser construído do zero — usar parceiro como Clicksign ou D4Sign reduz risco jurídico e tempo de sprint.

**Nota fiscal é o item mais amarrado a burocracia local**
Emissão varia por município/prefeitura — por isso fica na Fase 5, depois que o core já estiver validado com escolas reais.

---

*Base: leitura direta de `kav-class-backend/server.js`, `prisma/schema.prisma` e `my-app/app/**` em 29/08/2026, cruzada com o levantamento funcional da Emusys (fontes públicas, sem acesso ao sistema real). Decisão de arquitetura (Escola aditiva, dois pacotes comerciais, sem remover o modo professor autônomo) confirmada com o time antes de detalhar as sprints.*
