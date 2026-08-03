-- Flags de dedup pros novos crons de push (pagamento atrasado / aula amanhã):
-- sem elas, o cron das 8h reenviaria a mesma notificação todo dia enquanto o
-- boleto seguir vencido ou a aula seguir agendada.
ALTER TABLE "Aula" ADD COLUMN "lembreteEnviado" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Pagamento" ADD COLUMN "notificadoAtrasado" BOOLEAN NOT NULL DEFAULT false;
