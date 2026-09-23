# Runbook — INSTITUTION Sprint 26: Grade semanal por sala

Sem migration nova — 1 rota + reformulação visual da Logística. Pedido do usuário em 23/09/2026, com referência anexada: foto de uma planilha manual (Google Sheets) que a escola já usa hoje pra controlar horário de sala — um bloco "HORÁRIOS DE AULAS SALA X" por sala, colunas Seg-Sáb, linhas de hora, célula com "Professor - Aluno" colorida.

## O que essa sprint faz

- `GET /api/escola/logistica/grade-semanal` (nova) — mesma técnica de amostragem já usada em `ocupacao-semanal` (Sprint 14): olha só os próximos 7 dias pra achar 1 ocorrência representativa por dia-da-semana/hora, já que a recorrência é semanal/quinzenal/mensal alinhada ao dia. Devolve, por sala, a ocupação `{diaSemana, hora, aluno, professor, ...}` **no mesmo formato de objeto Aula** que a rota diária já existente (`/grade`) — o frontend reaproveita literalmente o mesmo fluxo de "trocar sala" nas duas visualizações, sem duplicar lógica.
- Extraído `diaHoraLocal()` como helper compartilhado (antes só existia inline dentro de `ocupacao-semanal`) — corrige o mesmo cuidado de fuso horário (`Intl` com `timeZone: America/Sao_Paulo`, não `getDay()`/`getHours()` que dependem do fuso do processo Node em produção) nas duas rotas.

### Frontend (`my-app/app/(escola)/logistica.tsx`)

- Duas sub-abas: **"Grade semanal (por sala)"** (nova, default) e **"Um dia específico"** (a grade diária que já existia, sala×hora só daquele dia — continua útil pro caso pontual "só hoje").
- Grade semanal: **um card por sala** (como na planilha de referência), cada um com colunas Seg-Sáb (sem domingo, igual à planilha) × linhas 06h-23h (janela padrão já usada em todo o resto do sistema desde os Sprints 14/18). Célula ocupada mostra "Professor" + "Aluno", colorida **por professor** (hash do nome → paleta de 8 cores, sem precisar guardar cor nenhuma no banco) — mesmo espírito visual da planilha (cada professor com uma cor pra identificar rápido quem dá aula onde).
- Tocar numa célula ocupada abre o mesmo fluxo de troca de sala que já existia (`abrirTrocaSala`/`salvarTroca`, S1.4) — "Só esta ocorrência" ou "A partir de agora (turma)".

## ⚠️ Não testado visualmente em navegador

Segui a instrução de testar mudanças de UI no navegador, mas não tinha credencial de uma Escola de teste com salas/aulas cadastradas neste ambiente pra logar e conferir visualmente. Validei com `tsc --noEmit` (zero erros) e `node -c` + boot do servidor (sem erro), e a estrutura reaproveita componentes/estilos já usados e comprovados em `equipe.tsx` (grid 06h-23h) e na própria grade diária de `logistica.tsx` que já funcionava — mas não é a mesma garantia que ver renderizado. Recomendo abrir a tela real antes de considerar fechado.

## O que essa sprint deliberadamente NÃO faz

- Não implementa "cadastrar aula direto de uma célula vazia" da grade semanal — isso exigiria decidir como uma célula vazia vira uma matrícula nova (escolher aluno existente, criar aluno novo, ou só marcar disponibilidade de sala), o que é maior que "mostrar a grade no formato pedido" (o pedido desta mensagem foi explicitamente sobre o formato visual, "principalmente"). Fica registrado como possível sprint futura se for esse o próximo passo.
- Não persiste cor nenhuma no banco — a cor por professor é 100% derivada (hash do nome) no frontend; se identidade visual estável entre sessões/dispositivos for importante, isso já garante consistência (mesmo nome → mesma cor sempre), sem precisar de campo novo.
- Não valida choque de horário (dois professores na mesma sala/hora) — mesma lacuna já registrada no roadmap mestre (S8.1), não é desta sprint.
