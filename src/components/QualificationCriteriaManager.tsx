import { useState } from 'react';
import { Plus, Pencil, Trash2, X, Loader2, ToggleLeft, ToggleRight, ListChecks } from 'lucide-react';
import { useFunnelsContext } from '@/hooks/useFunnels';
import {
  useQualificationCriteriaContext,
  type QualificationCriterion,
  type CriterionInput,
} from '@/hooks/useQualificationCriteria';

const inputCls = 'w-full bg-secondary rounded-lg px-3 py-2 text-sm text-foreground outline-none border border-border focus:border-primary/50 placeholder:text-muted-foreground';
const labelCls = 'text-[10px] text-muted-foreground uppercase tracking-wide mb-1 block';

// ========== FORM ==========

const CriterionForm = ({ criterion, funnelId, stageId, onSave, onCancel }: {
  criterion?: QualificationCriterion;
  funnelId: string;
  stageId: string;
  onSave: (input: CriterionInput) => Promise<void>;
  onCancel: () => void;
}) => {
  const [key, setKey] = useState(criterion?.key ?? '');
  const [label, setLabel] = useState(criterion?.label ?? '');
  const [questionHint, setQuestionHint] = useState(criterion?.questionHint ?? '');
  const [isRequired, setIsRequired] = useState(criterion?.isRequired ?? true);
  const [criterionType, setCriterionType] = useState<QualificationCriterion['criterionType']>(criterion?.criterionType ?? 'boolean');
  const [owner, setOwner] = useState<QualificationCriterion['owner']>(criterion?.owner ?? 'ia');
  // options só p/ select_single|select_multi — editadas como "valor|rótulo" por linha.
  const initialOptions = Array.isArray((criterion?.config as { options?: unknown })?.options)
    ? ((criterion!.config as { options: Array<{ value?: unknown; label?: unknown }> }).options)
        .map(o => `${o.value ?? ''}${o.label != null && o.label !== o.value ? `|${o.label}` : ''}`)
        .join('\n')
    : '';
  const [optionsText, setOptionsText] = useState(initialOptions);
  const [saving, setSaving] = useState(false);

  const isSelect = criterionType === 'select_single' || criterionType === 'select_multi';

  const parseOptions = () => optionsText
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => {
      const [value, label] = l.split('|').map(s => s.trim());
      return { value: value, label: label || value };
    })
    .filter(o => o.value);

  const handleSave = async () => {
    if (!key.trim() || !label.trim() || saving) return;
    if (isSelect && parseOptions().length === 0) return;
    setSaving(true);
    try {
      await onSave({
        funnelId,
        stageId,
        key: key.trim().toLowerCase().replace(/\s+/g, '_'),
        label: label.trim(),
        criterionType,
        owner,
        config: isSelect ? { options: parseOptions() } : {},
        questionHint: questionHint.trim(),
        isRequired,
      });
    } finally {
      setSaving(false);
    }
  };

  const TYPE_LABELS: Record<QualificationCriterion['criterionType'], string> = {
    boolean: 'Sim/Não',
    threshold: 'Número',
    enum: 'Texto (enum)',
    text: 'Texto livre',
    select_single: 'Lista (única)',
    select_multi: 'Lista (múltipla)',
  };
  const OWNER_LABELS: Record<QualificationCriterion['owner'], string> = {
    ia: 'IA', corretor: 'Corretor', ambos: 'Ambos',
  };

  return (
    <div className="bg-card rounded-xl p-4 mb-3 border border-border">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-foreground">{criterion ? 'Editar Critério' : 'Novo Critério'}</span>
        <button onClick={onCancel} className="p-1 text-muted-foreground active:scale-95"><X size={16} /></button>
      </div>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>Chave (técnica)</label>
            <input value={key} onChange={e => setKey(e.target.value)} disabled={!!criterion} placeholder="renda_compativel" className={`${inputCls} ${criterion ? 'opacity-60' : ''}`} />
          </div>
          <div className="flex items-end pb-1">
            <button
              onClick={() => setIsRequired(v => !v)}
              className={`flex items-center gap-1.5 text-xs font-medium ${isRequired ? 'text-primary' : 'text-muted-foreground'}`}
            >
              {isRequired ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
              {isRequired ? 'Obrigatório' : 'Opcional'}
            </button>
          </div>
        </div>
        <div>
          <label className={labelCls}>Rótulo</label>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Renda compatível com a faixa MCMV" className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>Tipo do campo</label>
            <select value={criterionType} onChange={e => setCriterionType(e.target.value as QualificationCriterion['criterionType'])} className={inputCls}>
              {(Object.keys(TYPE_LABELS) as QualificationCriterion['criterionType'][]).map(t => (
                <option key={t} value={t}>{TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Quem preenche</label>
            <select value={owner} onChange={e => setOwner(e.target.value as QualificationCriterion['owner'])} className={inputCls}>
              {(Object.keys(OWNER_LABELS) as QualificationCriterion['owner'][]).map(o => (
                <option key={o} value={o}>{OWNER_LABELS[o]}</option>
              ))}
            </select>
          </div>
        </div>
        {isSelect && (
          <div>
            <label className={labelCls}>Opções (uma por linha — "valor" ou "valor|rótulo")</label>
            <textarea value={optionsText} onChange={e => setOptionsText(e.target.value)} rows={3} placeholder={'whatsapp|WhatsApp\nligacao|Ligação'} className={`${inputCls} resize-none font-mono text-[11px]`} />
          </div>
        )}
        <div>
          <label className={labelCls}>Dica para a IA avaliar</label>
          <textarea value={questionHint} onChange={e => setQuestionHint(e.target.value)} rows={2} placeholder="Como a IA deve confirmar este critério na conversa, de forma consultiva." className={`${inputCls} resize-none`} />
        </div>
        <button
          onClick={handleSave}
          disabled={!key.trim() || !label.trim() || (isSelect && parseOptions().length === 0) || saving}
          className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold active:scale-[0.98] transition-transform disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          {criterion ? 'Salvar Alterações' : 'Criar Critério'}
        </button>
      </div>
    </div>
  );
};

// ========== MANAGER ==========

const QualificationCriteriaManager = () => {
  const { funnels } = useFunnelsContext();
  const { criteria, loading, addCriterion, updateCriterion, deleteCriterion } = useQualificationCriteriaContext();
  // Form aberto: chave composta funnelId::stageId (criação) ou id do critério (edição).
  const [creatingAt, setCreatingAt] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Só os funis operados pela IA têm critérios de qualificação. O hook de funis
  // não expõe is_ai_funnel; usamos a convenção de id (fun-ia-*) como filtro.
  const aiFunnels = funnels.filter(f => f.id.startsWith('fun-ia'));
  const displayFunnels = aiFunnels.length > 0 ? aiFunnels : funnels;

  const handleDelete = async (c: QualificationCriterion) => {
    if (!confirm(`Excluir o critério "${c.label}"?`)) return;
    await deleteCriterion(c.id);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 size={20} className="animate-spin" />
        <span className="text-xs ml-2">Carregando critérios…</span>
      </div>
    );
  }

  return (
    <div>
      <div className="text-xs text-muted-foreground bg-card/50 border border-border rounded-lg p-3 mb-3">
        Os critérios de qualificação definem o que a IA precisa confirmar na conversa antes de sugerir o avanço do lead à próxima etapa. A avaliação é consultiva (não um questionário). Quando todos os obrigatórios de uma etapa forem satisfeitos, a IA sugere a transição para você aprovar.
      </div>

      {displayFunnels.map(funnel => (
        <div key={funnel.id} className="mb-5">
          <p className="text-sm font-semibold text-foreground mb-2">{funnel.name}</p>
          {funnel.stages.map(stage => {
            const stageCriteria = criteria
              .filter(c => c.funnelId === funnel.id && c.stageId === stage.id)
              .sort((a, b) => a.position - b.position);
            const composeKey = `${funnel.id}::${stage.id}`;
            return (
              <div key={stage.id} className="mb-3 pl-2 border-l-2 border-border">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
                    <ListChecks size={13} className="text-muted-foreground" />
                    {stage.name}
                    {stageCriteria.length > 0 && (
                      <span className="text-[10px] text-muted-foreground">({stageCriteria.length})</span>
                    )}
                  </span>
                  {creatingAt !== composeKey && (
                    <button
                      onClick={() => { setCreatingAt(composeKey); setEditingId(null); }}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-secondary text-foreground text-[11px] font-medium active:scale-95"
                    >
                      <Plus size={12} /> Critério
                    </button>
                  )}
                </div>

                {creatingAt === composeKey && (
                  <CriterionForm
                    funnelId={funnel.id}
                    stageId={stage.id}
                    onSave={async (input) => { await addCriterion(input); setCreatingAt(null); }}
                    onCancel={() => setCreatingAt(null)}
                  />
                )}

                {stageCriteria.length === 0 && creatingAt !== composeKey ? (
                  <p className="text-[11px] text-muted-foreground py-1">Sem critérios nesta etapa.</p>
                ) : (
                  stageCriteria.map(c => (
                    editingId === c.id ? (
                      <CriterionForm
                        key={c.id}
                        criterion={c}
                        funnelId={funnel.id}
                        stageId={stage.id}
                        onSave={async (input) => { await updateCriterion(c.id, input); setEditingId(null); }}
                        onCancel={() => setEditingId(null)}
                      />
                    ) : (
                      <div key={c.id} className="flex items-center gap-2 bg-card rounded-lg p-2.5 mb-1.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">
                            {c.label}
                            <span className={`text-[9px] uppercase tracking-wide ml-1.5 ${c.isRequired ? 'text-primary' : 'text-muted-foreground'}`}>
                              {c.isRequired ? 'obrigatório' : 'opcional'}
                            </span>
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {c.key} · {c.owner} · {c.criterionType}
                          </p>
                        </div>
                        <button
                          onClick={() => updateCriterion(c.id, { isActive: !c.isActive })}
                          className={`p-1 active:scale-95 ${c.isActive ? 'text-primary' : 'text-muted-foreground'}`}
                          title={c.isActive ? 'Ativo' : 'Inativo'}
                        >
                          {c.isActive ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                        </button>
                        <button onClick={() => { setEditingId(c.id); setCreatingAt(null); }} className="p-1.5 text-muted-foreground active:scale-95"><Pencil size={13} /></button>
                        <button onClick={() => handleDelete(c)} className="p-1.5 text-destructive active:scale-95"><Trash2 size={13} /></button>
                      </div>
                    )
                  ))
                )}
              </div>
            );
          })}
        </div>
      ))}

      {displayFunnels.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-6">Nenhum funil cadastrado.</p>
      )}
    </div>
  );
};

export default QualificationCriteriaManager;
