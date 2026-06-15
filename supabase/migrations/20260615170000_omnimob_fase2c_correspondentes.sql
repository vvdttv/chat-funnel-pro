-- ============================================================
-- OMNIMOB — Fase 2C (parte 2/2): Correspondentes + roleta dupla
--   + captura de docs + devolutiva + cronometragem
-- ============================================================
-- PRÉ-REQUISITO: aplicar e committar 20260615160000_omnimob_fase2c_roles.sql
-- ANTES desta (os rótulos 'correspondente'/'atendente' precisam existir e
-- estar visíveis numa transação anterior para serem usados aqui).
--
-- Cria:
--   - 6 tabelas: correspondent_banks, correspondent_attendants,
--     credit_analyses, credit_analysis_documents, credit_analysis_comments,
--     lead_documents
--   - 1 tabela de infra: internal_notifications (fila de avisos à equipe)
--   - helper current_attendant_ids() (SECURITY DEFINER)
--   - RLS org-scoped + role-scoped (atendente vê só o que é dele)
--   - RPC assign_credit_analysis_internal (roleta dupla determinística, M2M)
--   - RPC start_credit_analysis / submit_credit_devolutiva (atendente/admin)
--   - trigger de atribuição ao entrar na etapa 'ia-analise'
--   - cron credit-analysis-sla + dispatch-internal-notifications
--
-- Org de produção MCMV: 11111111-1111-1111-1111-111111111111
-- Funil da IA: fun-ia-mcmv | etapa 4 = 'ia-analise' | etapa 5 = 'ia-devolutiva'
-- etapa 6 = 'ia-aprovado-aguardando' | etapa 10 = 'ia-reprovado'
-- Aplicar via psql no container supabase-db. Idempotente.
-- ============================================================

-- ============================================================
-- 1) TABELAS
-- ============================================================

-- 1.1 Correspondentes bancários ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.correspondent_banks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  distribution_pct integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT correspondent_banks_pct_chk CHECK (distribution_pct BETWEEN 0 AND 100)
);
CREATE INDEX IF NOT EXISTS idx_corr_banks_org
  ON public.correspondent_banks (organization_id);

-- 1.2 Atendentes (pertencem a 1 banco) -----------------------------------------
CREATE TABLE IF NOT EXISTS public.correspondent_attendants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  bank_id uuid NOT NULL REFERENCES public.correspondent_banks(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text,
  phone_e164 text,
  distribution_pct integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT corr_attendants_pct_chk CHECK (distribution_pct BETWEEN 0 AND 100)
);
CREATE INDEX IF NOT EXISTS idx_corr_attendants_org
  ON public.correspondent_attendants (organization_id);
CREATE INDEX IF NOT EXISTS idx_corr_attendants_bank
  ON public.correspondent_attendants (bank_id);
-- Um login de atendente mapeia a no máximo um cadastro por org.
CREATE UNIQUE INDEX IF NOT EXISTS corr_attendants_user_uniq
  ON public.correspondent_attendants (organization_id, user_id)
  WHERE user_id IS NOT NULL;

-- 1.3 Documentos recebidos do lead (fonte de verdade, independe de análise) -----
CREATE TABLE IF NOT EXISTS public.lead_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  deal_id text NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  file_url text NOT NULL,
  file_name text NOT NULL DEFAULT '',
  mime_type text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'lead_whatsapp',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_documents_source_chk CHECK (source IN ('lead_whatsapp','manual_upload'))
);
CREATE INDEX IF NOT EXISTS idx_lead_documents_deal
  ON public.lead_documents (deal_id);
-- Dedup por mensagem do provedor (a mídia de uma mesma message não duplica).
CREATE UNIQUE INDEX IF NOT EXISTS lead_documents_message_uniq
  ON public.lead_documents (message_id)
  WHERE message_id IS NOT NULL;

-- 1.4 Análise de crédito (o "card" no painel do correspondente) ------------------
CREATE TABLE IF NOT EXISTS public.credit_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  deal_id text NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  bank_id uuid REFERENCES public.correspondent_banks(id) ON DELETE SET NULL,
  attendant_id uuid REFERENCES public.correspondent_attendants(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'received',
  result text,
  result_conditions text,
  result_reason text,
  retomada_prazo_dias integer,
  received_at timestamptz NOT NULL DEFAULT now(),
  analysis_started_at timestamptz,
  returned_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credit_analyses_status_chk CHECK (status IN ('received','in_analysis','returned','cancelled')),
  CONSTRAINT credit_analyses_result_chk CHECK (result IS NULL OR result IN ('approved','approved_conditioned','rejected')),
  CONSTRAINT credit_analyses_retomada_chk CHECK (retomada_prazo_dias IS NULL OR retomada_prazo_dias > 0)
);
CREATE INDEX IF NOT EXISTS idx_credit_analyses_org_status
  ON public.credit_analyses (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_credit_analyses_attendant
  ON public.credit_analyses (attendant_id, status);
CREATE INDEX IF NOT EXISTS idx_credit_analyses_deal
  ON public.credit_analyses (deal_id);
-- No máximo uma análise ABERTA (received/in_analysis) por deal — idempotência da roleta.
CREATE UNIQUE INDEX IF NOT EXISTS credit_analyses_one_open_per_deal
  ON public.credit_analyses (deal_id)
  WHERE status IN ('received','in_analysis');

-- 1.5 Documentos vinculados à análise (o que o correspondente vê) ----------------
CREATE TABLE IF NOT EXISTS public.credit_analysis_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  analysis_id uuid NOT NULL REFERENCES public.credit_analyses(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_name text NOT NULL DEFAULT '',
  mime_type text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'lead_whatsapp',
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cad_source_chk CHECK (source IN ('lead_whatsapp','manual_upload'))
);
CREATE INDEX IF NOT EXISTS idx_cad_analysis
  ON public.credit_analysis_documents (analysis_id);

-- 1.6 Comentários do atendente por documento (ou gerais) -------------------------
CREATE TABLE IF NOT EXISTS public.credit_analysis_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  analysis_id uuid NOT NULL REFERENCES public.credit_analyses(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.credit_analysis_documents(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cac_analysis
  ON public.credit_analysis_comments (analysis_id);

-- 1.7 Fila de notificações internas (avisos à equipe — drenada por cron) ---------
-- Evita embutir o INTERNAL_FUNCTION_TOKEN dentro do trigger: o trigger só
-- enfileira; um cron chama a edge que drena e envia (WhatsApp na 2C; e-mail depois).
CREATE TABLE IF NOT EXISTS public.internal_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL,
  deal_id text,
  analysis_id uuid,
  attendant_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT internal_notif_status_chk CHECK (status IN ('pending','processing','sent','failed','skipped'))
);
CREATE INDEX IF NOT EXISTS idx_internal_notif_pending
  ON public.internal_notifications (status, created_at)
  WHERE status = 'pending';

-- updated_at triggers
DROP TRIGGER IF EXISTS trg_corr_banks_updated ON public.correspondent_banks;
CREATE TRIGGER trg_corr_banks_updated BEFORE UPDATE ON public.correspondent_banks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_corr_attendants_updated ON public.correspondent_attendants;
CREATE TRIGGER trg_corr_attendants_updated BEFORE UPDATE ON public.correspondent_attendants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_credit_analyses_updated ON public.credit_analyses;
CREATE TRIGGER trg_credit_analyses_updated BEFORE UPDATE ON public.credit_analyses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_internal_notif_updated ON public.internal_notifications;
CREATE TRIGGER trg_internal_notif_updated BEFORE UPDATE ON public.internal_notifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 2) HELPER — ids de atendente do usuário logado
-- ============================================================
-- Retorna os correspondent_attendants.id vinculados ao auth.uid() atual.
-- SECURITY DEFINER para que a policy possa usá-lo sem expor a tabela ao anon.
CREATE OR REPLACE FUNCTION public.current_attendant_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT a.id
    FROM public.correspondent_attendants a
   WHERE a.user_id = auth.uid()
     AND a.organization_id = public.current_org_id()
$$;
REVOKE ALL ON FUNCTION public.current_attendant_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_attendant_ids() TO authenticated;

-- ============================================================
-- 3) RLS
-- ============================================================
ALTER TABLE public.correspondent_banks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.correspondent_attendants    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_documents              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_analyses             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_analysis_documents   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_analysis_comments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_notifications      ENABLE ROW LEVEL SECURITY;

-- 3.1 correspondent_banks: membros leem; admin escreve -------------------------
DROP POLICY IF EXISTS "Membros veem bancos"   ON public.correspondent_banks;
DROP POLICY IF EXISTS "Admins criam bancos"   ON public.correspondent_banks;
DROP POLICY IF EXISTS "Admins atualizam bancos" ON public.correspondent_banks;
DROP POLICY IF EXISTS "Admins excluem bancos" ON public.correspondent_banks;
CREATE POLICY "Membros veem bancos"
  ON public.correspondent_banks FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());
CREATE POLICY "Admins criam bancos"
  ON public.correspondent_banks FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND (public.is_org_admin() OR public.is_superadmin(auth.uid())));
CREATE POLICY "Admins atualizam bancos"
  ON public.correspondent_banks FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND (public.is_org_admin() OR public.is_superadmin(auth.uid())))
  WITH CHECK (organization_id = public.current_org_id() AND (public.is_org_admin() OR public.is_superadmin(auth.uid())));
CREATE POLICY "Admins excluem bancos"
  ON public.correspondent_banks FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND (public.is_org_admin() OR public.is_superadmin(auth.uid())));

-- 3.2 correspondent_attendants: membros leem; admin escreve --------------------
DROP POLICY IF EXISTS "Membros veem atendentes"   ON public.correspondent_attendants;
DROP POLICY IF EXISTS "Admins criam atendentes"   ON public.correspondent_attendants;
DROP POLICY IF EXISTS "Admins atualizam atendentes" ON public.correspondent_attendants;
DROP POLICY IF EXISTS "Admins excluem atendentes" ON public.correspondent_attendants;
CREATE POLICY "Membros veem atendentes"
  ON public.correspondent_attendants FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());
CREATE POLICY "Admins criam atendentes"
  ON public.correspondent_attendants FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND (public.is_org_admin() OR public.is_superadmin(auth.uid())));
CREATE POLICY "Admins atualizam atendentes"
  ON public.correspondent_attendants FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND (public.is_org_admin() OR public.is_superadmin(auth.uid())))
  WITH CHECK (organization_id = public.current_org_id() AND (public.is_org_admin() OR public.is_superadmin(auth.uid())));
CREATE POLICY "Admins excluem atendentes"
  ON public.correspondent_attendants FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND (public.is_org_admin() OR public.is_superadmin(auth.uid())));

-- 3.3 lead_documents: membros da org leem; escrita só service_role (webhook) ----
DROP POLICY IF EXISTS "Membros veem documentos do lead" ON public.lead_documents;
CREATE POLICY "Membros veem documentos do lead"
  ON public.lead_documents FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());
-- INSERT/UPDATE/DELETE: sem policy para authenticated → só service_role (bypassa RLS).

-- 3.4 credit_analyses: admin vê tudo; atendente vê só as suas ------------------
DROP POLICY IF EXISTS "Veem analises atribuidas"  ON public.credit_analyses;
DROP POLICY IF EXISTS "Atualizam analises proprias" ON public.credit_analyses;
CREATE POLICY "Veem analises atribuidas"
  ON public.credit_analyses FOR SELECT TO authenticated
  USING (
    organization_id = public.current_org_id()
    AND (
      (public.is_org_admin() OR public.is_superadmin(auth.uid()))
      OR attendant_id IN (SELECT public.current_attendant_ids())
    )
  );
-- UPDATE direto fica restrito ao dono/admin; ações de negócio (iniciar análise,
-- devolutiva) vão por RPC SECURITY DEFINER que validam status. Esta policy cobre
-- ajustes livres permitidos ao dono (ex.: metadata).
CREATE POLICY "Atualizam analises proprias"
  ON public.credit_analyses FOR UPDATE TO authenticated
  USING (
    organization_id = public.current_org_id()
    AND (
      (public.is_org_admin() OR public.is_superadmin(auth.uid()))
      OR attendant_id IN (SELECT public.current_attendant_ids())
    )
  )
  WITH CHECK (
    organization_id = public.current_org_id()
    AND (
      (public.is_org_admin() OR public.is_superadmin(auth.uid()))
      OR attendant_id IN (SELECT public.current_attendant_ids())
    )
  );
-- INSERT/DELETE: sem policy authenticated → só service_role (roleta/admin via RPC).

-- 3.5 credit_analysis_documents: vê/insere se dono da análise ou admin ---------
DROP POLICY IF EXISTS "Veem docs da analise"   ON public.credit_analysis_documents;
DROP POLICY IF EXISTS "Inserem docs na analise" ON public.credit_analysis_documents;
CREATE POLICY "Veem docs da analise"
  ON public.credit_analysis_documents FOR SELECT TO authenticated
  USING (
    organization_id = public.current_org_id()
    AND (
      (public.is_org_admin() OR public.is_superadmin(auth.uid()))
      OR analysis_id IN (
        SELECT ca.id FROM public.credit_analyses ca
        WHERE ca.attendant_id IN (SELECT public.current_attendant_ids())
          AND ca.organization_id = public.current_org_id()
      )
    )
  );
CREATE POLICY "Inserem docs na analise"
  ON public.credit_analysis_documents FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_org_id()
    AND (
      (public.is_org_admin() OR public.is_superadmin(auth.uid()))
      OR analysis_id IN (
        SELECT ca.id FROM public.credit_analyses ca
        WHERE ca.attendant_id IN (SELECT public.current_attendant_ids())
          AND ca.organization_id = public.current_org_id()
      )
    )
  );

-- 3.6 credit_analysis_comments: vê/insere se dono da análise ou admin ----------
DROP POLICY IF EXISTS "Veem comentarios da analise"   ON public.credit_analysis_comments;
DROP POLICY IF EXISTS "Inserem comentarios na analise" ON public.credit_analysis_comments;
CREATE POLICY "Veem comentarios da analise"
  ON public.credit_analysis_comments FOR SELECT TO authenticated
  USING (
    organization_id = public.current_org_id()
    AND (
      (public.is_org_admin() OR public.is_superadmin(auth.uid()))
      OR analysis_id IN (
        SELECT ca.id FROM public.credit_analyses ca
        WHERE ca.attendant_id IN (SELECT public.current_attendant_ids())
          AND ca.organization_id = public.current_org_id()
      )
    )
  );
CREATE POLICY "Inserem comentarios na analise"
  ON public.credit_analysis_comments FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_org_id()
    AND author_id = auth.uid()
    AND (
      (public.is_org_admin() OR public.is_superadmin(auth.uid()))
      OR analysis_id IN (
        SELECT ca.id FROM public.credit_analyses ca
        WHERE ca.attendant_id IN (SELECT public.current_attendant_ids())
          AND ca.organization_id = public.current_org_id()
      )
    )
  );

-- 3.7 internal_notifications: sem acesso a authenticated (só service_role) ------
-- Nenhuma policy → RLS deny-all para usuários; apenas service_role escreve/lê.

-- ============================================================
-- 4) ROLETA DUPLA (determinística, ponderada, sem random)
-- ============================================================
-- Seleciona banco e atendente por menor carga ponderada pelo percentual:
--   score = distribution_pct / (1 + analises_ja_recebidas)
-- Maior score vence; empate → menor position → menor id. distribution_pct=0
-- nunca é elegível. Determinístico e proporcional ao longo do tempo.
--
-- M2M: SECURITY DEFINER, só service_role. Cria a credit_analyses (received),
-- copia lead_documents → credit_analysis_documents, e ENFILEIRA a notificação.
-- Idempotente: se já há análise aberta para o deal, retorna a existente.
CREATE OR REPLACE FUNCTION public.assign_credit_analysis_internal(
  p_deal_id text,
  p_org uuid,
  p_reason text DEFAULT NULL
) RETURNS TABLE (
  analysis_id uuid,
  bank_id uuid,
  attendant_id uuid,
  created boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bank_id uuid;
  v_attendant_id uuid;
  v_analysis_id uuid;
  v_existing record;
BEGIN
  IF p_org IS NULL THEN
    RAISE EXCEPTION 'org_obrigatoria';
  END IF;

  -- Serializa atribuições concorrentes da mesma org (evita corrida de contagem).
  PERFORM pg_advisory_xact_lock(hashtext('omnimob_assign_' || p_org::text));

  -- Idempotência: já existe análise aberta para o deal?
  SELECT ca.id, ca.bank_id, ca.attendant_id
    INTO v_existing
  FROM public.credit_analyses ca
  WHERE ca.deal_id = p_deal_id
    AND ca.status IN ('received','in_analysis')
  LIMIT 1;
  IF FOUND THEN
    analysis_id := v_existing.id;
    bank_id := v_existing.bank_id;
    attendant_id := v_existing.attendant_id;
    created := false;
    RETURN NEXT;
    RETURN;
  END IF;

  -- 1) Banco vencedor por carga ponderada. Carga = só análises ABERTAS
  -- (received/in_analysis); encerradas não distorcem a distribuição (H-4).
  SELECT b.id INTO v_bank_id
  FROM public.correspondent_banks b
  LEFT JOIN (
    SELECT ca.bank_id AS bid, count(*) AS n
    FROM public.credit_analyses ca
    WHERE ca.organization_id = p_org
      AND ca.status IN ('received','in_analysis')
    GROUP BY ca.bank_id
  ) c ON c.bid = b.id
  WHERE b.organization_id = p_org
    AND b.is_active
    AND b.distribution_pct > 0
  ORDER BY (b.distribution_pct::numeric / (1 + COALESCE(c.n, 0))) DESC,
           b.position ASC, b.id ASC
  LIMIT 1;

  -- 2) Atendente vencedor dentro do banco (se houver banco).
  IF v_bank_id IS NOT NULL THEN
    SELECT a.id INTO v_attendant_id
    FROM public.correspondent_attendants a
    LEFT JOIN (
      SELECT ca.attendant_id AS aid, count(*) AS n
      FROM public.credit_analyses ca
      WHERE ca.organization_id = p_org
        AND ca.status IN ('received','in_analysis')
      GROUP BY ca.attendant_id
    ) c ON c.aid = a.id
    WHERE a.organization_id = p_org
      AND a.bank_id = v_bank_id
      AND a.is_active
      AND a.distribution_pct > 0
    ORDER BY (a.distribution_pct::numeric / (1 + COALESCE(c.n, 0))) DESC,
             a.position ASC, a.id ASC
    LIMIT 1;
  END IF;

  -- 3) Cria a análise (attendant pode ser NULL → admin redistribui no painel).
  -- Captura unique_violation do índice credit_analyses_one_open_per_deal: se
  -- duas transações passarem pelo check de idempotência antes do commit, a
  -- perdedora cai aqui e retorna a análise vencedora (H-3).
  BEGIN
    INSERT INTO public.credit_analyses
      (organization_id, deal_id, bank_id, attendant_id, status, received_at, metadata)
    VALUES
      (p_org, p_deal_id, v_bank_id, v_attendant_id, 'received', now(),
       jsonb_build_object('assign_reason', COALESCE(p_reason, 'entrada em ia-analise')))
    RETURNING id INTO v_analysis_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT ca.id, ca.bank_id, ca.attendant_id
      INTO v_existing
    FROM public.credit_analyses ca
    WHERE ca.deal_id = p_deal_id
      AND ca.status IN ('received','in_analysis')
    LIMIT 1;
    analysis_id := v_existing.id;
    bank_id := v_existing.bank_id;
    attendant_id := v_existing.attendant_id;
    created := false;
    RETURN NEXT;
    RETURN;
  END;

  -- 4) Copia os documentos do lead para a análise.
  INSERT INTO public.credit_analysis_documents
    (organization_id, analysis_id, file_url, file_name, mime_type, source)
  SELECT p_org, v_analysis_id, ld.file_url, ld.file_name, ld.mime_type, ld.source
  FROM public.lead_documents ld
  WHERE ld.deal_id = p_deal_id;

  -- 5) Enfileira a notificação (drenada pelo cron → WhatsApp).
  INSERT INTO public.internal_notifications
    (organization_id, kind, deal_id, analysis_id, attendant_id, payload, status)
  VALUES
    (p_org, 'new_analysis', p_deal_id, v_analysis_id, v_attendant_id,
     jsonb_build_object('bank_id', v_bank_id), 'pending');

  analysis_id := v_analysis_id;
  bank_id := v_bank_id;
  attendant_id := v_attendant_id;
  created := true;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.assign_credit_analysis_internal(text, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.assign_credit_analysis_internal(text, uuid, text) FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.assign_credit_analysis_internal(text, uuid, text) TO service_role;

-- ============================================================
-- 5) TRIGGER — atribuição ao entrar na etapa 'ia-analise'
-- ============================================================
-- Quando um deal de um funil-IA chega na etapa 'ia-analise', dispara a roleta.
-- SECURITY DEFINER: roda como owner (superuser nas migrations), podendo chamar
-- assign_credit_analysis_internal (restrita a service_role) mesmo quando o
-- UPDATE veio de um usuário authenticated (ex.: admin movendo o card).
-- C-4: o OWNER desta função DEVE permanecer superusuário/postgres. NÃO alterar
-- com ALTER FUNCTION ... OWNER TO — trocar o owner quebra a chamada interna à
-- função service_role-only sem erro de compilação. Conferir após deploy:
--   \df+ public.tg_assign_correspondent_on_analise
CREATE OR REPLACE FUNCTION public.tg_assign_correspondent_on_analise()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_ai boolean;
BEGIN
  -- Early return: UPDATE que não mexe na etapa não interessa (H-1).
  IF TG_OP = 'UPDATE' AND NEW.stage_id IS NOT DISTINCT FROM OLD.stage_id THEN
    RETURN NEW;
  END IF;

  IF NEW.stage_id = 'ia-analise' THEN
    SELECT f.is_ai_funnel INTO v_is_ai
      FROM public.funnels f
     WHERE f.id = NEW.funnel_id;
    IF COALESCE(v_is_ai, false) THEN
      PERFORM public.assign_credit_analysis_internal(NEW.id, NEW.organization_id, 'entrada em ia-analise');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_correspondent_on_analise ON public.deals;
CREATE TRIGGER trg_assign_correspondent_on_analise
  AFTER INSERT OR UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.tg_assign_correspondent_on_analise();

-- ============================================================
-- 6) AÇÕES DO CORRESPONDENTE (atendente dono ou admin)
-- ============================================================

-- 6.1 Iniciar análise (dispara cronômetro) ------------------------------------
CREATE OR REPLACE FUNCTION public.start_credit_analysis(
  p_analysis_id uuid
) RETURNS TABLE (
  analysis_id uuid,
  status text,
  analysis_started_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid := public.current_org_id();
  v_locked record;
  v_now timestamptz := now();
  v_allowed boolean;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'sem_organizacao'; END IF;

  SELECT ca.id, ca.status, ca.attendant_id, ca.organization_id, ca.analysis_started_at
    INTO v_locked
  FROM public.credit_analyses ca
  WHERE ca.id = p_analysis_id
    AND ca.organization_id = v_org
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'analise_nao_encontrada'; END IF;

  v_allowed := (public.is_org_admin() OR public.is_superadmin(auth.uid()))
    OR v_locked.attendant_id IN (SELECT public.current_attendant_ids());
  IF NOT v_allowed THEN RAISE EXCEPTION 'sem_permissao'; END IF;

  -- No-op idempotente se já iniciada/devolvida (usa a linha já travada).
  IF v_locked.status <> 'received' THEN
    analysis_id := v_locked.id;
    status := v_locked.status;
    analysis_started_at := v_locked.analysis_started_at;
    RETURN NEXT; RETURN;
  END IF;

  UPDATE public.credit_analyses
     SET status = 'in_analysis',
         analysis_started_at = v_now,
         updated_at = v_now
   WHERE id = p_analysis_id;

  analysis_id := p_analysis_id;
  status := 'in_analysis';
  analysis_started_at := v_now;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.start_credit_analysis(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_credit_analysis(uuid) TO authenticated;

-- 6.2 Enviar devolutiva -------------------------------------------------------
-- Grava o resultado, encerra o cronômetro e MOVE o deal conforme o resultado:
--   approved / approved_conditioned → etapa 6 (ia-aprovado-aguardando)
--   rejected                        → etapa 10 (ia-reprovado)
-- A devolutiva é dado FACTUAL do correspondente (não palpite da IA), por isso
-- a transição é aplicada via move_deal_stage_internal. A comunicação ao lead
-- pós-devolutiva (agendamento etc.) é da Fase 3.
CREATE OR REPLACE FUNCTION public.submit_credit_devolutiva(
  p_analysis_id uuid,
  p_result text,
  p_conditions text DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_retomada_prazo_dias integer DEFAULT NULL
) RETURNS TABLE (
  analysis_id uuid,
  status text,
  result text,
  deal_id text,
  new_stage_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid := public.current_org_id();
  v_locked record;
  v_now timestamptz := now();
  v_allowed boolean;
  v_target_stage text;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'sem_organizacao'; END IF;
  IF p_result NOT IN ('approved','approved_conditioned','rejected') THEN
    RAISE EXCEPTION 'resultado_invalido';
  END IF;

  SELECT ca.id, ca.status, ca.attendant_id, ca.organization_id, ca.deal_id
    INTO v_locked
  FROM public.credit_analyses ca
  WHERE ca.id = p_analysis_id
    AND ca.organization_id = v_org
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'analise_nao_encontrada'; END IF;

  v_allowed := (public.is_org_admin() OR public.is_superadmin(auth.uid()))
    OR v_locked.attendant_id IN (SELECT public.current_attendant_ids());
  IF NOT v_allowed THEN RAISE EXCEPTION 'sem_permissao'; END IF;

  IF v_locked.status <> 'in_analysis' THEN
    RAISE EXCEPTION 'analise_nao_esta_em_andamento';
  END IF;

  UPDATE public.credit_analyses
     SET status = 'returned',
         result = p_result,
         result_conditions = CASE WHEN p_result = 'approved_conditioned' THEN p_conditions ELSE NULL END,
         result_reason = p_reason,
         retomada_prazo_dias = p_retomada_prazo_dias,
         returned_at = v_now,
         updated_at = v_now
   WHERE id = p_analysis_id;

  v_target_stage := CASE WHEN p_result = 'rejected' THEN 'ia-reprovado'
                         ELSE 'ia-aprovado-aguardando' END;

  -- Move o deal (dado factual do correspondente). move_deal_stage_internal é
  -- service_role; esta função (SECURITY DEFINER, owner superuser) pode chamá-la.
  PERFORM public.move_deal_stage_internal(
    v_locked.deal_id, v_target_stage,
    'devolutiva do correspondente: ' || p_result, NULL);

  analysis_id := p_analysis_id;
  status := 'returned';
  result := p_result;
  deal_id := v_locked.deal_id;
  new_stage_id := v_target_stage;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_credit_devolutiva(uuid, text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_credit_devolutiva(uuid, text, text, text, integer) TO authenticated;

-- ============================================================
-- 7) SLA — marca análises estouradas para notificação
-- ============================================================
-- Enfileira (idempotente) uma notificação de SLA para análises 'in_analysis'
-- há mais de p_hours sem devolutiva. Chamada pelo cron credit-analysis-sla.
CREATE OR REPLACE FUNCTION public.flag_credit_analysis_sla(p_hours integer DEFAULT 24)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  n integer := 0;
  r record;
BEGIN
  FOR r IN
    SELECT ca.id, ca.organization_id, ca.deal_id, ca.attendant_id
    FROM public.credit_analyses ca
    WHERE ca.status = 'in_analysis'
      AND ca.analysis_started_at < now() - make_interval(hours => GREATEST(p_hours, 1))
      AND NOT (ca.metadata ? 'sla_notified_at')
    FOR UPDATE SKIP LOCKED
  LOOP
    INSERT INTO public.internal_notifications
      (organization_id, kind, deal_id, analysis_id, attendant_id, payload, status)
    VALUES
      (r.organization_id, 'sla_overdue', r.deal_id, r.id, r.attendant_id,
       jsonb_build_object('hours', p_hours), 'pending');
    UPDATE public.credit_analyses
       SET metadata = metadata || jsonb_build_object('sla_notified_at', now()),
           updated_at = now()
     WHERE id = r.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.flag_credit_analysis_sla(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.flag_credit_analysis_sla(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.flag_credit_analysis_sla(integer) TO service_role;

-- ============================================================
-- 8) FILA DE NOTIFICAÇÃO — claim atômico p/ o drenador
-- ============================================================
CREATE OR REPLACE FUNCTION public.claim_internal_notifications(p_limit integer DEFAULT 20)
  RETURNS SETOF public.internal_notifications
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  -- Marca 'processing' no claim para que um cron seguinte (a cada 1 min) não
  -- reclame o mesmo item antes do drenador marcar sent/failed (M-1). O
  -- requeue de 'processing' órfão é responsabilidade do próprio drenador
  -- (devolve a 'pending' o que falhar) ou de uma varredura de stale.
  RETURN QUERY
  WITH claimed AS (
    SELECT n.id FROM public.internal_notifications n
     WHERE n.status = 'pending'
     ORDER BY n.created_at
     LIMIT GREATEST(p_limit, 1)
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.internal_notifications n
     SET status = 'processing', attempts = n.attempts + 1, updated_at = now()
    FROM claimed
   WHERE n.id = claimed.id
  RETURNING n.*;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_internal_notifications(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_internal_notifications(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_internal_notifications(integer) TO service_role;

-- ============================================================
-- 9) CRON
-- ============================================================
-- NOTA (produção self-hosted): a role `postgres` do Supabase NÃO tem permissão
-- para `ALTER DATABASE ... SET app.*` (GUC custom) — dá "permission denied to
-- set parameter". Por isso, no deploy, os jobs abaixo são RECRIADOS via
-- cron.schedule com o token e a URL INLINE (mesmo padrão já usado pelo job
-- `dispatch-ai-queue` da Fase 1). O token é o mesmo CRON_DISPATCH_TOKEN do
-- stack. Mantemos current_setting() aqui só como forma idempotente de criar os
-- jobs na aplicação da migration; o passo pós-deploy os sobrescreve com o token
-- real (ver NOTA PÓS-DEPLOY). NÃO versionar o token neste arquivo.
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule(jobid)
  FROM cron.job
 WHERE jobname IN ('credit-analysis-sla', 'dispatch-internal-notifications');

-- 9a. Drena a fila de notificações internas a cada 1 min.
SELECT cron.schedule(
  'dispatch-internal-notifications',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.functions_base_url', true) || '/send-internal-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', current_setting('app.cron_dispatch_token', true)
    ),
    body := '{"mode":"drain"}'::jsonb
  );
  $$
);

-- 9b. Varre SLA de análises a cada 15 min.
SELECT cron.schedule(
  'credit-analysis-sla',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.functions_base_url', true) || '/credit-analysis-sla',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', current_setting('app.cron_dispatch_token', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ============================================================
-- NOTA PÓS-DEPLOY (manual, fora do git):
--   A role postgres não seta GUC custom (app.*) no Supabase self-hosted.
--   Recriar os 2 jobs com token + URL INLINE (token = CRON_DISPATCH_TOKEN do
--   stack, o mesmo de dispatch-ai-queue):
--     SELECT cron.unschedule(jobid) FROM cron.job
--       WHERE jobname IN ('credit-analysis-sla','dispatch-internal-notifications');
--     SELECT cron.schedule('dispatch-internal-notifications','* * * * *', $$
--       SELECT net.http_post(
--         url := 'https://supabase-vvdttv.duckdns.org/functions/v1/send-internal-notification',
--         headers := jsonb_build_object('Content-Type','application/json','x-cron-token','<TOKEN>'),
--         body := '{"mode":"drain"}'::jsonb); $$);
--     SELECT cron.schedule('credit-analysis-sla','*/15 * * * *', $$
--       SELECT net.http_post(
--         url := 'https://supabase-vvdttv.duckdns.org/functions/v1/credit-analysis-sla',
--         headers := jsonb_build_object('Content-Type','application/json','x-cron-token','<TOKEN>'),
--         body := '{}'::jsonb); $$);
--   Conferir: SELECT jobname, active FROM cron.job WHERE jobname LIKE 'credit-%' OR jobname LIKE 'dispatch-internal%';
--             SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
-- ============================================================
