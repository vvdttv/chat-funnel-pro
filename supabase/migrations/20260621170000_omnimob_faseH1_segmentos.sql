-- ============================================================================
-- Fase H-1 — Multi-faixa: perfis de segmento (modelo de dados) (§4.14)
-- Omnimob v3. Idempotente. Não destrutivo.
--
-- Faixa = CAMADA de comportamento aplicada à persona (NÃO persona nova). O funil
-- declara seu segmento; o compose-playbook injeta o perfil no prompt (Fase H-2,
-- com a I-A). Esta migration só cria o modelo + seed dos 4 perfis + vincula MCMV.
-- ============================================================================

-- ---- 1. Perfis de segmento --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.segment_profiles (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code            text NOT NULL,            -- mcmv | medio | alto | luxo
  name            text NOT NULL,
  income_range    text NOT NULL DEFAULT '', -- faixa de renda/preço (texto livre)
  tone            text NOT NULL DEFAULT '', -- tom de voz da IA p/ esta faixa
  vocabulary      text NOT NULL DEFAULT '', -- vocabulário/estilo
  notes           text NOT NULL DEFAULT '', -- orientações de comportamento
  context_tag     text NOT NULL,            -- tag injetada no contexto (compose-playbook)
  is_active       boolean NOT NULL DEFAULT true,
  position        int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT segment_profiles_org_code_key UNIQUE (organization_id, code)
);
ALTER TABLE public.segment_profiles ENABLE ROW LEVEL SECURITY;
DO $p$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='segment_profiles' AND policyname='omni_segment_profiles_select') THEN
    CREATE POLICY omni_segment_profiles_select ON public.segment_profiles FOR SELECT TO authenticated
      USING (organization_id = current_org_id());
    CREATE POLICY omni_segment_profiles_write ON public.segment_profiles TO authenticated
      USING (organization_id = current_org_id() AND (is_org_admin() OR is_superadmin(uid())))
      WITH CHECK (organization_id = current_org_id() AND (is_org_admin() OR is_superadmin(uid())));
  END IF;
END $p$;

-- ---- 2. Funil declara seu segmento ------------------------------------------
ALTER TABLE public.funnels
  ADD COLUMN IF NOT EXISTS segment_code text;

-- ---- 3. Seed dos 4 perfis (org MCMV) ----------------------------------------
INSERT INTO public.segment_profiles (organization_id, code, name, income_range, tone, vocabulary, notes, context_tag, position) VALUES
  ('11111111-1111-1111-1111-111111111111','mcmv','Minha Casa Minha Vida','Renda até ~R$ 8.000 / imóvel até teto MCMV',
   'Acolhedor, simples e encorajador. Reduz ansiedade sobre crédito e burocracia.',
   'Linguagem do dia a dia, sem termos técnicos. Explica subsídio e parcela de forma concreta.',
   'Foco em viabilizar o sonho da casa própria; sensível a entrada/subsídio; reforça segurança no processo.',
   'seg-mcmv',1),
  ('11111111-1111-1111-1111-111111111111','medio','Médio padrão','Renda ~R$ 8.000–20.000',
   'Profissional e consultivo. Equilíbrio entre acolhimento e objetividade.',
   'Linguagem clara com alguns termos de mercado (financiamento, avaliação, ITBI).',
   'Cliente comparando opções; valoriza custo-benefício, localização e potencial de valorização.',
   'seg-medio',2),
  ('11111111-1111-1111-1111-111111111111','alto','Alto padrão','Renda ~R$ 20.000–60.000',
   'Sofisticado, discreto e preciso. Respeita o tempo do cliente.',
   'Vocabulário refinado; destaca diferenciais, acabamento, exclusividade e conveniência.',
   'Cliente exigente; menos sensível a preço, mais a experiência, status e atendimento personalizado.',
   'seg-alto',3),
  ('11111111-1111-1111-1111-111111111111','luxo','Luxo','Imóveis de altíssimo padrão / sob consulta',
   'Exclusivo, concierge, máxima discrição e personalização.',
   'Linguagem premium; foco em raridade, privacidade, curadoria e atendimento white-glove.',
   'Relacionamento de alto valor; cada interação é personalizada; evitar abordagem massificada.',
   'seg-luxo',4)
ON CONFLICT (organization_id, code) DO UPDATE
  SET name=EXCLUDED.name, income_range=EXCLUDED.income_range, tone=EXCLUDED.tone,
      vocabulary=EXCLUDED.vocabulary, notes=EXCLUDED.notes, context_tag=EXCLUDED.context_tag, updated_at=now();

-- ---- 4. Vincula o funil IA atual ao segmento MCMV + tag no contexto ---------
DO $do$
DECLARE v_org uuid := '11111111-1111-1111-1111-111111111111';
BEGIN
  UPDATE public.funnels SET segment_code = 'mcmv', updated_at = now()
   WHERE id = 'fun-ia-mcmv' AND organization_id = v_org;

  -- Adiciona a context_tag 'seg-mcmv' ao funil (sem duplicar) — o compose-playbook
  -- já agrega funnel.context_tags no contexto, então a faixa entra no prompt na H-2.
  UPDATE public.funnels
     SET context_tags = (
       SELECT jsonb_agg(DISTINCT e)
       FROM jsonb_array_elements(context_tags || '["seg-mcmv"]'::jsonb) e
     ), updated_at = now()
   WHERE id = 'fun-ia-mcmv' AND organization_id = v_org;

  RAISE NOTICE 'Segmentos seedados (4) + funil MCMV vinculado (seg-mcmv)';
END $do$;
