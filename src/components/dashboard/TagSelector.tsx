import React, { useState } from 'react';
import { Tag } from '../integrations/supabase/types';
import { useTags } from '../hooks/use-tags';
import TagBadge from './TagBadge';

interface TagSelectorProps {
  cardId: string;
  pipelineId: string;
  className?: string;
  onTagsChange?: (tags: Tag[]) => void;
}

const TagSelector: React.FC<TagSelectorProps> = ({
  cardId,
  pipelineId,
  className = '',
  onTagsChange
}) => {
  const { tags, getCardTagNames, assignTag, removeTag, isLoading } = useTags(pipelineId);
  const [isAdding, setIsAdding] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const currentTags = getCardTagNames(cardId);
  const availableTags = tags?.filter(tag =>
    !currentTags.some(ct => ct.id === tag.id) &&
    tag.name.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const handleAddTag = async (tag: Tag) => {
    try {
      await assignTag.mutateAsync({ cardId, tagId: tag.id });
      setShowDropdown(false);
      setSearchTerm('');
      onTagsChange?.(getCardTagNames(cardId));
    } catch (error) {
      console.error('Erro ao adicionar tag:', error);
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    try {
      await removeTag.mutateAsync({ cardId, tagId });
      onTagsChange?.(getCardTagNames(cardId));
    } catch (error) {
      console.error('Erro ao remover tag:', error);
    }
  };

  if (isLoading) {
    return (
      <div className={`flex flex-wrap gap-2 ${className}`}>
        <div className="h-6 w-20 bg-gray-200 rounded animate-pulse" />
        <div className="h-6 w-16 bg-gray-200 rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {/* Tags selecionadas */}
      <div className="flex flex-wrap gap-2 mb-2">
        {currentTags.map((tag) => (
          <div
            key={tag.id}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-full group hover:bg-gray-100 transition-colors"
          >
            <TagBadge tag={tag} size="sm" />
            <button
              onClick={() => handleRemoveTag(tag.id)}
              className="ml-1 text-xs text-gray-500 hover:text-red-600 transition-colors"
              title="Remover tag"
            >
              ×
            </button>
          </div>
        ))}
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="inline-flex items-center gap-1 px-2 py-1 border border-dashed border-gray-300 rounded-full text-sm text-gray-600 hover:border-gray-400 hover:text-gray-800 transition-colors"
        >
          + Adicionar
        </button>
      </div>

      {/* Dropdown de seleção */}
      {showDropdown && (
        <div className="absolute z-10 w-64 bg-white border border-gray-200 rounded-lg shadow-lg mt-1">
          <div className="p-2 border-b border-gray-200">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar tags..."
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus
            />
          </div>

          <div className="max-h-48 overflow-y-auto">
            {availableTags.length > 0 ? (
              availableTags.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => handleAddTag(tag)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 transition-colors"
                >
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  <span>{tag.name}</span>
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-gray-500 text-center">
                {searchTerm ? 'Nenhuma tag encontrada' : 'Nenhuma tag disponível'}
              </div>
            )}
          </div>

          <div className="p-2 border-t border-gray-200">
            <button
              onClick={() => setShowDropdown(false)}
              className="w-full px-3 py-1 text-sm text-gray-600 hover:text-gray-800 transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TagSelector;