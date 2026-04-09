import { deals, formatCurrency, STAGES, STAGE_PROBABILITIES } from '@/data/mockData';
import { TrendingUp, Users, Target, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

const lossData = [
  { name: 'Crédito Reprovado', value: 40, color: 'hsl(0, 84%, 60%)' },
  { name: 'Preço', value: 30, color: 'hsl(38, 92%, 50%)' },
  { name: 'Concorrência', value: 20, color: 'hsl(145, 63%, 49%)' },
  { name: 'Outros', value: 10, color: 'hsl(0, 0%, 40%)' },
];

const IndicadoresPage = () => {
  const [openSection, setOpenSection] = useState<string | null>('funnel');

  const totalDeals = deals.length;
  const receitaPrevista = deals.reduce((sum, d) => sum + d.value * (d.probability / 100), 0);
  const receitaGanha = deals.filter(d => d.stage === 'Fechamento').reduce((sum, d) => sum + d.value, 0);
  const ticketMedio = deals.reduce((sum, d) => sum + d.value, 0) / totalDeals;

  const toggleSection = (s: string) => setOpenSection(openSection === s ? null : s);

  return (
    <div className="flex flex-col h-full overflow-y-auto scrollbar-hide">
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-xl font-bold text-foreground mb-4">Indicadores</h1>

        {/* Forecast Card */}
        <div className="bg-card rounded-2xl p-5 mb-4">
          <p className="text-xs text-muted-foreground mb-1">Previsão de Receita</p>
          <p className="text-2xl font-bold text-primary">{formatCurrency(receitaPrevista)}</p>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, (receitaGanha / receitaPrevista) * 100)}%` }} />
            </div>
            <span className="text-xs text-muted-foreground">{Math.round((receitaGanha / receitaPrevista) * 100)}%</span>
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
        <div className="grid grid-cols-2 gap-3 mb-4">
          {[
            { label: 'Total Leads', value: '6', icon: Users, color: 'text-primary' },
            { label: 'Conversão', value: '16.7%', icon: Target, color: 'text-primary' },
            { label: 'Ticket Médio', value: formatCurrency(ticketMedio), icon: TrendingUp, color: 'text-primary' },
            { label: 'Ciclo Médio', value: '23 dias', icon: Clock, color: 'text-warning' },
          ].map((kpi, i) => (
            <div key={i} className="bg-card rounded-xl p-4">
              <kpi.icon size={16} className={`${kpi.color} mb-2`} />
              <p className="text-lg font-bold text-foreground">{kpi.value}</p>
              <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
            </div>
          ))}
        </div>

        {/* Accordion Sections */}
        <div className="space-y-2 pb-24">
          {/* Funnel Breakdown */}
          <div className="bg-card rounded-xl overflow-hidden">
            <button onClick={() => toggleSection('funnel')} className="w-full flex items-center justify-between p-4 active:bg-secondary transition-colors">
              <span className="text-sm font-semibold text-foreground">Funil de Vendas</span>
              {openSection === 'funnel' ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
            </button>
            {openSection === 'funnel' && (
              <div className="px-4 pb-4 space-y-2">
                {STAGES.map(stage => {
                  const stageDeals = deals.filter(d => d.stage === stage);
                  const stageValue = stageDeals.reduce((s, d) => s + d.value, 0);
                  const width = totalDeals > 0 ? (stageDeals.length / totalDeals) * 100 : 0;
                  return (
                    <div key={stage}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-muted-foreground">{stage}</span>
                        <span className="text-foreground font-medium">{stageDeals.length} · {formatCurrency(stageValue)}</span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${width}%` }} />
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
                  { channel: 'WhatsApp Business', leads: 3, ticket: 'R$ 906.667' },
                  { channel: 'Site Imobiliária', leads: 1, ticket: 'R$ 2.125.000' },
                  { channel: 'Instagram Ads', leads: 1, ticket: 'R$ 1.200.000' },
                  { channel: 'Portal ZAP', leads: 1, ticket: 'R$ 720.000' },
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
        </div>
      </div>
    </div>
  );
};

export default IndicadoresPage;
