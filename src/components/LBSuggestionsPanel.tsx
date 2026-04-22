/**
 * Painel de aprovação de LeadBehaviors sugeridos pela IA.
 *
 * Botão "Sugerir agora" chama a edge function `suggest-lead-behaviors`,
 * exibe os drafts retornados como cards editáveis e permite aprovar
 * (insere em `lead_behaviors`) ou descartar individualmente.
 */

import { useState } from 'react';
import {
  Sparkles, Loader2, Check, X, RefreshCw, AlertTriangle,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

type Category = 'positive' | 'neutral' | 'evasive' | 'negative' | 'objection';

interface LBDraft {
  code: string;
  label: string;
  category: Category;
  detectionHints: string[];
  defaultReaction: string;
  nextStep: string;
}

const CATEGORY_META: Record<Category, { label: string; classes: string }> = {
  positive:  { label: 'Positivo',  classes: 'bg-success/15 text-success border-success/30' },
  neutral:   { label: 'Neutro',    classes: 'bg-secondary text-muted-foreground border-border' },
  evasive:   { label: 'Evasivo',   classes: 'bg-warning/15 text-warning border-warning/30' },
  negative:  { label: 'Negativo',  classes: 'bg-destructive/15 text-destructive border-destructive/30' },
  objection: { label: 'Objeção',   classes: 'bg-primary/15 text-primary border-primary/30' },
};

export function LBSuggestionsPanel() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id ?? null;
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState<LBDraft[]>([]);
  const [analyzed, setAnalyzed] = useState<number | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [savingCode, setSavingCode] = useState<string | null>(null);

  const handleSuggest = async () => {
    setLoading(true);
    setInfo(null);
    try {
      const { data, error } = await supabase.functions.invoke('suggest-lead-behaviors', {
        body: { limit: 200 },
      });
      if (error) throw error;
      const payload = data as {
        suggestions?: LBDraft[];
        analyzed?: number;
        info?: string;
        error?: string;
      };
      if (payload.error) {
        toast({ title: 'Erro', description: payload.error, variant: 'destructive' });
      } else {
        setDrafts(payload.suggestions ?? []);
        setAnalyzed(payload.analyzed ?? null);
        setInfo(payload.info ?? null);
        if ((payload.suggestions ?? []).length === 0 && !payload.info) {
          setInfo('Nenhum LB novo identificado nos logs recentes.');
        }
      }
    } catch (e) {
      toast({
        title: 'Erro ao sugerir LBs',
        description: e instanceof Error ? e.message : 'Falha desconhecida',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (draft: LBDraft) => {
    if (!orgId) return;
    setSavingCode(draft.code);
    const { error } = await supabase.from('lead_behaviors').insert([{
      organization_id: orgId,
      code: draft.code,
      label: draft.label,
      category: draft.category,
      detection_hints: draft.detectionHints,
      default_reaction: draft.defaultReaction,
      next_step: draft.nextStep,
      typical_stages: [],
      applicable_context_tags: ['*'],
      applicable_statuses: ['open'],
      is_active: true,
    }]);
    setSavingCode(null);
    if (error) {
      toast({ title: 'Erro ao salvar LB', description: error.message, variant: 'destructive' });
      return;
    }
    setDrafts(prev => prev.filter(d => d.code !== draft.code));
    toast({ title: 'LB aprovado', description: `${draft.code} adicionado ao catálogo.` });
  };

  const handleDiscard = (code: string) => {
    setDrafts(prev => prev.filter(d => d.code !== code));
  };

  const updateDraft = (code: string, patch: Partial<LBDraft>) => {
    setDrafts(prev => prev.map(d => (d.code === code ? { ...d, ...patch } : d)));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Sparkles size={14} className="text-primary" />
            Sugestões de comportamentos
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            A IA analisa logs com resultado neutro/negativo e propõe LBs novos.
          </p>
        </div>
        <Button size="sm" onClick={handleSuggest} disabled={loading}>
          {loading ? (
            <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Analisando…</>
          ) : drafts.length > 0 ? (
            <><RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Sugerir novamente</>
          ) : (
            <><Sparkles className="w-3.5 h-3.5 mr-1.5" /> Sugerir agora</>
          )}
        </Button>
      </div>

      {analyzed !== null && (
        <p className="text-[11px] text-muted-foreground">
          {analyzed} logs analisados · {drafts.length} sugestões pendentes
        </p>
      )}

      {info && (
        <div className="p-2.5 bg-secondary border border-border rounded-lg text-xs text-muted-foreground flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-warning mt-0.5 shrink-0" />
          <span>{info}</span>
        </div>
      )}

      <div className="space-y-2">
        {drafts.map(d => (
          <div key={d.code} className="p-3 bg-card border border-border rounded-lg space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <Badge variant="outline" className={`text-[10px] ${CATEGORY_META[d.category].classes}`}>
                  {CATEGORY_META[d.category].label}
                </Badge>
                <code className="text-[10px] text-muted-foreground font-mono">{d.code}</code>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  size="sm" variant="ghost"
                  onClick={() => handleDiscard(d.code)}
                  className="h-7 px-2"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleApprove(d)}
                  disabled={savingCode === d.code}
                  className="h-7 px-2.5"
                >
                  {savingCode === d.code
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <><Check className="w-3.5 h-3.5 mr-1" /> Aprovar</>}
                </Button>
              </div>
            </div>

            <div>
              <Label className="text-[11px]">Rótulo</Label>
              <Input
                value={d.label}
                onChange={(e) => updateDraft(d.code, { label: e.target.value })}
                className="bg-secondary border-border h-8 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[11px]">Reação padrão</Label>
                <Textarea
                  value={d.defaultReaction}
                  onChange={(e) => updateDraft(d.code, { defaultReaction: e.target.value })}
                  className="bg-secondary border-border text-xs min-h-[60px]"
                />
              </div>
              <div>
                <Label className="text-[11px]">Próximo passo</Label>
                <Textarea
                  value={d.nextStep}
                  onChange={(e) => updateDraft(d.code, { nextStep: e.target.value })}
                  className="bg-secondary border-border text-xs min-h-[60px]"
                />
              </div>
            </div>

            <div>
              <Label className="text-[11px]">
                Pistas de detecção ({d.detectionHints.length})
              </Label>
              <div className="flex flex-wrap gap-1 mt-1">
                {d.detectionHints.map((hint, i) => (
                  <Badge key={i} variant="outline" className="text-[10px] font-normal">
                    {hint}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {!loading && drafts.length === 0 && analyzed === null && (
        <div className="p-6 border border-dashed border-border rounded-lg text-center">
          <Sparkles className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
          <p className="text-xs text-muted-foreground">
            Clique em "Sugerir agora" para a IA analisar seus logs e propor novos comportamentos.
          </p>
        </div>
      )}
    </div>
  );
}
