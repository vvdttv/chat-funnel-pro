-- OmniMob Fase 3D - Integracoes 2026-06-19

CREATE TABLE IF NOT EXISTS webhook_rate_limits (
  id BIGSERIAL PRIMARY KEY,
  ip_address TEXT NOT NULL,
  endpoint TEXT NOT NULL DEFAULT 'whatsapp-webhook',
  req_count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS webhook_rate_limits_uniq ON webhook_rate_limits (ip_address, endpoint, window_start);
CREATE INDEX IF NOT EXISTS webhook_rate_limits_cleanup_idx ON webhook_rate_limits (created_at);

CREATE TABLE IF NOT EXISTS webhook_idempotency (
  idempotency_key TEXT PRIMARY KEY,
  payload_hash TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);
CREATE INDEX IF NOT EXISTS webhook_idempotency_expires_idx ON webhook_idempotency (expires_at);

CREATE OR REPLACE FUNCTION cleanup_expired_idempotency_keys()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN DELETE FROM webhook_idempotency WHERE expires_at < NOW(); END; $$;

CREATE TABLE IF NOT EXISTS deal_tags (
  id BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6b7280',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name)
);
CREATE TABLE IF NOT EXISTS deal_tag_assignments (
  id BIGSERIAL PRIMARY KEY,
  deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  tag_id BIGINT NOT NULL REFERENCES deal_tags(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (deal_id, tag_id)
);
CREATE INDEX IF NOT EXISTS deal_tag_assignments_deal_idx ON deal_tag_assignments(deal_id);
CREATE INDEX IF NOT EXISTS deal_tags_org_idx ON deal_tags(organization_id);
ALTER TABLE deal_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_tag_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY deal_tags_org_access ON deal_tags FOR ALL USING (organization_id IN (SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()));
CREATE POLICY deal_tag_assignments_access ON deal_tag_assignments FOR ALL USING (deal_id IN (SELECT id FROM deals WHERE organization_id IN (SELECT organization_id FROM user_organizations WHERE user_id = auth.uid())));

CREATE TABLE IF NOT EXISTS email_logs (
  id BIGSERIAL PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  deal_id TEXT REFERENCES deals(id) ON DELETE SET NULL,
  template TEXT NOT NULL,
  to_email TEXT NOT NULL,
  to_name TEXT,
  subject TEXT NOT NULL,
  body_html TEXT,
  body_text TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  provider TEXT NOT NULL DEFAULT 'resend',
  external_id TEXT,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS email_logs_org_idx ON email_logs(organization_id);
CREATE INDEX IF NOT EXISTS email_logs_deal_idx ON email_logs(deal_id);
CREATE INDEX IF NOT EXISTS email_logs_status_idx ON email_logs(status);
CREATE INDEX IF NOT EXISTS email_logs_created_idx ON email_logs(created_at DESC);
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY email_logs_org_read ON email_logs FOR SELECT USING (organization_id IN (SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()));
CREATE POLICY email_logs_service_write ON email_logs FOR INSERT WITH CHECK (true);
CREATE POLICY email_logs_service_update ON email_logs FOR UPDATE USING (true);

CREATE TABLE IF NOT EXISTS stripe_events (
  id BIGSERIAL PRIMARY KEY,
  event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  api_version TEXT,
  created BIGINT,
  raw_payload JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS stripe_events_type_idx ON stripe_events(event_type);
CREATE INDEX IF NOT EXISTS stripe_events_created_idx ON stripe_events(created_at DESC);

CREATE OR REPLACE FUNCTION get_deal_tags_json(p_deal_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE result JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color)), '[]'::jsonb) INTO result
  FROM deal_tag_assignments a JOIN deal_tags t ON t.id = a.tag_id WHERE a.deal_id = p_deal_id;
  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION upsert_webhook_idempotency(p_key TEXT, p_hash TEXT, p_status INTEGER, p_body JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE existing JSONB;
BEGIN
  INSERT INTO webhook_idempotency (idempotency_key, payload_hash, response_status, response_body)
  VALUES (p_key, p_hash, p_status, p_body) ON CONFLICT (idempotency_key) DO NOTHING;
  SELECT to_jsonb(wh) INTO existing FROM webhook_idempotency wh WHERE wh.idempotency_key = p_key;
  RETURN existing;
END; $$;

CREATE OR REPLACE FUNCTION check_rate_limit(p_ip TEXT, p_endpoint TEXT DEFAULT 'whatsapp-webhook', p_max_req INTEGER DEFAULT 100, p_window_sec INTEGER DEFAULT 60)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE window_start TIMESTAMPTZ; current_count INTEGER;
BEGIN
  window_start := date_trunc('minute', NOW());
  DELETE FROM webhook_rate_limits WHERE ip_address = p_ip AND endpoint = p_endpoint AND created_at < (NOW() - (p_window_sec || ' seconds')::interval);
  SELECT req_count INTO current_count FROM webhook_rate_limits WHERE ip_address = p_ip AND endpoint = p_endpoint AND window_start = window_start;
  IF current_count IS NULL THEN
    INSERT INTO webhook_rate_limits (ip_address, endpoint, req_count, window_start) VALUES (p_ip, p_endpoint, 1, window_start);
    RETURN true;
  END IF;
  IF current_count >= p_max_req THEN RETURN false; END IF;
  UPDATE webhook_rate_limits SET req_count = req_count + 1, created_at = NOW() WHERE ip_address = p_ip AND endpoint = p_endpoint AND window_start = window_start;
  RETURN true;
END; $$;

INSERT INTO deal_tags (organization_id, name, color) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Quente', '#ef4444'),
  ('11111111-1111-1111-1111-111111111111', 'Morno', '#f59e0b'),
  ('11111111-1111-1111-1111-111111111111', 'Frio', '#3b82f6'),
  ('11111111-1111-1111-1111-111111111111', 'Prioridade', '#8b5cf6'),
  ('11111111-1111-1111-1111-111111111111', 'Recusa', '#6b7280')
ON CONFLICT (organization_id, name) DO NOTHING;
