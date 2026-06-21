import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { GraduationCap, Check, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useIAFeedback, type FeedbackInterpretation } from '@/hooks/use-ia-feedback';

interface TrainIADialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  funnelId: string;
  stageId: string;
  dealId?: string;
  sourceDecisionLogId?: string;
  stageLabel?: string;
}

/**
 * Modo Treinador — Canal 1 (pop-up). Fluxo: escreve feedback → IA interpreta e
 * mostra o que entendeu → usuário confirma (Salvar) → grava o override → fecha.
 */
export function TrainIADialog({ open, onOpenChange, funnelId, stageId, dealId, sourceDecisionLogId, stageLabel }: TrainIADialogProps) {
  const { busy, interpret, apply } = useIAFeedback();
  const { toast } = useToast();
  const [text, setText] = useState('');
  const [interpretation, setInterpretation] = useState<FeedbackInterpretation | null>(null);
  const [saved, setSaved] = useState(false);

  const reset = () => { setText(''); setInterpretation(null); setSaved(false); };
  const close = () => { reset(); onOpenChange(false); };

  const handleInterpret = async () => {
    if (!text.trim()) return;
    const r = await interpret({ feedbackText: text, funnelId, stageId, dealId, sourceDecisionLogId });
    if (r) setInterpretation(r);
    else toast({ title: 'Não consegui interpretar', description: 'Reformule o feedback.', variant: 'destructive' });
  };

  const handleApply = async () => {
    if (!interpretation) return;
    const ok = await apply({
      feedbackText: text,
      interpretedSummary: interpretation.summary,
      funnelId: interpretation.funnel_id,
      stageId: interpretation.stage_id,
      payload: interpretation.payload,
      dealId,
    });
    if (ok) {
      setSaved(true);
      toast({ title: 'Ajuste salvo', description: 'A próxima resposta da IA nesta etapa já vai aplicá-lo.' });
    } else {
      toast({ title: 'Erro ao salvar', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap size={18} className="text-primary" />
            Treinar IA {stageLabel ? `— ${stageLabel}` : ''}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Diga em linguagem natural o que quer ajustar no comportamento da IA nesta etapa.
            A IA mostra o que entendeu e você confirma antes de salvar.
          </p>

          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Ex.: na abertura, seja mais objetiva e pergunte logo a cidade do lead"
            disabled={busy || saved}
          />

          {!interpretation && (
            <Button onClick={handleInterpret} disabled={busy || !text.trim()} className="gap-1 w-full">
              <Send size={15} /> {busy ? 'Interpretando…' : 'Enviar para a IA'}
            </Button>
          )}

          {interpretation && (
            <div className="rounded-md bg-muted/50 p-3 space-y-2">
              <div className="text-xs font-medium text-primary">A IA entendeu assim:</div>
              <p className="text-sm">{interpretation.summary}</p>
            </div>
          )}

          {interpretation && !saved && (
            <div className="flex gap-2">
              <Button onClick={handleApply} disabled={busy} className="gap-1 flex-1">
                <Check size={15} /> {busy ? 'Salvando…' : 'Confirmar e salvar'}
              </Button>
              <Button variant="outline" onClick={() => setInterpretation(null)} disabled={busy}>
                Reformular
              </Button>
            </div>
          )}

          {saved && (
            <Button onClick={close} className="w-full gap-1">
              <Check size={15} /> Pronto, fechar
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default TrainIADialog;
