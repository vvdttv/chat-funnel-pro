-- OmniMob Fase 4A — Notificacoes Push
-- Tabela notifications (por usuario) + RLS + RPCs + integracao nos fluxos.
-- Idempotente. profiles.id == auth.uid() (FK profiles_id_fkey -> auth.users).

-- 1) TABELA notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  type            text NOT NULL,
  title           text NOT NULL,
  body            text,
  data            jsonb NOT NULL DEFAULT '{}'::jsonb,
  read            boolean NOT NULL DEFAULT false,
  read_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_type_chk CHECK (
    type IN ('deal_stalled','new_lead','credit_approved','briefing_ready','system')
  )
);

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications (user_id, read) WHERE read = false;
CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_org_idx
  ON public.notifications (organization_id);

-- 2) RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifications_owner_select ON public.notifications;
DROP POLICY IF EXISTS notifications_owner_update ON public.notifications;
DROP POLICY IF EXISTS notifications_service_insert ON public.notifications;
CREATE POLICY notifications_owner_select ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY notifications_owner_update ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY notifications_service_insert ON public.notifications
  FOR INSERT TO service_role WITH CHECK (true);

-- 3) RPCs auxiliares
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id uuid, p_type text, p_title text, p_body text DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL, p_data jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.notifications (user_id, organization_id, type, title, body, data)
  VALUES (p_user_id, p_organization_id, p_type, p_title, p_body, COALESCE(p_data, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END; $fn$;
GRANT EXECUTE ON FUNCTION public.create_notification(uuid,text,text,text,uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.notify_deal_owners(
  p_deal_id text, p_type text, p_title text,
  p_body text DEFAULT NULL, p_data jsonb DEFAULT '{}'::jsonb
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_org uuid; v_assigned uuid; v_count integer := 0; v_uid uuid;
BEGIN
  SELECT organization_id, assigned_to INTO v_org, v_assigned
  FROM public.deals WHERE id = p_deal_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF v_assigned IS NOT NULL THEN
    PERFORM public.create_notification(v_assigned, p_type, p_title, p_body, v_org, p_data);
    RETURN 1;
  END IF;
  FOR v_uid IN SELECT p.id FROM public.profiles p WHERE p.organization_id = v_org LOOP
    PERFORM public.create_notification(v_uid, p_type, p_title, p_body, v_org, p_data);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END; $fn$;
GRANT EXECUTE ON FUNCTION public.notify_deal_owners(text,text,text,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_notification_read(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  UPDATE public.notifications SET read = true, read_at = now()
   WHERE id = p_id AND user_id = auth.uid() AND read = false;
  RETURN FOUND;
END; $fn$;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_count integer;
BEGIN
  WITH upd AS (
    UPDATE public.notifications SET read = true, read_at = now()
     WHERE user_id = auth.uid() AND read = false RETURNING 1
  ) SELECT COUNT(*) INTO v_count FROM upd;
  RETURN v_count;
END; $fn$;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_unread_notification_count()
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT COUNT(*)::integer FROM public.notifications
   WHERE user_id = auth.uid() AND read = false;
$fn$;
GRANT EXECUTE ON FUNCTION public.get_unread_notification_count() TO authenticated;

-- 4) INTEGRACAO — Stalled deals (estende check_stalled_deals_cron)
CREATE OR REPLACE FUNCTION public.check_stalled_deals_cron(
  p_org uuid DEFAULT NULL::uuid, p_threshold_days int DEFAULT 3
)
RETURNS TABLE(deal_id text, lead_name text, stage_name text, days_stalled numeric, notification_created boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_org uuid; v_rec record; v_nc boolean;
BEGIN
  v_org := COALESCE(p_org, public.current_org_id());
  FOR v_rec IN
    SELECT d.id, d.lead_name, d.stage_id, d.updated_at,
           EXTRACT(EPOCH FROM (now()-d.updated_at))/86400.0 AS ds
      FROM public.deals d
     WHERE d.organization_id = v_org
       AND d.status = 'open'
       AND EXTRACT(EPOCH FROM (now()-d.updated_at))/86400.0 > p_threshold_days
       AND NOT EXISTS (
         SELECT 1 FROM public.internal_notifications n
          WHERE n.deal_id = d.id AND n.kind = 'stalled_deal'
            AND n.created_at > now() - interval '1 day')
  LOOP
    v_nc := false;
    BEGIN
      INSERT INTO public.internal_notifications(organization_id,kind,deal_id,payload,status)
      VALUES(v_org,'stalled_deal',v_rec.id,
             jsonb_build_object('lead_name',v_rec.lead_name,'days_stalled',ROUND(v_rec.ds,1),'threshold_days',p_threshold_days),
             'pending');
      v_nc := true;
    EXCEPTION WHEN OTHERS THEN v_nc := false; END;
    BEGIN
      PERFORM public.notify_deal_owners(
        v_rec.id, 'deal_stalled',
        'Deal parado ha ' || ROUND(v_rec.ds,0)::text || ' dias',
        COALESCE(v_rec.lead_name,'Lead') || ' esta sem movimento. Verifique o andamento.',
        jsonb_build_object('deal_id',v_rec.id,'days_stalled',ROUND(v_rec.ds,1),'stage_id',v_rec.stage_id)
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN
      INSERT INTO public.deal_activities(deal_id,organization_id,type_code,title,description,next_action_required)
      VALUES(v_rec.id,v_org,'stalled_alert','Deal parado detectado',
             'Deal parado ha '||ROUND(v_rec.ds,0)::text||' dias',true);
    EXCEPTION WHEN OTHERS THEN NULL; END;
    RETURN QUERY SELECT v_rec.id, v_rec.lead_name, v_rec.stage_id, ROUND(v_rec.ds,1), v_nc;
  END LOOP;
END; $fn$;
GRANT EXECUTE ON FUNCTION public.check_stalled_deals_cron(uuid,int) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_stalled_deals_cron(uuid,int) TO authenticated;

-- 5) INTEGRACAO — New lead (entrou em 'ia-atendimento')
CREATE OR REPLACE FUNCTION public.notify_new_lead_qualified()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF NEW.stage_id = 'ia-atendimento'
     AND (TG_OP = 'INSERT' OR NEW.stage_id IS DISTINCT FROM OLD.stage_id) THEN
    BEGIN
      PERFORM public.notify_deal_owners(
        NEW.id, 'new_lead',
        'Novo lead qualificado: ' || COALESCE(NEW.lead_name,'Lead'),
        'Um novo lead entrou em atendimento e esta pronto para acompanhamento.',
        jsonb_build_object('deal_id',NEW.id,'stage_id',NEW.stage_id,'lead_name',NEW.lead_name)
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
  RETURN NEW;
END; $fn$;

DROP TRIGGER IF EXISTS trg_notify_new_lead ON public.deals;
CREATE TRIGGER trg_notify_new_lead
  AFTER INSERT OR UPDATE OF stage_id ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_lead_qualified();
