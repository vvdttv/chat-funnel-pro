import { useState, FormEvent, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, Loader2, ArrowLeft, KeyRound } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

type Mode = 'login' | 'forgot-username' | 'forgot-answer' | 'forgot-success';

const AuthPage = () => {
  const { signInWithUsername, session, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>('login');

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
    if (!q) {
      toast({
        title: 'Sem pergunta de segurança',
        description: 'Esse usuário não tem pergunta cadastrada. Peça ao admin para resetar sua senha.',
        variant: 'destructive',
      });
      return;
    }
    setSecurityQuestion(q);
    setMode('forgot-answer');
  };

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
    if (errMsg) {
      toast({ title: 'Falha ao redefinir', description: errMsg, variant: 'destructive' });
      return;
    }
    setMode('forgot-success');
  };

  const goLogin = () => {
    setMode('login');
    setRecoveryUsername('');
    setSecurityQuestion('');
    setSecurityAnswer('');
    setNewPassword('');
    setConfirmPassword('');
  };

  return (
    <div className="max-w-md mx-auto h-screen bg-background text-foreground flex flex-col justify-center px-6">
      <div className="text-center mb-8">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary/15 flex items-center justify-center">
          {mode === 'login' ? <LogIn className="text-primary" size={28} /> : <KeyRound className="text-primary" size={28} />}
        </div>
        <h1 className="text-2xl font-bold text-foreground">
          {mode === 'login' ? 'Entrar' : 'Recuperar senha'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {mode === 'login' && 'Acesse sua conta para continuar'}
          {mode === 'forgot-username' && 'Informe seu usuário para começar'}
          {mode === 'forgot-answer' && 'Responda sua pergunta de segurança'}
          {mode === 'forgot-success' && 'Senha redefinida com sucesso'}
        </p>
      </div>

      {mode === 'login' && (
        <>
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
            onClick={() => setMode('forgot-username')}
            className="text-xs text-primary mt-4 mx-auto block active:scale-95"
          >
            Esqueci minha senha
          </button>

          <p className="text-[10px] text-muted-foreground text-center mt-6">
            O acesso é apenas por convite. Solicite ao administrador da sua empresa.
          </p>
        </>
      )}

      {mode === 'forgot-username' && (
        <form onSubmit={onLookupQuestion} className="space-y-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Usuário</label>
            <input
              type="text"
              autoCapitalize="none"
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
          <button type="button" onClick={goLogin} className="text-xs text-muted-foreground mt-2 mx-auto flex items-center gap-1 active:scale-95">
            <ArrowLeft size={12} /> Voltar para login
          </button>
        </form>
      )}

      {mode === 'forgot-answer' && (
        <form onSubmit={onResetPassword} className="space-y-3">
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
              value={securityAnswer}
              onChange={e => setSecurityAnswer(e.target.value)}
              className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Nova senha</label>
            <input
              type="password"
              autoComplete="new-password"
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
              className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50"
            />
          </div>
          <button
            type="submit"
            disabled={submitting || !securityAnswer || !newPassword || !confirmPassword}
            className="w-full bg-primary text-primary-foreground rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
          >
            {submitting && <Loader2 className="animate-spin" size={16} />}
            Redefinir senha
          </button>
          <button type="button" onClick={goLogin} className="text-xs text-muted-foreground mt-2 mx-auto flex items-center gap-1 active:scale-95">
            <ArrowLeft size={12} /> Voltar para login
          </button>
        </form>
      )}

      {mode === 'forgot-success' && (
        <div className="space-y-4">
          <div className="bg-primary/10 border border-primary/30 rounded-xl p-4 text-center">
            <p className="text-sm text-foreground">Sua senha foi redefinida.</p>
            <p className="text-xs text-muted-foreground mt-1">Use a nova senha para entrar.</p>
          </div>
          <button
            onClick={goLogin}
            className="w-full bg-primary text-primary-foreground rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            <LogIn size={16} /> Ir para login
          </button>
        </div>
      )}
    </div>
  );
};

export default AuthPage;
