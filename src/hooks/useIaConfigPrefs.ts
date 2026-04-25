/**
 * Lê as preferências do usuário (última config) para pré-selecionar chips
 * com indicador "↻ da última vez" no configurador conversacional.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface IaConfigPrefs {
  last_scope: string | null;
  last_scope_ids: string[];
  last_trigger: string | null;
  last_polarity: string | null;
  last_tone: string | null;
  last_format: string | null;
}

export function useIaConfigPrefs() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<IaConfigPrefs | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('ia_config_prefs')
        .select('last_scope,last_scope_ids,last_trigger,last_polarity,last_tone,last_format')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        setPrefs({
          last_scope: data.last_scope,
          last_scope_ids: Array.isArray(data.last_scope_ids) ? (data.last_scope_ids as string[]) : [],
          last_trigger: data.last_trigger,
          last_polarity: data.last_polarity,
          last_tone: data.last_tone,
          last_format: data.last_format,
        });
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  return { prefs, loading };
}
