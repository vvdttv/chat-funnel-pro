-- OmniMob — Fase 5: Hardening de banco
--
-- 1) search_path fixo em funções SECURITY DEFINER (evita search_path hijacking)
-- 2) RLS habilitado em tabelas internas expostas via PostgREST
-- 3) Correção do bug de janela em check_rate_limit

-- ---------------------------------------------------------------------------
-- 1) search_path fixo (ALTER não reescreve o corpo)
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.get_deal_tags_json(text)               SET search_path = public, pg_temp;
ALTER FUNCTION public.upsert_webhook_idempotency(text,text,integer,jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public.cleanup_expired_idempotency_keys()     SET search_path = public, pg_temp;
ALTER FUNCTION public.increment_tokens(uuid,bigint)          SET search_path = public, pg_temp;
ALTER FUNCTION public.is_superadmin(uuid)                    SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 2) RLS habilitado (sem policy → nega anon/authenticated; service_role e
--    funções SECURITY DEFINER continuam funcionando, pois bypassam RLS).
-- ---------------------------------------------------------------------------
ALTER TABLE public.webhook_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_events        ENABLE ROW LEVEL SECURITY;

-- Defesa em profundidade: revoga grants amplos de anon/authenticated nessas
-- tabelas internas (só service_role / definer precisam acessar).
REVOKE ALL ON public.webhook_rate_limits FROM anon, authenticated;
REVOKE ALL ON public.webhook_idempotency FROM anon, authenticated;
REVOKE ALL ON public.stripe_events        FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) check_rate_limit: corrige bug de janela.
--    Antes: `WHERE ... window_start = window_start` (coluna comparada consigo
--    mesma → sempre true; ambiguidade variável/coluna). Renomeia a variável
--    para v_window_start e qualifica a coluna.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_ip text,
  p_endpoint text DEFAULT 'whatsapp-webhook'::text,
  p_max_req integer DEFAULT 100,
  p_window_sec integer DEFAULT 60)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
DECLARE v_window_start TIMESTAMPTZ; v_current_count INTEGER;
BEGIN
  v_window_start := date_trunc('minute', NOW());
  DELETE FROM public.webhook_rate_limits
    WHERE ip_address = p_ip AND endpoint = p_endpoint
      AND created_at < (NOW() - (p_window_sec || ' seconds')::interval);
  SELECT req_count INTO v_current_count
    FROM public.webhook_rate_limits
    WHERE ip_address = p_ip AND endpoint = p_endpoint AND window_start = v_window_start;
  IF v_current_count IS NULL THEN
    INSERT INTO public.webhook_rate_limits (ip_address, endpoint, req_count, window_start)
      VALUES (p_ip, p_endpoint, 1, v_window_start)
      ON CONFLICT (ip_address, endpoint, window_start)
      DO UPDATE SET req_count = public.webhook_rate_limits.req_count + 1, created_at = NOW();
    RETURN true;
  END IF;
  IF v_current_count >= p_max_req THEN RETURN false; END IF;
  UPDATE public.webhook_rate_limits
    SET req_count = req_count + 1, created_at = NOW()
    WHERE ip_address = p_ip AND endpoint = p_endpoint AND window_start = v_window_start;
  RETURN true;
END; $function$;
