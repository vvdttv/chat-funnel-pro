/**
 * IASimulator — aba "Simulador" dentro de Config IA.
 *
 * Permite testar uma mensagem hipotética do lead em um funil/etapa escolhidos
 * e ver TUDO que a IA decidiria (LBs detectados, skill ativada, prompt, resposta)
 * sem gravar log nem enviar nada (dryRun=true).
 */
import { useState, useMemo } from 'react';
import { Loader2, Play, Sparkles, AlertTriangle, Wrench, ChevronDown, ChevronUp } from 'lucide-react';
import { useFunnelsContext } from '@/hooks/useFunnels';
import { useIaRespondToLead, type IaRespondResult } from '@/hooks/useIaRespondToLead';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CorrectBehaviorSheet, type DecisionContext } from './CorrectBehaviorSheet';

export const IASimulator = () => {
  const { funnels } = useFunnelsContext();
  const { respond, loading, error } = useIaRespondToLead();
  const [funnelId, setFunnelId] = useState<string>('');
  const [stageId, setStageId] = useState<string>('');
  const [dealStatus, setDealStatus] = useState<'open' | 'won' | 'lost'>('open');
  const [leadMessage, setLeadMessage] = useState('');
  const [result, setResult] = useState<IaRespondResult | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [correctOpen, setCorrectOpen] = useState(false);

  const stages = useMemo(() => {
    const f = funnels.find(x => x.id === funnelId);
    return f?.stages ?? [];
  }, [funnels, funnelId]);

  const canRun = funnelId && stageId && leadMessage.trim().length >= 3 && !loading;

  const handleRun = async () => {
    if (!canRun) return;
    const r = await respond({
      funnelId, stageId, dealStatus,
      leadMessage: leadMessage.trim(),
      dryRun: true,
    });
    if (r) setResult(r);
  };

  const decisionForCorrect: DecisionContext | null = result ? {
    leadMessage: leadMessage.trim(),
    generatedResponse: result.response,
    detectedBehaviorCodes: result.detectedBehaviorCodes,
    activatedSkillCode: result.activatedSkillCode,
    appliedRuleCodes: result.appliedRuleCodes,
    archetypeCode: result.archetypeCode,
    statusOverlayCode: result.statusOverlayCode,
    contextTags: result.contextTags,
  } : null;

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground bg-card/50 border border-border rounded-lg p-3">
        Teste como a IA reagiria a uma mensagem hipotética. Nada é gravado nem enviado —
        é só pra você validar suas configurações antes de qualquer lead real ser afetado.
      </div>

      <div className="bg-card border border-border rounded-xl p-3 space-y-3">
        <div className="grid grid-cols-1 gap-2">
          <div>
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Funil</label>
            <Select value={funnelId} onValueChange={(v) => { setFunnelId(v); setStageId(''); }}>
              <SelectTrigger className="h-9 text-xs bg-background border-border mt-1">
                <SelectValue placeholder="Escolha um funil" />
              </SelectTrigger>
              <SelectContent>
                {funnels.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Etapa</label>
            <Select value={stageId} onValueChange={setStageId} disabled={!funnelId}>
              <SelectTrigger className="h-9 text-xs bg-background border-border mt-1">
                <SelectValue placeholder={funnelId ? 'Escolha a etapa' : 'Escolha o funil primeiro'} />
              </SelectTrigger>
              <SelectContent>
                {stages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Status do deal</label>
            <Select value={dealStatus} onValueChange={(v) => setDealStatus(v as typeof dealStatus)}>
              <SelectTrigger className="h-9 text-xs bg-background border-border mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Aberto</SelectItem>
                <SelectItem value="won">Ganho</SelectItem>
                <SelectItem value="lost">Perdido</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Mensagem hipotética do lead</label>
          <Textarea
            value={leadMessage}
            onChange={e => setLeadMessage(e.target.value)}
            placeholder="Ex: Quero um desconto de 20% senão vou desistir."
            rows={3}
            className="bg-background mt-1"
          />
        </div>

        <button
          onClick={handleRun}
          disabled={!canRun}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-40 active:scale-[0.98] transition-transform"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
          {loading ? 'Simulando…' : 'Simular resposta'}
        </button>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive text-xs p-3 rounded-lg">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-3">
          {/* Trace */}
          <div className="bg-card border border-border rounded-xl p-3 space-y-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">O que a IA decidiu</div>
            <ul className="text-xs text-foreground space-y-1 leading-relaxed">
              <li>
                <span className="text-muted-foreground">Comportamentos detectados:</span>{' '}
                {result.detectedBehaviorCodes.length ? result.detectedBehaviorCodes.join(', ') : 'nenhum'}
              </li>
              <li>
                <span className="text-muted-foreground">Habilidade ativada:</span>{' '}
                {result.activatedSkillCode ?? 'nenhuma'}
              </li>
              <li>
                <span className="text-muted-foreground">Regras aplicadas:</span>{' '}
                {result.appliedRuleCodes.length ? result.appliedRuleCodes.join(', ') : 'nenhuma'}
              </li>
              {result.archetypeCode && (
                <li>
                  <span className="text-muted-foreground">Etapa:</span> {result.archetypeCode}
                  {result.statusOverlayCode && ` + ${result.statusOverlayCode}`}
                </li>
              )}
            </ul>
          </div>

          {/* Resposta ou handoff */}
          {result.handoff.triggered ? (
            <div className="bg-warning/10 border border-warning/30 rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-warning mb-1">
                <AlertTriangle size={11} /> Transferiria pra humano
              </div>
              <div className="text-xs text-foreground">{result.handoff.reason}</div>
            </div>
          ) : result.response ? (
            <div className="bg-primary/10 border border-primary/30 rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-primary mb-1">
                <Sparkles size={11} /> Resposta que a IA daria
              </div>
              <div className="text-xs text-foreground whitespace-pre-wrap">{result.response}</div>
            </div>
          ) : null}

          {/* Prompt usado (collapsible) */}
          <button
            onClick={() => setShowPrompt(s => !s)}
            className="w-full flex items-center justify-between text-[11px] text-muted-foreground bg-card/50 border border-border rounded-lg px-3 py-2 active:scale-[0.99]"
          >
            <span>Prompt completo enviado à IA</span>
            {showPrompt ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {showPrompt && (
            <pre className="text-[10px] text-foreground/70 bg-background border border-border rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
              {result.systemPrompt}
            </pre>
          )}

          {/* Ajustar */}
          {decisionForCorrect && (
            <button
              onClick={() => setCorrectOpen(true)}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-secondary text-foreground border border-border text-xs font-semibold active:scale-[0.98]"
            >
              <Wrench size={12} /> Ajustar isso
            </button>
          )}
        </div>
      )}

      <CorrectBehaviorSheet
        open={correctOpen}
        onOpenChange={setCorrectOpen}
        decision={decisionForCorrect}
      />
    </div>
  );
};
