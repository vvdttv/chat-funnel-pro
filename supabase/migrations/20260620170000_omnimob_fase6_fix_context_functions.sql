-- ============================================================================
-- OmniMob — Fase 6: Correção das funções de contexto (org + admin)
-- ----------------------------------------------------------------------------
-- PROBLEMA (drift banco vs repo):
--  * current_org_id() no banco lia apenas o claim JWT 'org_id'. O GoTrue
--    self-hosted NÃO injeta esse claim (sem custom access token hook), então
--    a função retornava NULL para todo token de login real -> toda policy
--    org-scoped negava acesso (conversations, properties, whatsapp_numbers...).
--  * is_org_admin() era um stub `SELECT false` -> nenhum admin conseguia
--    escrever em tabelas com gate de admin.
--
-- CORREÇÃO:
--  * current_org_id(): fallback para profiles.organization_id quando o claim
--    'org_id' está ausente/vazio. Não exige hook no GoTrue nem relogin.
--  * is_org_admin(): considera profiles.role IN ('admin','superadmin') E,
--    para compatibilidade, user_roles.role='admin'. (profiles.role é a fonte
--    real no banco; user_roles está vazia hoje.)
--
-- SEGURANÇA: ambas SECURITY DEFINER + search_path fixo (mantém padrão Fase 5).
-- REVERSÍVEL: redefinição de função; comportamento anterior documentado acima.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(
    nullif((auth.jwt() ->> 'org_id'), '')::uuid,
    (SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1)
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_org_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'superadmin')
      AND p.organization_id = public.current_org_id()
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'
      AND ur.organization_id = public.current_org_id()
  );
$function$;

-- ----------------------------------------------------------------------------
-- record_deal_stage_event: tornar SECURITY DEFINER
-- ----------------------------------------------------------------------------
-- PROBLEMA: este trigger insere em deal_stage_events (tabela de auditoria, RLS
-- habilitado, escrita apenas via trigger). Por NAO ser SECURITY DEFINER, rodava
-- como o usuario chamador (authenticated) e era bloqueado pela RLS -> impedia
-- qualquer INSERT/UPDATE em deals por usuario autenticado. Os outros 3 triggers
-- de deals (assign_correspondent, start_scheduling, notify_new_lead) ja sao
-- SECURITY DEFINER. Alinhamos este ao mesmo padrao. A tabela continua sem
-- policy de escrita p/ o cliente (frontend nao acessa direto; relatorios leem
-- via RPCs SECURITY DEFINER). Corpo da funcao inalterado.
-- ----------------------------------------------------------------------------
ALTER FUNCTION public.record_deal_stage_event() SECURITY DEFINER;
