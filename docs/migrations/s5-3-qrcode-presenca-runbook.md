# Runbook — S5.3: QR Code de presença + app do gestor (Salas)

Sem migration nesta sprint — 100% aditivo em rotas, sem tocar no schema
(`Sala.id`, já um UUID, serve de chave do QR; `Aula.presenca` já existia
desde antes de qualquer sprint desta série).

## Ordem alterada: S5.2 pulada, S5.3 veio antes

S5.2 (painel de métricas) depende de S3.1 (cobrança automática), ainda
pendente da decisão de negócio (Stripe Connect vs. conta única — ver
memória `project_gateway_cobranca_stripe`). S5.3 só depende de S1.4 (já
concluída), então veio antes — mesmo raciocínio de sequenciamento já
usado em S3.3 e S4.1.

## ⚠️ Decisões de escopo — leia antes de vender isso como "presença sem toque manual de verdade" ou "app do gestor completo"

**1. Presença por QR é uma confirmação única, não uma reconciliação de
duas pontas.** O roadmap pede "presença lançada ao escanear pelo app
(professor e aluno)". Implementado como: **o primeiro scan, de qualquer
um dos dois lados, já marca a aula como `PRESENTE`**. Isso não é um
sistema de "professor confirmou, aluno não confirmou" — é literalmente
eliminar o toque manual do professor numa lista de presença, que é o
critério de pronto do roadmap ("presença lançada por QR Code aparece no
relatório sem toque manual de ninguém"). Quem precisar registrar
**ausência** continua usando a rota que já existia,
`POST /api/aulas/:id/registrar-presenca`.

**2. "App do gestor completo — matrícula completa, financeiro, agenda,
salas, gestão de aulas, tudo no bolso" foi interpretado como fechar a
lacuna de UI mais concreta e já identificada, não como reconstruir um
super-app.** Backend de matrícula (S2.2), financeiro (S3.3), agenda
(S1.4) e gestão de aulas (trocar professor/sala, cancelar — também
S1.4) já existem e já foram testados em sprints anteriores; o que
faltava mesmo, sem nenhuma UI desde S1.2, era **Salas** — por isso esta
sprint fecha isso especificamente (lista + criação + cartaz), em vez de
tentar entregar uma reformulação completa da tela do gestor numa única
sprint. A grade visual de agenda com as ações inline de S1.4
(trocar professor/sala, cancelar) segue com a mesma decisão de escopo
registrada no runbook de S1.4: aguardando uma tela própria de agenda.

**3. Não dá pra testar o scan de câmera de verdade neste ambiente.**
Não há device físico nem simulador com câmera neste sandbox. A tela de
scanner (`components/EscanearPresenca.tsx`) foi construída seguindo a
API oficial do `expo-camera` (`CameraView` + `onBarcodeScanned` +
`useCameraPermissions`, exatamente como documentado nos `.d.ts` do
pacote) e passou no typecheck, mas **a interação de apontar a câmera pro
QR e o fluxo de permissão nunca foram operados de verdade**. Precisa de
um teste manual num device real antes de anunciar o recurso.

## O que essa sprint adiciona

Sem migration — reaproveita `Sala` (S1.2) e `Aula.presenca` (já
existente). Dependência nova: `qrcode` (backend, gera o PNG do QR em
base64, embutido direto na página HTML) e `expo-camera` (app, lê o QR).

### Rotas novas

| Rota | Quem | O que faz |
|---|---|---|
| `GET /api/salas/:id/cartaz` | **pública** | página HTML pronta pra imprimir, com o QR embutido |
| `POST /api/presenca/qrcode` | professor OU aluno (autenticado) | acha a aula deles, agendada agora, nessa sala, e marca `PRESENTE` |

### `GET /api/salas/:id/cartaz` é pública — não é um lapso

A página abre num navegador externo (`WebBrowser.openBrowserAsync` no
app), então não dá pra mandar o `Authorization: Bearer` normal — e
colocar um JWT de sessão (validade de 7 dias!) numa query string pra
contornar isso vazaria em histórico de navegador sem necessidade
nenhuma. **Esse exato problema foi encontrado e corrigido durante esta
sprint**: a primeira versão do frontend tentava passar o token via
`?token=`, e a rota original exigia autenticação — corrigido tornando a
rota pública, porque o `id` da sala já é um UUID imprevisível (o mesmo
valor que vai impresso no próprio QR e usado sem segredo nenhum em
`POST /api/presenca/qrcode`) e o nome da sala não é dado sensível. Rate
limit (`limitarTaxaPublica`, mesmo padrão de S4.2) aplicado mesmo assim,
por higiene — não porque exista um segredo pra proteger.

### `POST /api/presenca/qrcode` — como resolve "qual aula"

Payload do QR: `KAVCLASS_SALA:<salaId>` (não é uma URL — a leitura
acontece dentro do app, então não precisa ser abrível fora dele). A rota
busca, pra quem escaneou (professor via `professorId`, aluno via
`alunoId`), a aula **dele** nessa sala, com `dataHora` dentro de ±2h de
agora, pega a mais próxima, e marca `PRESENTE`.

## Bug real achado e corrigido testando em staging

**Segundo scan sumia com a aula.** A query original filtrava só
`status: 'AGENDADA'` — mas o primeiro scan já muda o status pra
`CONCLUIDA` junto com a presença. Resultado: um segundo scan (do outro
lado, ex. o aluno depois do professor) não achava mais a aula e caía no
**404** genérico de "nenhuma aula agendada agora", em vez do
"presença já estava registrada" esperado — confuso pra quem só queria
confirmar que já tinha funcionado. Corrigido: a busca agora aceita
`status: { in: ['AGENDADA', 'CONCLUIDA'] }` (excluindo `CANCELADA` de
propósito — não dá pra marcar presença numa aula cancelada), e a
checagem de idempotência (`if (aula.presenca) return jaRegistrada: true`)
passou a ser alcançável de verdade. Só apareceu simulando os dois lados
escaneando em sequência — não seria pego só lendo o código.

## Validado em staging — ponta a ponta

1. `GET /api/salas/:id/cartaz` sem nenhum header de autenticação → **200**,
   `Content-Type: text/html`, nome da sala aparece corretamente (inclusive
   com acento, confirma o `escaparHtml` funcionando). Sala inexistente →
   **404**.
2. `POST /api/presenca/qrcode` sem `salaId` → **400**. Sala inexistente →
   **404**.
3. Professor escaneia aula sua, agendada agora, na sala → **200**,
   `presenca: PRESENTE` e `status: CONCLUIDA` confirmados direto no banco.
4. Escanear de novo (mesmo professor) → **"já estava registrada"**
   (`jaRegistrada: true`), não mais o 404 do bug acima.
5. Aluno escaneia a mesma sala depois → também cai em **"já estava
   registrada"** — o segundo lado a chegar não quebra nada nem duplica.
6. Aula fora da janela de ±2h → **404** ("nenhuma aula sua agendada agora
   nessa sala").
7. **Isolamento entre escolas**: professor de outra escola escaneando a
   sala desta não acha nenhuma aula dele (mesma resposta 404 — a sala
   existir noutra escola não vaza nada, ele só não tem aula lá).
8. Cartaz de sala de outra escola → **404** (a rota é pública mas ainda
   assim escopada pelo `id` da sala; não existe rota de "listar salas de
   qualquer escola").
9. Sem token no `POST /api/presenca/qrcode` → **401** (rota exige
   `autenticar`, mesmo sendo aberta a professor OU aluno).

Dados de teste apagados do staging ao final.

## Frontend

- `components/EscanearPresenca.tsx`: componente compartilhado (câmera +
  moldura + estado de resultado), usado por telas finas em
  `(professor)/escanear-presenca.tsx` e `(aluno)/escanear-presenca.tsx`,
  registradas nos respectivos drawers.
- Seção "Salas" em `(professor)/escola.tsx`: lista + criação + botão de
  QR que abre o cartaz no navegador (`WebBrowser.openBrowserAsync`).
- Dependência nova: `expo-camera`, com permissão de câmera configurada
  via plugin no `app.json` (`cameraPermission`).

## Verificação pós-deploy em produção

Nenhuma — sem migration, sem coluna nova. Só confirmar que
`GET /api/salas/:id/cartaz` responde e que `qrcode`/`expo-camera` foram
instalados no build (`npm ls qrcode` no backend, o app precisa de um
novo build nativo — EAS Build — já que `expo-camera` é módulo nativo,
não some com só um update OTA).

## Rollback

Sem migration pra reverter. Reverter o deploy do backend remove as duas
rotas novas; reverter o app remove a tela de scanner e a seção Salas —
mas como `expo-camera` é módulo nativo, isso exige um novo build (EAS),
não um update OTA.

---

## Fase 5 — status

- **S5.1 (Comunicados):** ✅
- **S5.2 (Painel de métricas):** pendente (depende de S3.1).
- **S5.3 (QR Code de presença + Salas):** ✅ (esta sprint).
- **S5.4 (Nota fiscal + antecipação):** pendente (depende de S3.1).
- **S5.5 (Estoque, renovação em lote, aula online):** próxima — não
  depende de S3.1, só de S1.3 (✅ já feita).
