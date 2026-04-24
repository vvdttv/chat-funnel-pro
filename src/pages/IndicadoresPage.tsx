import { formatCurrency } from '@/data/mockData';
import { useDealsContext } from '@/hooks/useDeals';
import { TrendingUp, Users, Target, Clock, ChevronDown, ChevronUp, Bot, Layers } from 'lucide-react';
import { useState } from 'react';
import { useFunnelsContext } from '@/hooks/useFunnels';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { IADecisionLogsPanel } from '@/components/IADecisionLogsPanel';
import { FunnelStatusHeatmap } from '@/components/FunnelStatusHeatmap';
import { useIADecisionLogs } from '@/hooks/useIADecisionLogs';
import { AIIndicatorsBlock } from '@/components/AIIndicatorsBlock';
import { Sparkles } from 'lucide-react';

const lossData = [
  { name: 'Crédito Reprovado', value: 40, color: 'hsl(0, 84%, 60%)' },
  { name: 'Preço', value: 30, color: 'hsl(38, 92%, 50%)' },
  { name: 'Concorrência', value: 20, color: 'hsl(145, 63%, 49%)' },
  { name: 'Outros', value: 10, color: 'hsl(0, 0%, 40%)' },
];

const IndicadoresPage = () => {
  const [openSection, setOpenSection] = useState<string | null>('ia_ask');
  const { funnels } = useFunnelsContext();
  const { deals } = useDealsContext();
  const { logs: iaLogs } = useIADecisionLogs({ sinceDays: 30, limit: 1000 });

  const totalDeals = deals.length;
  const receitaPrevista = deals.reduce((sum, d) => sum + d.value * (d.probability / 100), 0);
  // "Ganha" = deals in last stage of their funnel
  const receitaGanha = deals.filter(d => {
    const funnel = funnels.find(f => f.id === d.funnelId);
    if (!funnel) return false;
    return d.stage === funnel.stages[funnel.stages.length - 1].name;
  }).reduce((sum, d) => sum + d.value, 0);
  const ticketMedio = totalDeals > 0 ? deals.reduce((sum, d) => sum + d.value, 0) / totalDeals : 0;

  const toggleSection = (s: string) => setOpenSection(openSection === s ? null : s);

  return (
    <div className="flex flex-col h-full overflow-y-auto scrollbar-hide pb-16">
      <div className="px-4 lg:px-8 pt-4 pb-2 lg:max-w-7xl lg:mx-auto w-full">

        {/* Forecast Card */}
        <div className="bg-card rounded-2xl p-5 mb-4">
          <p className="text-xs text-muted-foreground mb-1">Previsão de Receita</p>
          <p className="text-2xl font-bold text-primary">{formatCurrency(receitaPrevista)}</p>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: `${receitaPrevista > 0 ? Math.min(100, (receitaGanha / receitaPrevista) * 100) : 0}%` }} />
            </div>
            <span className="text-xs text-muted-foreground">{receitaPrevista > 0 ? Math.round((receitaGanha / receitaPrevista) * 100) : 0}%</span>
          </div>
          <div className="flex items-center justify-between mt-3">
            <div>
              <p className="text-[10px] text-muted-foreground">Ganha</p>
              <p className="text-sm font-bold text-primary">{formatCurrency(receitaGanha)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground">Meta</p>
              <p className="text-sm font-bold text-foreground">{formatCurrency(receitaPrevista)}</p>
            </div>
          </div>
        </div>

        {/* KPI Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {[
            { label: 'Total Leads', value: '8', icon: Users, color: 'text-primary' },
            { label: 'Conversão', value: '15.4%', icon: Target, color: 'text-primary' },
            { label: 'Ticket Médio', value: formatCurrency(ticketMedio), icon: TrendingUp, color: 'text-primary' },
            { label: 'Ciclo Médio', value: '23 dias', icon: Clock, color: 'text-muted-foreground' },
          ].map((kpi, i) => (
            <div key={i} className="bg-card rounded-xl p-4">
              <kpi.icon size={16} className={`${kpi.color} mb-2`} />
              <p className="text-lg font-bold text-foreground">{kpi.value}</p>
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

          {/* Funnel Breakdown — per funnel */}
          <div className="bg-card rounded-xl overflow-hidden">
            <button onClick={() => toggleSection('funnel')} className="w-full flex items-center justify-between p-4 active:bg-secondary transition-colors">
              <span className="text-sm font-semibold text-foreground">Funis de Vendas</span>
              {openSection === 'funnel' ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
            </button>
            {openSection === 'funnel' && (
              <div className="px-4 pb-4 space-y-4">
                {funnels.map(funnel => {
                  const funnelDeals = deals.filter(d => d.funnelId === funnel.id);
                  return (
                    <div key={funnel.id}>
                      <p className="text-xs font-semibold text-foreground mb-2">{funnel.name}</p>
                      <div className="space-y-1.5">
                        {funnel.stages.map(stage => {
                          const stageDeals = funnelDeals.filter(d => d.stage === stage.name);
                          const stageValue = stageDeals.reduce((s, d) => s + d.value, 0);
                          const width = funnelDeals.length > 0 ? (stageDeals.length / funnelDeals.length) * 100 : 0;
                          return (
                            <div key={stage.name}>
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="text-muted-foreground">{stage.name}</span>
                                <span className="text-foreground font-medium">{stageDeals.length} · {formatCurrency(stageValue)}</span>
                              </div>
                              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${width}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Loss Reasons */}
          <div className="bg-card rounded-xl overflow-hidden">
            <button onClick={() => toggleSection('loss')} className="w-full flex items-center justify-between p-4 active:bg-secondary transition-colors">
              <span className="text-sm font-semibold text-foreground">Motivos de Perda</span>
              {openSection === 'loss' ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
            </button>
            {openSection === 'loss' && (
              <div className="px-4 pb-4">
                <div className="h-40 mb-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={lossData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" stroke="none">
                        {lossData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1.5">
                  {lossData.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-muted-foreground flex-1">{item.name}</span>
                      <span className="text-foreground font-medium">{item.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Channel Origin */}
          <div className="bg-card rounded-xl overflow-hidden">
            <button onClick={() => toggleSection('channel')} className="w-full flex items-center justify-between p-4 active:bg-secondary transition-colors">
              <span className="text-sm font-semibold text-foreground">Origem / Canal</span>
              {openSection === 'channel' ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
            </button>
            {openSection === 'channel' && (
              <div className="px-4 pb-4 space-y-2">
                {[
                  { channel: 'Facebook Ads', leads: 2, ticket: 'R$ 214.000' },
                  { channel: 'Instagram Reels', leads: 1, ticket: 'R$ 3.100.000' },
                  { channel: 'Instagram Ads', leads: 1, ticket: 'R$ 1.200.000' },
                  { channel: 'Google Ads', leads: 1, ticket: 'R$ 245.000' },
                  { channel: 'Portal ZAP', leads: 1, ticket: 'R$ 265.000' },
                ].map((ch, i) => (
                  <div key={i} className="flex items-center justify-between bg-secondary rounded-lg p-3">
                    <div>
                      <p className="text-sm text-foreground font-medium">{ch.channel}</p>
                      <p className="text-[10px] text-muted-foreground">{ch.leads} leads</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-primary font-semibold">Ticket: {ch.ticket}</p>
                    </div>
                  </div>
                ))}
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

          {/* Sprint 24 — Saúde composicional (heatmap funil × status) */}
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
