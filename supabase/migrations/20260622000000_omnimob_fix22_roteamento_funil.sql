-- ============================================================================
-- Fix 2.2 — Roteamento de funil no recebimento (venda vs locação)
-- Omnimob v3. Idempotente + atômica.
--
-- whatsapp_numbers ganha default_funnel_id: o funil em que LEADS NOVOS desse
-- número entram. Número de vendas → fun-ia-mcmv; número de locação → fun-ia-locacao.
-- O webhook usa esse funil; se nulo, cai no is_ai_funnel=true (retrocompat).
-- ============================================================================
BEGIN;

ALTER TABLE public.whatsapp_numbers
  ADD COLUMN IF NOT EXISTS default_funnel_id text;

-- FK leve (não bloqueia se funil for removido — SET NULL)
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='whatsapp_numbers_default_funnel_fk') THEN
    ALTER TABLE public.whatsapp_numbers
      ADD CONSTRAINT whatsapp_numbers_default_funnel_fk
      FOREIGN KEY (default_funnel_id) REFERENCES public.funnels(id) ON DELETE SET NULL;
  END IF;
END $c$;

-- O número atual (default da org) atende VENDAS (fun-ia-mcmv).
UPDATE public.whatsapp_numbers
   SET default_funnel_id = 'fun-ia-mcmv', updated_at = now()
 WHERE organization_id = '11111111-1111-1111-1111-111111111111'
   AND default_funnel_id IS NULL;

COMMIT;
