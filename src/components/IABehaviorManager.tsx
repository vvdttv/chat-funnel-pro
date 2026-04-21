/**
 * CRUD admin para `ia_rules` e `lead_behaviors`.
 *
 * Renderizado dentro da aba "Fluxos IA" de ConfigPage. Permite admins
 * criar/editar/excluir regras (DO/DONT/ASK/NOASK) e comportamentos do
 * lead (LB-xxx) diretamente sobre as tabelas do Lovable Cloud.
 *
 * Quando o dataset ainda está apenas no seed local (fromCloud=false),
 * exibe um aviso pedindo para semear primeiro via IABehaviorSeedBanner.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Plus, Pencil, Trash2, Save, X, Loader2, Filter,
  ShieldCheck, ShieldAlert, HelpCircle, Ban, Bot, AlertTriangle,
  Tag, Activity,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useIABehavior } from '@/hooks/useIABehavior';
import type {
  IABehaviorRule, IARuleKind, IARuleScope,
  LeadBehavior, LeadBehaviorCategory,
} from '@/data/iaBehavior';

type Tab = 'rules' | 'behaviors';

const KIND_META: Record<IARuleKind, { label: string; icon: typeof ShieldCheck; classes: string }> = {
  do:    { label: 'DO',    icon: ShieldCheck,  classes: 'bg-success/15 text-success border-success/30' },
  dont:  { label: 'DON\'T',icon: Ban,          classes: 'bg-destructive/15 text-destructive border-destructive/30' },
  ask:   { label: 'ASK',   icon: HelpCircle,   classes: 'bg-primary/15 text-primary border-primary/30' },
  noask: { label: 'NOASK', icon: ShieldAlert,  classes: 'bg-warning/15 text-warning border-warning/30' },
};

const SCOPE_OPTIONS: IARuleScope[] = ['universal', 'E0', 'E1', 'E2', 'E3', 'E4a', 'E4b'];

const CATEGORY_META: Record<LeadBehaviorCategory, { label: string; classes: string }> = {
  positive:  { label: 'Positivo',  classes: 'bg-success/15 text-success border-success/30' },
  neutral:   { label: 'Neutro',    classes: 'bg-secondary text-muted-foreground border-border' },
  evasive:   { label: 'Evasivo',   classes: 'bg-warning/15 text-warning border-warning/30' },
  negative:  { label: 'Negativo',  classes: 'bg-destructive/15 text-destructive border-destructive/30' },
  objection: { label: 'Objeção',   classes: 'bg-primary/15 text-primary border-primary/30' },
};

// ============================================================================
// Editor de regra
// ============================================================================

interface RuleDraft {
  id?: string;          // uuid db (vazio quando novo)
  code: string;         // ex.: IA-DO-026
  kind: IARuleKind;
  scope: IARuleScope;
  text: string;
  meta: string;
}

const emptyRule: RuleDraft = { code: '', kind: 'do', scope: 'universal', text: '', meta: '' };

const RuleEditor = ({
  draft, onChange, onSave, onCancel, saving,
}: {
  draft: RuleDraft;
  onChange: (d: RuleDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) => {
  const valid = draft.code.trim() && draft.text.trim();
  return (
    <div className="bg-card border border-primary/40 rounded-xl p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input
          value={draft.code}
          onChange={e => onChange({ ...draft, code: e.target.value.toUpperCase() })}
          placeholder="IA-DO-026"
          className="text-xs bg-secondary border border-border rounded-md px-2 py-1.5 text-foreground font-mono"
        />
        <select
          value={draft.kind}
          onChange={e => onChange({ ...draft, kind: e.target.value as IARuleKind })}
          className="text-xs bg-secondary border border-border rounded-md px-2 py-1.5 text-foreground"
        >
          {(Object.keys(KIND_META) as IARuleKind[]).map(k =>
            <option key={k} value={k}>{KIND_META[k].label}</option>)}
        </select>
      </div>
      <select
        value={draft.scope}
        onChange={e => onChange({ ...draft, scope: e.target.value as IARuleScope })}
        className="w-full text-xs bg-secondary border border-border rounded-md px-2 py-1.5 text-foreground"
      >
        {SCOPE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <textarea
        value={draft.text}
        onChange={e => onChange({ ...draft, text: e.target.value })}
        placeholder="Texto da regra exibido ao corretor / aplicado pela IA…"
        rows={3}
        className="w-full text-xs bg-secondary border border-border rounded-md px-2 py-1.5 text-foreground resize-none"
      />
      <input
        value={draft.meta}
        onChange={e => onChange({ ...draft, meta: e.target.value })}
        placeholder="Meta (opcional): dado capturado / motivo da proibição"
        className="w-full text-xs bg-secondary border border-border rounded-md px-2 py-1.5 text-foreground"
      />
      <div className="flex gap-1.5">
        <button
          onClick={onSave}
          disabled={!valid || saving}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold active:scale-95 disabled:opacity-50"
        >
          {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
          Salvar
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg bg-secondary border border-border text-xs active:bg-card"
        >
          <X size={11} />
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// Editor de comportamento
// ============================================================================

interface BehaviorDraft {
  id?: string;
  code: string;
  label: string;
  category: LeadBehaviorCategory;
  typicalStages: string;        // CSV simples no editor
  detectionHints: string;       // CSV
  defaultReaction: string;
  nextStep: string;
}

const emptyBehavior: BehaviorDraft = {
  code: '', label: '', category: 'neutral',
  typicalStages: '*', detectionHints: '',
  defaultReaction: '', nextStep: '',
};

const BehaviorEditor = ({
  draft, onChange, onSave, onCancel, saving,
}: {
  draft: BehaviorDraft;
  onChange: (d: BehaviorDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) => {
  const valid = draft.code.trim() && draft.label.trim();
  return (
    <div className="bg-card border border-primary/40 rounded-xl p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input
          value={draft.code}
          onChange={e => onChange({ ...draft, code: e.target.value.toUpperCase() })}
          placeholder="LB-086"
          className="text-xs bg-secondary border border-border rounded-md px-2 py-1.5 text-foreground font-mono"
        />
        <select
          value={draft.category}
          onChange={e => onChange({ ...draft, category: e.target.value as LeadBehaviorCategory })}
          className="text-xs bg-secondary border border-border rounded-md px-2 py-1.5 text-foreground"
        >
          {(Object.keys(CATEGORY_META) as LeadBehaviorCategory[]).map(c =>
            <option key={c} value={c}>{CATEGORY_META[c].label}</option>)}
        </select>
      </div>
      <input
        value={draft.label}
        onChange={e => onChange({ ...draft, label: e.target.value })}
        placeholder="Rótulo curto do comportamento"
        className="w-full text-xs bg-secondary border border-border rounded-md px-2 py-1.5 text-foreground"
      />
      <input
        value={draft.typicalStages}
        onChange={e => onChange({ ...draft, typicalStages: e.target.value })}
        placeholder="Etapas (CSV): * ou E0,E1,E2"
        className="w-full text-xs bg-secondary border border-border rounded-md px-2 py-1.5 text-foreground font-mono"
      />
      <textarea
        value={draft.detectionHints}
        onChange={e => onChange({ ...draft, detectionHints: e.target.value })}
        placeholder="Pistas de detecção (CSV ou linhas)"
        rows={2}
        className="w-full text-xs bg-secondary border border-border rounded-md px-2 py-1.5 text-foreground resize-none"
      />
      <textarea
        value={draft.defaultReaction}
        onChange={e => onChange({ ...draft, defaultReaction: e.target.value })}
        placeholder="Reação padrão da IA"
        rows={2}
        className="w-full text-xs bg-secondary border border-border rounded-md px-2 py-1.5 text-foreground resize-none"
      />
      <input
        value={draft.nextStep}
        onChange={e => onChange({ ...draft, nextStep: e.target.value })}
        placeholder="Próximo passo recomendado"
        className="w-full text-xs bg-secondary border border-border rounded-md px-2 py-1.5 text-foreground"
      />
      <div className="flex gap-1.5">
        <button
          onClick={onSave}
          disabled={!valid || saving}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold active:scale-95 disabled:opacity-50"
        >
          {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
          Salvar
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg bg-secondary border border-border text-xs active:bg-card"
        >
          <X size={11} />
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// Componente principal
// ============================================================================

const splitCsv = (s: string): string[] =>
  s.split(/[\n,]/).map(x => x.trim()).filter(Boolean);

export const IABehaviorManager = () => {
  const { isAdmin, profile } = useAuth();
  const { fromCloud, refresh } = useIABehavior();
  const [tab, setTab] = useState<Tab>('rules');

  // datasets locais (lemos do db por id pra ter o uuid pra update/delete)
  const [rules, setRules] = useState<Array<IABehaviorRule & { dbId: string }>>([]);
  const [behaviors, setBehaviors] = useState<Array<LeadBehavior & { dbId: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [ruleScopeFilter, setRuleScopeFilter] = useState<string>('');
  const [ruleKindFilter, setRuleKindFilter] = useState<string>('');
  const [behaviorCatFilter, setBehaviorCatFilter] = useState<string>('');

  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleDraft, setRuleDraft] = useState<RuleDraft>(emptyRule);
  const [editingBehaviorId, setEditingBehaviorId] = useState<string | null>(null);
  const [behaviorDraft, setBehaviorDraft] = useState<BehaviorDraft>(emptyBehavior);
  const [saving, setSaving] = useState(false);

  const fetchAll = async () => {
    if (!fromCloud) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [r, b] = await Promise.all([
        supabase.from('ia_rules').select('id,code,kind,scope,text,meta,is_active').order('code'),
        supabase.from('lead_behaviors').select('id,code,label,category,typical_stages,detection_hints,default_reaction,next_step,is_active').order('code'),
      ]);
      if (r.error) throw r.error;
      if (b.error) throw b.error;
      setRules((r.data ?? []).map(row => ({
        dbId: row.id,
        id: row.code,
        kind: row.kind as IARuleKind,
        scope: row.scope as IARuleScope,
        text: row.text,
        meta: row.meta ?? undefined,
      })));
      setBehaviors((b.data ?? []).map(row => ({
        dbId: row.id,
        id: row.code,
        label: row.label,
        category: row.category as LeadBehaviorCategory,
        typicalStages: Array.isArray(row.typical_stages) ? (row.typical_stages as LeadBehavior['typicalStages']) : [],
        detectionHints: Array.isArray(row.detection_hints) ? (row.detection_hints as string[]) : [],
        defaultReaction: row.default_reaction ?? '',
        nextStep: row.next_step ?? '',
      })));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao carregar dados';
      console.error('[IABehaviorManager]', e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [fromCloud]);

  const filteredRules = useMemo(() => rules.filter(r =>
    (!ruleScopeFilter || r.scope === ruleScopeFilter) &&
    (!ruleKindFilter || r.kind === ruleKindFilter)
  ), [rules, ruleScopeFilter, ruleKindFilter]);

  const filteredBehaviors = useMemo(() => behaviors.filter(b =>
    !behaviorCatFilter || b.category === behaviorCatFilter
  ), [behaviors, behaviorCatFilter]);

  // -------- ações regras --------
  const startNewRule = () => {
    setRuleDraft(emptyRule);
    setEditingRuleId('__new__');
  };
  const startEditRule = (rule: IABehaviorRule & { dbId: string }) => {
    setRuleDraft({
      id: rule.dbId, code: rule.id, kind: rule.kind, scope: rule.scope,
      text: rule.text, meta: rule.meta ?? '',
    });
    setEditingRuleId(rule.dbId);
  };
  const cancelRule = () => { setEditingRuleId(null); setRuleDraft(emptyRule); };
  const saveRule = async () => {
    if (!profile?.organization_id) return;
    setSaving(true);
    try {
      const payload = {
        organization_id: profile.organization_id,
        code: ruleDraft.code.trim(),
        kind: ruleDraft.kind,
        scope: ruleDraft.scope,
        text: ruleDraft.text.trim(),
        meta: ruleDraft.meta.trim() || null,
        is_active: true,
      };
      if (ruleDraft.id) {
        const { error: e } = await supabase.from('ia_rules').update(payload).eq('id', ruleDraft.id);
        if (e) throw e;
      } else {
        const { error: e } = await supabase.from('ia_rules').insert(payload);
        if (e) throw e;
      }
      cancelRule();
      await Promise.all([fetchAll(), refresh()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar regra');
    } finally {
      setSaving(false);
    }
  };
  const deleteRule = async (dbId: string) => {
    if (!confirm('Excluir esta regra?')) return;
    setSaving(true);
    try {
      const { error: e } = await supabase.from('ia_rules').delete().eq('id', dbId);
      if (e) throw e;
      await Promise.all([fetchAll(), refresh()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao excluir regra');
    } finally {
      setSaving(false);
    }
  };

  // -------- ações comportamentos --------
  const startNewBehavior = () => {
    setBehaviorDraft(emptyBehavior);
    setEditingBehaviorId('__new__');
  };
  const startEditBehavior = (b: LeadBehavior & { dbId: string }) => {
    setBehaviorDraft({
      id: b.dbId, code: b.id, label: b.label, category: b.category,
      typicalStages: b.typicalStages.join(','),
      detectionHints: b.detectionHints.join('\n'),
      defaultReaction: b.defaultReaction,
      nextStep: b.nextStep,
    });
    setEditingBehaviorId(b.dbId);
  };
  const cancelBehavior = () => { setEditingBehaviorId(null); setBehaviorDraft(emptyBehavior); };
  const saveBehavior = async () => {
    if (!profile?.organization_id) return;
    setSaving(true);
    try {
      const payload = {
        organization_id: profile.organization_id,
        code: behaviorDraft.code.trim(),
        label: behaviorDraft.label.trim(),
        category: behaviorDraft.category,
        typical_stages: splitCsv(behaviorDraft.typicalStages),
        detection_hints: splitCsv(behaviorDraft.detectionHints),
        default_reaction: behaviorDraft.defaultReaction.trim(),
        next_step: behaviorDraft.nextStep.trim(),
        is_active: true,
      };
      if (behaviorDraft.id) {
        const { error: e } = await supabase.from('lead_behaviors').update(payload).eq('id', behaviorDraft.id);
        if (e) throw e;
      } else {
        const { error: e } = await supabase.from('lead_behaviors').insert(payload);
        if (e) throw e;
      }
      cancelBehavior();
      await Promise.all([fetchAll(), refresh()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar comportamento');
    } finally {
      setSaving(false);
    }
  };
  const deleteBehavior = async (dbId: string) => {
    if (!confirm('Excluir este comportamento?')) return;
    setSaving(true);
    try {
      const { error: e } = await supabase.from('lead_behaviors').delete().eq('id', dbId);
      if (e) throw e;
      await Promise.all([fetchAll(), refresh()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao excluir comportamento');
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) return null;

  if (!fromCloud) {
    return (
      <div className="bg-warning/10 border border-warning/30 rounded-xl p-3 mb-3 flex items-start gap-2">
        <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />
        <div className="text-xs text-foreground">
          A biblioteca da IA está usando o seed local. Use o botão "Semear dataset padrão"
          acima para enviar o conteúdo para o banco antes de editá-lo.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl p-3 mb-3 border border-border">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <Bot size={14} className="text-[hsl(270,60%,70%)]" />
          Editor da biblioteca da IA
        </h3>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-3 bg-secondary rounded-lg p-1">
        <button
          onClick={() => setTab('rules')}
          className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors ${
            tab === 'rules' ? 'bg-card text-foreground' : 'text-muted-foreground'
          }`}
        >Regras ({rules.length})</button>
        <button
          onClick={() => setTab('behaviors')}
          className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors ${
            tab === 'behaviors' ? 'bg-card text-foreground' : 'text-muted-foreground'
          }`}
        >Comportamentos ({behaviors.length})</button>
      </div>

      {error && (
        <div className="mb-2 p-2 bg-destructive/10 border border-destructive/30 rounded text-[11px] text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-6 text-muted-foreground text-xs">
          <Loader2 size={12} className="animate-spin mr-1.5" /> Carregando…
        </div>
      ) : tab === 'rules' ? (
        <>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Filter size={11} className="text-muted-foreground" />
            <select
              value={ruleScopeFilter}
              onChange={e => setRuleScopeFilter(e.target.value)}
              className="text-[11px] bg-secondary border border-border rounded-md px-2 py-1 text-foreground"
            >
              <option value="">Todos os escopos</option>
              {SCOPE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              value={ruleKindFilter}
              onChange={e => setRuleKindFilter(e.target.value)}
              className="text-[11px] bg-secondary border border-border rounded-md px-2 py-1 text-foreground"
            >
              <option value="">Todos os tipos</option>
              {(Object.keys(KIND_META) as IARuleKind[]).map(k =>
                <option key={k} value={k}>{KIND_META[k].label}</option>)}
            </select>
            <button
              onClick={startNewRule}
              className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-[11px] font-semibold active:scale-95"
            >
              <Plus size={11} /> Nova regra
            </button>
          </div>

          {editingRuleId === '__new__' && (
            <div className="mb-2">
              <RuleEditor
                draft={ruleDraft}
                onChange={setRuleDraft}
                onSave={saveRule}
                onCancel={cancelRule}
                saving={saving}
              />
            </div>
          )}

          <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
            {filteredRules.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-4">Nenhuma regra.</p>
            ) : filteredRules.map(rule => {
              const meta = KIND_META[rule.kind];
              const Icon = meta.icon;
              const isEditing = editingRuleId === rule.dbId;
              if (isEditing) {
                return (
                  <RuleEditor
                    key={rule.dbId}
                    draft={ruleDraft}
                    onChange={setRuleDraft}
                    onSave={saveRule}
                    onCancel={cancelRule}
                    saving={saving}
                  />
                );
              }
              return (
                <div key={rule.dbId} className="bg-secondary/50 border border-border/50 rounded-lg p-2.5">
                  <div className="flex items-start gap-2">
                    <div className={`px-1.5 py-0.5 rounded border text-[9px] font-bold flex items-center gap-1 shrink-0 ${meta.classes}`}>
                      <Icon size={9} /> {meta.label}
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground shrink-0">{rule.id}</span>
                    <span className="text-[10px] text-primary shrink-0">· {rule.scope}</span>
                    <div className="flex gap-0.5 ml-auto shrink-0">
                      <button
                        onClick={() => startEditRule(rule)}
                        className="p-1 rounded hover:bg-card text-muted-foreground"
                      ><Pencil size={11} /></button>
                      <button
                        onClick={() => deleteRule(rule.dbId)}
                        className="p-1 rounded hover:bg-destructive/20 text-destructive"
                      ><Trash2 size={11} /></button>
                    </div>
                  </div>
                  <p className="text-[11px] text-foreground mt-1.5">{rule.text}</p>
                  {rule.meta && (
                    <p className="text-[10px] text-muted-foreground mt-1 italic">↳ {rule.meta}</p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Filter size={11} className="text-muted-foreground" />
            <select
              value={behaviorCatFilter}
              onChange={e => setBehaviorCatFilter(e.target.value)}
              className="text-[11px] bg-secondary border border-border rounded-md px-2 py-1 text-foreground"
            >
              <option value="">Todas categorias</option>
              {(Object.keys(CATEGORY_META) as LeadBehaviorCategory[]).map(c =>
                <option key={c} value={c}>{CATEGORY_META[c].label}</option>)}
            </select>
            <button
              onClick={startNewBehavior}
              className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-[11px] font-semibold active:scale-95"
            >
              <Plus size={11} /> Novo comportamento
            </button>
          </div>

          {editingBehaviorId === '__new__' && (
            <div className="mb-2">
              <BehaviorEditor
                draft={behaviorDraft}
                onChange={setBehaviorDraft}
                onSave={saveBehavior}
                onCancel={cancelBehavior}
                saving={saving}
              />
            </div>
          )}

          <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
            {filteredBehaviors.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-4">Nenhum comportamento.</p>
            ) : filteredBehaviors.map(b => {
              const cat = CATEGORY_META[b.category];
              const isEditing = editingBehaviorId === b.dbId;
              if (isEditing) {
                return (
                  <BehaviorEditor
                    key={b.dbId}
                    draft={behaviorDraft}
                    onChange={setBehaviorDraft}
                    onSave={saveBehavior}
                    onCancel={cancelBehavior}
                    saving={saving}
                  />
                );
              }
              return (
                <div key={b.dbId} className="bg-secondary/50 border border-border/50 rounded-lg p-2.5">
                  <div className="flex items-start gap-2">
                    <div className={`px-1.5 py-0.5 rounded border text-[9px] font-bold shrink-0 ${cat.classes}`}>
                      {cat.label}
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground shrink-0">{b.id}</span>
                    <div className="flex gap-0.5 ml-auto shrink-0">
                      <button
                        onClick={() => startEditBehavior(b)}
                        className="p-1 rounded hover:bg-card text-muted-foreground"
                      ><Pencil size={11} /></button>
                      <button
                        onClick={() => deleteBehavior(b.dbId)}
                        className="p-1 rounded hover:bg-destructive/20 text-destructive"
                      ><Trash2 size={11} /></button>
                    </div>
                  </div>
                  <p className="text-xs text-foreground font-medium mt-1.5">{b.label}</p>
                  {b.typicalStages.length > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Etapas: <span className="font-mono">{b.typicalStages.join(', ')}</span>
                    </p>
                  )}
                  {b.defaultReaction && (
                    <p className="text-[10px] text-foreground mt-1 italic">↳ {b.defaultReaction}</p>
                  )}
                  {b.nextStep && (
                    <p className="text-[10px] text-primary mt-0.5">→ {b.nextStep}</p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
