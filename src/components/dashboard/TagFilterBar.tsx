import React, { useState, useEffect } from 'react';
import { Filter, X } from 'lucide-react';
import { useTags } from '../hooks/use-tags';
import { TagBadge } from './TagBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface TagFilterBarProps {
  pipelineId: string;
  selectedTagIds: string[];
  onTagSelectionChange: (tagIds: string[]) => void;
  className?: string;
}

const TagFilterBar: React.FC<TagFilterBarProps> = ({
  pipelineId,
  selectedTagIds,
  onTagSelectionChange,
  className = ''
}) => {
  const { tags, isLoading } = useTags(pipelineId);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleTagToggle = (tagId: string) => {
    const newSelection = selectedTagIds.includes(tagId)
      ? selectedTagIds.filter(id => id !== tagId)
      : [...selectedTagIds, tagId];
    onTagSelectionChange(newSelection);
  };

  const handleClearAll = () => {
    onTagSelectionChange([]);
  };

  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 p-2 border rounded-lg ${className}`}>
        <div className="h-4 w-4 bg-gray-200 rounded animate-pulse" />
        <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Botão de filtro */}
      <Button
        variant="outline"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 w-full justify-between"
      >
        <div className="flex items-center gap-2">
          <Filter size={16} />
          <span>Filtrar por tags</span>
          {selectedTagIds.length > 0 && (
            <span className="bg-primary text-primary-foreground text-xs rounded-full px-2 py-0.5">
              {selectedTagIds.length}
            </span>
          )}
        </div>
        {isExpanded && <X size={16} />}
      </Button>

      {/* Filtro expandido */}
      {isExpanded && (
        <div className="p-3 border rounded-lg bg-card space-y-3">
          {/* Tags selecionadas */}
          {selectedTagIds.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Tags selecionadas:</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearAll}
                  className="text-xs"
                >
                  Limpar tudo
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {tags?.filter(tag => selectedTagIds.includes(tag.id)).map(tag => (
                  <div
                    key={tag.id}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full group hover:bg-gray-100 transition-colors"
                  >
                    <TagBadge tag={tag} size="sm" />
                    <button
                      onClick={() => handleTagToggle(tag.id)}
                      className="ml-1 text-xs text-gray-500 hover:text-red-600 transition-colors"
                      title="Remover tag"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Lista de tags disponíveis */}
          <div className="space-y-2">
            <span className="text-sm font-medium">Disponíveis:</span>
            <div className="flex flex-wrap gap-2">
              {tags?.map(tag => (
                <button
                  key={tag.id}
                  onClick={() => handleTagToggle(tag.id)}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full transition-colors ${
                    selectedTagIds.includes(tag.id)
                      ? 'ring-2 ring-primary bg-primary/10'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  <TagBadge tag={tag} size="sm" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TagFilterBar;