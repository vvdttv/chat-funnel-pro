import { useState } from 'react';
import { Bot, Check, X, Pencil, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useAISuggestions, type AISuggestion } from '@/hooks/use-ai-suggestions';

/** Mapa amigável de etapas do funil da IA. */
const STAGE_LABELS: Record<string, string> = {
  'ia-novo-lead': 'Novo lead',
  'ia-atendimento': 'Em atendimento',
  'ia-coleta': 'Coleta de dados',
  'ia-analise': 'Enviado para análise',
  'ia-devolutiva': 'Aguardando devolutiva',
  'ia-aprovado-aguardando': 'Aprovado — aguardando',
  'ia-agendamento': 'Agendamento',
  'ia-transferido': 'Transferido ao corretor',
  'ia-troca-voz': 'Troca de voz',
};

function SuggestionCard({ s, onApprove, onReject }: {
  s: AISuggestion;
  onApprove: (id: string, text?: string) => Promise<boolean>;
  onReject: (id: string, reason?: string) => Promise<boolean>;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(s.suggested_response ?? '');
  const [busy, setBusy] = useState(false);

  const handleApprove = async () => {
    setBusy(true);
    const edited = editing && text.trim() !== (s.suggested_response ?? '').trim() ? text.trim() : undefined;
    const ok = await onApprove(s.queue_id, edited);
    setBusy(false);
    toast({
      title: ok ? 'Resposta aprovada' : 'Erro ao aprovar',
      description: ok ? 'Será enviada ao lead em instantes.' : 'Tente novamente.',
      variant: ok ? undefined : 'destructive',
    });
  };

  const handleReject = async () => {
    setBusy(true);
    const ok = await onReject(s.queue_id);
    setBusy(false);
    toast({
      title: ok ? 'Sugestão descartada' : 'Erro ao rejeitar',
      variant: ok ? undefined : 'destructive',
    });
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium truncate">{s.lead_name ?? 'Lead'}</span>
          <Badge variant="secondary" className="shrink-0">{STAGE_LABELS[s.stage_id] ?? s.stage_id}</Badge>
        </div>
        <span className="text-[11px] text-muted-foreground shrink-0">
          {new Date(s.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {s.lead_message && (
        <div className="text-sm">
          <span className="text-muted-foreground">Lead: </span>
          <span className="italic">“{s.lead_message}”</span>
        </div>
      )}

      <div className="rounded-md bg-muted/50 p-3">
        <div className="flex items-center gap-1.5 mb-1 text-xs text-primary font-medium">
          <Bot size={14} /> Sugestão da IA
        </div>
        {editing ? (
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} className="text-sm" />
        ) : (
          <p className="text-sm whitespace-pre-wrap">{s.suggested_response ?? '(sem texto)'}</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleApprove} disabled={busy} className="gap-1">
          <Check size={15} /> Aprovar e enviar
        </Button>
        <Button size="sm" variant="outline" onClick={() => setEditing((v) => !v)} disabled={busy} className="gap-1">
          <Pencil size={15} /> {editing ? 'Cancelar edição' : 'Editar'}
        </Button>
        <Button size="sm" variant="ghost" onClick={handleReject} disabled={busy} className="gap-1 text-destructive ml-auto">
          <X size={15} /> Descartar
        </Button>
      </div>
    </Card>
  );
}

/** Caixa de Sugestões da IA — modo assistido (Fase I-A). */
export function AISuggestionsPanel() {
  const { suggestions, isLoading, error, refetch, approve, reject } = useAISuggestions();

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Bot size={20} className="text-primary" />
          <h2 className="font-semibold">Sugestões da IA</h2>
          {suggestions.length > 0 && <Badge>{suggestions.length}</Badge>}
        </div>
        <Button size="icon" variant="ghost" onClick={refetch} aria-label="Atualizar">
          <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3 max-w-2xl mx-auto">
          {error && <p className="text-sm text-destructive">Erro: {error}</p>}
          {!isLoading && suggestions.length === 0 && !error && (
            <div className="text-center text-muted-foreground py-12">
              <Bot size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhuma sugestão aguardando aprovação.</p>
              <p className="text-xs mt-1">Quando a IA responder a um lead em modo assistido, aparecerá aqui.</p>
            </div>
          )}
          {suggestions.map((s) => (
            <SuggestionCard key={s.queue_id} s={s} onApprove={approve} onReject={reject} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

export default AISuggestionsPanel;
