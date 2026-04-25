/**
 * ConfigurarIaPage — Configurador conversacional da IA.
 *
 * Substitui visualmente a complexidade da aba "Fluxos IA": o usuário
 * descreve em pt-BR o comportamento desejado, responde a um trio fixo de
 * perguntas estruturadas + perguntas customizadas, revisa um resumo humano
 * do plano e salva. Pode desfazer dentro de 60s.
 *
 * Mobile-first (max-w-md). Admin-only via ProtectedRoute do App.tsx.
 */
import { ArrowLeft, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CustomQuestions } from '@/components/configurador-ia/CustomQuestions';
import { FixedTrioQuestions } from '@/components/configurador-ia/FixedTrioQuestions';
import { ReviewScreen } from '@/components/configurador-ia/ReviewScreen';
import { SavedSessionsList, type SavedSession } from '@/components/configurador-ia/SavedSessionsList';
import { UndoBanner } from '@/components/configurador-ia/UndoBanner';
import { Textarea } from '@/components/ui/textarea';
import {
  type ComposedPlan, type CustomAnswer, type CustomQuestion,
  type FixedAnswers, useBehaviorComposer,
} from '@/hooks/useBehaviorComposer';
import { useIaConfigPrefs } from '@/hooks/useIaConfigPrefs';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

type Step = 'describe' | 'fixed_trio' | 'custom_questions' | 'review' | 'saved';

const ConfigurarIaPage = () => {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { prefs } = useIaConfigPrefs();
  const { toast } = useToast();
  const { loading, error, generateQuestions, composePlan, persistPlan, revertSession } = useBehaviorComposer();

  const [step, setStep] = useState<Step>('describe');
  const [userMessage, setUserMessage] = useState('');
  const [fixedAnswers, setFixedAnswers] = useState<FixedAnswers | null>(null);
  const [prefilledFixed, setPrefilledFixed] = useState<FixedAnswers | null>(null);
  const [customQuestions, setCustomQuestions] = useState<CustomQuestion[]>([]);
  const [customAnswers, setCustomAnswers] = useState<CustomAnswer[]>([]);
  const [plan, setPlan] = useState<ComposedPlan | null>(null);
  const [savedSessionId, setSavedSessionId] = useState<string | null>(null);
  const [sessionsRefreshKey, setSessionsRefreshKey] = useState(0);

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto p-6 text-center text-muted-foreground">
        Apenas admins podem configurar a IA.
      </div>
    );
  }

  const reset = () => {
    setStep('describe'); setUserMessage(''); setFixedAnswers(null); setPrefilledFixed(null);
    setCustomQuestions([]); setCustomAnswers([]); setPlan(null); setSavedSessionId(null);
  };

  const handleAdjustSession = (s: SavedSession) => {
    setUserMessage(s.original_message);
    setPrefilledFixed(s.fixed_answers ?? null);
    setFixedAnswers(null);
    setCustomQuestions([]); setCustomAnswers([]); setPlan(null); setSavedSessionId(null);
    setStep('describe');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFixedSubmit = async (answers: FixedAnswers) => {
    setFixedAnswers(answers);
    const result = await generateQuestions({ userMessage, fixedAnswers: answers });
    if (!result) {
      toast({ title: 'Erro', description: error ?? 'Não foi possível gerar perguntas.', variant: 'destructive' });
      return;
    }
    setCustomQuestions(result.questions);
    setStep('custom_questions');
  };

  const handleCustomSubmit = async (answers: CustomAnswer[]) => {
    setCustomAnswers(answers);
    if (!fixedAnswers) return;
    const result = await composePlan({ userMessage, fixedAnswers, customAnswers: answers });
    if (!result) {
      toast({ title: 'Erro', description: error ?? 'Não foi possível montar o plano.', variant: 'destructive' });
      return;
    }
    setPlan(result);
    setStep('review');
  };

  const handleSave = async () => {
    if (!plan || !fixedAnswers) return;
    const result = await persistPlan({
      userMessage, fixedAnswers, customQuestions, customAnswers, generatedPlan: plan,
    });
    if (!result) {
      toast({ title: 'Erro', description: error ?? 'Falha ao salvar.', variant: 'destructive' });
      return;
    }
    setSavedSessionId(result.sessionId);
    setSessionsRefreshKey(k => k + 1);
    setStep('saved');
  };

  const handleRevert = async () => {
    if (!savedSessionId) return;
    const ok = await revertSession(savedSessionId);
    if (ok) {
      toast({ title: 'Configuração desfeita', description: 'Tudo voltou ao estado anterior.' });
      reset();
    } else {
      toast({ title: 'Erro', description: error ?? 'Falha ao desfazer.', variant: 'destructive' });
    }
  };

  const stepLabel: Record<Step, string> = {
    describe: 'Descreva',
    fixed_trio: 'Onde e quando',
    custom_questions: 'Detalhes',
    review: 'Revisar',
    saved: 'Salvo',
  };

  return (
    <div className="h-full overflow-y-auto bg-background pb-24">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 rounded-lg active:scale-95 transition-transform"
            aria-label="Voltar"
          >
            <ArrowLeft size={20} className="text-muted-foreground" />
          </button>
          <div className="flex-1 text-center">
            <div className="text-sm font-semibold text-foreground flex items-center justify-center gap-1.5">
              <Sparkles size={14} className="text-primary" /> Configurar a IA
            </div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{stepLabel[step]}</div>
          </div>
          <button
            onClick={reset}
            className="p-2 -mr-2 rounded-lg active:scale-95 transition-transform"
            aria-label="Começar de novo"
            title="Começar de novo"
          >
            <RefreshCw size={16} className="text-muted-foreground" />
          </button>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-4 space-y-4">
        {/* Mensagem inicial da IA */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-start gap-2">
            <Sparkles size={16} className="text-primary mt-0.5 flex-shrink-0" />
            <div className="text-sm text-foreground leading-relaxed">
              Me conta como você quer que a IA se comporte. Pode escrever do seu jeito — depois eu te faço perguntas curtinhas pra ajustar.
            </div>
          </div>
        </div>

        {/* Passo: descrever */}
        {step === 'describe' && (
          <>
            <div className="space-y-3">
              <Textarea
                value={userMessage}
                onChange={e => setUserMessage(e.target.value)}
                placeholder="Ex: Quando o lead pedir desconto, a IA não pode prometer nada — só consultar comigo."
                rows={4}
                className="bg-card"
              />
              <button
                onClick={() => userMessage.trim().length >= 5 && setStep('fixed_trio')}
                disabled={userMessage.trim().length < 5}
                className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 active:scale-[0.98] transition-transform"
              >
                Continuar
              </button>
            </div>

            <div className="pt-4">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 px-1">
                O que já está configurado
              </div>
              <SavedSessionsList refreshKey={sessionsRefreshKey} onAdjust={handleAdjustSession} />
            </div>
          </>
        )}

        {/* Sumário da intenção (depois do passo describe) */}
        {step !== 'describe' && userMessage && (
          <div className="bg-card/50 border border-border rounded-xl p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Sua intenção</div>
            <div className="text-sm text-foreground italic">"{userMessage}"</div>
          </div>
        )}

        {/* Passo: trio fixo */}
        {step === 'fixed_trio' && (
          <FixedTrioQuestions
            prefs={prefilledFixed ? {
              last_scope: prefilledFixed.scope,
              last_scope_ids: prefilledFixed.scopeIds ?? [],
              last_trigger: prefilledFixed.trigger,
              last_polarity: prefilledFixed.polarity,
              last_tone: null,
              last_format: null,
            } : prefs}
            onSubmit={handleFixedSubmit}
          />
        )}

        {/* Passo: perguntas customizadas */}
        {step === 'custom_questions' && (
          <>
            {loading === 'questions' ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground text-sm gap-2">
                <Loader2 size={16} className="animate-spin" /> A IA está pensando…
              </div>
            ) : customQuestions.length > 0 ? (
              <CustomQuestions questions={customQuestions} onSubmit={handleCustomSubmit} />
            ) : (
              <div className="text-sm text-muted-foreground text-center py-4">
                Sem perguntas adicionais. <button className="text-primary underline" onClick={() => fixedAnswers && handleCustomSubmit([])}>Gerar plano</button>
              </div>
            )}
          </>
        )}

        {/* Loading durante compose_plan */}
        {step === 'custom_questions' && loading === 'plan' && (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm gap-2">
            <Loader2 size={16} className="animate-spin" /> A IA está montando o plano…
          </div>
        )}

        {/* Passo: review */}
        {step === 'review' && plan && (
          <ReviewScreen
            plan={plan}
            saving={loading === 'persist'}
            onSave={handleSave}
            onAdjust={() => setStep('custom_questions')}
            onCancel={reset}
          />
        )}

        {/* Passo: saved (com undo) */}
        {step === 'saved' && savedSessionId && (
          <div className="space-y-3">
            <UndoBanner
              sessionId={savedSessionId}
              onRevert={handleRevert}
              onDismiss={() => { /* mantém na tela */ }}
            />
            <button
              onClick={reset}
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold active:scale-[0.98] transition-transform"
            >
              Configurar outra coisa
            </button>
            <button
              onClick={() => navigate('/')}
              className="w-full py-2.5 rounded-lg border border-border text-sm text-foreground active:scale-[0.98] transition-transform"
            >
              Voltar ao app
            </button>
          </div>
        )}
      </main>
    </div>
  );
};

export default ConfigurarIaPage;
