# Runbook — INSTITUTION Sprint 1: Perfil da Instituição + Equipe

Migration: `kav-class-backend/prisma/migrations/20260908100000_add_perfil_instituicao_e_disponibilidade/migration.sql`

Primeira sprint do plano de 11 sprints do `docs/institution-briefing-2026-09-08.md` (seção 7). Pré-requisito puro: sem ela, Grade de hoje (Sprint 3) e Pagamento de professores (Sprint 7) não têm de onde ler horário de funcionamento nem valor por aula.

## O que essa migration faz

- `Escola` ganha: `horarioFuncionamento` (JSONB, nullable), `logoUrl`, `email`, `valorPorAula` (Float, nullable), `tipoRemuneracaoProfessor` (enum `TipoRemuneracaoProfessor { POR_AULA POR_ALUNO_MES }`, default `POR_AULA`, NOT NULL), `diaFechamento` (Int, nullable).
- `Professor` ganha: `contatoEmergencia`, `dataPagamento` (Int, dia do mês), `contratoUrl` — todos nullable.
- Nova tabela `DisponibilidadeProfessor` (id, diaSemana 0-6, horaInicio/horaFim como texto "HH:mm", tipo enum `TipoDisponibilidade { DISPONIVEL PAUSA }`, professorId FK com `ON DELETE CASCADE`), índice `(professorId, diaSemana)`.
- 100% aditivo — nenhuma coluna existente alterada ou removida.

## Decisão de execução (importante pra próximas sprints)

`npx prisma migrate dev` **não funciona neste projeto** — falha ao tentar recriar o histórico inteiro num shadow database (a migration `20260801000000_harden_indices_enums_fk_fixes` recria um índice único que já existe desde o `init`, sem `IF NOT EXISTS` — só fazia sentido rodar uma vez contra o banco real de produção, que tinha esse índice dropado fora do Prisma). Corrigir esse arquivo local dispara detecção de "migration modificada após aplicada" contra o banco real e o Prisma oferece `migrate reset` (dropa o schema inteiro) — **não aceitar isso**.

Fluxo usado (e que deve ser reaproveitado nas próximas 10 sprints): SQL escrito à mão em `prisma/migrations/<timestamp>_<slug>/migration.sql`, aplicado com `npx prisma db execute --schema=prisma/schema.prisma --file=<path>`, registrado com `npx prisma migrate resolve --applied <nome_da_pasta>`, seguido de `npx prisma generate`. Registrado em memória de longo prazo (`feedback_prisma_migrate_dev_broken.md`) pra não repetir a investigação em sessões futuras.

## Rotas novas/alteradas

| Rota | Quem | O que faz |
|---|---|---|
| `GET /api/escola/perfil` | DONO/GESTOR | Estendida: agora retorna também `logoUrl`, `email`, `horarioFuncionamento`, `valorPorAula`, `tipoRemuneracaoProfessor`, `diaFechamento`. |
| `PUT /api/escola/perfil` | DONO/GESTOR | Nova. Atualiza qualquer subconjunto dos campos acima + `nome`. |
| `POST /api/escola/professores/criar` | DONO/GESTOR | Estendida: aceita `telefone`, `contatoEmergencia`, `dataNascimento`, `dataPagamento`, `contratoUrl`, `cursos[]`, `fotoUrl` opcionais, além dos campos já existentes. |
| `PUT /api/escola/professores/:id` | DONO/GESTOR | Nova. Edita cadastro completo de um professor da própria Escola (sem trocar e-mail/senha — isso é autoatendimento via `/api/professor/perfil`). |
| `GET /api/escola/professores/:id/disponibilidade` | DONO/GESTOR | Nova. Lista a grade semanal do professor. |
| `PUT /api/escola/professores/:id/disponibilidade` | DONO/GESTOR | Nova. Substitui a grade inteira (delete + createMany numa transação) — o frontend sempre manda o estado completo. |

## Frontend

- `my-app/app/(escola)/perfil-instituicao.tsx` (novo arquivo, novo item de menu "Perfil da Instituição" em `NAV_ESCOLA`/`_ui.tsx`, grupo "Instituição"): dados da instituição (nome/e-mail/logo por URL), horário de funcionamento (editor de 7 dias com aberto/fechado + horário), remuneração de professor (por aula ou por aluno/mês + valor + dia de fechamento), link pra Catálogo (Planos/Modalidades/Cursos).
- **Decisão de escopo**: `perfil.tsx` (já existente) é o perfil **pessoal** do usuário logado (nome/senha) — não confundir com Perfil da **Instituição**. O briefing usava o mesmo nome pros dois conceitos; mantive-os como telas separadas.
- `equipe.tsx`: formulário de criação de professor ganhou todos os campos do cadastro completo pedido (contato, contato de emergência, nascimento, dia de pagamento, URL do contrato, cursos, URL da foto). Ao criar (modo "Criar login direto"), o modal avança automaticamente para uma segunda etapa obrigatória de grade de disponibilidade (componente `GradeDisponibilidade`, local ao arquivo) antes de fechar.
- **Decisão de escopo**: a grade de disponibilidade é implementada como lista de faixas por dia (adicionar/remover horário com início/fim/tipo), não como grid de 24 células clicáveis — mesmo modelo de dado (`DisponibilidadeProfessor`), interação mais simples e confiável de entregar nesta sprint. Pode evoluir pra grid depois sem mudar o schema.
- Convite por e-mail não passa pela etapa de grade (a conta só existe depois que o professor aceita) — fica pendente até alguém abrir a edição dele depois (Sprint 4 adiciona o botão "Grade" por professor na listagem).

## Validado nesta sessão

- `node -c server.js` — sintaxe OK.
- `npx tsc --noEmit -p .` (dentro de `my-app/`) — sem erros novos nos arquivos tocados (os 2 erros restantes em `escolher-plano.tsx` são pré-existentes, não relacionados a esta sprint).
- Migration aplicada com sucesso contra o banco real via `prisma db execute` (script executado sem erro) e registrada via `migrate resolve --applied`.
- **Pendente de teste manual** (não executado nesta sessão): fluxo completo no app (Expo web/Expo Go) — criar professor, preencher grade, editar Perfil da Instituição.

## O que essa sprint deliberadamente NÃO faz

- Upload real de arquivo pra `logoUrl`/`contratoUrl`/`fotoUrl` — são campos de texto (URL), sem storage integrado. Decisão registrada, não esquecida: fica pra quando houver um serviço de upload de arquivo definido pro projeto.
- Bloqueio de fato, na marcação de aula, dos horários fora de `DisponibilidadeProfessor` — essa validação é o "torna a regra global" mencionado no briefing e será aplicada quando a Grade de hoje/Logística (Sprints 3/6) passarem a criar `Aula` a partir dessa grade.
- Notificação de aniversário do professor no Painel — vem no Sprint 3, que já lê `Professor.dataNascimento` (campo que já existia antes desta sprint).
