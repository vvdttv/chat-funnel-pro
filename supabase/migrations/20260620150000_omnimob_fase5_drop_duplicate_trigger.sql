-- OmniMob — Fase 5: remove trigger duplicado em deals
--
-- `trg_deals_stage_events` e `trg_record_deal_stage_event` são idênticos
-- (AFTER INSERT OR UPDATE FOR EACH ROW EXECUTE record_deal_stage_event()).
-- Cada transição gravava 2 linhas em deal_stage_events. Relatórios e o
-- get_dashboard_metrics deduplicam com COUNT(DISTINCT deal_id), então remover
-- o duplicado não altera nenhuma leitura — apenas para de gravar lixo.
--
-- Mantém trg_deals_stage_events (nome mais descritivo).
DROP TRIGGER IF EXISTS trg_record_deal_stage_event ON public.deals;
