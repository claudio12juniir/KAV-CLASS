# Runbook — INSTITUTION Sprint 19: Funil de captação → WhatsApp (v1 wa.me)

Sem migration nova — só rotas + página HTML pública. Oitava e última sprint do plano de 22/09/2026 (`docs/institution-briefing-2026-09-22.md`, seção 4).

## Decisão tomada (v1, sem custo)

O briefing registrava uma decisão de negócio pendente: landing 100% externa feita pela escola vs. formulário continuar hospedado pelo KAV. Como o usuário pediu pra seguir até o fim sem pausar pra decisão a cada sprint, foi implementada **a v1 recomendada** (sem custo, sem homologação de API paga):

- O formulário público **continua hospedado pelo KAV** (`GET /captacao/:token`) — não existe redirecionamento pra landing externa da escola.
- Depois do envio, a página de sucesso mostra um botão **"Confirmar pelo WhatsApp"** que abre `https://wa.me/<número da escola>` com uma mensagem pré-preenchida (nome de quem preencheu + nome da escola) — a pessoa que respondeu ao formulário decide, com 1 toque, mandar a mensagem de verdade pro WhatsApp da escola.
- **Se a escola nunca configurou `Escola.whatsapp`** (campo que já existia, editável em `perfil-instituicao.tsx`), o botão simplesmente não aparece — a página de sucesso continua funcionando normalmente, sem quebrar nem exigir nada novo de quem já usa o link hoje.

**Trade-off explícito, não escondido**: isso não é 100% automático — depende de a pessoa que preencheu o formulário confirmar o toque no WhatsApp. A alternativa 100% automática (API oficial do WhatsApp Business/Meta ou parceiro tipo Twilio/Z-API) tem custo e homologação — mesma decisão em aberto já registrada no roadmap mestre como pré-requisito de **S8.5**. Se o usuário quiser essa via depois, é sprint nova, não retrabalho desta.

## O que mudou

- `GET /api/publico/captacao/:token` (server.js) — passou a retornar também `escolaWhatsapp` (lido de `Escola.whatsapp`, campo que já existia desde a Rede Social Fase 3).
- `GET /captacao/:token` (página HTML pública) — guarda `escolaWhatsapp`/`escolaNome` na primeira chamada; ao receber sucesso do `POST`, monta o link `wa.me` (mesmo padrão `https://wa.me/<dígitos>` já usado em `abrirWhatsApp()` de `financeiro.tsx`, reaproveitado por consistência) e mostra o botão verde.
- Nenhuma rota nova, nenhum model novo, nenhuma UI nova no painel da escola — `captacao.tsx` (gestão de links) não precisou mudar porque o comportamento é inteiramente da página pública.

## O que essa sprint deliberadamente NÃO faz

- **Não redireciona pra uma landing page externa feita pela escola.** Se essa exigência for inegociável no futuro, a via mais simples é `LinkCaptacao` ganhar um campo `urlExterna` opcional — o link do KAV vira um redirect 302 que registra o clique e manda pra URL da escola, mas nesse caso o KAV nunca vê a resposta do formulário (que mora fora), então o WhatsApp automático desta sprint deixaria de funcionar nesse modo. As duas coisas (landing externa vs. resposta automática pro WhatsApp) são mutuamente exclusivas do jeito que estão desenhadas — não dá pra ter as duas sem uma API paga recebendo webhook do formulário externo.
- **Não envia a mensagem sozinho** — depende do toque de quem preencheu o formulário. Ver decisão acima.
- **Não integra WhatsApp Business API/Meta Cloud API/Twilio** — nenhuma conta nova, nenhum custo, nenhuma homologação.

## Validado nesta sessão

- `node -c server.js` — sintaxe OK; boot local sem erro.
- `curl http://localhost:3000/captacao/<token qualquer>` — página HTML carrega, JS embutido (incluindo o regex `/\D/g` de limpeza do número) renderiza corretamente no HTML servido.
- `npx tsc --noEmit -p .` em `my-app/` — zero erros (sprint não tocou frontend TS, só server.js).
- **Pendente de teste manual**: configurar `Escola.whatsapp` em Perfil da Instituição, abrir um link de captação real, preencher o formulário e confirmar que o botão de WhatsApp aparece com o número e mensagem certos; conferir que sem `whatsapp` configurado o botão simplesmente não aparece.
