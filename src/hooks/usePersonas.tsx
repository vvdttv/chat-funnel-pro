import { useEffect, useState, useCallback, createContext, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Persona (tabela `agent_personas`, Fase 2A). Identidade fixa que atende o lead
 * (P1 passiva/tráfego, P2 ativa/indicação). Nome/tom/missão entram na identity
 * do playbook da IA. "Trocou de número, trocou de persona — não de agente."
 */
export interface AgentPersona {
  id: string;
  name: string;
  gender: string | null;
  personality: string;
  style: string;
  tone: string;
  mission: string;
  identityNotes: string;
  photoUrl: string | null;
  isActive: boolean;
  position: number;
  createdAt: string;
}

type DBPersonaRow = {
  id: string;
  name: string;
  gender: string | null;
  personality: string;
  style: string;
  tone: string;
  mission: string;
  identity_notes: string;
  photo_url: string | null;
  is_active: boolean;
  position: number;
  created_at: string;
};

function rowToPersona(row: DBPersonaRow): AgentPersona {
  return {
    id: row.id,
    name: row.name,
    gender: row.gender,
    personality: row.personality ?? '',
    style: row.style ?? '',
    tone: row.tone ?? '',
    mission: row.mission ?? '',
    identityNotes: row.identity_notes ?? '',
    photoUrl: row.photo_url,
    isActive: row.is_active,
    position: row.position ?? 0,
    createdAt: row.created_at,
  };
}

export interface PersonaInput {
  name: string;
  gender?: string | null;
  personality?: string;
  style?: string;
  tone?: string;
  mission?: string;
  identityNotes?: string;
  photoUrl?: string | null;
  isActive?: boolean;
}

const toDBPatch = (input: PersonaInput) => ({
  ...(input.name !== undefined ? { name: input.name } : {}),
  ...(input.gender !== undefined ? { gender: input.gender } : {}),
  ...(input.personality !== undefined ? { personality: input.personality } : {}),
  ...(input.style !== undefined ? { style: input.style } : {}),
  ...(input.tone !== undefined ? { tone: input.tone } : {}),
  ...(input.mission !== undefined ? { mission: input.mission } : {}),
  ...(input.identityNotes !== undefined ? { identity_notes: input.identityNotes } : {}),
  ...(input.photoUrl !== undefined ? { photo_url: input.photoUrl } : {}),
  ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
});

/**
 * Carrega as personas da organização (RLS filtra) e mantém via realtime.
 * Espelha o padrão de `useConversations`/`useFunnels`.
 */
export function usePersonas() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  const [personas, setPersonas] = useState<AgentPersona[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) { setPersonas([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('agent_personas')
        .select('*')
        .order('position', { ascending: true });
      if (cancelled) return;
      if (error) { setError(error.message); setLoading(false); return; }
      setPersonas((data || []).map(r => rowToPersona(r as DBPersonaRow)));
      setLoading(false);
    })();

    const channel = supabase
      .channel(`agent-personas-org-${orgId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'agent_personas' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const row = payload.new as DBPersonaRow;
            setPersonas(prev => prev.some(p => p.id === row.id) ? prev : [...prev, rowToPersona(row)]);
          } else if (payload.eventType === 'UPDATE') {
            const row = payload.new as DBPersonaRow;
            setPersonas(prev => prev.map(p => p.id === row.id ? rowToPersona(row) : p));
          } else if (payload.eventType === 'DELETE') {
            const row = payload.old as { id?: string };
            if (row?.id) setPersonas(prev => prev.filter(p => p.id !== row.id));
          }
        }
      )
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [orgId]);

  const addPersona = useCallback(async (input: PersonaInput) => {
    if (!orgId) return { error: 'sem_organizacao' };
    const { error } = await supabase.from('agent_personas').insert({
      organization_id: orgId,
      position: personas.length,
      ...toDBPatch(input),
    });
    if (error) { console.error('[usePersonas] erro ao criar persona', error); return { error: error.message }; }
    return {};
  }, [orgId, personas.length]);

  const updatePersona = useCallback(async (id: string, input: PersonaInput) => {
    const { error } = await supabase.from('agent_personas').update(toDBPatch(input)).eq('id', id);
    if (error) { console.error('[usePersonas] erro ao atualizar persona', error); return { error: error.message }; }
    return {};
  }, []);

  const deletePersona = useCallback(async (id: string) => {
    const { error } = await supabase.from('agent_personas').delete().eq('id', id);
    if (error) { console.error('[usePersonas] erro ao deletar persona', error); return { error: error.message }; }
    return {};
  }, []);

  return { personas, loading, error, addPersona, updatePersona, deletePersona };
}

// ========== Contexto global (estado compartilhado) ==========

const PersonasContext = createContext<ReturnType<typeof usePersonas> | null>(null);

export function PersonasProvider({ children }: { children: React.ReactNode }) {
  const value = usePersonas();
  return <PersonasContext.Provider value={value}>{children}</PersonasContext.Provider>;
}

export function usePersonasContext() {
  const ctx = useContext(PersonasContext);
  if (!ctx) throw new Error('usePersonasContext deve ser usado dentro de PersonasProvider');
  return ctx;
}
