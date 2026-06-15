import { useState, useRef } from 'react';
import { Plus, Pencil, Trash2, X, User, Loader2, ToggleLeft, ToggleRight, Upload } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePersonasContext, type AgentPersona, type PersonaInput } from '@/hooks/usePersonas';

const BUCKET = 'whatsapp-media-public';

// ========== FORM (create/edit) ==========

const PersonaForm = ({ persona, onSave, onCancel }: {
  persona?: AgentPersona;
  onSave: (input: PersonaInput) => Promise<void>;
  onCancel: () => void;
}) => {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  const [name, setName] = useState(persona?.name ?? '');
  const [gender, setGender] = useState(persona?.gender ?? '');
  const [personality, setPersonality] = useState(persona?.personality ?? '');
  const [style, setStyle] = useState(persona?.style ?? '');
  const [tone, setTone] = useState(persona?.tone ?? '');
  const [mission, setMission] = useState(persona?.mission ?? '');
  const [identityNotes, setIdentityNotes] = useState(persona?.identityNotes ?? '');
  const [photoUrl, setPhotoUrl] = useState<string | null>(persona?.photoUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    if (!orgId) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${orgId}/personas/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
      if (error) { console.error('[PersonaForm] upload erro', error); return; }
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      setPhotoUrl(data.publicUrl);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        gender: gender.trim() || null,
        personality: personality.trim(),
        style: style.trim(),
        tone: tone.trim(),
        mission: mission.trim(),
        identityNotes: identityNotes.trim(),
        photoUrl,
      });
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full bg-secondary rounded-lg px-3 py-2 text-sm text-foreground outline-none border border-border focus:border-primary/50 placeholder:text-muted-foreground';
  const labelCls = 'text-[10px] text-muted-foreground uppercase tracking-wide mb-1 block';

  return (
    <div className="bg-card rounded-xl p-4 mb-4 border border-border">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-foreground">{persona ? 'Editar Persona' : 'Nova Persona'}</span>
        <button onClick={onCancel} className="p-1 text-muted-foreground active:scale-95"><X size={16} /></button>
      </div>
      <div className="space-y-3">
        {/* Foto */}
        <div className="flex items-center gap-3">
          <div className="w-16 h-16 rounded-full bg-secondary border border-border flex items-center justify-center overflow-hidden shrink-0">
            {photoUrl
              ? <img src={photoUrl} alt="" className="w-full h-full object-cover" />
              : <User size={24} className="text-muted-foreground" />}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary text-foreground text-xs font-medium active:scale-[0.98] disabled:opacity-50"
          >
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {photoUrl ? 'Trocar foto' : 'Enviar foto'}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>Nome</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Marina" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Sexo</label>
            <input value={gender} onChange={e => setGender(e.target.value)} placeholder="feminino" className={inputCls} />
          </div>
        </div>

        <div>
          <label className={labelCls}>Tom</label>
          <input value={tone} onChange={e => setTone(e.target.value)} placeholder="Cordial, consultivo, sem pressão" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Personalidade</label>
          <textarea value={personality} onChange={e => setPersonality(e.target.value)} rows={2} placeholder="Empática, paciente, didática" className={`${inputCls} resize-none`} />
        </div>
        <div>
          <label className={labelCls}>Estilo</label>
          <textarea value={style} onChange={e => setStyle(e.target.value)} rows={2} placeholder="Mensagens curtas, linguagem acessível, emojis pontuais" className={`${inputCls} resize-none`} />
        </div>
        <div>
          <label className={labelCls}>Missão</label>
          <input value={mission} onChange={e => setMission(e.target.value)} placeholder="Avançar o lead respeitando seu ritmo" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Notas de identidade (injetadas no prompt)</label>
          <textarea value={identityNotes} onChange={e => setIdentityNotes(e.target.value)} rows={2} placeholder="Observações livres que reforçam a identidade" className={`${inputCls} resize-none`} />
        </div>

        <button
          onClick={handleSave}
          disabled={!name.trim() || saving}
          className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold active:scale-[0.98] transition-transform disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          {persona ? 'Salvar Alterações' : 'Criar Persona'}
        </button>
      </div>
    </div>
  );
};

// ========== CARD ==========

const PersonaCard = ({ persona, onEdit, onDelete, onToggle }: {
  persona: AgentPersona;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) => (
  <div className="flex items-center gap-3 bg-card rounded-xl p-3 mb-2">
    <div className="w-11 h-11 rounded-full bg-secondary border border-border flex items-center justify-center overflow-hidden shrink-0">
      {persona.photoUrl
        ? <img src={persona.photoUrl} alt="" className="w-full h-full object-cover" />
        : <User size={18} className="text-muted-foreground" />}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-semibold text-foreground truncate">
        {persona.name}
        {persona.gender ? <span className="text-[10px] text-muted-foreground font-normal ml-1.5">· {persona.gender}</span> : null}
      </p>
      <p className="text-[11px] text-muted-foreground truncate">{persona.tone || 'sem tom definido'}</p>
    </div>
    <button
      onClick={onToggle}
      className={`p-1.5 active:scale-95 ${persona.isActive ? 'text-primary' : 'text-muted-foreground'}`}
      title={persona.isActive ? 'Ativa' : 'Inativa'}
    >
      {persona.isActive ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
    </button>
    <button onClick={onEdit} className="p-2 text-muted-foreground active:scale-95"><Pencil size={15} /></button>
    <button onClick={onDelete} className="p-2 text-destructive active:scale-95"><Trash2 size={15} /></button>
  </div>
);

// ========== MANAGER ==========

const PersonasManager = () => {
  const { personas, loading, addPersona, updatePersona, deletePersona } = usePersonasContext();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleCreate = async (input: PersonaInput) => {
    await addPersona(input);
    setCreating(false);
  };

  const handleUpdate = async (id: string, input: PersonaInput) => {
    await updatePersona(id, input);
    setEditingId(null);
  };

  const handleDelete = async (persona: AgentPersona) => {
    if (!confirm(`Excluir a persona "${persona.name}"? As conversas dela mantêm o histórico.`)) return;
    await deletePersona(persona.id);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 size={20} className="animate-spin" />
        <span className="text-xs ml-2">Carregando personas…</span>
      </div>
    );
  }

  return (
    <div>
      <div className="text-xs text-muted-foreground bg-card/50 border border-border rounded-lg p-3 mb-3">
        O lead percebe apenas as personas que você cadastra aqui. Cada número de WhatsApp é vinculado a uma persona — trocou de número, o lead percebe a persona daquele número continuando o atendimento.
      </div>

      {creating && <PersonaForm onSave={handleCreate} onCancel={() => setCreating(false)} />}
      {editingId && (
        <PersonaForm
          persona={personas.find(p => p.id === editingId)}
          onSave={(input) => handleUpdate(editingId, input)}
          onCancel={() => setEditingId(null)}
        />
      )}

      {!creating && !editingId && (
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-muted-foreground">{personas.length} persona(s)</span>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium active:scale-95 transition-transform"
          >
            <Plus size={14} /> Nova Persona
          </button>
        </div>
      )}

      {personas.length === 0 && !creating
        ? <p className="text-xs text-muted-foreground text-center py-6">Nenhuma persona cadastrada</p>
        : personas.map(p => (
            <PersonaCard
              key={p.id}
              persona={p}
              onEdit={() => { setEditingId(p.id); setCreating(false); }}
              onDelete={() => handleDelete(p)}
              onToggle={() => updatePersona(p.id, { isActive: !p.isActive })}
            />
          ))}
    </div>
  );
};

export default PersonasManager;
