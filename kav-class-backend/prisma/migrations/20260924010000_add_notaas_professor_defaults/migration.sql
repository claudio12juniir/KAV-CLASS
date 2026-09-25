-- Código de serviço e alíquota padrão do professor (INSTITUTION Sprint 28,
-- briefing 24/09/2026) — a emissão automática ao fechar a folha não tem
-- ninguém digitando nada na hora, então precisam estar pré-configurados.
ALTER TABLE "Professor" ADD COLUMN "notaasCodigoServicoPadrao" TEXT;
ALTER TABLE "Professor" ADD COLUMN "notaasAliquotaIssPadrao" DOUBLE PRECISION;
