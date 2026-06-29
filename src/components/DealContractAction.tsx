import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileSignature, AlertCircle, Loader2, ShieldCheck, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Deal } from '@/data/mockData';
import { useFunnelsContext } from '@/hooks/useFunnels';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

/**
 * Atalho contextual para criar/abrir contrato de locacao a partir do card
 * do deal no kanban. So aparece quando:
 *   - usuario e admin (mesmo gate do painel /contratos)
 *   - etapa atual do deal tem role='contrato' (ancora semantica J-2b-0a;
 *     na pratica e a etapa corloc-contrato do funil de corretor de locacao)
 *
 * Logica:
 *   1. Carrega em paralelo: contrato existente do deal + garantia mais recente
 *   2. Se ja existe contrato => botao "Abrir contrato" navega /contratos
 *   3. Senao, exige garantia com result IN (approved, approved_conditioned)
 *      antes de mostrar "Criar contrato" (a RPC valida no banco, mas mostrar
 *      antes economiza um round-trip e da feedback melhor).
 */
type GuaranteeRow = {
  id: string;
  result: 'approved' | 'approved_conditioned' | 'rejected' | null;
};

type ContractRow = { id: string };

export const DealContractAction = ({ deal }: { deal: Deal }) => {
  const { isAdmin } = useAuth();
  const { funnels } = useFunnelsContext();
  const navigate = useNavigate();
  const { toast } = useToast();

  const stageRole = (() => {
    const f = funnels.find(x => x.id === deal.funnelId);
    const s = f?.stages.find(x => x.id === deal.stageId);
    return s?.role ?? null;
  })();

  const [loading, setLoading] = useState(true);
  const [contract, setContract] = useState<ContractRow | null>(null);
  const [approvedGuarantee, setApprovedGuarantee] = useState<GuaranteeRow | null>(null);
  const [creating, setCreating] = useState(false);

  const isContractStage = isAdmin && stageRole === 'contrato';

  useEffect(() => {
    if (!isContractStage) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [cRes, gRes] = await Promise.all([
        supabase
          .from('lease_contracts')
          .select('id')
          .eq('deal_id', deal.id)
          .not('status', 'in', '(cancelado,encerrado)')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('guarantee_analyses')
          .select('id, result')
          .eq('deal_id', deal.id)
          .in('result', ['approved', 'approved_conditioned'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      if (cRes.error) console.error('[DealContractAction] contract', cRes.error);
      if (gRes.error) console.error('[DealContractAction] guarantee', gRes.error);
      setContract((cRes.data as ContractRow | null) ?? null);
      setApprovedGuarantee((gRes.data as GuaranteeRow | null) ?? null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [deal.id, isContractStage]);

  const handleCreate = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    const { data, error } = await supabase.rpc('create_lease_contract', {
      p_deal_id: deal.id,
      p_metadata: {} as never,
    });
    setCreating(false);
    if (error) {
      console.error('[DealContractAction] create', error);
      toast({
        title: 'Nao foi possivel criar o contrato',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    toast({
      title: row?.out_created ? 'Contrato criado' : 'Contrato ja existia',
      description: 'Abra o painel de Contratos para editar os campos.',
    });
    navigate('/contratos');
  }, [creating, deal.id, navigate, toast]);

  if (!isContractStage) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-3 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <FileSignature size={14} className="text-primary" />
        <p className="text-xs font-semibold text-foreground">Contrato de locacao</p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 size={12} className="animate-spin" />
          Verificando contrato e garantia...
        </div>
      ) : contract ? (
        <button
          onClick={() => navigate('/contratos')}
          className="w-full flex items-center justify-between bg-primary/15 text-primary px-3 py-2 rounded-lg text-xs font-medium active:scale-[0.99]"
        >
          <span>Contrato existente</span>
          <ExternalLink size={14} />
        </button>
      ) : !approvedGuarantee ? (
        <div className="flex items-start gap-2 bg-warning/10 text-warning rounded-lg p-2.5">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <p className="text-[11px] leading-tight">
            Aprove uma garantia (no painel /garantia) antes de criar o contrato.
            Tipos validos: aprovada ou aprovada com condicoes.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-2">
            <ShieldCheck size={12} className="text-primary" />
            Garantia {approvedGuarantee.result === 'approved' ? 'aprovada' : 'aprovada com condicoes'}.
          </div>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="w-full bg-primary text-primary-foreground px-3 py-2 rounded-lg text-xs font-medium active:scale-[0.99] disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {creating && <Loader2 size={12} className="animate-spin" />}
            Criar contrato
          </button>
        </>
      )}
    </div>
  );
};

export default DealContractAction;
