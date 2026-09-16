// Backfill de Conta — fundação de identidade unificada (Rede Social Fase 1,
// Step 1). Roda UMA VEZ, manualmente, contra o banco de produção: cria 1
// Conta por e-mail já existente em Professor ∪ Aluno, e liga contaId nas
// linhas correspondentes. Idempotente (upsert por email + updateMany
// condicionado a contaId ainda nulo) — pode ser reexecutado com segurança
// se cair no meio.
//
// PRÉ-VOO OBRIGATÓRIO antes de rodar em produção: checar colisão de e-mail
// entre as duas tabelas. Hoje nada impede o mesmo e-mail existir como
// Professor E como Aluno simultaneamente (unique constraints independentes)
// — só o /api/login já resolve isso, sempre priorizando Professor achado
// primeiro. Este script replica a MESMA prioridade pra não mudar quem
// consegue logar com esse e-mail no dia 1. Rodar antes:
//
//   SELECT email FROM "Aluno" WHERE email IN (SELECT email FROM "Professor");
//
// Se devolver linhas, PARE e revise cada uma manualmente: pode ser 2
// pessoas diferentes que coincidiram no e-mail, e fundir cegamente numa
// Conta só vazaria o vínculo de uma pessoa pra outra.
//
// Uso:
//   node scripts/backfill-conta.js            (aplica de verdade)
//   node scripts/backfill-conta.js --dry-run   (só reporta o que faria)

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

async function checarColisaoDeEmail() {
  const colisoes = await prisma.$queryRaw`
    SELECT email FROM "Aluno" WHERE email IN (SELECT email FROM "Professor")
  `;
  if (colisoes.length > 0) {
    console.error(`[backfill-conta] ABORTADO: ${colisoes.length} e-mail(s) existem como Professor E como Aluno ao mesmo tempo:`);
    for (const { email } of colisoes) console.error(`  - ${email}`);
    console.error('[backfill-conta] Revise cada um manualmente antes de rodar o backfill.');
    process.exit(1);
  }
}

async function main() {
  await checarColisaoDeEmail();

  const professores = await prisma.professor.findMany({
    where: { contaId: null },
    select: { id: true, email: true, senha: true, googleId: true, nome: true, fotoUrl: true },
  });
  const alunos = await prisma.aluno.findMany({
    where: { contaId: null },
    select: { id: true, email: true, senha: true, googleId: true, nome: true, fotoUrl: true },
  });

  // Prioridade Professor > Aluno — mesma ordem que /api/login já usa hoje
  // (server.js: testa Professor antes de Aluno). Sem colisão real (checado
  // acima), isso só importa pro caso raro de um e-mail aparecer nas duas
  // listas por um registro já ter contaId e o outro não.
  const porEmail = new Map();
  for (const a of alunos) porEmail.set(a.email, a);
  for (const p of professores) porEmail.set(p.email, p);

  console.log(`[backfill-conta] ${porEmail.size} e-mail(s) a processar (${professores.length} professor(es), ${alunos.length} aluno(s) sem contaId).`);
  if (DRY_RUN) {
    console.log('[backfill-conta] --dry-run: nenhuma escrita será feita.');
  }

  let criadas = 0;
  let ligados = 0;

  for (const [email, fonte] of porEmail) {
    if (DRY_RUN) { criadas++; continue; }

    const conta = await prisma.conta.upsert({
      where: { email },
      create: { email, senha: fonte.senha, googleId: fonte.googleId, nome: fonte.nome, fotoUrl: fonte.fotoUrl },
      update: {},
    });
    criadas++;

    const r1 = await prisma.professor.updateMany({ where: { email, contaId: null }, data: { contaId: conta.id } });
    const r2 = await prisma.aluno.updateMany({ where: { email, contaId: null }, data: { contaId: conta.id } });
    ligados += r1.count + r2.count;
  }

  console.log(`[backfill-conta] Concluído: ${criadas} Conta(s) processada(s), ${ligados} linha(s) Professor/Aluno ligada(s).`);
  if (!DRY_RUN) {
    console.log('[backfill-conta] Opcional (otimização de planner, não obrigatório): depois de confirmar que não sobrou contaId nulo,');
    console.log('  rode manualmente via `prisma db execute`:');
    console.log('    ALTER TABLE "Professor" VALIDATE CONSTRAINT "Professor_contaId_fkey";');
    console.log('    ALTER TABLE "Aluno" VALIDATE CONSTRAINT "Aluno_contaId_fkey";');
  }
}

main()
  .catch((err) => { console.error('[backfill-conta] Erro:', err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
