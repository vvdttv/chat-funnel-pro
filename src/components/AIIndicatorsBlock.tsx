import { useMemo, useState } from 'react';
import { Sparkles, Send, RotateCcw, Loader2, AlertCircle, Mic } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useDealsContext } from '@/hooks/useDeals';
import { useFunnelsContext } from '@/hooks/useFunnels';
import { formatCurrency } from '@/data/mockData';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import { useToast } from '@/hooks/use-toast';

type ChartType = 'kpi' | 'bar' | 'line' | 'pie' | 'table';
type Unit = 'currency' | 'count' | 'percent' | 'days';

interface KPI { label: string; value: number; unit?: Unit }
interface DataPoint { label: string; value: number }

interface ChartSpec {
  type: ChartType;
  title: string;
  unit?: Unit;
  kpis?: KPI[];
  data?: DataPoint[];
  columns?: string[];
  rows?: string[][];
}

interface AIResponse {
  summary: string;
  chart_spec: ChartSpec;
}

interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  result?: AIResponse;
}

const PIE_COLORS = [
  'hsl(var(--primary))',
  'hsl(38, 92%, 50%)',
  'hsl(0, 84%, 60%)',
  'hsl(270, 60%, 70%)',
  'hsl(200, 80%, 60%)',
  'hsl(145, 63%, 49%)',
  'hsl(310, 60%, 65%)',
  'hsl(0, 0%, 50%)',
];

function formatValue(value: number, unit?: Unit): string {
  if (unit === 'currency') return formatCurrency(value);
  if (unit === 'percent') return `${value.toFixed(1)}%`;
  if (unit === 'days') return `${value.toFixed(1)} dias`;
  return new Intl.NumberFormat('pt-BR').format(Math.round(value));
}

const ChartRenderer = ({ spec }: { spec: ChartSpec }) => {
  const u = spec.unit;

  if (spec.type === 'kpi' && spec.kpis?.length) {
    return (
      <div className="grid grid-cols-2 gap-2">
        {spec.kpis.slice(0, 4).map((k, i) => (
          <div key={i} className="bg-secondary rounded-lg p-3">
            <p className="text-[10px] text-muted-foreground mb-1 truncate">{k.label}</p>
            <p className="text-base font-bold text-primary">{formatValue(k.value, k.unit ?? u)}</p>
          </div>
        ))}
      </div>
    );
  }

  if (spec.type === 'bar' && spec.data?.length) {
    return (
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={spec.data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => formatValue(v, u)} width={60} />
            <Tooltip
              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 12 }}
              formatter={(v: number) => formatValue(v, u)}
            />
            <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (spec.type === 'line' && spec.data?.length) {
    return (
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={spec.data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => formatValue(v, u)} width={60} />
            <Tooltip
              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 12 }}
              formatter={(v: number) => formatValue(v, u)}
            />
            <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (spec.type === 'pie' && spec.data?.length) {
    return (
      <>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={spec.data} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" stroke="none">
                {spec.data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 12 }}
                formatter={(v: number) => formatValue(v, u)}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-1 mt-2">
          {spec.data.map((d, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
              <span className="text-muted-foreground flex-1 truncate">{d.label}</span>
              <span className="text-foreground font-medium">{formatValue(d.value, u)}</span>
            </div>
          ))}
        </div>
      </>
    );
  }

  if (spec.type === 'table' && spec.columns?.length && spec.rows?.length) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              {spec.columns.map((c, i) => (
                <th key={i} className="text-left py-2 px-2 font-semibold text-muted-foreground">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {spec.rows.slice(0, 10).map((row, ri) => (
              <tr key={ri} className="border-b border-border/50">
                {row.slice(0, spec.columns!.length).map((cell, ci) => (
                  <td key={ci} className="py-2 px-2 text-foreground">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return <p className="text-xs text-muted-foreground">Sem dados para exibir.</p>;
};

export const AIIndicatorsBlock = () => {
  const { deals } = useDealsContext();
  const { funnels } = useFunnelsContext();
  const { toast } = useToast();
  const [question, setQuestion] = useState('');
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [loading, setLoading] = useState(false);

  const snapshot = useMemo(() => {
    const totals = {
      deal_count: deals.length,
      open_count: deals.filter(d => d.status === 'open' || !d.status).length,
      won_count: deals.filter(d => d.status === 'won').length,
      lost_count: deals.filter(d => d.status === 'lost').length,
      total_value: deals.reduce((s, d) => s + d.value, 0),
      won_value: deals.filter(d => d.status === 'won').reduce((s, d) => s + d.value, 0),
      forecast_value: deals.reduce((s, d) => s + d.value * (d.probability / 100), 0),
      avg_ticket: deals.length > 0 ? deals.reduce((s, d) => s + d.value, 0) / deals.length : 0,
    };

    const by_funnel = funnels.map(f => {
      const fd = deals.filter(d => d.funnelId === f.id);
      const by_stage = f.stages.map(s => {
        const sd = fd.filter(d => d.stage === s.name);
        return { stage_name: s.name, deal_count: sd.length, total_value: sd.reduce((sum, d) => sum + d.value, 0) };
      });
      return {
        funnel_id: f.id,
        funnel_name: f.name,
        deal_count: fd.length,
        total_value: fd.reduce((s, d) => s + d.value, 0),
        by_stage,
      };
    });

    const statusMap = new Map<string, { deal_count: number; total_value: number }>();
    for (const d of deals) {
      const key = d.status || 'open';
      const cur = statusMap.get(key) || { deal_count: 0, total_value: 0 };
      cur.deal_count += 1;
      cur.total_value += d.value;
      statusMap.set(key, cur);
    }
    const by_status = Array.from(statusMap.entries()).map(([status, v]) => ({ status, ...v }));

    const lossMap = new Map<string, number>();
    for (const d of deals) {
      if (d.status === 'lost') {
        const r = (d as any).statusReason || 'Não informado';
        lossMap.set(r, (lossMap.get(r) || 0) + 1);
      }
    }
    const by_loss_reason = Array.from(lossMap.entries()).map(([reason, deal_count]) => ({ reason, deal_count }));

    const assigneeMap = new Map<string, { deal_count: number; total_value: number }>();
    for (const d of deals) {
      const a = (d as any).assignedTo || 'sem_dono';
      const cur = assigneeMap.get(a) || { deal_count: 0, total_value: 0 };
      cur.deal_count += 1;
      cur.total_value += d.value;
      assigneeMap.set(a, cur);
    }
    const by_assignee = Array.from(assigneeMap.entries()).map(([assignee, v]) => ({ assignee, ...v }));

    return {
      totals,
      by_funnel,
      by_status,
      by_loss_reason,
      by_assignee,
      recent_activities: { total: 0, done: 0, pending: 0, overdue: 0 },
    };
  }, [deals, funnels]);

  const ask = async (q: string) => {
    if (!q.trim() || loading) return;
    setLoading(true);
    const newTurn: ConversationTurn = { role: 'user', content: q };
    setConversation(prev => [...prev, newTurn]);
    setQuestion('');
    try {
      const history = conversation
        .filter(t => t.role === 'assistant' && t.result)
        .map(t => ({ role: 'assistant' as const, content: t.result!.summary }));
      const { data, error } = await supabase.functions.invoke('analyze-indicators', {
        body: { question: q, snapshot, history },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const result = data as AIResponse;
      setConversation(prev => [...prev, { role: 'assistant', content: result.summary, result }]);
    } catch (e: any) {
      toast({
        title: 'Erro ao consultar a IA',
        description: e?.message || 'Tente novamente em instantes.',
        variant: 'destructive',
      });
      setConversation(prev => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setConversation([]);
    setQuestion('');
  };

  const hasConversation = conversation.length > 0;
  const lastResult = [...conversation].reverse().find(t => t.result)?.result;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-[hsl(270,60%,70%)]" />
          <span className="text-xs font-semibold text-foreground">O que você gostaria de saber?</span>
        </div>
        {hasConversation && (
          <button
            onClick={reset}
            className="flex items-center gap-1 text-[10px] text-muted-foreground active:text-foreground transition-colors"
            title="Recomeçar"
          >
            <RotateCcw size={11} /> Recomeçar
          </button>
        )}
      </div>

      {/* Resultado mais recente em destaque */}
      {lastResult && (
        <div className="bg-secondary/50 rounded-lg p-3 space-y-3 border border-border/50">
          <p className="text-xs font-semibold text-foreground">{lastResult.chart_spec.title}</p>
          <ChartRenderer spec={lastResult.chart_spec} />
          <p className="text-xs text-muted-foreground leading-relaxed">{lastResult.summary}</p>
        </div>
      )}

      {/* Histórico de turnos anteriores (compacto) */}
      {conversation.length > 2 && (
        <div className="space-y-1.5">
          {conversation.slice(0, -2).map((t, i) => (
            <div
              key={i}
              className={`text-[10px] px-2 py-1 rounded ${
                t.role === 'user' ? 'bg-primary/10 text-foreground' : 'bg-secondary/50 text-muted-foreground'
              }`}
            >
              {t.role === 'user' ? '🗨 ' : '✨ '}{t.content}
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') ask(question); }}
          placeholder={hasConversation ? 'Refinar (ex.: agrupe por mês)…' : 'Ex.: Qual a conversão por etapa?'}
          disabled={loading}
          className="flex-1 bg-secondary text-foreground text-xs rounded-lg px-3 py-2 outline-none placeholder:text-muted-foreground disabled:opacity-50"
        />
        <button
          type="button"
          disabled
          title="Áudio em breve"
          className="w-8 h-8 rounded-lg bg-secondary text-muted-foreground/50 flex items-center justify-center cursor-not-allowed"
        >
          <Mic size={14} />
        </button>
        <button
          onClick={() => ask(question)}
          disabled={loading || !question.trim()}
          className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50 active:scale-95 transition-transform"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </div>

      {/* Sugestões iniciais */}
      {!hasConversation && !loading && (
        <div className="flex flex-wrap gap-1.5">
          {[
            'Conversão por etapa',
            'Receita prevista por funil',
            'Top motivos de perda',
            'Distribuição por status',
          ].map((s) => (
            <button
              key={s}
              onClick={() => ask(s)}
              className="text-[10px] px-2 py-1 bg-secondary text-muted-foreground rounded-full active:bg-secondary/70"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {!hasConversation && (
        <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground/70">
          <AlertCircle size={10} className="mt-0.5 shrink-0" />
          <span>Os dados são processados em tempo real a partir da sua operação. A IA usa apenas os totais agregados, sem expor dados de leads individuais.</span>
        </div>
      )}
    </div>
  );
};
