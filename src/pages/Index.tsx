import { useState, useCallback } from 'react';
import BottomNav from '@/components/BottomNav';
import FunisPage from '@/pages/FunisPage';
import AtividadesPage from '@/pages/AtividadesPage';
import IndicadoresPage from '@/pages/IndicadoresPage';
import ConfigPage from '@/pages/ConfigPage';
import { useToast } from '@/hooks/use-toast';
import { FunnelsProvider, useFunnels } from '@/hooks/useFunnels';
import { DealsProvider, useDeals } from '@/hooks/useDeals';
import { ActivityTypesProvider } from '@/hooks/useActivityTypes';

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
            <div className="flex-1 overflow-hidden">
              {renderPage()}
            </div>
            <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
          </div>
        </ActivityTypesProvider>
      </DealsProvider>
    </FunnelsProvider>
  );
};

export default Index;
