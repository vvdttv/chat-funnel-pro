import { useState, FormEvent, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

const AuthPage = () => {
  const { signInWithUsername, session, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

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

  return (
    <div className="max-w-md mx-auto h-screen bg-background text-foreground flex flex-col justify-center px-6">
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

      <p className="text-[10px] text-muted-foreground text-center mt-6">
        O acesso é apenas por convite. Solicite ao administrador da sua empresa.
      </p>
    </div>
  );
};

export default AuthPage;
