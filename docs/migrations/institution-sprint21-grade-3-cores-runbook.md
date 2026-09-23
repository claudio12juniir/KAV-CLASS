# Runbook — INSTITUTION Sprint 21: Grade de hoje com 3 cores autônomas

Sem migration nova — só frontend + 1 rota nova (`registrar-falta`, já criada no Sprint 20). Segunda sprint da rodada de 23/09/2026.

## O que essa sprint faz

Pedido do usuário: "quando o professor marcar presença na aula, já marque automaticamente nessa lista de aulas do dia aquela aula como verdinho — aluno presente/aula concluída; amarelo — falta do aluno/professor, aula para repor; vermelho — falta injustificada, registra no histórico e não precisa de reposição". E que a escola consiga fazer isso sozinha, sem depender do professor.

### Classificação (`my-app/app/(escola)/index.tsx`)

```
corDaAula(aula):
  presenca === 'PRESENTE'                         → verde  (Aula concluída)
  presenca ∈ {AUSENCIA_ALUNO, AUSENCIA_PROFESSOR}  → amarelo se decisaoReposicao=true, vermelho se false
  senão                                            → cinza  (Pendente)
```

- Badge colorido novo em cada linha de aula na `ModalGradeProfessor`, além dos badges de detalhe que já existiam (Professor ok/pendente, Aluno ok/pendente).
- Lista "Grade de hoje" (visão por professor) ganhou contadores rápidos: quantas aulas daquele professor estão "pendentes" e quantas "pra repor", sem precisar abrir a grade em horas.

### Ação autônoma da escola: "Marcar falta"

Botão novo `Marcar falta` em cada aula → escolhe **quem** faltou (Aluno/Professor) → escolhe **se precisa repor** (Sim/Não) → chama `PUT /api/aulas/:id/registrar-falta` (rota nova do Sprint 20). **Sem senha** — diferente de "Marcar presença manual" (override, continua exigindo senha de quem está sendo marcado): registrar uma ausência não carrega o mesmo risco de fraude que reivindicar presença de alguém. Já sincroniza a tela de Reposições sozinho, herdado do Sprint 20.

O antigo botão solto "Marcar/Desmarcar reposição" (`PUT /api/aulas/:id/reposicao`, sem tocar em `presenca`) foi removido da Grade de hoje — ele só fazia sentido isolado quando não existia uma forma de marcar falta+reposição junto; agora "Marcar falta" cobre o caso de ponta a ponta. A rota em si não foi removida do backend (outros fluxos podem vir a usá-la).

### "Tempo real" — decisão de escopo

O app não tem infraestrutura de WebSocket/push-refresh hoje — todo o painel atualiza por refetch ao focar a tela (padrão já registrado no roadmap mestre). Construir push em tempo real de verdade é mudança de infraestrutura, fora do escopo desta sprint. **V1 pragmática**: `carregarDados()` no Painel agora roda a cada 20s automaticamente enquanto a tela está aberta (`setInterval` dentro do `useFocusEffect`, limpo no unmount) — sem precisar sair e voltar da tela pra ver o professor confirmando presença pelo celular.

**Correção necessária pra o polling funcionar direito**: `professorSelecionado` guardava o objeto inteiro da grade no momento do clique — com o polling trocando a referência de `gradeHoje` a cada 20s, a modal aberta ficaria "congelada" no estado de quando foi aberta. Trocado por `professorSelecionadoId` (só o id), com o objeto exibido sempre derivado ao vivo de `gradeHoje.find(...)`. Como efeito colateral (bom): a modal **não fecha mais sozinha** depois de cada ação (substituir professor, marcar falta, override) — só atualiza os dados no lugar, permitindo marcar várias coisas em sequência sem reabrir.

## Validado nesta sessão

- `npx tsc --noEmit -p .` em `my-app/` — zero erros no projeto inteiro.
- `node -c server.js` — sintaxe OK; boot local sem erro (sem rota nova nesta sprint, só reaproveitando `registrar-falta` do Sprint 20).
- **Pendente de teste manual**: marcar falta com os dois desfechos (amarelo/vermelho) e conferir a cor mudando na hora; abrir a modal, esperar ~20s com uma aula sendo confirmada por outro dispositivo (app do professor) e ver o badge virar verde sozinho.

## O que essa sprint deliberadamente NÃO faz

- Não implementa WebSocket/push-refresh de verdade — ver decisão de escopo acima.
- Não estende o polling de 20s pra outras telas (Reposições, Logística, Equipe) — o pedido era especificamente sobre a Grade de hoje.
- Não adiciona uma forma de "desfazer" uma falta já marcada (voltar pro estado cinza/pendente) — só dá pra trocar entre amarelo e vermelho registrando de novo. Registrado como possível sprint futura, não pedido explicitamente agora.
