-- ============================================================================
-- Omnimob Fase 0 — Gateway IA plug-and-play + Persistência de Conversas
-- ============================================================================
-- Cria:
--   1. ai_gateway_config  — config do provedor de IA editável pelo painel
--                           (plug-and-play: kiro-gateway agora, qualquer provider depois)
--   2. conversations      — uma conversa por canal/contato (chaveada por deal/telefone)
--   3. messages           — toda mensagem enviada/recebida (persistência total)
--
-- Padrões seguidos (verificados no banco de produção):
--   - RLS habilitado em tudo
--   - helper current_org_id() lê claim 'org_id' do JWT
--   - deal_id é TEXT (deals.id é text), não uuid
--   - acesso de escrita pelas edge functions é via service_role (bypassa RLS)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ai_gateway_config
-- ----------------------------------------------------------------------------
-- Uma linha ativa por organização define qual gateway/provider a IA usa.
-- api_format: 'openai' (/chat/completions) ou 'anthropic' (/v1/messages).
-- O kiro-gateway suporta os dois; default 'openai' (compatível com a abstração atual).
CREATE TABLE IF NOT EXISTS public.ai_gateway_config (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label           text NOT NULL DEFAULT 'kiro-gateway',
  provider        text NOT NULL DEFAULT 'kiro-gateway',
  api_format      text NOT NULL DEFAULT 'openai'
                    CHECK (api_format IN ('openai', 'anthropic')),
  base_url        text NOT NULL,
  -- chave do provedor; criptografia/cofre fica a cargo da app, aqui guarda referência/segredo
  api_key         text,
  model_fast      text NOT NULL DEFAULT 'claude-haiku-4.5',
  model_smart     text NOT NULL DEFAULT 'claude-opus-4.5',
  is_active       boolean NOT NULL DEFAULT true,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- no máximo uma config ativa por organização
CREATE UNIQUE INDEX IF NOT EXISTS ai_gateway_config_one_active_per_org
  ON public.ai_gateway_config (organization_id)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS ai_gateway_config_org_idx
  ON public.ai_gateway_config (organization_id);

ALTER TABLE public.ai_gateway_config ENABLE ROW LEVEL SECURITY;

-- leitura para membros autenticados da org; escrita via service_role (edge/admin)
DROP POLICY IF EXISTS "membros da org leem gateway config" ON public.ai_gateway_config;
CREATE POLICY "membros da org leem gateway config"
  ON public.ai_gateway_config FOR SELECT
  USING (organization_id = public.current_org_id());

-- ----------------------------------------------------------------------------
-- 2. conversations
-- ----------------------------------------------------------------------------
-- Uma conversa por (organização, canal, contato). Liga opcionalmente a um deal
-- e a um lead_channel. Mantém histórico mesmo se o número for perdido.
CREATE TABLE IF NOT EXISTS public.conversations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  deal_id            text REFERENCES public.deals(id) ON DELETE SET NULL,
  lead_channel_id    uuid REFERENCES public.lead_channels(id) ON DELETE SET NULL,
  channel            text NOT NULL DEFAULT 'whatsapp',
  provider           text,                    -- waha | cloud_api | etc.
  contact_phone_e164 text,
  contact_name       text,
  -- persona que está atendendo (P1/P2); preenchido quando o módulo de personas existir
  persona_id         uuid,
  -- número de WhatsApp usado (origem/destino); idem
  whatsapp_number_id uuid,
  status             text NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'archived', 'closed')),
  -- controle da janela de 24h da Meta para roteamento oficial x não-oficial
  last_inbound_at    timestamptz,
  last_outbound_at   timestamptz,
  last_message_at    timestamptz,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversations_org_idx
  ON public.conversations (organization_id);
CREATE INDEX IF NOT EXISTS conversations_deal_idx
  ON public.conversations (deal_id);
CREATE INDEX IF NOT EXISTS conversations_phone_idx
  ON public.conversations (organization_id, contact_phone_e164);
CREATE INDEX IF NOT EXISTS conversations_last_message_idx
  ON public.conversations (organization_id, last_message_at DESC);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "membros da org leem conversas" ON public.conversations;
CREATE POLICY "membros da org leem conversas"
  ON public.conversations FOR SELECT
  USING (organization_id = public.current_org_id());

-- ----------------------------------------------------------------------------
-- 3. messages
-- ----------------------------------------------------------------------------
-- Toda mensagem trocada. direction: inbound (do lead) | outbound (nossa).
-- sender_type distingue lead/IA/corretor/sistema. Persiste status de entrega.
CREATE TABLE IF NOT EXISTS public.messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id  uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  direction        text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  sender_type      text NOT NULL DEFAULT 'lead'
                     CHECK (sender_type IN ('lead', 'ai', 'broker', 'system', 'correspondent')),
  -- identifica o agente/usuário que enviou (quando aplicável)
  sender_id        uuid,
  content_type     text NOT NULL DEFAULT 'text'
                     CHECK (content_type IN ('text', 'image', 'audio', 'document', 'video', 'location', 'template')),
  content          text,                     -- texto ou legenda
  media_url        text,                     -- URL no storage, se mídia
  -- id da mensagem no provedor (WAHA/Meta) p/ dedup e correlação de status
  external_id      text,
  -- canal pelo qual saiu/entrou: 'waha' (não-oficial) | 'cloud_api' (oficial)
  channel_route    text,
  status           text NOT NULL DEFAULT 'received'
                     CHECK (status IN ('received', 'queued', 'sent', 'delivered', 'read', 'failed')),
  error_message    text,
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_conversation_idx
  ON public.messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS messages_org_idx
  ON public.messages (organization_id);
-- dedup de inbound por provedor
CREATE UNIQUE INDEX IF NOT EXISTS messages_external_id_uniq
  ON public.messages (organization_id, external_id)
  WHERE external_id IS NOT NULL;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "membros da org leem mensagens" ON public.messages;
CREATE POLICY "membros da org leem mensagens"
  ON public.messages FOR SELECT
  USING (organization_id = public.current_org_id());

-- ----------------------------------------------------------------------------
-- 4. updated_at automático (reusa public.update_updated_at_column() já existente)
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS set_updated_at ON public.ai_gateway_config;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.ai_gateway_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON public.conversations;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON public.messages;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 5. manter last_message_at da conversa em dia ao inserir mensagem
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_touch_conversation_on_message()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.conversations c
     SET last_message_at = NEW.created_at,
         last_inbound_at  = CASE WHEN NEW.direction = 'inbound'  THEN NEW.created_at ELSE c.last_inbound_at  END,
         last_outbound_at = CASE WHEN NEW.direction = 'outbound' THEN NEW.created_at ELSE c.last_outbound_at END,
         updated_at = now()
   WHERE c.id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_conversation ON public.messages;
CREATE TRIGGER touch_conversation AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_conversation_on_message();

-- ----------------------------------------------------------------------------
-- 6. seed da config do gateway (kiro-gateway) para a organização existente
-- ----------------------------------------------------------------------------
-- Insere uma config ativa por org que ainda não tenha. Idempotente.
-- IMPORTANTE: api_key fica NULL aqui de propósito (nunca versionar segredo no SQL).
-- O valor real é setado via UPDATE direto no banco, fora do git/histórico de migrations.
INSERT INTO public.ai_gateway_config
  (organization_id, label, provider, api_format, base_url, api_key, model_fast, model_smart, is_active)
SELECT o.id,
       'kiro-gateway',
       'kiro-gateway',
       'openai',
       'https://claudecode-vvdttv.duckdns.org/v1',
       NULL,
       'claude-haiku-4.5',
       'claude-opus-4.5',
       true
  FROM public.organizations o
 WHERE NOT EXISTS (
   SELECT 1 FROM public.ai_gateway_config g
    WHERE g.organization_id = o.id AND g.is_active
 );
