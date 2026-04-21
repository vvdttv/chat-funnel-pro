import { useState, useEffect, FormEvent } from 'react';
import { Shield, Loader2, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

const SecurityQuestionManager = () => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [hasQuestion, setHasQuestion] = useState<boolean>(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!profile) return;
      const { data } = await supabase
        .from('profiles')
        .select('security_question')
        .eq('user_id', profile.user_id)
        .maybeSingle();
      if (!active) return;
      if (data?.security_question) {
        setHasQuestion(true);
        setQuestion(data.security_question);
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [profile]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (question.trim().length < 5) {
      toast({ title: 'Pergunta muito curta', description: 'Mínimo 5 caracteres.', variant: 'destructive' });
      return;
    }
    if (answer.trim().length < 2) {
      toast({ title: 'Resposta inválida', description: 'Mínimo 2 caracteres.', variant: 'destructive' });
      return;
    }
    if (answer !== confirm) {
      toast({ title: 'As respostas não coincidem', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke('set-security-question', {
      body: { question: question.trim(), answer },
    });
    setSubmitting(false);
    if (error || (data as any)?.error) {
      toast({ title: 'Falha ao salvar', description: (data as any)?.error || error?.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Pergunta de segurança salva' });
    setHasQuestion(true);
    setAnswer('');
    setConfirm('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 size={18} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="bg-card rounded-xl p-4 border border-border">
        <div className="flex items-center gap-2 mb-1">
          <Shield size={16} className="text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Pergunta de segurança</h3>
          {hasQuestion && (
            <span className="ml-auto text-[10px] flex items-center gap-1 bg-primary/15 text-primary px-2 py-0.5 rounded-full font-medium">
              <Check size={10} /> Configurada
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground mb-3">
          Usada para recuperar sua senha caso esqueça. A resposta é armazenada de forma segura (hash) e
          comparada de forma case-insensitive, ignorando espaços extras.
        </p>

        <form onSubmit={onSubmit} className="space-y-2.5">
          <div>
            <label className="block text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Pergunta</label>
            <input
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="Ex: Nome do meu primeiro animal de estimação"
              maxLength={200}
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 placeholder:text-muted-foreground"
            />
          </div>
          <div>
            <label className="block text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
              {hasQuestion ? 'Nova resposta' : 'Resposta'}
            </label>
            <input
              type="password"
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              placeholder="Sua resposta"
              maxLength={200}
              autoComplete="off"
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
            />
          </div>
          <div>
            <label className="block text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Confirmar resposta</label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Repita a resposta"
              maxLength={200}
              autoComplete="off"
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-primary text-primary-foreground rounded-lg py-2 text-xs font-semibold flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
          >
            {submitting && <Loader2 size={13} className="animate-spin" />}
            {hasQuestion ? 'Atualizar pergunta' : 'Salvar pergunta'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default SecurityQuestionManager;
