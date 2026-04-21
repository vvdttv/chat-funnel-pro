import { useState, FormEvent, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, Loader2, ArrowLeft, KeyRound, Check, User, HelpCircle, Lock, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Progress } from '@/components/ui/progress';

type Mode = 'login' | 'forgot' | 'forgot-success';
type ForgotStep = 1 | 2 | 3;

const STEP_META: Record<ForgotStep, { label: string; subtitle: string; icon: typeof User }> = {
  1: { label: 'Usuário', subtitle: 'Informe seu usuário para localizar sua conta', icon: User },
  2: { label: 'Pergunta', subtitle: 'Responda sua pergunta de segurança', icon: HelpCircle },
  3: { label: 'Nova senha', subtitle: 'Defina sua nova senha de acesso', icon: Lock },
};

const TOTAL_STEPS = 3;

const AuthPage = () => {
  const { signInWithUsername, session, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>('login');
  const [step, setStep] = useState<ForgotStep>(1);

  // login state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // recovery state
  const [recoveryUsername, setRecoveryUsername] = useState('');
  const [securityQuestion, setSecurityQuestion] = useState('');
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [maxAttempts, setMaxAttempts] = useState(3);
  const [windowMinutes, setWindowMinutes] = useState(15);

  useEffect(() => {
    if (!loading && session) navigate('/', { replace: true });
  }, [session, loading, navigate]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setSubmitting(true);
    const { error } = await signInWithUsername(username, password);
    setSubmitting(false);
    if (error) {
      toast({
        title: 'Falha no login',
        description: error.includes('Invalid') ? 'Usuário ou senha incorretos.' : error,
        variant: 'destructive',
      });
      return;
    }
    navigate('/', { replace: true });
  };

  // Passo 1 → busca pergunta
  const onLookupQuestion = async (e: FormEvent) => {
    e.preventDefault();
    if (!recoveryUsername.trim()) return;
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke('get-security-question', {
      body: { username: recoveryUsername.trim() },
    });
    setSubmitting(false);
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }
    const q = (data as any)?.question;
    const remaining = (data as any)?.attemptsRemaining;
    const max = (data as any)?.maxAttempts;
    const win = (data as any)?.windowMinutes;
    if (typeof remaining === 'number') setAttemptsRemaining(remaining);
    if (typeof max === 'number') setMaxAttempts(max);
    if (typeof win === 'number') setWindowMinutes(win);
    if (!q) {
      toast({
        title: 'Sem pergunta de segurança',
        description: 'Esse usuário não tem pergunta cadastrada. Peça ao admin para resetar sua senha.',
        variant: 'destructive',
      });
      return;
    }
    if (typeof remaining === 'number' && remaining === 0) {
      toast({
        title: 'Bloqueado temporariamente',
        description: `Muitas tentativas erradas. Aguarde ${win ?? 15} minutos e tente novamente.`,
        variant: 'destructive',
      });
      return;
    }
    setSecurityQuestion(q);
    setStep(2);
  };

  // Passo 2 → valida que respondeu (validação real só no passo 3)
  const onSubmitAnswer = (e: FormEvent) => {
    e.preventDefault();
    if (securityAnswer.trim().length < 1) {
      toast({ title: 'Resposta obrigatória', variant: 'destructive' });
      return;
    }
    setStep(3);
  };

  // Passo 3 → reseta
  const onResetPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast({ title: 'Senha muito curta', description: 'Mínimo 6 caracteres.', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'As senhas não coincidem', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke('reset-password-with-question', {
      body: {
        username: recoveryUsername.trim(),
        answer: securityAnswer,
        newPassword,
      },
    });
    setSubmitting(false);
    const errMsg = (data as any)?.error || error?.message;
    const remaining = (data as any)?.attemptsRemaining;
    if (typeof remaining === 'number') setAttemptsRemaining(remaining);
    if (errMsg) {
      // Resposta errada → volta para passo 2 para tentar de novo
      const lower = errMsg.toLowerCase();
      if (lower.includes('inválid') || lower.includes('invalid')) {
        const remainingNote =
          typeof remaining === 'number'
            ? remaining === 0
              ? ' Você esgotou suas tentativas. Aguarde 15 minutos.'
              : ` Restam ${remaining} tentativa(s).`
            : '';
        toast({
          title: 'Resposta incorreta',
          description: `Verifique sua resposta e tente novamente.${remainingNote}`,
          variant: 'destructive',
        });
        setStep(2);
        setSecurityAnswer('');
      } else {
        toast({ title: 'Falha ao redefinir', description: errMsg, variant: 'destructive' });
      }
      return;
    }
    setMode('forgot-success');
  };

  const goLogin = () => {
    setMode('login');
    setStep(1);
    setRecoveryUsername('');
    setSecurityQuestion('');
    setSecurityAnswer('');
    setNewPassword('');
    setConfirmPassword('');
    setAttemptsRemaining(null);
  };

  const goBack = () => {
    if (step === 1) {
      goLogin();
    } else {
      setStep((s) => (s - 1) as ForgotStep);
    }
  };

  const progressValue = (step / TOTAL_STEPS) * 100;
  const stepMeta = STEP_META[step];
  const StepIcon = stepMeta.icon;

  return (
    <div className="max-w-md mx-auto h-screen bg-background text-foreground flex flex-col justify-center px-6">
      {mode === 'login' && (
        <>
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary/15 flex items-center justify-center">
              <LogIn className="text-primary" size={28} />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Entrar</h1>
            <p className="text-sm text-muted-foreground mt-1">Acesse sua conta para continuar</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Usuário</label>
              <input
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="seu.usuario"
                className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 placeholder:text-muted-foreground"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Senha</label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 placeholder:text-muted-foreground"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || !username.trim() || !password}
              className="w-full bg-primary text-primary-foreground rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
            >
              {submitting ? <Loader2 className="animate-spin" size={16} /> : <LogIn size={16} />}
              Entrar
            </button>
          </form>

          <button
            type="button"
            onClick={() => { setMode('forgot'); setStep(1); }}
            className="text-xs text-primary mt-4 mx-auto block active:scale-95"
          >
            Esqueci minha senha
          </button>

          <p className="text-[10px] text-muted-foreground text-center mt-6">
            O acesso é apenas por convite. Solicite ao administrador da sua empresa.
          </p>
        </>
      )}

      {mode === 'forgot' && (
        <>
          {/* Header com ícone */}
          <div className="text-center mb-6">
            <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-primary/15 flex items-center justify-center">
              <KeyRound className="text-primary" size={24} />
            </div>
            <h1 className="text-xl font-bold text-foreground">Recuperar senha</h1>
          </div>

          {/* Step indicator pills */}
          <div className="flex items-center justify-between mb-2 px-1">
            {[1, 2, 3].map((n) => {
              const isDone = step > n;
              const isActive = step === n;
              const meta = STEP_META[n as ForgotStep];
              const Icon = meta.icon;
              return (
                <div key={n} className="flex flex-col items-center gap-1 flex-1">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                      isDone
                        ? 'bg-primary text-primary-foreground'
                        : isActive
                          ? 'bg-primary/15 text-primary border border-primary/40'
                          : 'bg-secondary text-muted-foreground'
                    }`}
                  >
                    {isDone ? <Check size={12} /> : <Icon size={12} />}
                  </div>
                  <span
                    className={`text-[9px] font-medium ${
                      isActive ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {meta.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Progress bar */}
          <Progress value={progressValue} className="h-1.5 mb-4" />

          {/* Subtitle */}
          <div className="mb-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
              Passo {step} de {TOTAL_STEPS}
            </p>
            <p className="text-sm text-foreground font-medium flex items-center justify-center gap-1.5">
              <StepIcon size={14} className="text-primary" />
              {stepMeta.subtitle}
            </p>
          </div>

          {/* Tentativas restantes (visível nos passos 2/3 quando temos a info) */}
          {step >= 2 && attemptsRemaining !== null && (
            <div
              className={`mb-4 flex items-center gap-2 rounded-xl px-3 py-2 border text-[11px] ${
                attemptsRemaining === 0
                  ? 'bg-destructive/10 border-destructive/30 text-destructive'
                  : attemptsRemaining === 1
                    ? 'bg-warning/10 border-warning/30 text-warning'
                    : 'bg-secondary border-border text-muted-foreground'
              }`}
            >
              <ShieldAlert size={13} className="shrink-0" />
              {attemptsRemaining === 0 ? (
                <span>
                  Limite atingido. Aguarde {windowMinutes} minutos para tentar novamente.
                </span>
              ) : (
                <span>
                  <span className="font-semibold">{attemptsRemaining}</span> de{' '}
                  <span className="font-semibold">{maxAttempts}</span> tentativa
                  {attemptsRemaining > 1 ? 's' : ''} restante
                  {attemptsRemaining > 1 ? 's' : ''} antes do bloqueio temporário.
                </span>
              )}
            </div>
          )}

          {/* Passo 1 */}
          {step === 1 && (
            <form onSubmit={onLookupQuestion} className="space-y-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Usuário</label>
                <input
                  type="text"
                  autoCapitalize="none"
                  autoFocus
                  value={recoveryUsername}
                  onChange={e => setRecoveryUsername(e.target.value)}
                  placeholder="seu.usuario"
                  className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 placeholder:text-muted-foreground"
                />
              </div>
              <button
                type="submit"
                disabled={submitting || !recoveryUsername.trim()}
                className="w-full bg-primary text-primary-foreground rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
              >
                {submitting && <Loader2 className="animate-spin" size={16} />}
                Continuar
              </button>
            </form>
          )}

          {/* Passo 2 */}
          {step === 2 && (
            <form onSubmit={onSubmitAnswer} className="space-y-3">
              <div className="bg-card border border-border rounded-xl p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Pergunta</p>
                <p className="text-sm text-foreground">{securityQuestion}</p>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Resposta</label>
                <input
                  type="text"
                  autoComplete="off"
                  autoCapitalize="none"
                  autoFocus
                  value={securityAnswer}
                  onChange={e => setSecurityAnswer(e.target.value)}
                  placeholder="Sua resposta"
                  className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50"
                />
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  Comparação ignora maiúsculas/minúsculas e espaços extras.
                </p>
              </div>
              <button
                type="submit"
                disabled={!securityAnswer.trim()}
                className="w-full bg-primary text-primary-foreground rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
              >
                Continuar
              </button>
            </form>
          )}

          {/* Passo 3 */}
          {step === 3 && (
            <form onSubmit={onResetPassword} className="space-y-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Nova senha</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  autoFocus
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 placeholder:text-muted-foreground"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Confirmar nova senha</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Repita a senha"
                  className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 placeholder:text-muted-foreground"
                />
              </div>
              <button
                type="submit"
                disabled={submitting || !newPassword || !confirmPassword || attemptsRemaining === 0}
                className="w-full bg-primary text-primary-foreground rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
              >
                {submitting && <Loader2 className="animate-spin" size={16} />}
                <Check size={16} /> Redefinir senha
              </button>
            </form>
          )}

          {/* Voltar */}
          <button
            type="button"
            onClick={goBack}
            className="text-xs text-muted-foreground mt-4 mx-auto flex items-center gap-1 active:scale-95"
          >
            <ArrowLeft size={12} />
            {step === 1 ? 'Voltar para login' : 'Voltar para passo anterior'}
          </button>
        </>
      )}

      {mode === 'forgot-success' && (
        <>
          <div className="text-center mb-6">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary/15 flex items-center justify-center">
              <Check className="text-primary" size={28} />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Senha redefinida</h1>
          </div>
          <Progress value={100} className="h-1.5 mb-6" />
          <div className="space-y-4">
            <div className="bg-primary/10 border border-primary/30 rounded-xl p-4 text-center">
              <p className="text-sm text-foreground">Sua senha foi atualizada com sucesso.</p>
              <p className="text-xs text-muted-foreground mt-1">Use a nova senha para entrar.</p>
            </div>
            <button
              onClick={goLogin}
              className="w-full bg-primary text-primary-foreground rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              <LogIn size={16} /> Ir para login
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default AuthPage;
