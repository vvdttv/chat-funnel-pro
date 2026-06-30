import { useState } from 'react';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

/**
 * Painel para apagar todos os registros marcados como is_demo = true.
 * Restrito a superadmin. Exige confirmação dupla (modal + texto "LIMPAR").
 * Os dados reais (is_demo = false) nunca são tocados.
 */
export default function DemoDataManager() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [openDialog, setOpenDialog] = useState(false);

  const isSuperadmin = profile?.role === 'superadmin';

  const handleWipe = async () => {
    if (confirmText !== 'LIMPAR') {
      toast({
        title: 'Confirmação inválida',
        description: 'Digite exatamente "LIMPAR" para confirmar.',
        variant: 'destructive',
      });
      return;
    }
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('wipe-demo-data', {
        body: { confirm: 'LIMPAR' },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);

      const affected = (data as { tables_affected?: number })?.tables_affected ?? 0;
      toast({
        title: 'Dados de demonstração apagados',
        description: `${affected} tabelas afetadas. Atualize a página para ver o resultado.`,
      });
      setOpenDialog(false);
      setConfirmText('');
    } catch (err) {
      toast({
        title: 'Falha ao apagar dados de demonstração',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      setRunning(false);
    }
  };

  if (!isSuperadmin) {
    return (
      <div className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
        Esta seção está disponível apenas para o superadmin.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-card p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-warning/15 p-2 shrink-0">
            <AlertTriangle size={18} className="text-warning" />
          </div>
          <div className="flex-1 space-y-1">
            <h3 className="text-sm font-semibold text-foreground">Dados de demonstração</h3>
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              Esta opção apaga todos os registros marcados como <code className="text-[11px] bg-secondary px-1 py-0.5 rounded">is_demo = true</code>.
              Os dados reais permanecem intactos. A operação é irreversível e leva cerca de 30 segundos.
            </p>
          </div>
        </div>

        <AlertDialog open={openDialog} onOpenChange={setOpenDialog}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" className="gap-2">
              <Trash2 size={14} /> Limpar dados de demonstração
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar limpeza</AlertDialogTitle>
              <AlertDialogDescription className="space-y-3">
                <span className="block">
                  Esta ação apaga todos os registros marcados como dados de demonstração
                  em todas as tabelas operacionais (deals, mensagens, atividades, decisões da IA, etc.).
                </span>
                <span className="block">
                  Os dados reais (com <code className="text-[11px] bg-secondary px-1 py-0.5 rounded">is_demo = false</code>) não serão afetados.
                </span>
                <span className="block">
                  Digite <strong>LIMPAR</strong> abaixo para confirmar:
                </span>
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="LIMPAR"
                  autoComplete="off"
                />
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={running}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); handleWipe(); }}
                disabled={running || confirmText !== 'LIMPAR'}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2"
              >
                {running ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {running ? 'Apagando...' : 'Apagar agora'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}