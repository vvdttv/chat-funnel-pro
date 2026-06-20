import React, { useState } from 'react';
import { useTags, useDealTags } from '@/hooks/use-tags';
import { TagBadge } from '@/components/TagBadge';

interface TagSelectorProps {
  /** id do deal (deals.id é text) */
  dealId: string;
  className?: string;
  /** id do usuário que está atribuindo (assigned_by), opcional */
  userId?: string;
}

/**
 * Seleciona/remove tags de um deal. Lê as tags atuais via useDealTags
 * (RPC get_deal_tags_json) e a lista disponível da org via useTags.
 */
const TagSelector: React.FC<TagSelectorProps> = ({ dealId, className = '', userId }) => {
  const { tags: orgTags, isLoading: loadingOrg } = useTags();
  const { tags: dealTags, isLoading: loadingDeal, assignTag, removeTag } = useDealTags(dealId);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [busy, setBusy] = useState(false);

  const isLoading = loadingOrg || loadingDeal;
  const currentIds = new Set(dealTags.map(t => t.id));
  const availableTags = orgTags.filter(tag =>
    !currentIds.has(tag.id) &&
    tag.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleAdd = async (tagId: number) => {
    setBusy(true);
    await assignTag(tagId, userId);
    setBusy(false);
    setShowDropdown(false);
    setSearchTerm('');
  };

  const handleRemove = async (tagId: number) => {
    setBusy(true);
    await removeTag(tagId);
    setBusy(false);
  };

  if (isLoading) {
    return (
      <div className={`flex flex-wrap gap-2 ${className}`}>
        <div className="h-6 w-20 bg-secondary rounded-full animate-pulse" />
        <div className="h-6 w-16 bg-secondary rounded-full animate-pulse" />
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        {dealTags.map(tag => (
          <span key={tag.id} className="inline-flex items-center gap-1 group">
            <TagBadge name={tag.name} color={tag.color} size="sm" />
            <button
              onClick={() => handleRemove(tag.id)}
              disabled={busy}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
              title="Remover tag"
              aria-label={`Remover tag ${tag.name}`}
            >
              ×
            </button>
          </span>
        ))}
        <button
          onClick={() => setShowDropdown(v => !v)}
          disabled={busy}
          className="inline-flex items-center gap-1 px-2 py-0.5 border border-dashed border-border rounded-full text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors disabled:opacity-40"
        >
          + Adicionar
        </button>
      </div>

      {showDropdown && (
        <div className="absolute z-20 w-56 bg-card border border-border rounded-lg shadow-lg mt-1">
          <div className="p-2 border-b border-border">
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar tags..."
              className="w-full px-2 py-1 text-sm bg-secondary text-foreground border border-border rounded outline-none focus:border-primary/50"
              autoFocus
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {availableTags.length > 0 ? (
              availableTags.map(tag => (
                <button
                  key={tag.id}
                  onClick={() => handleAdd(tag.id)}
                  disabled={busy}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-secondary flex items-center gap-2 transition-colors disabled:opacity-40"
                >
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                  <span className="text-foreground">{tag.name}</span>
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-muted-foreground text-center">
                {searchTerm ? 'Nenhuma tag encontrada' : 'Nenhuma tag disponível'}
              </div>
            )}
          </div>
          <div className="p-1.5 border-t border-border">
            <button
              onClick={() => setShowDropdown(false)}
              className="w-full px-3 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
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
