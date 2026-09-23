# Runbook — INSTITUTION Sprint 14: Grade visual 06h–23h (Equipe + Salas)

Sem migration nova — 100% frontend + 1 rota de leitura nova. Terceira sprint do plano de 22/09/2026 (`docs/institution-briefing-2026-09-22.md`, seção 4).

## O que essa sprint faz

Fecha a v1 de texto-livre da grade de disponibilidade do professor (registrada como decisão de escopo no runbook do Sprint 1) e a lista-de-cards da Logística (Sprint 6 do briefing 08/09), trocando as duas por um grid clicável 06h–23h — mesmo componente visual (linhas de hora, colunas variam: dias da semana em Equipe, salas em Logística).

### Equipe (`my-app/app/(escola)/equipe.tsx`)

- `GradeDisponibilidade` virou grid 7×17 (dias × horas 06-22, cada bloco de 1h). Toque cicla vazio → Disponível → Pausa → vazio.
- **Preservação de dados**: slots herdados da v1 de texto livre que não alinham num bloco de 1h (ex. "08:30–09:15") não são descartados — ficam de fora do grid (não editáveis ali) mas voltam intactos em toda gravação, listados à parte como "Horários fora do padrão". Função `ehSlotDeGrade` decide o que entra no grid.
- Overlay "Em aula" (read-only, célula não clicável): nova rota `GET /api/escola/professores/:id/ocupacao-semanal` retorna, pros próximos 7 dias, dia/hora/aluno de cada aula do professor — like uma amostra representativa do ciclo semanal vigente (aulas recorrentes já existem pré-geradas por meses, não precisa varrer tudo). Extração de dia/hora usa `Intl.DateTimeFormat` com `timeZone: America/Sao_Paulo` explícito, não `getDay()/getHours()` (que dependem do fuso do processo Node em produção).
- Usado nos dois fluxos existentes: cadastro de professor novo (etapa 2 obrigatória, sem ocupação ainda) e edição de grade de professor já existente (com ocupação).

### Logística (`my-app/app/(escola)/logistica.tsx`)

- A lista de `SectionCard` por sala virou um grid único: linhas = horas 06-22, colunas = salas cadastradas. Célula ocupada mostra professor+aluno e, ao tocar, abre o mesmo fluxo de troca de sala que já existia (`abrirTrocaSala` → "Só hoje" / "A partir de agora (turma)"), sem mudar a lógica de gravação.
- Aulas sem sala continuam na lista "Sem sala definida" abaixo do grid (não têm coluna pra aparecer).

## Validado nesta sessão

- `npx tsc --noEmit -p .` em `my-app/` — zero erros no projeto inteiro (não só nos arquivos tocados).
- `node -c server.js` — sintaxe OK.
- **Pendente de teste manual**: abrir os dois grids no Expo web/Expo Go, marcar disponibilidade, trocar sala pelo grid, conferir que slots fora do padrão de uma escola antiga (se existir) não somem ao salvar.

## O que essa sprint deliberadamente NÃO faz

- **Criar aula nova a partir de uma célula vazia do grid de Salas** — o grid de Logística é pra reorganizar aulas que já existem (trocar de sala), não um fluxo de matrícula/agendamento novo. Criar aula do zero continua pelos fluxos já existentes (cadastro de aluno com dia/horário, ou tela de aula avulsa do professor). Registrado como decisão de escopo, não esquecido — construir isso seria essencially o S8.1 do roadmap mestre (quadro de aulas com choque de horário), que depende de Fase 7 (RBAC) segundo o roadmap.
- **Validação de choque de horário/sala** — se duas aulas caírem na mesma sala+hora (hoje sem trava nenhuma), o grid mostra só a primeira encontrada na célula; a segunda fica "escondida" visualmente até a escola resolver o conflito por fora. Mesma lacuna já documentada no roadmap mestre (S8.1), não nova desta sprint.
- **Overlay de ocupação na Logística** — o grid de salas já mostra ocupação diretamente (é o próprio dado principal da tela), diferente de Equipe onde ocupação é sobreposta à disponibilidade configurável.
