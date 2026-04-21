import { useEffect, useState } from 'react';
import { Plus, KeyRound, Trash2, Shield, User as UserIcon, Loader2, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth, AppRole } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface Member {
  user_id: string;
  username: string;
  display_name: string | null;
  role: AppRole;
}

export const UsersManager = () => {
  const { isAdmin, profile, user } = useAuth();
  const { toast } = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [resetTarget, setResetTarget] = useState<Member | null>(null);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState<AppRole>('corretor');
  const [submitting, setSubmitting] = useState(false);
  const [resetPwd, setResetPwd] = useState('');

  const loadMembers = async () => {
    if (!profile) return;
    setLoading(true);
    const { data: profs } = await supabase
      .from('profiles')
      .select('user_id, username, display_name')
      .eq('organization_id', profile.organization_id);
    const { data: rolesData } = await supabase
      .from('user_roles')
      .select('user_id, role')
      .eq('organization_id', profile.organization_id);
    const roleMap = new Map<string, AppRole>();
    (rolesData || []).forEach(r => roleMap.set(r.user_id, r.role as AppRole));
    const list: Member[] = (profs || []).map(p => ({
      user_id: p.user_id,
      username: p.username,
      display_name: p.display_name,
      role: roleMap.get(p.user_id) || 'corretor',
    }));
    setMembers(list);
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) loadMembers();
  }, [isAdmin, profile?.organization_id]);

  if (!isAdmin) {
    return (
      <div className="bg-card border border-border rounded-xl p-4 text-center">
        <Shield className="mx-auto mb-2 text-muted-foreground" size={20} />
        <p className="text-xs text-muted-foreground">Apenas admins gerenciam usuários.</p>
      </div>
    );
  }

  const handleCreate = async () => {
    if (!newUsername.trim() || newPassword.length < 6) {
      toast({ title: 'Dados inválidos', description: 'Usuário e senha (mín. 6 chars) obrigatórios.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke('create-user', {
      body: {
        username: newUsername.trim().toLowerCase(),
        password: newPassword,
        display_name: newDisplayName.trim() || newUsername.trim(),
        role: newRole,
      },
    });
    setSubmitting(false);
    if (error || (data && data.error)) {
      toast({ title: 'Falha ao criar', description: (data?.error || error?.message || 'Erro'), variant: 'destructive' });
      return;
    }
    toast({ title: 'Usuário criado', description: `${newUsername} pode fazer login agora.` });
    setShowCreate(false);
    setNewUsername(''); setNewPassword(''); setNewDisplayName(''); setNewRole('corretor');
    loadMembers();
  };

  const handleReset = async () => {
    if (!resetTarget || resetPwd.length < 6) return;
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke('reset-user-password', {
      body: { target_user_id: resetTarget.user_id, new_password: resetPwd },
    });
    setSubmitting(false);
    if (error || (data && data.error)) {
      toast({ title: 'Falha', description: (data?.error || error?.message || 'Erro'), variant: 'destructive' });
      return;
    }
    toast({ title: 'Senha redefinida', description: `Nova senha de ${resetTarget.username} aplicada.` });
    setResetTarget(null);
    setResetPwd('');
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Usuários da empresa</h3>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1 bg-primary/15 text-primary text-[11px] font-medium px-2.5 py-1 rounded-full active:scale-95"
        >
          <Plus size={11} /> Novo
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="animate-spin text-muted-foreground" size={18} />
        </div>
      ) : members.length === 0 ? (
        <p className="text-[11px] text-muted-foreground text-center py-3">Nenhum usuário ainda.</p>
      ) : (
        <div className="space-y-1.5">
          {members.map(m => (
            <div key={m.user_id} className="bg-card border border-border rounded-xl p-2.5 flex items-center gap-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${m.role === 'admin' ? 'bg-primary/15 text-primary' : 'bg-secondary text-foreground'}`}>
                {m.role === 'admin' ? <Shield size={14} /> : <UserIcon size={14} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">
                  {m.display_name || m.username}
                  {m.user_id === user?.id && <span className="text-muted-foreground font-normal ml-1">(você)</span>}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">@{m.username} · {m.role}</p>
              </div>
              <button
                onClick={() => setResetTarget(m)}
                className="p-1.5 text-muted-foreground active:scale-95"
                title="Redefinir senha"
              >
                <KeyRound size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modal criar */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-card border border-border rounded-2xl p-4 w-full max-w-sm space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-foreground">Novo usuário</h4>
              <button onClick={() => setShowCreate(false)} className="text-muted-foreground"><X size={16} /></button>
            </div>
            <div className="space-y-2">
              <input
                value={newUsername} onChange={e => setNewUsername(e.target.value)}
                placeholder="usuário (ex: joao)"
                autoCapitalize="none"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              />
              <input
                value={newDisplayName} onChange={e => setNewDisplayName(e.target.value)}
                placeholder="Nome de exibição"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              />
              <input
                value={newPassword} onChange={e => setNewPassword(e.target.value)}
                type="password" placeholder="Senha (mín. 6)"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              />
              <select
                value={newRole} onChange={e => setNewRole(e.target.value as AppRole)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              >
                <option value="corretor">Corretor (vê só seus deals)</option>
                <option value="admin">Admin (vê tudo)</option>
              </select>
            </div>
            <button
              onClick={handleCreate} disabled={submitting}
              className="w-full bg-primary text-primary-foreground rounded-lg py-2 text-sm font-semibold active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="animate-spin" size={14} />}
              Criar usuário
            </button>
          </div>
        </div>
      )}

      {/* Modal reset senha */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setResetTarget(null)}>
          <div className="bg-card border border-border rounded-2xl p-4 w-full max-w-sm space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-foreground">Nova senha de @{resetTarget.username}</h4>
              <button onClick={() => setResetTarget(null)} className="text-muted-foreground"><X size={16} /></button>
            </div>
            <input
              value={resetPwd} onChange={e => setResetPwd(e.target.value)}
              type="password" placeholder="Nova senha (mín. 6)"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
            />
            <button
              onClick={handleReset} disabled={submitting || resetPwd.length < 6}
              className="w-full bg-primary text-primary-foreground rounded-lg py-2 text-sm font-semibold active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="animate-spin" size={14} />}
              Redefinir
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersManager;
