import { formatCurrency } from '@/data/mockData';
import { TrendingUp, Users, Target, Clock, ChevronDown, ChevronUp, Bot, Layers, Download, CheckCircle2, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useFunnelsContext } from '@/hooks/useFunnels';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { IADecisionLogsPanel } from '@/components/IADecisionLogsPanel';
import { FunnelStatusHeatmap } from '@/components/FunnelStatusHeatmap';
import { useIADecisionLogs } from '@/hooks/useIADecisionLogs';
import { AIIndicatorsBlock } from '@/components/AIIndicatorsBlock';
import { Sparkles } from 'lucide-react';
import { useReports, type Granularity } from '@/hooks/use-reports';
import { exportToCsv } from '@/lib/export-csv';
import { useDealsContext } from '@/hooks/useDeals';

const PERIOD_OPTIONS: { label: string; days: number; granularity: Granularity }[] = [
  { label: '7 dias', days: 7, granularity: 'day' },
  { label: '30 dias', days: 30, granularity: 'day' },
  { label: '90 dias', days: 90, granularity: 'week' },
  { label: '12 meses', days: 365, granularity: 'month' },
];

const LOSS_COLORS = ['hsl(0,84%,60%)', 'hsl(38,92%,50%)', 'hsl(145,63%,49%)', 'hsl(217,91%,60%)', 'hsl(0,0%,40%)'];

const IndicadoresPage = () => {
  const [openSection, setOpenSection] = useState<string | null>('ia_ask');
  const [periodIdx, setPeriodIdx] = useState(1); // 30 dias
  const { funnels } = useFunnelsContext();
  const { deals } = useDealsContext();
  const { logs: iaLogs } = useIADecisionLogs({ sinceDays: 30, limit: 1000 });

  const period = useMemo(() => {
    const opt = PERIOD_OPTIONS[periodIdx];
    const to = new Date();
    const from = new Date(to.getTime() - opt.days * 24 * 60 * 60 * 1000);
    return { from, to, granularity: opt.granularity, funnelId: null };
  }, [periodIdx]);

  const { summary, stages, timeseries, lossReasons, loading, error } = useReports(period);

  const toggleSection = (s: string) => setOpenSection(openSection === s ? null : s);

  const periodLabel = PERIOD_OPTIONS[periodIdx].label;

  const kpis = [
    {
      label: 'Total Leads',
      value: summary ? String(summary.total_leads) : '—',
      icon: Users,
      color: 'text-primary',
    },
    {
      label: 'Conversão',
      value: summary ? `${summary.conversion_rate}%` : '—',
      icon: Target,
      color: 'text-primary',
    },
    {
      label: 'Ticket Médio',
      value: summary ? formatCurrency(summary.avg_ticket) : '—',
      icon: TrendingUp,
      color: 'text-primary',
    },
    {
      label: 'Ciclo Médio',
      value: summary ? `${summary.avg_cycle_days} dias` : '—',
      icon: Clock,
      color: 'text-muted-foreground',
    },
  ];

  const lossChartData = lossReasons.map((r, i) => ({
    name: r.reason,
    value: r.loss_count,
    pct: r.pct,
    color: LOSS_COLORS[i % LOSS_COLORS.length],
  }));

  const handleExportSummary = () => {
    if (!summary) return;
    const rows = [
      { metric: 'Total de leads', value: summary.total_leads },
      { metric: 'Ganhos', value: summary.won_count },
      { metric: 'Perdidos', value: summary.lost_count },
      { metric: 'Em aberto', value: summary.open_count },
      { metric: 'Receita ganha', value: summary.won_value },
      { metric: 'Valor total (pipeline)', value: summary.total_value },
      { metric: 'Ticket médio', value: summary.avg_ticket },
      { metric: 'Taxa de conversão (%)', value: summary.conversion_rate },
      { metric: 'Ciclo médio (dias)', value: summary.avg_cycle_days },
    ];
    exportToCsv(`relatorio-funil-${periodLabel.replace(/\s/g, '')}`, rows, [
      { key: 'metric', header: 'Métrica' },
      { key: 'value', header: 'Valor' },
    ]);
  };

  const handleExportStages = () => {
    exportToCsv(`relatorio-etapas-${periodLabel.replace(/\s/g, '')}`, stages, [
      { key: 'stage_name', header: 'Etapa' },
      { key: 'entered_count', header: 'Entradas' },
      { key: 'conversion_to_next', header: 'Conversão p/ próxima (%)' },
      { key: 'avg_days_in_stage', header: 'Dias médios na etapa' },
    ]);
  };

  const handleExportTimeseries = () => {
    exportToCsv(`relatorio-evolucao-${periodLabel.replace(/\s/g, '')}`, timeseries, [
      { key: 'bucket', header: 'Período' },
      { key: 'new_leads', header: 'Novos leads' },
      { key: 'won_count', header: 'Ganhos' },
      { key: 'lost_count', header: 'Perdidos' },
      { key: 'won_value', header: 'Receita ganha' },
    ]);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto scrollbar-hide">
      <div className="px-4 lg:px-8 pt-4 pb-2 lg:max-w-7xl lg:mx-auto w-full">

        {/* Period selector */}
        <div className="flex items-center justify-between mb-4 gap-2">
          <div className="flex gap-1 bg-secondary rounded-lg p-1">
            {PERIOD_OPTIONS.map((opt, i) => (
              <button
                key={opt.label}
                onClick={() => setPeriodIdx(i)}
                className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                  periodIdx === i ? 'bg-card text-foreground font-semibold shadow-sm' : 'text-muted-foreground'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={handleExportSummary}
            disabled={!summary}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50"
          >
            <Download size={14} />
            Exportar CSV
          </button>
        </div>

        {error && (
          <div className="bg-destructive/10 text-destructive text-xs rounded-lg p-3 mb-4">
            {error}
          </div>
        )}

        {/* Forecast / receita card */}
        <div className="bg-card rounded-2xl p-5 mb-4">
          <p className="text-xs text-muted-foreground mb-1">Receita Ganha ({periodLabel})</p>
          <p className="text-2xl font-bold text-primary">
            {summary ? formatCurrency(summary.won_value) : '—'}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{
                  width: `${summary && summary.total_value > 0
                    ? Math.min(100, (summary.won_value / summary.total_value) * 100)
                    : 0}%`,
                }}
              />
            </div>
            <span className="text-xs text-muted-foreground">
              {summary && summary.total_value > 0
                ? Math.round((summary.won_value / summary.total_value) * 100)
                : 0}%
            </span>
          </div>
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 size={14} className="text-primary" />
              <div>
                <p className="text-[10px] text-muted-foreground">Ganhos</p>
                <p className="text-sm font-bold text-primary">{summary?.won_count ?? '—'}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <XCircle size={14} className="text-destructive" />
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground">Perdidos</p>
                <p className="text-sm font-bold text-foreground">{summary?.lost_count ?? '—'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* KPI Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {kpis.map((kpi, i) => (
            <div key={i} className="bg-card rounded-xl p-4">
              <kpi.icon size={16} className={`${kpi.color} mb-2`} />
              <p className="text-lg font-bold text-foreground">{loading ? '…' : kpi.value}</p>
              <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
            </div>
          ))}
        </div>

        {/* Accordion Sections */}
        <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0 pb-24">
          {/* IA — O que você gostaria de saber? */}
          <div className="bg-card rounded-xl overflow-hidden lg:col-span-2">
            <button onClick={() => toggleSection('ia_ask')} className="w-full flex items-center justify-between p-4 active:bg-secondary transition-colors">
              <span className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Sparkles size={14} className="text-[hsl(270,60%,70%)]" />
                Pergunte à IA
              </span>
              {openSection === 'ia_ask' ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
            </button>
            {openSection === 'ia_ask' && (
              <div className="px-4 pb-4">
                <AIIndicatorsBlock />
              </div>
            )}
          </div>

          {/* Evolução (série temporal) */}
          <div className="bg-card rounded-xl overflow-hidden lg:col-span-2">
            <button onClick={() => toggleSection('evolucao')} className="w-full flex items-center justify-between p-4 active:bg-secondary transition-colors">
              <span className="text-sm font-semibold text-foreground">Evolução no período</span>
              <div className="flex items-center gap-2">
                <Download
                  size={14}
                  className="text-muted-foreground hover:text-foreground"
                  onClick={(e) => { e.stopPropagation(); handleExportTimeseries(); }}
                />
                {openSection === 'evolucao' ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
              </div>
            </button>
            {openSection === 'evolucao' && (
              <div className="px-4 pb-4">
                {timeseries.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-8 text-center">Sem dados no período.</p>
                ) : (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={timeseries} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,90%)" vertical={false} />
                        <XAxis dataKey="bucket" tick={{ fontSize: 10 }} tickLine={false} />
                        <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="new_leads" name="Novos" fill="hsl(217,91%,60%)" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="won_count" name="Ganhos" fill="hsl(145,63%,49%)" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="lost_count" name="Perdidos" fill="hsl(0,84%,60%)" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Funnel Breakdown — por etapa (dados reais) */}
          <div className="bg-card rounded-xl overflow-hidden">
            <button onClick={() => toggleSection('funnel')} className="w-full flex items-center justify-between p-4 active:bg-secondary transition-colors">
              <span className="text-sm font-semibold text-foreground">Conversão por Etapa</span>
              <div className="flex items-center gap-2">
                <Download
                  size={14}
                  className="text-muted-foreground hover:text-foreground"
                  onClick={(e) => { e.stopPropagation(); handleExportStages(); }}
                />
                {openSection === 'funnel' ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
              </div>
            </button>
            {openSection === 'funnel' && (
              <div className="px-4 pb-4 space-y-1.5">
                {stages.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">Sem movimentação no período.</p>
                ) : (
                  stages.map((stage) => {
                    const maxEntered = Math.max(...stages.map((s) => s.entered_count), 1);
                    const width = (stage.entered_count / maxEntered) * 100;
                    const atRisk = stage.avg_days_in_stage > 3;
                    return (
                      <div key={stage.stage_id}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-muted-foreground truncate max-w-[150px]">{stage.stage_name}</span>
                          <span className="text-foreground font-medium">
                            {stage.entered_count} · {stage.conversion_to_next}%
                          </span>
                        </div>
                        <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${atRisk ? 'bg-red-400' : 'bg-primary'}`}
                            style={{ width: `${Math.max(width, stage.entered_count > 0 ? 5 : 0)}%` }}
                          />
                        </div>
                        <p className={`text-[10px] mt-0.5 ${atRisk ? 'text-red-500' : 'text-muted-foreground'}`}>
                          {stage.avg_days_in_stage} dias médios
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Loss Reasons (dados reais) */}
          <div className="bg-card rounded-xl overflow-hidden">
            <button onClick={() => toggleSection('loss')} className="w-full flex items-center justify-between p-4 active:bg-secondary transition-colors">
              <span className="text-sm font-semibold text-foreground">Motivos de Perda</span>
              {openSection === 'loss' ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
            </button>
            {openSection === 'loss' && (
              <div className="px-4 pb-4">
                {lossChartData.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-8 text-center">Nenhuma perda registrada no período.</p>
                ) : (
                  <>
                    <div className="h-40 mb-3">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={lossChartData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" stroke="none">
                            {lossChartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                          </Pie>
                          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-1.5">
                      {lossChartData.map((item, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="text-muted-foreground flex-1 truncate">{item.name}</span>
                          <span className="text-foreground font-medium">{item.value} ({item.pct}%)</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Auditoria da IA */}
          <div className="bg-card rounded-xl overflow-hidden">
            <button onClick={() => toggleSection('ia')} className="w-full flex items-center justify-between p-4 active:bg-secondary transition-colors">
              <span className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Bot size={14} className="text-[hsl(270,60%,70%)]" />
                Decisões da IA
              </span>
              {openSection === 'ia' ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
            </button>
            {openSection === 'ia' && (
              <div className="px-4 pb-4">
                <IADecisionLogsPanel />
              </div>
            )}
          </div>

          {/* Saúde composicional (heatmap funil × status) */}
          <div className="bg-card rounded-xl overflow-hidden">
            <button onClick={() => toggleSection('composicional')} className="w-full flex items-center justify-between p-4 active:bg-secondary transition-colors">
              <span className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Layers size={14} className="text-primary" />
                Saúde composicional
              </span>
              {openSection === 'composicional' ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
            </button>
            {openSection === 'composicional' && (
              <div className="px-4 pb-4">
                <FunnelStatusHeatmap deals={deals} funnels={funnels} logs={iaLogs} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default IndicadoresPage;
