/**
 * Hook reativo para CRUD de skills.
 *
 * Carrega ia_skills + ia_skill_nodes + ia_skill_guardrails da org atual e
 * agrega no shape `SkillWithNodes` esperado pelo motor `skillComposer`.
 * Também expõe ações para o canvas: upsert de skill, upsert/delete de nó,
 * vínculo/desvínculo de guardrail.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type {
  IASkill, IASkillNode, SkillNodeKind, SkillScopeType,
} from '@/data/iaSkills';
import type { SkillWithNodes } from '@/lib/skillComposer';

interface SkillRow {
  id: string;
  code: string;
  name: string;
  description: string;
  scope_type: string;
  scope_id: string | null;
  is_active: boolean;
  is_auto_suggested: boolean;
  position: number;
}

interface NodeRow {
  id: string;
  skill_id: string;
  kind: string;
  parent_node_id: string | null;
  branch_label: string | null;
  position_x: number;
  position_y: number;
  config: unknown;
  position: number;
}

interface GuardrailRow {
  id: string;
  skill_id: string;
  rule_code: string;
}

const skillFromRow = (r: SkillRow): IASkill => ({
  id: r.id,
  code: r.code,
  name: r.name,
  description: r.description ?? '',
  scopeType: r.scope_type as SkillScopeType,
  scopeId: r.scope_id,
  isActive: r.is_active,
  isAutoSuggested: r.is_auto_suggested,
  position: r.position,
});

const nodeFromRow = (r: NodeRow): IASkillNode => ({
  id: r.id,
  skillId: r.skill_id,
  kind: r.kind as SkillNodeKind,
  parentNodeId: r.parent_node_id,
  branchLabel: r.branch_label,
  positionX: Number(r.position_x ?? 0),
  positionY: Number(r.position_y ?? 0),
  config: (r.config as Record<string, unknown>) ?? {},
  position: r.position,
});

export interface UseSkillsState {
  loading: boolean;
  error: string | null;
  skills: SkillWithNodes[];
  refresh: () => Promise<void>;
  createSkill: (s: Omit<IASkill, 'id'>) => Promise<{ id: string | null; error: string | null }>;
  updateSkill: (id: string, patch: Partial<Omit<IASkill, 'id'>>) => Promise<{ error: string | null }>;
  deleteSkill: (id: string) => Promise<{ error: string | null }>;
  upsertNode: (n: Omit<IASkillNode, 'id'> & { id?: string }) => Promise<{ id: string | null; error: string | null }>;
  deleteNode: (id: string) => Promise<{ error: string | null }>;
  setGuardrails: (skillId: string, ruleCodes: string[]) => Promise<{ error: string | null }>;
}

export function useSkills(): UseSkillsState {
  const { profile } = useAuth();
  const orgId = profile?.organization_id ?? null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [skills, setSkills] = useState<SkillWithNodes[]>([]);

  const fetchAll = useCallback(async () => {
    if (!orgId) {
      setSkills([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [s1, s2, s3] = await Promise.all([
        supabase.from('ia_skills')
          .select('id,code,name,description,scope_type,scope_id,is_active,is_auto_suggested,position')
          .eq('organization_id', orgId)
          .order('position', { ascending: true }),
        supabase.from('ia_skill_nodes')
          .select('id,skill_id,kind,parent_node_id,branch_label,position_x,position_y,config,position')
          .eq('organization_id', orgId),
        supabase.from('ia_skill_guardrails')
          .select('id,skill_id,rule_code')
          .eq('organization_id', orgId),
      ]);

      const firstErr = [s1, s2, s3].find(r => r.error)?.error;
      if (firstErr) throw firstErr;

      const skillRows = (s1.data ?? []) as SkillRow[];
      const nodeRows = (s2.data ?? []) as NodeRow[];
      const guardRows = (s3.data ?? []) as GuardrailRow[];

      const nodesBySkill = new Map<string, IASkillNode[]>();
      for (const n of nodeRows.map(nodeFromRow)) {
        const arr = nodesBySkill.get(n.skillId) ?? [];
        arr.push(n);
        nodesBySkill.set(n.skillId, arr);
      }

      const guardsBySkill = new Map<string, string[]>();
      for (const g of guardRows) {
        const arr = guardsBySkill.get(g.skill_id) ?? [];
        arr.push(g.rule_code);
        guardsBySkill.set(g.skill_id, arr);
      }

      const out: SkillWithNodes[] = skillRows.map(skillFromRow).map(skill => ({
        skill,
        nodes: nodesBySkill.get(skill.id) ?? [],
        guardrailRuleCodes: guardsBySkill.get(skill.id) ?? [],
      }));

      setSkills(out);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao carregar skills';
      console.error('[useSkills]', e);
      setError(msg);
      setSkills([]);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const createSkill = useCallback<UseSkillsState['createSkill']>(async (s) => {
    if (!orgId) return { id: null, error: 'Sem organização' };
    const { data, error } = await supabase.from('ia_skills').insert([{
      organization_id: orgId,
      code: s.code,
      name: s.name,
      description: s.description,
      scope_type: s.scopeType,
      scope_id: s.scopeId,
      is_active: s.isActive,
      is_auto_suggested: s.isAutoSuggested,
      position: s.position,
    }]).select('id').single();
    if (error) return { id: null, error: error.message };
    await fetchAll();
    return { id: data.id, error: null };
  }, [orgId, fetchAll]);

  const updateSkill = useCallback<UseSkillsState['updateSkill']>(async (id, patch) => {
    const dbPatch: Record<string, unknown> = {};
    if (patch.code !== undefined) dbPatch.code = patch.code;
    if (patch.name !== undefined) dbPatch.name = patch.name;
    if (patch.description !== undefined) dbPatch.description = patch.description;
    if (patch.scopeType !== undefined) dbPatch.scope_type = patch.scopeType;
    if (patch.scopeId !== undefined) dbPatch.scope_id = patch.scopeId;
    if (patch.isActive !== undefined) dbPatch.is_active = patch.isActive;
    if (patch.isAutoSuggested !== undefined) dbPatch.is_auto_suggested = patch.isAutoSuggested;
    if (patch.position !== undefined) dbPatch.position = patch.position;

    const { error } = await supabase.from('ia_skills').update(dbPatch as never).eq('id', id);
    if (error) return { error: error.message };
    await fetchAll();
    return { error: null };
  }, [fetchAll]);

  const deleteSkill = useCallback<UseSkillsState['deleteSkill']>(async (id) => {
    const { error } = await supabase.from('ia_skills').delete().eq('id', id);
    if (error) return { error: error.message };
    await fetchAll();
    return { error: null };
  }, [fetchAll]);

  const upsertNode = useCallback<UseSkillsState['upsertNode']>(async (n) => {
    if (!orgId) return { id: null, error: 'Sem organização' };
    const dbRow = {
      ...(n.id ? { id: n.id } : {}),
      skill_id: n.skillId,
      organization_id: orgId,
      kind: n.kind,
      parent_node_id: n.parentNodeId,
      branch_label: n.branchLabel,
      position_x: n.positionX,
      position_y: n.positionY,
      config: n.config as never,
      position: n.position,
    };
    const { data, error } = await supabase
      .from('ia_skill_nodes')
      .upsert([dbRow])
      .select('id')
      .single();
    if (error) return { id: null, error: error.message };
    await fetchAll();
    return { id: data.id, error: null };
  }, [orgId, fetchAll]);

  const deleteNode = useCallback<UseSkillsState['deleteNode']>(async (id) => {
    const { error } = await supabase.from('ia_skill_nodes').delete().eq('id', id);
    if (error) return { error: error.message };
    await fetchAll();
    return { error: null };
  }, [fetchAll]);

  const setGuardrails = useCallback<UseSkillsState['setGuardrails']>(async (skillId, ruleCodes) => {
    if (!orgId) return { error: 'Sem organização' };
    // delete + reinsert (volume pequeno, mais simples que diff)
    const { error: delErr } = await supabase
      .from('ia_skill_guardrails').delete().eq('skill_id', skillId);
    if (delErr) return { error: delErr.message };
    if (ruleCodes.length > 0) {
      const rows = ruleCodes.map(rc => ({
        skill_id: skillId, organization_id: orgId, rule_code: rc,
      }));
      const { error: insErr } = await supabase.from('ia_skill_guardrails').insert(rows);
      if (insErr) return { error: insErr.message };
    }
    await fetchAll();
    return { error: null };
  }, [orgId, fetchAll]);

  return useMemo(() => ({
    loading, error, skills,
    refresh: fetchAll,
    createSkill, updateSkill, deleteSkill,
    upsertNode, deleteNode, setGuardrails,
  }), [loading, error, skills, fetchAll, createSkill, updateSkill, deleteSkill, upsertNode, deleteNode, setGuardrails]);
}
