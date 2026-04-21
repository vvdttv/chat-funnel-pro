import { useState, useEffect, FormEvent } from 'react';
import { Shield, Loader2, Check, Trash2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { sanitizeQuestion, sanitizeAnswer } from '@/lib/sanitize';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const SecurityQuestionManager = () => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [hasQuestion, setHasQuestion] = useState<boolean>(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
    const cleanQuestion = sanitizeQuestion(question);
    const cleanAnswer = sanitizeAnswer(answer);
    const cleanConfirm = sanitizeAnswer(confirm);

    if (cleanQuestion.length < 5) {
      toast({ title: 'Pergunta muito curta', description: 'Mínimo 5 caracteres (sem HTML).', variant: 'destructive' });
      return;
    }
    if (cleanAnswer.length < 2) {
      toast({ title: 'Resposta inválida', description: 'Mínimo 2 caracteres (sem HTML).', variant: 'destructive' });
      return;
    }
    if (cleanAnswer !== cleanConfirm) {
      toast({ title: 'As respostas não coincidem', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke('set-security-question', {
      body: { question: cleanQuestion, answer: cleanAnswer },
    });
    setSubmitting(false);
    if (error || (data as any)?.error) {
      toast({ title: 'Falha ao salvar', description: (data as any)?.error || error?.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Pergunta de segurança salva' });
    setHasQuestion(true);
    setQuestion(cleanQuestion);
    setAnswer('');
    setConfirm('');
  };

  const onDelete = async () => {
    setDeleting(true);
    const { data, error } = await supabase.functions.invoke('delete-security-question');
    setDeleting(false);
    if (error || (data as any)?.error) {
      toast({
        title: 'Falha ao excluir',
        description: (data as any)?.error || error?.message,
        variant: 'destructive',
      });
      return;
    }
    setHasQuestion(false);
    setQuestion('');
    setAnswer('');
    setConfirm('');
    setConfirmDeleteOpen(false);
    toast({
      title: 'Pergunta excluída',
      description: 'O estado de recuperação foi resetado. Cadastre uma nova pergunta para reabilitar o "Esqueci minha senha".',
    });
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

          {hasQuestion && (
            <button
              type="button"
              onClick={() => setConfirmDeleteOpen(true)}
              disabled={submitting || deleting}
              className="w-full bg-destructive/10 text-destructive border border-destructive/30 rounded-lg py-2 text-xs font-semibold flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
            >
              <Trash2 size={13} />
              Excluir pergunta de segurança
            </button>
          )}
        </form>
      </div>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <div className="w-12 h-12 rounded-2xl bg-destructive/15 flex items-center justify-center mb-2">
              <AlertTriangle className="text-destructive" size={22} />
            </div>
            <AlertDialogTitle>Excluir pergunta de segurança?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                Sua pergunta atual e resposta serão removidas permanentemente, e o histórico de tentativas
                de recuperação será zerado.
              </span>
              <span className="block font-medium text-destructive">
                Sem pergunta cadastrada, você não conseguirá usar “Esqueci minha senha” — só um administrador
                poderá redefinir seu acesso.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); onDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 flex items-center gap-2"
            >
              {deleting && <Loader2 size={13} className="animate-spin" />}
              <Trash2 size={13} />
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SecurityQuestionManager;
