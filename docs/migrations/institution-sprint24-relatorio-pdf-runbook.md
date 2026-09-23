# Runbook — INSTITUTION Sprint 24: Relatório do aluno em PDF por período

Sem migration nova — 1 rota + botões de exportação. Quinta sprint da rodada de 23/09/2026.

## O que essa sprint faz

- `GET /api/escola/alunos/:id/relatorio-pdf?periodo=mensal|bimestral|semestral|anual&mes=&ano=` (nova) — reaproveita 100% o padrão já existente do relatório financeiro/DRE (Sprint 8, briefing 08/09/2026): `pdfkit`, logo da escola no topo quando cadastrado, **nunca cita "KAV Class"** (mesmo motivo jurídico já registrado: problema da escola não deve envolver a plataforma).
- Período calculado a partir de `mes`/`ano` (default: mês/ano atual) + duração (`mensal`=1 mês, `bimestral`=2, `semestral`=6, `anual`=12).
- Conteúdo do PDF: frequência (presenças / faltas com reposição / faltas injustificadas / reposições realizadas — usando a classificação de 3 cores dos Sprints 20/21), pagamentos do período com status colorido, e relatórios da coordenação/professor (`RelatorioAluno`) registrados no período.

### Frontend

`my-app/app/(escola)/alunos.tsx`, aba **Relatórios** do modal do aluno — ganhou 4 botões (Mensal/Bimestral/Semestral/Anual) no topo. Mesmo fluxo de download já usado no relatório financeiro (`financeiro.tsx`): busca o PDF autenticado, salva em `FileSystem.cacheDirectory`, abre `Sharing.shareAsync` — a escola pode mandar direto por WhatsApp/e-mail pro pai ou pro aluno.

## Validado nesta sessão

- `node -c server.js` — sintaxe OK; boot local sem erro.
- `npx tsc --noEmit -p .` em `my-app/` — zero erros no projeto inteiro.
- **Pendente de teste manual**: gerar um PDF de cada período pra um aluno com aulas/pagamentos/relatórios reais e conferir o conteúdo e o compartilhamento.

## O que essa sprint deliberadamente NÃO faz

- Não gera a versão Excel do relatório do aluno (só PDF, que é o formato explicitamente pedido pra "enviar aos pais do aluno, ou ao próprio aluno"). O padrão de Excel já existe (`ExcelJS`, usado no DRE) e pode ser replicado depois se pedido.
- Não deixa a escola escolher `mes`/`ano` customizados na UI ainda — os botões sempre pedem o período "atual" (mês corrente como ponto de partida). A rota já aceita `mes`/`ano` na query pra uma UI de seleção de data vir depois, sem mudar o backend.
- Não inclui os "Conteúdos" (materiais enviados) no PDF — o relatório é focado em frequência/pagamento/qualidade de ensino, que foi o que o pedido original enfatizou ("pra enviar aos pais... relatórios mensais, bimestrais...").
