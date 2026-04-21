-- Sprint 1 (rev. 2 do Opus) — Renaming AIA → IA nos codes persistidos.
--
-- Estado atual confirmado: 0 linhas com prefixo 'AIA-' em ia_rules. A migration
-- é idempotente e defensiva: protege contra qualquer org que tenha rodado um
-- seed antigo entre auditorias. Pode ser reaplicada sem efeito.

UPDATE public.ia_rules
SET code = REPLACE(code, 'AIA-', 'IA-'),
    updated_at = now()
WHERE code LIKE 'AIA-%';

-- Verificação: garantir que não restou nada com o prefixo antigo
DO $$
DECLARE
  remaining int;
BEGIN
  SELECT COUNT(*) INTO remaining FROM public.ia_rules WHERE code LIKE 'AIA-%';
  IF remaining > 0 THEN
    RAISE EXCEPTION 'Renaming AIA->IA falhou: % linhas ainda têm prefixo AIA-', remaining;
  END IF;
END $$;