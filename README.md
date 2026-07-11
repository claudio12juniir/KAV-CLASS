<div align="center">

<img src="my-app/assets/images/kavclass.png" width="260" alt="KAV Class logo" />

### Sistema de gestão para professores particulares

Um app mobile (React Native/Expo) + API REST (Node/Express/Prisma) para professores particulares
gerenciarem alunos, aulas, mensalidades, materiais e comunicação — tudo em um só lugar.

[![Node](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](kav-class-backend/package.json)
[![Expo](https://img.shields.io/badge/Expo-SDK%2054-000020?logo=expo&logoColor=white)](my-app/package.json)
[![React Native](https://img.shields.io/badge/React%20Native-0.81-61DAFB?logo=react&logoColor=white)](my-app/package.json)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma&logoColor=white)](kav-class-backend/prisma/schema.prisma)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

</div>

---

## Sobre o projeto

O **KAV Class** nasceu de um problema real: professores particulares que administram sua agenda,
cobranças e materiais de aula manualmente (planilhas, WhatsApp, cadernos). O sistema centraliza essa
rotina em duas experiências dedicadas — uma para o **professor**, outra para o **aluno** — conectadas
por uma API que cuida de autenticação, cobrança recorrente, agendamento e notificações.

É um projeto full-stack construído e mantido sozinho do zero, cobrindo modelagem de dados, API REST,
autenticação, pagamentos (Stripe + PIX), push notifications, upload de arquivos e um app mobile
multiplataforma (iOS/Android/Web) com dois perfis de usuário distintos.

## Funcionalidades

**Para o professor**
- Dashboard com aulas do dia e registro de presença em um toque (presente / falta do aluno / falta do professor / pendente de reposição)
- Cadastro e gestão de alunos: mensalidade, dia/frequência das aulas, duração de contrato, status (pendente / ativo / inativo)
- Envio de material de aula em lote (imagens, PDFs/documentos, áudio, texto ou link) direto da tela de agendamento
- Código de convite único por professor para o aluno se cadastrar sozinho
- Controle financeiro: cobranças, aprovação de comprovantes de pagamento, relatórios
- Central de notificações (contrato vencendo/vencido, novo aluno, nova mensagem) com push notifications
- Chat individual com cada aluno

**Para o aluno**
- Dashboard com próxima aula, taxa de frequência, status de pagamento e progresso do contrato
- Pagamento via PIX (copia-e-cola) ou cartão (Stripe Checkout), com histórico de faturas
- Acesso aos materiais enviados pelo professor
- Solicitação de reposição de aula
- Chat direto com o professor

**Autenticação e conta**
- Login com e-mail/senha (JWT, senha com hash bcrypt) e **login biométrico** (Face ID / Touch ID) via `expo-local-authentication`
- Recuperação de senha por e-mail (Nodemailer)
- Foto de perfil com captura/seleção de imagem e compressão automática

## Arquitetura

```
KAV CLASS/APP
├── my-app/                 # App mobile (Expo Router + React Native)
│   └── app/
│       ├── (professor)/    # Rotas exclusivas do professor
│       ├── (aluno)/        # Rotas exclusivas do aluno
│       └── ...              # Login, cadastro, recuperação de senha
│
├── kav-class-backend/      # API REST (Express + Prisma)
│   ├── server.js
│   └── prisma/schema.prisma
│
└── render.yaml             # Deploy do backend no Render
```

O app conversa com a API via REST, autenticando com JWT armazenado em `expo-secure-store`. O backend
expõe rotas segregadas por papel (`/api/aluno/*` vs. rotas de professor), processa assinaturas via
webhook do Stripe e roda um job diário (`node-cron`) para verificar contratos vencendo/vencidos.

### Modelo de dados

`Professor` e `Aluno` são as entidades raiz (um professor tem muitos alunos). A partir delas derivam
`Aula` (aulas agendadas/dadas), `Pagamento` (faturas), `Material` (conteúdo de aula), `Mensagem` (chat),
`Notificacao` e `Reposicao` (pedidos de reposição de aula). `TokenRedefinicaoSenha` cuida do fluxo de
recuperação de senha.

## Tecnologias

| Camada | Stack |
|---|---|
| **Mobile** | React Native 0.81, Expo SDK 54, Expo Router (file-based routing), TypeScript |
| **Backend** | Node.js, Express 5, Prisma ORM |
| **Banco de dados** | PostgreSQL |
| **Autenticação** | JWT, bcrypt, biometria (`expo-local-authentication`), `expo-secure-store` |
| **Pagamentos** | Stripe Checkout + Webhooks, PIX |
| **Notificações** | Expo Push Notifications, Nodemailer, `node-cron` (jobs agendados) |
| **Deploy** | Render (backend), EAS Build (app) |

## Como rodar localmente

### Pré-requisitos
- Node.js 18+
- PostgreSQL
- [Expo Go](https://expo.dev/go) no celular (ou emulador Android/iOS) para testar o app

### Backend

```bash
cd kav-class-backend
npm install
cp .env.example .env      # preencha DATABASE_URL, JWT_SECRET, STRIPE_SECRET_KEY, etc.
npx prisma migrate deploy
npm start
```

### App mobile

```bash
cd my-app
npm install
npx expo start
```

Aponte a constante de API (`app/api.ts`) para o endereço do backend local ou para a instância publicada.

## Autor

Desenvolvido por **Claudio Luiz Dias Junior**.
