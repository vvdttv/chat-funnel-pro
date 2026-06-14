-- ============================================================================
-- Omnimob Fase 1 — Worker/dispatcher da fila + pg_cron
-- ============================================================================
-- Cria:
--   1. status 'processing' no CHECK de ai_response_queue (claim atômico)
--   2. RPC claim_ai_queue_batch(p_limit) — reivindica lote com FOR UPDATE SKIP LOCKED
--   3. extensão pg_cron + job que chama a edge function dispatch-ai-queue via pg_net
--
-- Padrões (verificados em produção):
--   - pg_cron está em shared_preload_libraries (CREATE EXTENSION sem restart)
--   - pg_net 0.14 já instalado (schema net)
--   - edge functions expostas em https://supabase-vvdttv.duckdns.org/functions/v1/<nome>
--   - escrita pelas functions é via service_role (bypassa RLS)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Permitir status 'processing' na fila
-- ----------------------------------------------------------------------------
-- O worker marca itens como 'processing' ao reivindicá-los, para que execuções
-- concorrentes do cron não peguem o mesmo item.
ALTER TABLE public.ai_response_queue
  DROP CONSTRAINT IF EXISTS ai_response_queue_status_check;
ALTER TABLE public.ai_response_queue
  ADD CONSTRAINT ai_response_queue_status_check
  CHECK (status IN (
    'pending', 'processing', 'awaiting_approval', 'approved',
    'sent', 'rejected', 'failed', 'cancelled'
  ));

-- ----------------------------------------------------------------------------
-- 2. RPC: reivindica um lote de itens prontos, atomicamente
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER: chamada pela edge function via service_role; a própria
-- função controla o acesso (não exposta a usuários via PostgREST sem service key).
-- FOR UPDATE SKIP LOCKED: duas execuções simultâneas do cron nunca pegam a
-- mesma linha. Marca 'processing' e devolve os itens para o worker processar.
CREATE OR REPLACE FUNCTION public.claim_ai_queue_batch(p_limit integer DEFAULT 5)
  RETURNS SETOF public.ai_response_queue
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT q.id
      FROM public.ai_response_queue q
     WHERE q.status = 'pending'
       AND (q.scheduled_send_at IS NULL OR q.scheduled_send_at <= now())
     ORDER BY q.created_at
     LIMIT GREATEST(p_limit, 1)
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.ai_response_queue q
     SET status = 'processing',
         updated_at = now()
    FROM claimed
   WHERE q.id = claimed.id
  RETURNING q.*;
END;
$$;

-- Acesso à RPC: apenas service_role (worker). Revoga de anon/authenticated.
REVOKE ALL ON FUNCTION public.claim_ai_queue_batch(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_ai_queue_batch(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ai_queue_batch(integer) TO service_role;

-- ----------------------------------------------------------------------------
-- 3. Recuperação de itens 'processing' órfãos (crash do worker)
-- ----------------------------------------------------------------------------
-- Se o worker morrer no meio, o item fica 'processing' para sempre. Esta função
-- devolve a 'pending' itens presos há mais de N minutos. Chamada pelo mesmo cron.
CREATE OR REPLACE FUNCTION public.requeue_stale_processing(p_minutes integer DEFAULT 5)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE public.ai_response_queue
     SET status = 'pending', updated_at = now()
   WHERE status = 'processing'
     AND updated_at < now() - make_interval(mins => GREATEST(p_minutes, 1));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.requeue_stale_processing(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.requeue_stale_processing(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.requeue_stale_processing(integer) TO service_role;

-- ----------------------------------------------------------------------------
-- 4. pg_cron + agendamento
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 4a. Dispara o worker a cada 10 segundos.
-- O segredo x-cron-token é injetado por UPDATE fora do git (ver nota abaixo),
-- lendo de uma tabela de settings interna, para não versionar segredo no SQL.
-- Aqui criamos o job com um placeholder via current_setting, resolvido no UPDATE.
--
-- IMPORTANTE: o valor real de x-cron-token é setado DEPOIS, com:
--   SELECT cron.alter_job( (SELECT jobid FROM cron.job WHERE jobname='dispatch-ai-queue'),
--                          command := $$ ... net.http_post(... 'x-cron-token','<TOKEN_REAL>' ...) $$ );
-- ou recriando o job com o token. NUNCA versionar o token aqui.

-- Remove job anterior se existir (idempotência ao reaplicar)
SELECT cron.unschedule(jobid)
  FROM cron.job
 WHERE jobname IN ('dispatch-ai-queue', 'requeue-stale-processing');

-- Job principal: chama a edge function. O token é substituído no passo pós-deploy.
SELECT cron.schedule(
  'dispatch-ai-queue',
  '10 seconds',
  $$
  SELECT net.http_post(
    url := 'https://supabase-vvdttv.duckdns.org/functions/v1/dispatch-ai-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', 'REPLACE_WITH_CRON_DISPATCH_TOKEN'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Job de recuperação: devolve itens 'processing' órfãos a 'pending' a cada 5 min.
SELECT cron.schedule(
  'requeue-stale-processing',
  '*/5 * * * *',
  $$ SELECT public.requeue_stale_processing(5); $$
);

-- ============================================================================
-- NOTA PÓS-DEPLOY (manual, fora do git):
--   1. Substituir 'REPLACE_WITH_CRON_DISPATCH_TOKEN' pelo valor real de
--      CRON_DISPATCH_TOKEN (mesmo valor setado no .env do serviço functions),
--      recriando o job dispatch-ai-queue com cron.schedule(...) já com o token.
--   2. Conferir execução: SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
-- ============================================================================
