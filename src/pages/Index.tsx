import { useState, useCallback, lazy, Suspense } from 'react';
import BottomNav from '@/components/BottomNav';
import { NotificationBell } from '@/components/NotificationBell';
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
  const [activeTab, setActiveTab] = useState('leads');
  const [hasPendingStep, setHasPendingStep] = useState(false);
  const { toast } = useToast();
  const funnelsState = useFunnels();
  const dealsState = useDeals(funnelsState.funnels);

  const handleTabChange = useCallback((tab: string) => {
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
          <div className="w-full h-screen bg-background text-foreground flex flex-col relative overflow-hidden">
            <div className="absolute top-2 right-2 z-50">
              <NotificationBell />
            </div>
            <div className="flex-1 min-h-0 overflow-hidden pb-[var(--bottom-nav-h)]">
              <Suspense fallback={<TabFallback />}>
                {renderPage()}
              </Suspense>
            </div>
            <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
          </div>
        </ActivityTypesProvider>
      </DealsProvider>
    </FunnelsProvider>
  );
};

export default Index;
