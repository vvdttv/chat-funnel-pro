import { useState, useEffect, useCallback } from 'react';
import { GraduationCap, Plus, Trash2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

interface Permission {
  id: number;
  phone_e164: string;
  label: string;
  is_active: boolean;
  created_at: string;
}

/**
 * Config — Modo Treinador: cadastra quem pode treinar a IA via WhatsApp
 * (#modofeedback). Senha guardada com hash (bcrypt) no banco; nunca exibida.
 */
export function FeedbackPermissionsManager() {
  const { toast } = useToast();
  const [perms, setPerms] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('list_feedback_permissions');
    if (error) toast({ title: 'Erro ao carregar', description: error.message, variant: 'destructive' });
    else setPerms((data ?? []) as Permission[]);
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const normalizePhone = (v: string) => {
    const d = v.replace(/\D/g, '');
    return d ? `+${d}` : '';
  };

  const handleAdd = async () => {
    const e164 = normalizePhone(phone);
    if (!e164) { toast({ title: 'Número inválido', variant: 'destructive' }); return; }
    if (password.length < 6) { toast({ title: 'Senha muito curta', description: 'Mínimo 6 caracteres.', variant: 'destructive' }); return; }
    setBusy(true);
    const { error } = await supabase.rpc('upsert_feedback_permission', {
      p_phone_e164: e164, p_password: password, p_label: label || '',
    });
    setBusy(false);
    if (error) { toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Permissão salva', description: `${e164} pode treinar a IA via WhatsApp.` });
    setPhone(''); setPassword(''); setLabel('');
    load();
  };

  const handleDelete = async (id: number, phoneLabel: string) => {
    if (!confirm(`Remover a permissão de ${phoneLabel}?`)) return;
    const { error } = await supabase.rpc('delete_feedback_permission', { p_id: id });
    if (error) { toast({ title: 'Erro ao remover', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Permissão removida' });
    load();
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center gap-2">
        <GraduationCap size={20} className="text-primary" />
        <h2 className="font-semibold">Modo Treinador — Permissões</h2>
        <Button size="icon" variant="ghost" onClick={load} aria-label="Atualizar" className="ml-auto">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Quem pode treinar a IA pelo WhatsApp (enviando <code>#modofeedback</code> + senha).
        A senha é guardada de forma segura (criptografada) e não pode ser vista depois — só redefinida.
      </p>

      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium">Adicionar / atualizar permissão</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Input placeholder="Número (com DDD)" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Input placeholder="Senha (mín. 6)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Input placeholder="Nome/rótulo" value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <Button onClick={handleAdd} disabled={busy} className="gap-1">
          <Plus size={15} /> {busy ? 'Salvando…' : 'Salvar permissão'}
        </Button>
      </Card>

      <div className="space-y-2">
        {!loading && perms.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhuma permissão cadastrada.</p>
        )}
        {perms.map((p) => (
          <Card key={p.id} className="p-3 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="font-medium">{p.label || p.phone_e164}</div>
              <div className="text-xs text-muted-foreground">{p.phone_e164}</div>
            </div>
            <Badge variant={p.is_active ? 'default' : 'secondary'}>{p.is_active ? 'ativo' : 'inativo'}</Badge>
            <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleDelete(p.id, p.label || p.phone_e164)} aria-label="Remover">
              <Trash2 size={15} />
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default FeedbackPermissionsManager;
