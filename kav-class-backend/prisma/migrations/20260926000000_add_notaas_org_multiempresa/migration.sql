-- Fiscal: modelo de organização multi-empresa da Notaas (26/09/2026) — em
-- vez de cada Escola/Professor abrir conta própria na Notaas, a KAV CLASS
-- usa um token de organização único pra cadastrar um "projeto" por
-- Escola/Professor com o CNPJ/certificado real de cada um. cnpj/
-- inscricaoMunicipal/regimeTributario da Escola já existiam; os campos
-- abaixo completam o cadastro fiscal de verdade + rastreiam o certificado
-- digital A1 subido.
ALTER TABLE "Escola" ADD COLUMN "razaoSocial" TEXT;
ALTER TABLE "Escola" ADD COLUMN "inscricaoEstadual" TEXT;
ALTER TABLE "Escola" ADD COLUMN "codigoMunicipio" TEXT;
ALTER TABLE "Escola" ADD COLUMN "notaasOrgProjectId" TEXT;
ALTER TABLE "Escola" ADD COLUMN "notaasCertificadoNomeArquivo" TEXT;
ALTER TABLE "Escola" ADD COLUMN "notaasCertificadoValidoAte" TIMESTAMP(3);

ALTER TABLE "Professor" ADD COLUMN "razaoSocial" TEXT;
ALTER TABLE "Professor" ADD COLUMN "inscricaoMunicipal" TEXT;
ALTER TABLE "Professor" ADD COLUMN "inscricaoEstadual" TEXT;
ALTER TABLE "Professor" ADD COLUMN "regimeTributario" TEXT;
ALTER TABLE "Professor" ADD COLUMN "codigoMunicipio" TEXT;
ALTER TABLE "Professor" ADD COLUMN "notaasOrgProjectId" TEXT;
ALTER TABLE "Professor" ADD COLUMN "notaasCertificadoNomeArquivo" TEXT;
ALTER TABLE "Professor" ADD COLUMN "notaasCertificadoValidoAte" TIMESTAMP(3);
