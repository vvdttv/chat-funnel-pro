-- ============================================================================
-- OmniMob — Fase 6: Ativação do cron de deals parados (3C-P3)
-- ----------------------------------------------------------------------------
-- check_stalled_deals_cron(p_org, p_threshold) ja existe e foi validado, mas
-- NAO estava agendado. Com p_org=NULL no contexto do cron (sem JWT),
-- current_org_id() retorna NULL e nada e detectado. Para funcionar em
-- multi-org, criamos uma wrapper que itera todas as organizations e chama a
-- funcao por org. Agendamos a wrapper no cron (padrao requeue-stale-processing:
-- funcao SQL pura, sem net.http_post nem GUCs).
--
-- A funcao e idempotente (dedupe de 1 dia em internal_notifications) e
-- autocontida (sub-blocos com EXCEPTION). Hoje, com 0 deals, nao faz nada.
-- Horario: 1x/dia as 08:00 BRT = 11:00 UTC (BRT = UTC-3) — alertas de deal
-- parado nao precisam de frequencia alta.
--
-- REVERSIVEL: SELECT cron.unschedule('check-stalled-deals-daily');
--             DROP FUNCTION public.run_stalled_deals_check_all();
-- ============================================================================

CREATE OR REPLACE FUNCTION public.run_stalled_deals_check_all(p_threshold_days integer DEFAULT 3)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org record;
  v_total integer := 0;
  v_count integer;
BEGIN
  FOR v_org IN SELECT id FROM public.organizations LOOP
    SELECT count(*) INTO v_count
    FROM public.check_stalled_deals_cron(v_org.id, p_threshold_days);
    v_total := v_total + COALESCE(v_count, 0);
  END LOOP;
  RETURN v_total;
END;
$function$;

-- Acesso: apenas service_role/cron. Bloqueia anon/authenticated.
REVOKE ALL ON FUNCTION public.run_stalled_deals_check_all(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.run_stalled_deals_check_all(integer) FROM anon, authenticated;

-- Agenda 1x/dia as 08:00 BRT (11:00 UTC). Idempotente: desagenda antes se ja existir.
SELECT cron.unschedule('check-stalled-deals-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'check-stalled-deals-daily');

SELECT cron.schedule(
  'check-stalled-deals-daily',
  '0 11 * * *',
  $cron$ SELECT public.run_stalled_deals_check_all(3); $cron$
);
