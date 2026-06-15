-- ============================================================
-- OMNIMOB — Fase 2C (parte 1/2): Roles correspondente + atendente
-- ============================================================
-- ALTER TYPE ... ADD VALUE deve rodar e committar ANTES de qualquer
-- uso do novo rótulo em policies/funções (Postgres não enxerga o valor
-- novo na mesma transação que o adiciona). Por isso esta migration é
-- SEPARADA da 20260615170000 (tabelas/RLS/RPCs) e deve ser aplicada e
-- committada primeiro.
--
-- IMPORTANTE (C-1): `ALTER TYPE ... ADD VALUE` NÃO pode rodar dentro de um
-- bloco de transação. Aplique este arquivo SEM envelopar em transação:
--   psql -v ON_ERROR_STOP=1 -f este_arquivo.sql        (psql não abre BEGIN p/ arquivo -f)
-- NÃO usar --single-transaction. NÃO envolver em DO/BEGIN. A cláusula
-- IF NOT EXISTS (Postgres 12+) torna o comando idempotente sem DO-block.
-- ============================================================

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'correspondente';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'atendente';
