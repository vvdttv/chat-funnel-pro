import { useState } from 'react';
import { properties, waNumbers, aiFlows, formatCurrency, Property, AIFlow } from '@/data/mockData';
import { Building2, Smartphone, Bot, Plus, Copy, ExternalLink, ChevronRight, ToggleLeft, ToggleRight } from 'lucide-react';

type SettingsTab = 'imoveis' | 'numeros' | 'fluxos';

const tabs: { id: SettingsTab; label: string; icon: typeof Building2 }[] = [
  { id: 'imoveis', label: 'Imóveis', icon: Building2 },
  { id: 'numeros', label: 'Números WA', icon: Smartphone },
  { id: 'fluxos', label: 'Fluxos IA', icon: Bot },
];

const PropertyCard = ({ property }: { property: Property }) => (
  <div className="bg-card rounded-xl p-4 mb-3 active:scale-[0.98] transition-transform">
    <div className="flex items-start justify-between mb-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded font-mono">{property.code}</span>
        </div>
        <p className="text-sm font-semibold text-foreground mt-1">{property.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{property.address}</p>
      </div>
      {property.tourLink && (
        <button className="p-1.5 text-primary active:scale-95 transition-transform">
          <ExternalLink size={14} />
        </button>
      )}
    </div>
    <p className="text-base font-bold text-primary">{formatCurrency(property.value)}</p>
  </div>
);

const FlowCard = ({ flow }: { flow: AIFlow }) => (
  <div className="bg-card rounded-xl p-4 mb-3">
    <div className="flex items-start justify-between mb-2">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">{flow.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{flow.description}</p>
      </div>
      <div className={`p-1 ${flow.active ? 'text-primary' : 'text-muted-foreground'}`}>
        {flow.active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
      </div>
    </div>
    <div className="flex items-center justify-between mt-3">
      <span className="text-xs text-muted-foreground">{flow.blocks} blocos</span>
      <div className="flex gap-2">
        <button className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary px-2 py-1 rounded-lg active:scale-95 transition-transform">
          <Copy size={12} /> Clonar
        </button>
        <button className="flex items-center gap-1 text-xs text-primary bg-primary/15 px-2 py-1 rounded-lg active:scale-95 transition-transform">
          Editar <ChevronRight size={12} />
        </button>
      </div>
    </div>
  </div>
);

const ConfigPage = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('imoveis');

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-xl font-bold text-foreground mb-4">Configurações</h1>

        <div className="flex gap-2 mb-4">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium transition-colors active:scale-95 transition-transform ${
                  activeTab === tab.id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide px-4 pb-24">
        {activeTab === 'imoveis' && (
          <>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">{properties.length} imóveis cadastrados</span>
              <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium active:scale-95 transition-transform">
                <Plus size={14} /> Novo
              </button>
            </div>
            {properties.map(p => <PropertyCard key={p.id} property={p} />)}
          </>
        )}

        {activeTab === 'numeros' && (
          <>
            {waNumbers.map(wa => (
              <div key={wa.id} className="bg-card rounded-xl p-4 mb-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{wa.label}</p>
                    <p className="text-xs text-muted-foreground font-mono">{wa.number}</p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    wa.type === 'official' ? 'bg-primary/15 text-primary' : 'bg-warning/15 text-warning'
                  }`}>
                    {wa.type === 'official' ? 'API Oficial' : 'QR Code'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {wa.agents.map(agent => (
                    <span key={agent} className="text-[10px] bg-secondary text-muted-foreground px-2 py-1 rounded-full">{agent}</span>
                  ))}
                  <button className="text-[10px] bg-primary/15 text-primary px-2 py-1 rounded-full active:scale-95 transition-transform">
                    + Vincular
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {activeTab === 'fluxos' && (
          <>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">{aiFlows.length} fluxos</span>
              <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium active:scale-95 transition-transform">
                <Plus size={14} /> Novo Fluxo
              </button>
            </div>
            {aiFlows.map(f => <FlowCard key={f.id} flow={f} />)}
          </>
        )}
      </div>
    </div>
  );
};

export default ConfigPage;
