import { useState, useCallback, lazy, Suspense } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import type { TabId } from '@/components/shell/navItems';
import { useToast } from '@/hooks/use-toast';
import { FunnelsProvider, useFunnels } from '@/hooks/useFunnels';
import { DealsProvider, useDeals } from '@/hooks/useDeals';
import { ActivityTypesProvider } from '@/hooks/useActivityTypes';

// Cada aba é um chunk próprio: o usuário só baixa a tela que abrir. Indicadores
// (recharts) e ConfigPage são os mais pesados — não entram no bundle inicial.
const FunisPage = lazy(() => import('@/pages/FunisPage'));
const AtividadesPage = lazy(() => import('@/pages/AtividadesPage'));
const IndicadoresPage = lazy(() => import('@/pages/IndicadoresPage'));
const ConfigPage = lazy(() => import('@/pages/ConfigPage'));
const AISuggestionsPanel = lazy(() => import('@/components/AISuggestionsPanel'));

const TabFallback = () => (
  <div className="w-full h-full p-4 space-y-3 animate-in fade-in duration-150">
    <div className="h-8 w-1/3 rounded-md bg-secondary/50 animate-pulse" />
    <div className="flex gap-3 overflow-hidden">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="w-[260px] shrink-0 space-y-2">
          <div className="h-8 rounded-md bg-secondary/40 animate-pulse" />
          <div className="h-16 rounded-md bg-secondary/30 animate-pulse" />
          <div className="h-16 rounded-md bg-secondary/30 animate-pulse" />
        </div>
      ))}
    </div>
  </div>
);

const Index = () => {
  const [activeTab, setActiveTab] = useState<TabId>('leads');
  const [hasPendingStep, setHasPendingStep] = useState(false);
  const { toast } = useToast();
  const funnelsState = useFunnels();
  const dealsState = useDeals(funnelsState.funnels);

  const handleTabChange = useCallback((tab: TabId) => {
    if (hasPendingStep) {
      toast({
        title: 'Registro obrigatório',
        description: 'Registre o próximo passo antes de sair.',
        variant: 'destructive',
      });
      return;
    }
    setActiveTab(tab);
  }, [hasPendingStep, toast]);

  const renderPage = () => {
    switch (activeTab) {
      case 'leads': return <FunisPage onPendingStepChange={setHasPendingStep} />;
      case 'suggestions': return <AISuggestionsPanel />;
      case 'activities': return <AtividadesPage />;
      case 'indicators': return <IndicadoresPage />;
      case 'settings': return <ConfigPage />;
      default: return <FunisPage onPendingStepChange={setHasPendingStep} />;
    }
  };

  return (
    <FunnelsProvider value={funnelsState}>
      <DealsProvider value={dealsState}>
        <ActivityTypesProvider>
          <AppShell activeTab={activeTab} onTabChange={handleTabChange}>
            <Suspense fallback={<TabFallback />}>
              {renderPage()}
            </Suspense>
          </AppShell>
        </ActivityTypesProvider>
      </DealsProvider>
    </FunnelsProvider>
  );
};

export default Index;
