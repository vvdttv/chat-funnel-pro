import React, { useState } from 'react';
import { Users, Settings, Tag, SlidersHorizontal, BarChart3 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import TagManager from './TagManager';
import TagFilterBar from './TagFilterBar';

interface FunnelManagerTabsProps {
  pipelineId: string;
  onTagFilterChange?: (tagIds: string[]) => void;
  selectedTagIds?: string[];
  className?: string;
}

const FunnelManagerTabs: React.FC<FunnelManagerTabsProps> = ({
  pipelineId,
  onTagFilterChange,
  selectedTagIds = [],
  className = ''
}) => {
  const [activeTab, setActiveTab] = useState('config');

  return (
    <div className={`w-full ${className}`}>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="config" className="flex items-center gap-2">
            <SlidersHorizontal size={16} />
            Configurações
          </TabsTrigger>
          <TabsTrigger value="tags" className="flex items-center gap-2">
            <Tag size={16} />
            Tags
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users size={16} />
            Usuários
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <BarChart3 size={16} />
            Análises
          </TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="mt-4">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Configurações do Funil</h3>
            <p className="text-sm text-muted-foreground">
              Configure as etapas, campos e comportamentos do funil.
            </p>
            {/* Conteúdo de configurações existente */}
          </div>
        </TabsContent>

        <TabsContent value="tags" className="mt-4">
          <div className="space-y-6">
            {/* Filtro de tags */}
            {onTagFilterChange && (
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Filtrar por Tags</h3>
                <TagFilterBar
                  pipelineId={pipelineId}
                  selectedTagIds={selectedTagIds}
                  onTagSelectionChange={onTagFilterChange}
                />
              </div>
            )}

            {/* Gerenciador de tags */}
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Gerenciar Tags</h3>
              <TagManager pipelineId={pipelineId} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Gerenciamento de Usuários</h3>
            <p className="text-sm text-muted-foreground">
              Adicione, remova e configure permissões dos usuários.
            </p>
            {/* Conteúdo de gerenciamento de usuários */}
          </div>
        </TabsContent>

        <TabsContent value="analytics" className="mt-4">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Análises e Métricas</h3>
            <p className="text-sm text-muted-foreground">
              Visualize métricas e desempenho do funil.
            </p>
            {/* Conteúdo de análises */}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FunnelManagerTabs;