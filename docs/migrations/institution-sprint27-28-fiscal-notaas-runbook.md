# Sprint 27/28 — Fiscal (Notaas / NFS-e)

Briefing 24/09/2026. Pedido do usuário: criar categoria "Fiscal" no INSTITUTION
para a escola, com sub-abas que resolvam a necessidade de ponta a ponta, e
para o professor, quando a escola exige nota fiscal dele para liberar o
pagamento, que a emissão aconteça automaticamente pelo sistema.

Integração com **Notaas** (`https://platform.notaas.com.br/api/v1`),
provedor de NFS-e como serviço.

## Duas direções de nota fiscal

Modeladas como `TipoNotaFiscal`:

- **`ALUNO_PARA_ESCOLA`** — a escola emite nota para o aluno/responsável que
  pagou. Usa a chave Notaas da **própria escola**. Emissão **sempre manual**
  (ação explícita da escola na aba Pendentes) — documento fiscal tem
  consequência legal real, nunca deve sair sozinho sem alguém decidir emitir.
- **`PROFESSOR_PARA_ESCOLA`** — o professor emite nota para a escola, quando
  a escola exige (`Escola.exigeNotaProfessor = true`) para liberar o
  pagamento. Usa a chave Notaas do **próprio professor** (CNPJ MEI/PJ dele).
  Emissão **automática**, disparada ao fechar a folha de pagamento do mês.

Essas duas direções usam credenciais e tomadores completamente diferentes —
nunca são combinadas.

## Revisão de arquitetura (26/09/2026): organização multi-empresa

Desenho original (24/09): cada Escola/Professor criava a própria conta na
Notaas e colava a API key deles no app. O usuário pediu pra eliminar essa
fricção pro cliente final: usar a **própria conta Notaas dele como
mediadora**, com a escola só cadastrando os dados fiscais no app e a nota
saindo emitida pelo SEFAZ/prefeitura da escola mesmo assim.

Confirmado via documentação pública (`docs.notaas.com.br/docs/org-api`) que
a Notaas tem um nível "Organização" acima dos projetos, documentado como
recurso do plano **Enterprise**, pensado exatamente pra plataformas/
contadores que emitem por vários clientes:

- `POST /org/projects` — cria um "projeto" (empresa) com `cnpj`,
  `razaoSocial`, `inscricaoMunicipal`, `inscricaoEstadual`,
  `regimeTributario`, `codigoMunicipio` — os dados fiscais REAIS de quem
  presta o serviço.
- `POST /org/projects/{id}/certificate` — sobe o certificado digital A1
  (.pfx/.p12, multipart/form-data com campos `file` e `password`, máx.
  50KB). Resposta inclui `subjectCN`, `validFrom`, `validUntil`.
- `POST /org/projects/{id}/api-keys` — gera uma API key ESCOPADA àquele
  projeto, usada depois em `/emitir` normalmente.

**O que isso não elimina — e não tem como eliminar:** a escola (ou o
professor, no caso `PROFESSOR_PARA_ESCOLA`) ainda precisa ter um certificado
digital A1 próprio, emitido pra o CNPJ dela por uma autoridade certificadora
(Serasa, Certisign, Soluti etc.). É o certificado que assina a nota
perante a prefeitura — nenhuma plataforma, nem a Notaas nem qualquer
concorrente, consegue emitir nota de um CNPJ sem o certificado dele. Isso é
uma exigência legal do sistema de NFS-e brasileiro, independente de qual
provedor está por trás.

Com um único **token de organização** (`NOTAAS_ORG_TOKEN`, prefixo
`ntaas_org_`) da conta do próprio usuário, o backend passa a orquestrar os
3 passos acima via `criarEmpresaFiscalNotaas()` sempre que uma Escola ou
Professor completa o cadastro fiscal — a experiência do cliente final vira
"preencher um formulário fiscal + subir um arquivo", sem nunca abrir conta
em nenhuma plataforma terceira.

**Risco assumido, confirmado com o usuário antes de implementar:** o acesso
ao recurso de Organização depende do plano Notaas do usuário (Enterprise).
Se o `NOTAAS_ORG_TOKEN` não tiver esse acesso, `notaasOrgFetch` falha com
401/403 e a rota de cadastro devolve erro claro — não trava nada, só precisa
ser resolvido diretamente com a Notaas.

## Armazenamento de credenciais

- `NOTAAS_ORG_TOKEN` — env var da PLATAFORMA (nunca por tenant), guardada só
  em `.env`/variáveis de ambiente do servidor, nunca no banco.
- `notaasApiKeyCriptografada`/`notaasApiKeyUltimos4` — a API key ESCOPADA ao
  projeto daquela Escola/Professor especificamente, gerada por nós via
  `POST /org/projects/{id}/api-keys` (não é mais colada pelo tenant). Mesma
  cifra AES-256-GCM com `ASAAS_ENCRYPTION_KEY` de antes.
- `notaasOrgProjectId` — id do projeto Notaas daquela Escola/Professor.
- `notaasCertificadoNomeArquivo`/`notaasCertificadoValidoAte` — metadados do
  certificado (não guardamos o .pfx nem a senha — só repassamos pra Notaas
  no momento do cadastro e descartamos).
- `notaasWebhookToken` — igual antes: roteia o webhook e serve de segredo
  HMAC.
- `razaoSocial`/`cnpj`/`inscricaoMunicipal`/`inscricaoEstadual`/
  `regimeTributario`/`codigoMunicipio` — agora É o cadastro fiscal de
  verdade (antes eram só "espelho pra exibir").

Campos em `Escola` e em `Professor` (schema.prisma), independentes entre si.

**O token de API individual que o usuário forneceu na sprint anterior (dia
24/09) nunca foi escrito em nenhum arquivo do repositório** (o repo GitHub é
público) — segue sem uso. Pra essa arquitetura funcionar, o usuário precisa
gerar/localizar um **token de organização** (`ntaas_org_...`) na própria
Notaas e colocá-lo como `NOTAAS_ORG_TOKEN` no `.env` do servidor (local e em
produção) — nunca colado em chat ou commitado.

## Webhook

`POST /api/webhooks/notaas/:token` (registrado com `express.raw` **antes**
do `express.json` global, mesmo padrão de Stripe/Cloudflare Stream, porque a
assinatura HMAC precisa ser calculada sobre os bytes crus do corpo).

- Busca Escola OU Professor por `notaasWebhookToken === token`.
- Valida `X-Notaas-Signature` como HMAC-SHA256(token, rawBody).
- Eventos tratados: `nfse.issued` (status `EMITIDA` + número + chave de
  acesso + data), `nfse.documents_ready` (pdfUrl/xmlUrl), `nfse.error`
  (status `ERRO` + mensagem), `nfse.cancelled` (status `CANCELADA`).
- Sempre responde 200, mesmo em erro interno, para não gerar tempestade de
  retentativas da Notaas.

## Automação da folha de pagamento

`PUT /api/escola/folha-pagamento/:id/status` — ao fechar (`FECHADA`), se
`escola.exigeNotaProfessor` for verdadeiro, dispara
`emitirNotaFolhaPagamento(folha)` em fire-and-forget (não bloqueia a
resposta do fechamento da folha).

Essa função é idempotente (procura `NotaFiscal` existente por
`folhaPagamentoId` antes de emitir de novo) e **nunca trava o fechamento da
folha**: se o professor não conectou a própria conta Notaas ou não tem
código de serviço configurado, grava uma `NotaFiscal` com `status: 'ERRO'` e
manda notificação push pedindo para ele configurar — a escola consegue
fechar a folha normalmente de qualquer forma.

## Telas

- `(escola)/fiscal.tsx` — 3 abas via `SubAbasSimples`:
  - **Configurações** — cadastro fiscal (razão social, CNPJ, inscrição
    municipal/estadual, regime tributário, código do município IBGE) +
    upload do certificado A1 (`expo-document-picker` + leitura em base64
    via `expo-file-system/legacy`) + senha do certificado, tudo enviado
    junto em `POST .../cadastrar-empresa`; depois de cadastrado, mostra
    razão social/CNPJ/validade do certificado (com aviso se faltar menos de
    30 dias) e botão "Desconectar". Código de serviço/alíquota ISS padrão e
    toggle "Exigir nota fiscal do professor" continuam editáveis à parte via
    `PUT .../configuracao`.
  - **Pendentes** — pagamentos de aluno já recebidos (`status: 'PAGO'`) sem
    nota (`notaFiscal: null`), com botão "Emitir nota" por linha.
  - **Notas emitidas** — histórico das duas direções, com badge de status e
    link de PDF.
- `(professor-escola)/fiscal.tsx` — só existe no INSTITUTION (não em
  `(professor)`/SELF, pois só faz sentido quando a escola exige nota). Mesmo
  fluxo de cadastro fiscal + certificado do lado da escola, mas com os dados
  do próprio professor (CNPJ MEI/PJ). **Sem botão de emitir manual** — a
  emissão é sempre automática ao fechar a folha.

Nav: entrada "Fiscal" adicionada em `NAV_ESCOLA` (`(escola)/_ui.tsx`, novo
grupo entre "Operação" e "Instituição") e em `NAV_PROFESSOR_ESCOLA`
(`(professor-escola)/_nav.ts`, ao lado de "Financeiro").

## Rotas de API novas

Escola: `POST /api/escola/fiscal/notaas/cadastrar-empresa` (substituiu
`conectar` — body agora inclui `razaoSocial`/`cnpj`/`inscricaoMunicipal`/
`inscricaoEstadual`/`regimeTributario`/`codigoMunicipio`/
`certificadoBase64`/`certificadoNomeArquivo`/`senhaCertificado`),
`POST /api/escola/fiscal/notaas/desconectar` (só limpa os campos locais —
não desativa o projeto na Notaas, deativação lá é irreversível e não foi
pedida), `GET/PUT /api/escola/fiscal/configuracao`,
`GET /api/escola/fiscal/pendentes`, `GET /api/escola/fiscal/notas`,
`POST /api/escola/pagamentos/:id/emitir-nota`.

Professor: `GET /api/professor/fiscal`,
`PUT /api/professor/fiscal/configuracao`,
`POST /api/professor/fiscal/notaas/cadastrar-empresa|desconectar` (mesmo
formato do lado escola).

## O que foi deliberadamente NÃO feito

- Não há emissão manual para o professor — sempre automática no fechamento
  da folha, por pedido explícito do usuário.
- Não há edição/cancelamento de nota pela tela (cancelamento fica para uma
  sprint futura, se pedido).
- Não há reemissão em lote (`/emitir/batch` da Notaas) — cada nota é emitida
  individualmente; lote fica para se o volume justificar.

## Pontos em aberto (verificar contra sandbox real antes de confiar 100%)

1. **Formato exato do campo do tomador para CPF vs CNPJ** no corpo de
   `POST /emitir` — a documentação pública não deixa 100% claro se é um
   único campo `documento` ou campos separados `cpf`/`cnpj`. Implementado
   com o nome mais provável (`cnpj`/`cpf` dentro de `tomador`); se a Notaas
   rejeitar, ajustar conforme o erro retornado.
2. **Prefixo do header `X-Notaas-Signature`** — não confirmado com certeza
   se vem como `sha256=<hex>` ou hex puro. Implementado removendo o prefixo
   opcional antes de comparar, então funciona nos dois casos, mas idealmente
   confirmar com um webhook de teste real (`POST
   /webhooks/endpoints/{id}/test`).
3. **Nome do campo com a API key na resposta de `POST
   /org/projects/{id}/api-keys`** — não confirmado com certeza (`apiKey`
   foi o mais provável). `criarEmpresaFiscalNotaas` tenta `apiKey`, `key` e
   `token`, nessa ordem; se nenhum bater, a rota de cadastro falha com erro
   claro em vez de silenciosamente guardar `undefined`.
4. **Se `POST /org/projects/{id}/certificate` valida o CNPJ do certificado
   contra o CNPJ do projeto** — a documentação não deixou isso explícito
   (só mostrou erros de "arquivo inválido, senha incorreta, certificado
   expirado"). Se a Notaas aceitar certificado de CNPJ diferente do
   cadastrado, isso é uma lacuna de validação que talvez precise de checagem
   adicional nossa (comparar `subjectCN` retornado com o `cnpj` enviado).
5. **Acesso ao recurso de Organização** — documentado como Enterprise; o
   usuário confirmou implementação sem ainda ter certeza se o plano dele
   cobre. `NOTAAS_ORG_TOKEN` ainda não está configurado em nenhum ambiente
   (nem local, nem produção) — sem ele, toda rota `cadastrar-empresa`
   responde 503.

## Verificação

- `node -c server.js` — OK (revalidado após a revisão de 26/09).
- `npx tsc --noEmit -p my-app` — 0 erros (revalidado após a revisão de
  26/09).
- Boot smoke test do backend — subiu limpo, conectou ao banco, sem erros
  (revalidado após aplicar a migration `20260926000000_add_notaas_org_multiempresa`).
- **Não testado end-to-end** — falta `NOTAAS_ORG_TOKEN` no ambiente pra
  exercitar `cadastrar-empresa` de verdade contra a API da Notaas.
