/**
 * Sprint 24 — Heatmap funnel × status no IndicadoresPage.
 *
 * Visualiza a "saúde composicional" de cada funil cruzando:
 *   - Linhas: cada funil da org
 *   - Colunas: status do deal (open / won / lost) + IA fallback
 *
 * Cores variam por intensidade (contagem absoluta), tooltip mostra
 * a taxa de conversão (won / (won + lost)) e a quantidade de fallbacks
 * IA do período (logs com outcome ∈ { fallback, abandoned }).
 *
 * Componente puro de UI: recebe deals + funnels + logs já carregados.
 */

import { useMemo } from 'react';
import { Bot, TrendingUp } from 'lucide-react';
import type { Deal } from '@/data/mockData';
import type { Funnel } from '@/data/mockData';
import type { IADecisionLog } from '@/hooks/useIADecisionLogs';

interface Props {
  deals: Deal[];
  funnels: Funnel[];
  logs: IADecisionLog[];
}

const FALLBACK_OUTCOMES = new Set(['fallback', 'abandoned']);

export const FunnelStatusHeatmap = ({ deals, funnels, logs }: Props) => {
  const rows = useMemo(() => {
    return funnels.map(f => {
      const fDeals = deals.filter(d => d.funnelId === f.id);
      const lastStageId = f.stages[f.stages.length - 1]?.id;
      const won = fDeals.filter(d => d.stage === f.stages[f.stages.length - 1]?.name).length;
      const lost = fDeals.filter(d => (d as unknown as { status?: string }).status === 'lost').length;
      const open = fDeals.length - won - lost;
      const fallbacks = logs.filter(l => l.funnel_id === f.id && l.outcome && FALLBACK_OUTCOMES.has(l.outcome)).length;
      const conversion = won + lost > 0 ? Math.round((won / (won + lost)) * 100) : 0;
      return { funnel: f, open: Math.max(0, open), won, lost, fallbacks, conversion, lastStageId };
    });
  }, [funnels, deals, logs]);

  const max = useMemo(() => {
    let m = 1;
    for (const r of rows) {
      m = Math.max(m, r.open, r.won, r.lost, r.fallbacks);
    }
    return m;
  }, [rows]);

  const intensity = (n: number) => {
    if (n === 0) return 0;
    return Math.max(0.12, n / max);
  };

  const cellStyle = (n: number, hue: string) => ({
    backgroundColor: `hsl(${hue} / ${intensity(n).toFixed(2)})`,
  });

  if (rows.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground italic text-center py-3">
        Cadastre funis para ver a matriz.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_repeat(4,minmax(48px,1fr))] gap-1 text-[10px]">
        <div className="text-muted-foreground uppercase tracking-wider font-semibold">Funil</div>
        <div className="text-center text-primary font-semibold">Aberto</div>
        <div className="text-center text-success font-semibold">Ganho</div>
        <div className="text-center text-destructive font-semibold">Perdido</div>
        <div className="text-center text-warning font-semibold flex items-center justify-center gap-0.5">
          <Bot size={9} /> Fallback
        </div>

        {rows.map(r => (
          <RowFragment key={r.funnel.id} row={r} cellStyle={cellStyle} />
        ))}
      </div>

      <div className="bg-secondary/40 border border-border rounded-md px-2 py-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
        <TrendingUp size={11} className="text-primary shrink-0" />
        Intensidade da cor reflete a contagem relativa ao maior valor da matriz.
        Conversão = ganho ÷ (ganho + perdido).
      </div>
    </div>
  );
};

const RowFragment = ({
  row, cellStyle,
}: {
  row: ReturnType<typeof useMemo<unknown>> extends infer _ ? {
    funnel: Funnel; open: number; won: number; lost: number; fallbacks: number; conversion: number;
  } : never;
  cellStyle: (n: number, hue: string) => { backgroundColor: string };
}) => {
  return (
    <>
      <div className="text-foreground text-[11px] font-medium truncate flex items-center" title={row.funnel.name}>
        {row.funnel.name}
        <span className="ml-1 text-[9px] text-muted-foreground">· {row.conversion}%</span>
      </div>
      <Cell value={row.open} style={cellStyle(row.open, '210 90% 60%')} />
      <Cell value={row.won} style={cellStyle(row.won, '145 63% 49%')} />
      <Cell value={row.lost} style={cellStyle(row.lost, '0 84% 60%')} />
      <Cell value={row.fallbacks} style={cellStyle(row.fallbacks, '38 92% 50%')} />
    </>
  );
};

const Cell = ({ value, style }: { value: number; style: { backgroundColor: string } }) => (
  <div
    className="text-center py-1.5 rounded border border-border/40 text-[11px] font-mono text-foreground"
    style={style}
  >
    {value}
  </div>
);
