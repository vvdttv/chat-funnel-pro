
-- ============= DEALS TABLE =============
CREATE TABLE public.deals (
  id text PRIMARY KEY,
  funnel_id text NOT NULL REFERENCES public.funnels(id) ON DELETE CASCADE,
  stage_id text NOT NULL,
  lead_id text NOT NULL,
  lead_name text NOT NULL,
  property text NOT NULL DEFAULT '',
  property_code text NOT NULL DEFAULT '',
  value numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open', -- 'open' | 'won' | 'lost'
  secondary_contacts jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deals públicos para leitura" ON public.deals FOR SELECT USING (true);
CREATE POLICY "Qualquer um pode criar deals" ON public.deals FOR INSERT WITH CHECK (true);
CREATE POLICY "Qualquer um pode atualizar deals" ON public.deals FOR UPDATE USING (true);
CREATE POLICY "Qualquer um pode excluir deals" ON public.deals FOR DELETE USING (true);

CREATE TRIGGER trg_deals_updated_at
BEFORE UPDATE ON public.deals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_deals_funnel_stage ON public.deals(funnel_id, stage_id);

-- ============= STAGE EVENTS (immutable history) =============
CREATE TABLE public.deal_stage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id text NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  funnel_id text NOT NULL,
  from_stage_id text, -- null on creation
  to_stage_id text NOT NULL,
  entered_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.deal_stage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Eventos públicos para leitura" ON public.deal_stage_events FOR SELECT USING (true);
CREATE POLICY "Qualquer um pode registrar eventos" ON public.deal_stage_events FOR INSERT WITH CHECK (true);

CREATE INDEX idx_stage_events_funnel_stage ON public.deal_stage_events(funnel_id, to_stage_id);
CREATE INDEX idx_stage_events_deal ON public.deal_stage_events(deal_id, entered_at);

-- ============= TRIGGER: registra evento ao criar deal e ao mudar stage_id =============
CREATE OR REPLACE FUNCTION public.record_deal_stage_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.deal_stage_events (deal_id, funnel_id, from_stage_id, to_stage_id, entered_at)
    VALUES (NEW.id, NEW.funnel_id, NULL, NEW.stage_id, NEW.created_at);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    INSERT INTO public.deal_stage_events (deal_id, funnel_id, from_stage_id, to_stage_id, entered_at)
    VALUES (NEW.id, NEW.funnel_id, OLD.stage_id, NEW.stage_id, now());
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_deals_stage_events
AFTER INSERT OR UPDATE ON public.deals
FOR EACH ROW EXECUTE FUNCTION public.record_deal_stage_event();

-- ============= RPC: get_stage_metrics =============
-- Estratégias:
--   * closeProbability = deals que passaram por (funnel,stage) e estão com status='won' / total que passaram
--   * advanceProbability = deals que entraram em (funnel,stage) e depois entraram em outro stage / total que entraram
--   * avgDaysToAdvance = média de (próximo evento - este evento) em dias, para os que avançaram
--   * avgDaysToClose = média de (data status=won - este evento) em dias, para os que fecharam
--   * totalValue + dealCount = soma e count de deals atualmente nessa etapa
CREATE OR REPLACE FUNCTION public.get_stage_metrics(p_funnel_id text, p_stage_id text)
RETURNS TABLE (
  total_value numeric,
  deal_count int,
  close_probability int,
  advance_probability int,
  avg_days_to_advance numeric,
  avg_days_to_close numeric
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_passed_count int;
  v_won_count int;
  v_advanced_count int;
  v_avg_advance numeric;
  v_avg_close numeric;
BEGIN
  -- Valor e contagem ATUAIS na etapa
  SELECT COALESCE(SUM(value), 0), COUNT(*)::int
    INTO total_value, deal_count
  FROM public.deals
  WHERE funnel_id = p_funnel_id AND stage_id = p_stage_id;

  -- Total de deals que JÁ passaram por essa etapa
  SELECT COUNT(DISTINCT deal_id)::int INTO v_passed_count
  FROM public.deal_stage_events
  WHERE funnel_id = p_funnel_id AND to_stage_id = p_stage_id;

  -- Quantos desses estão como ganhos
  SELECT COUNT(*)::int INTO v_won_count
  FROM public.deals d
  WHERE d.funnel_id = p_funnel_id
    AND d.status = 'won'
    AND EXISTS (
      SELECT 1 FROM public.deal_stage_events e
      WHERE e.deal_id = d.id AND e.to_stage_id = p_stage_id
    );

  -- Quantos avançaram (têm um evento POSTERIOR ao de entrada nessa etapa)
  WITH entries AS (
    SELECT deal_id, MIN(entered_at) AS entered_at
    FROM public.deal_stage_events
    WHERE funnel_id = p_funnel_id AND to_stage_id = p_stage_id
    GROUP BY deal_id
  ),
  next_event AS (
    SELECT e.deal_id, e.entered_at AS entered_at,
           (SELECT MIN(n.entered_at) FROM public.deal_stage_events n
              WHERE n.deal_id = e.deal_id AND n.entered_at > e.entered_at) AS next_at
    FROM entries e
  )
  SELECT COUNT(*) FILTER (WHERE next_at IS NOT NULL)::int,
         AVG(EXTRACT(EPOCH FROM (next_at - entered_at)) / 86400.0) FILTER (WHERE next_at IS NOT NULL)
    INTO v_advanced_count, v_avg_advance
  FROM next_event;

  -- Tempo médio para fechamento (entre entrar nessa etapa e o deal virar won)
  WITH entries AS (
    SELECT deal_id, MIN(entered_at) AS entered_at
    FROM public.deal_stage_events
    WHERE funnel_id = p_funnel_id AND to_stage_id = p_stage_id
    GROUP BY deal_id
  )
  SELECT AVG(EXTRACT(EPOCH FROM (d.updated_at - e.entered_at)) / 86400.0)
    INTO v_avg_close
  FROM entries e
  JOIN public.deals d ON d.id = e.deal_id
  WHERE d.status = 'won';

  close_probability := CASE WHEN v_passed_count > 0 THEN ROUND((v_won_count::numeric / v_passed_count) * 100)::int ELSE 0 END;
  advance_probability := CASE WHEN v_passed_count > 0 THEN ROUND((v_advanced_count::numeric / v_passed_count) * 100)::int ELSE 0 END;
  avg_days_to_advance := COALESCE(ROUND(v_avg_advance, 1), 0);
  avg_days_to_close := COALESCE(ROUND(v_avg_close, 1), 0);

  RETURN NEXT;
END;
$$;
