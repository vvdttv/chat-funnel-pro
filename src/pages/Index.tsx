import { useState } from 'react';
import BottomNav from '@/components/BottomNav';
import FunisPage from '@/pages/FunisPage';
import AtividadesPage from '@/pages/AtividadesPage';
import IndicadoresPage from '@/pages/IndicadoresPage';
import ConfigPage from '@/pages/ConfigPage';

const Index = () => {
  const [activeTab, setActiveTab] = useState('funnels');

  const renderPage = () => {
    switch (activeTab) {
      case 'funnels': return <FunisPage />;
      case 'activities': return <AtividadesPage />;
      case 'indicators': return <IndicadoresPage />;
      case 'settings': return <ConfigPage />;
      default: return <FunisPage />;
    }
  };

  return (
    <div className="max-w-md mx-auto h-screen bg-background text-foreground flex flex-col relative overflow-hidden">
      <div className="flex-1 overflow-hidden">
        {renderPage()}
      </div>
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
};

export default Index;
