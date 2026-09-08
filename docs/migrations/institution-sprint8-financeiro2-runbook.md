# Runbook — INSTITUTION Sprint 8: Financeiro II (relatório PDF/Excel + Pagamentos)

**Sem migration nesta sprint** — só código (rotas novas + libs).

Oitava sprint do plano de 11 (`docs/institution-briefing-2026-09-08.md`, seção 7).

## Libs novas

`pdfkit` e `exceljs` instaladas em `kav-class-backend` (`npm install pdfkit exceljs`). Escolhidas em vez de `puppeteer`: geram o arquivo em memória sem precisar de Chromium instalado — importante porque o serviço roda no plano gratuito do Render (ver `kav_class_deployment` na memória de longo prazo). Testadas com um smoke test isolado (gerar 1 PDF + 1 Excel de exemplo) antes de integrar nas rotas — ambas funcionam sem dependência nativa extra.

## Decisão de escopo — reaproveitar o DRE existente

A lógica de cálculo do DRE (`GET /api/escola/dre`, já existente antes desta sprint) foi fatorada numa função `calcularDre(escolaId, mes, ano)`, reaproveitada pelas 2 rotas de exportação novas — **não foi recriada do zero**. Aproveitei pra também somar `DespesaFixa` (Sprint 7) nas despesas totais, o que tinha ficado deliberadamente de fora no runbook do Sprint 7 até este momento (registrado lá como pendência pra esta sprint).

## Rotas novas

| Rota | Quem | O que faz |
|---|---|---|
| `GET /api/escola/dre/:mes/:ano/pdf` | DONO/GESTOR | Relatório mensal em PDF — nome da instituição e logo (`Escola.logoUrl`, se cadastrado) no topo, receitas/despesas/resultado, lista de lançamentos avulsos. **Nenhuma menção a "KAV Class" em lugar nenhum** — motivo jurídico explícito do usuário, registrado no código. |
| `GET /api/escola/dre/:mes/:ano/excel` | DONO/GESTOR | Mesmo conteúdo, em planilha `.xlsx`. |
| `GET /api/escola/pagamentos-status` | DONO/GESTOR | 3 listas de alunos ativos: inadimplentes (≥1 `Pagamento` ATRASADO — mesma definição do KPI "Inadimplentes" do Painel, Sprint 3), pagos este mês, em dia. Cada item já vem com telefone do aluno ou, na falta, do responsável financeiro. |

## Decisões de escopo

- Botão de WhatsApp é um link direto `wa.me/<telefone>` (números limpos de máscara) — **não** é a régua de cobrança automática do roadmap mestre (S8.5, que envolve WhatsApp Business API/Twilio/Z-API e decisão de fornecedor). v1 pragmática pedida pelo briefing.
- Download do relatório no app: como o React Native não consegue anexar `Authorization` header numa navegação de browser (por isso `GET /api/salas/:id/cartaz` de S5.3 é pública), o app busca os bytes via `fetch` autenticado, converte pra base64 (`FileReader.readAsDataURL`) e usa `expo-file-system` + `expo-sharing` (mesmo padrão já usado em `(professor)/pagamento.tsx` pra abrir comprovante em PDF) — não foi preciso tornar a rota pública.

## Frontend

- `financeiro.tsx`: sub-aba DRE ganhou botões "Exportar PDF"/"Exportar Excel" no cabeçalho do card; nova sub-aba "Pagamentos" com as 3 listas + botão WhatsApp por aluno.

## Validado nesta sessão

- `node -c server.js` — sintaxe OK; boot local sem erro.
- Smoke test isolado: `pdfkit` e `exceljs` geram arquivos válidos (testado fora do Express, confirmando que as libs funcionam no ambiente antes de integrar).
- `npx tsc --noEmit -p .` — sem erros novos.
- **Pendente de teste manual**: baixar/compartilhar o PDF e o Excel de dentro do app de verdade (Expo Go/build), abrir o WhatsApp a partir do botão.

## O que essa sprint deliberadamente NÃO faz

- Envio automático de cobrança por WhatsApp/SMS (isso é S8.5 do roadmap mestre, com decisão de fornecedor em aberto).
- Conciliação bancária ou plano de contas no relatório — o DRE continua "simplificado" (mesma decisão já registrada quando ele foi criado).
