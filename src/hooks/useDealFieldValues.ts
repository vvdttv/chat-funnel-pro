import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { DealFieldValue } from '@/lib/dealFieldValues';

type DBRow = {
  id: string;
  deal_id: string;
  criterion_id: string | null;
  field_key: string;
  value: unknown;
  owner: string;
  source: string;
  updated_at: string;
};

const rowTo = (r: DBRow): DealFieldValue => ({
  id: r.id,
  dealId: r.deal_id,
  criterionId: r.criterion_id,
  fieldKey: r.field_key,
  value: r.value,
  owner: (r.owner as DealFieldValue['owner']) ?? 'ia',
  source: (r.source as DealFieldValue['source']) ?? 'ia',
  updatedAt: r.updated_at,
});

/**
 * Carrega os valores de campos de um deal (deal_field_values) + realtime, e
 * expõe `setValue` que persiste via RPC `set_deal_field_value` (a RPC valida
 * permissão/owner; humano não edita campo owner='ia').
 */
export function useDealFieldValues(dealId: string | null | undefined) {
  const [values, setValues] = useState<DealFieldValue[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!dealId) { setValues([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('deal_field_values')
        .select('id, deal_id, criterion_id, field_key, value, owner, source, updated_at')
        .eq('deal_id', dealId);
      if (cancelled) return;
      if (error) { console.error('[useDealFieldValues] load', error); setValues([]); setLoading(false); return; }
      setValues((data || []).map(r => rowTo(r as DBRow)));
      setLoading(false);
    })();

    const channel = supabase
      .channel(`deal-field-values-${dealId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'deal_field_values', filter: `deal_id=eq.${dealId}` },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const r = rowTo(payload.new as DBRow);
            setValues(prev => {
              const i = prev.findIndex(v => v.id === r.id || v.fieldKey === r.fieldKey);
              if (i === -1) return [...prev, r];
              const next = prev.slice(); next[i] = r; return next;
            });
          } else if (payload.eventType === 'DELETE') {
            const old = payload.old as { id?: string };
            if (old?.id) setValues(prev => prev.filter(v => v.id !== old.id));
          }
        })
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [dealId]);

  const setValue = useCallback(async (
    fieldKey: string,
    value: unknown,
    criterionId?: string | null,
  ): Promise<{ error: string | null }> => {
    if (!dealId) return { error: 'sem_deal' };
    const { data, error } = await supabase.rpc('set_deal_field_value', {
      p_deal_id: dealId,
      p_field_key: fieldKey,
      p_value: value as never,
      ...(criterionId ? { p_criterion_id: criterionId } : {}),
    });
    if (error) { console.error('[useDealFieldValues] setValue', error); return { error: error.message }; }
    // atualização otimista (realtime confirma)
    const row = Array.isArray(data) ? data[0] : data;
    if (row) {
      setValues(prev => {
        const i = prev.findIndex(v => v.fieldKey === fieldKey);
        const mapped: DealFieldValue = {
          id: (row as { out_id: string }).out_id,
          dealId,
          criterionId: criterionId ?? null,
          fieldKey,
          value,
          owner: (row as { out_owner: DealFieldValue['owner'] }).out_owner,
          source: (row as { out_source: DealFieldValue['source'] }).out_source,
          updatedAt: new Date().toISOString(),
        };
        if (i === -1) return [...prev, mapped];
        const next = prev.slice(); next[i] = mapped; return next;
      });
    }
    return { error: null };
  }, [dealId]);

  return { values, loading, setValue };
}
