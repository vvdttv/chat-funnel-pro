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
  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
    Carregando…
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
