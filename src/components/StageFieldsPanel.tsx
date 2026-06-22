import { useMemo } from 'react';
import { Check, AlertCircle, Bot, Loader2 } from 'lucide-react';
import { useQualificationCriteriaContext, type QualificationCriterion } from '@/hooks/useQualificationCriteria';
import { useDealFieldValues } from '@/hooks/useDealFieldValues';
import { isFilled, isHumanEditable, criterionOptions, type DealFieldValue } from '@/lib/dealFieldValues';

/**
 * Campos da etapa atual do deal (Fase 1.4c).
 * - Mostra os critérios de `stage_qualification_criteria` do funnel+stage do deal.
 * - owner ia: read-only (mostra o que a IA coletou).
 * - owner corretor|ambos: editável pelo humano (select/checkbox/input).
 * - Sinaliza obrigatórios pendentes com a MESMA régua da trava de avanço (1.4b).
 */
const StageFieldsPanel = ({ dealId, funnelId, stageId }: { dealId: string; funnelId: string; stageId: string }) => {
  const { criteria, loading: critLoading } = useQualificationCriteriaContext();
  const { values, loading: valLoading, setValue } = useDealFieldValues(dealId);

  const stageCriteria = useMemo(
    () => criteria
      .filter(c => c.funnelId === funnelId && c.stageId === stageId && c.isActive)
      .sort((a, b) => a.position - b.position),
    [criteria, funnelId, stageId],
  );

  const valueByKey = useMemo(() => {
    const m = new Map<string, DealFieldValue>();
    for (const v of values) m.set(v.fieldKey, v);
    return m;
  }, [values]);

  if (critLoading || valLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
        <Loader2 size={14} className="animate-spin" /> Carregando campos…
      </div>
    );
  }
  if (stageCriteria.length === 0) return null;

  const missingRequired = stageCriteria.filter(
    c => c.isRequired && !isFilled(valueByKey.get(c.key)?.value),
  ).length;

  return (
    <div className="bg-secondary rounded-xl p-3 mb-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-muted-foreground">Campos da etapa</p>
        {missingRequired > 0 ? (
          <span className="text-[10px] font-medium text-amber-500 flex items-center gap-1">
            <AlertCircle size={11} /> {missingRequired} obrigatório{missingRequired > 1 ? 's' : ''} pendente{missingRequired > 1 ? 's' : ''}
          </span>
        ) : (
          <span className="text-[10px] font-medium text-emerald-500 flex items-center gap-1">
            <Check size={11} /> completo
          </span>
        )}
      </div>
      <div className="space-y-2.5">
        {stageCriteria.map(c => (
          <FieldRow
            key={c.id}
            criterion={c}
            value={valueByKey.get(c.key)?.value}
            source={valueByKey.get(c.key)?.source}
            onChange={(v) => setValue(c.key, v, c.id)}
          />
        ))}
      </div>
    </div>
  );
};

const labelCls = 'text-[11px] font-medium text-foreground flex items-center gap-1.5';
const fieldCls = 'w-full bg-card rounded-lg px-2.5 py-1.5 text-xs text-foreground outline-none border border-border focus:border-primary/50';

const FieldRow = ({ criterion, value, source, onChange }: {
  criterion: QualificationCriterion;
  value: unknown;
  source?: DealFieldValue['source'];
  onChange: (value: unknown) => void;
}) => {
  const editable = isHumanEditable(criterion);
  const filled = isFilled(value);
  const opts = criterionOptions(criterion);

  const pending = criterion.isRequired && !filled;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className={labelCls}>
          {criterion.label}
          {criterion.isRequired && <span className="text-amber-500">*</span>}
          {criterion.owner === 'ia' && <Bot size={11} className="text-muted-foreground" />}
        </span>
        {source && <span className="text-[9px] uppercase tracking-wide text-muted-foreground">{source}</span>}
      </div>

      {/* owner=ia → read-only */}
      {!editable ? (
        <div className={`text-xs px-2.5 py-1.5 rounded-lg border ${pending ? 'border-amber-500/40 text-muted-foreground' : 'border-border text-foreground'} bg-card/50`}>
          {renderReadOnly(criterion, value)}
        </div>
      ) : criterion.criterionType === 'boolean' ? (
        <button
          type="button"
          onClick={() => onChange(value === true ? false : true)}
          className={`flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-lg border ${value === true ? 'border-primary/50 text-primary' : 'border-border text-muted-foreground'} bg-card`}
        >
          <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${value === true ? 'bg-primary border-primary' : 'border-border'}`}>
            {value === true && <Check size={10} className="text-primary-foreground" />}
          </span>
          {value === true ? 'Sim' : 'Não'}
        </button>
      ) : criterion.criterionType === 'select_single' ? (
        <select
          className={fieldCls}
          value={typeof value === 'string' ? value : ''}
          onChange={e => onChange(e.target.value || null)}
        >
          <option value="">Selecione…</option>
          {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : criterion.criterionType === 'select_multi' ? (
        <div className="flex flex-wrap gap-1.5">
          {opts.map(o => {
            const arr = Array.isArray(value) ? (value as string[]) : [];
            const on = arr.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => onChange(on ? arr.filter(x => x !== o.value) : [...arr, o.value])}
                className={`text-[11px] px-2 py-1 rounded-lg border ${on ? 'border-primary/50 text-primary bg-primary/10' : 'border-border text-muted-foreground bg-card'}`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      ) : criterion.criterionType === 'threshold' ? (
        <input
          type="number"
          className={fieldCls}
          defaultValue={typeof value === 'number' ? value : (value != null ? String(value) : '')}
          onBlur={e => {
            const n = e.target.value.trim() === '' ? null : Number(e.target.value);
            onChange(Number.isFinite(n as number) ? n : null);
          }}
          placeholder="0"
        />
      ) : (
        // text / enum
        <input
          type="text"
          className={fieldCls}
          defaultValue={typeof value === 'string' ? value : (value != null ? String(value) : '')}
          onBlur={e => onChange(e.target.value.trim() === '' ? null : e.target.value)}
          placeholder={criterion.questionHint || 'Digite…'}
        />
      )}
    </div>
  );
};

function renderReadOnly(c: QualificationCriterion, value: unknown): string {
  if (!isFilled(value)) return '—';
  if (c.criterionType === 'boolean') return value === true ? 'Sim' : 'Não';
  if (Array.isArray(value)) {
    const opts = criterionOptions(c);
    return value.map(v => opts.find(o => o.value === String(v))?.label ?? String(v)).join(', ');
  }
  if (c.criterionType === 'select_single') {
    const opts = criterionOptions(c);
    return opts.find(o => o.value === String(value))?.label ?? String(value);
  }
  return String(value);
}

export default StageFieldsPanel;
