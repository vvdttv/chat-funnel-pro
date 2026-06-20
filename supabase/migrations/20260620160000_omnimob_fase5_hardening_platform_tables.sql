-- OmniMob — Fase 5: Hardening de tabelas de plataforma expostas sem RLS
--
-- Advisor de segurança apontou 7 tabelas em `public` sem RLS, com grants de
-- SELECT a anon/authenticated via PostgREST. NENHUMA é referenciada pelo código
-- OmniMob (frontend/edge). Risco crítico: `system_config` guarda stripe_secret_key
-- e a chave privada ed25519 de licença; `source_config` guarda payloads cifrados.
--
-- Estratégia:
--  * Secret/config (system_config, source_config, processed_stripe_events):
--    RLS habilitado SEM policy → nega anon/authenticated; service_role bypassa.
--    + REVOKE de grants amplos (defesa em profundidade).
--  * User-owned (subscriptions, licenses, legal_acceptances,
--    reseller_stripe_accounts): RLS + policy de leitura do próprio dono
--    (user_id = auth.uid()). Escrita só via service_role (sem policy de write).
--
-- Reversível: DISABLE ROW LEVEL SECURITY / DROP POLICY / re-GRANT.

-- ---- Secret / config: deny-all p/ clientes -------------------------------
ALTER TABLE public.system_config           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_config           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processed_stripe_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.system_config           FROM anon, authenticated;
REVOKE ALL ON public.source_config           FROM anon, authenticated;
REVOKE ALL ON public.processed_stripe_events FROM anon, authenticated;

-- ---- User-owned: leitura do próprio dono ---------------------------------
ALTER TABLE public.subscriptions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licenses                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_acceptances         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reseller_stripe_accounts  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscriptions_owner_read ON public.subscriptions;
CREATE POLICY subscriptions_owner_read ON public.subscriptions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS licenses_owner_read ON public.licenses;
CREATE POLICY licenses_owner_read ON public.licenses
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS legal_acceptances_owner_read ON public.legal_acceptances;
CREATE POLICY legal_acceptances_owner_read ON public.legal_acceptances
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS reseller_stripe_accounts_owner_read ON public.reseller_stripe_accounts;
CREATE POLICY reseller_stripe_accounts_owner_read ON public.reseller_stripe_accounts
  FOR SELECT TO authenticated USING (user_id = auth.uid());
