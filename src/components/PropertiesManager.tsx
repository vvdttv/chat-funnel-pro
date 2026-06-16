import { useState, useRef, useMemo } from 'react';
import { Plus, Pencil, Trash2, X, Building2, Loader2, ToggleLeft, ToggleRight, Upload, Percent } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  usePropertiesContext, type Property, type PropertyInput, type PropertyStatus,
} from '@/hooks/useProperties';
import { useOrgSettings } from '@/hooks/useOrgSettings';

const BUCKET = 'whatsapp-media-public';

const STATUS_OPTIONS: { value: PropertyStatus; label: string }[] = [
  { value: 'disponivel', label: 'Disponível' },
  { value: 'reservado', label: 'Reservado' },
  { value: 'vendido', label: 'Vendido' },
  { value: 'inativo', label: 'Inativo' },
];

const STATUS_CLS: Record<PropertyStatus, string> = {
  disponivel: 'bg-[hsl(150,40%,25%)]/40 text-[hsl(150,60%,65%)]',
  reservado: 'bg-warning/15 text-warning',
  vendido: 'bg-primary/15 text-primary',
  inativo: 'bg-secondary text-muted-foreground',
};

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// ========== FORM (create/edit) ==========

const PropertyForm = ({ property, projectionPct, onSave, onCancel }: {
  property?: Property;
  projectionPct: number;
  onSave: (input: PropertyInput) => Promise<void>;
  onCancel: () => void;
}) => {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  const [code, setCode] = useState(property?.code ?? '');
  const [title, setTitle] = useState(property?.title ?? '');
  const [price, setPrice] = useState<string>(property ? String(property.price) : '');
  // Avaliação: se já existe usa o valor salvo; senão fica vazio (placeholder = projeção).
  const [appraisal, setAppraisal] = useState<string>(
    property?.appraisalValue != null ? String(property.appraisalValue) : '',
  );
  const [city, setCity] = useState(property?.city ?? '');
  const [neighborhood, setNeighborhood] = useState(property?.neighborhood ?? '');
  const [bedrooms, setBedrooms] = useState<string>(property?.bedrooms != null ? String(property.bedrooms) : '');
  const [parking, setParking] = useState<string>(property?.parkingSpaces != null ? String(property.parkingSpaces) : '');
  const [status, setStatus] = useState<PropertyStatus>(property?.status ?? 'disponivel');
  const [notes, setNotes] = useState(property?.notes ?? '');
  const [photoUrl, setPhotoUrl] = useState<string | null>(property?.photoUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const priceNum = Number(price) || 0;
  // Valor exato projetado a partir da % da org (mostrado quando o captador não digitou avaliação).
  const projectedAppraisal = useMemo(
    () => Math.round(priceNum * (1 + projectionPct / 100) * 100) / 100,
    [priceNum, projectionPct],
  );
  const effectiveAppraisal = appraisal !== '' ? Number(appraisal) : projectedAppraisal;

  const handleUpload = async (file: File) => {
    if (!orgId) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${orgId}/properties/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
      if (error) { console.error('[PropertyForm] upload erro', error); return; }
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      setPhotoUrl(data.publicUrl);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!code.trim() || priceNum <= 0 || saving) return;
    setSaving(true);
    try {
      await onSave({
        code: code.trim(),
        title: title.trim(),
        price: priceNum,
        // Grava a avaliação efetiva (digitada ou projetada) — match usa este valor.
        appraisalValue: effectiveAppraisal,
        city: city.trim() || null,
        neighborhood: neighborhood.trim() || null,
        bedrooms: bedrooms !== '' ? Number(bedrooms) : null,
        parkingSpaces: parking !== '' ? Number(parking) : null,
        status,
        notes: notes.trim() || null,
        photoUrl,
      });
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground';

  return (
    <div className="fixed inset-0 z-50 bg-background/80 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">{property ? 'Editar imóvel' : 'Novo imóvel'}</h3>
          <button onClick={onCancel} className="p-1 text-muted-foreground active:scale-95"><X size={18} /></button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] text-muted-foreground">Código *</label>
            <input value={code} onChange={e => setCode(e.target.value)} className={inputCls} placeholder="AP-001" />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value as PropertyStatus)} className={inputCls}>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-[11px] text-muted-foreground">Título</label>
          <input value={title} onChange={e => setTitle(e.target.value)} className={inputCls} placeholder="Apto 2 quartos, Jardim..." />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] text-muted-foreground">Preço (R$) *</label>
            <input type="number" value={price} onChange={e => setPrice(e.target.value)} className={inputCls} placeholder="240000" />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">Avaliação (R$)</label>
            <input type="number" value={appraisal} onChange={e => setAppraisal(e.target.value)} className={inputCls}
              placeholder={priceNum > 0 ? String(projectedAppraisal) : 'projeção'} />
          </div>
        </div>
        {priceNum > 0 && (
          <p className="text-[10px] text-muted-foreground -mt-1">
            {appraisal !== ''
              ? `Avaliação informada: ${brl(Number(appraisal))}`
              : `Projeção ${projectionPct}% → ${brl(projectedAppraisal)} (editável acima)`}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] text-muted-foreground">Cidade</label>
            <input value={city} onChange={e => setCity(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">Bairro</label>
            <input value={neighborhood} onChange={e => setNeighborhood(e.target.value)} className={inputCls} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] text-muted-foreground">Quartos</label>
            <input type="number" value={bedrooms} onChange={e => setBedrooms(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">Vagas</label>
            <input type="number" value={parking} onChange={e => setParking(e.target.value)} className={inputCls} />
          </div>
        </div>

        <div>
          <label className="text-[11px] text-muted-foreground">Observações</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={inputCls} />
        </div>

        <div>
          <label className="text-[11px] text-muted-foreground">Foto</label>
          <div className="flex items-center gap-2">
            {photoUrl && <img src={photoUrl} alt="" className="w-12 h-12 rounded-lg object-cover" />}
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary text-xs text-foreground active:scale-95">
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Enviar
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={onCancel} className="flex-1 px-3 py-2 rounded-lg bg-secondary text-sm text-foreground active:scale-95">Cancelar</button>
          <button onClick={handleSave} disabled={!code.trim() || priceNum <= 0 || saving}
            className="flex-1 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium active:scale-95 disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ========== CARD ==========

const PropertyCard = ({ property, onEdit, onDelete, onToggle }: {
  property: Property;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) => (
  <div className="bg-card border border-border rounded-xl p-3 mb-2 flex items-center gap-3">
    {property.photoUrl
      ? <img src={property.photoUrl} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
      : <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center shrink-0"><Building2 size={18} className="text-muted-foreground" /></div>}
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-foreground truncate">{property.code}</span>
        <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${STATUS_CLS[property.status]}`}>
          {STATUS_OPTIONS.find(o => o.value === property.status)?.label}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground truncate">{property.title || '—'}</p>
      <p className="text-[11px] text-foreground">
        {brl(property.price)}
        {property.appraisalValue != null && <span className="text-muted-foreground"> · aval. {brl(property.appraisalValue)}</span>}
        {property.city && <span className="text-muted-foreground"> · {property.city}</span>}
      </p>
    </div>
    <div className="flex items-center gap-1 shrink-0">
      <button onClick={onToggle} className="p-1 text-muted-foreground active:scale-95" title={property.isActive ? 'Ativo' : 'Inativo'}>
        {property.isActive ? <ToggleRight size={18} className="text-primary" /> : <ToggleLeft size={18} />}
      </button>
      <button onClick={onEdit} className="p-1 text-muted-foreground active:scale-95"><Pencil size={15} /></button>
      <button onClick={onDelete} className="p-1 text-destructive active:scale-95"><Trash2 size={15} /></button>
    </div>
  </div>
);

// ========== MANAGER ==========

const PropertiesManager = () => {
  const { properties, loading, addProperty, updateProperty, deleteProperty } = usePropertiesContext();
  const { settings, updateMaxProjectionPct } = useOrgSettings();
  const [editing, setEditing] = useState<Property | null>(null);
  const [creating, setCreating] = useState(false);
  const [pctDraft, setPctDraft] = useState<string>('');
  const [savingPct, setSavingPct] = useState(false);

  const pct = settings.maxProjectionPct;
  const draftVal = pctDraft !== '' ? Number(pctDraft) : pct;

  const savePct = async () => {
    if (pctDraft === '' || savingPct) return;
    const clamped = Math.max(0, Number(pctDraft) || 0);
    setSavingPct(true);
    await updateMaxProjectionPct(clamped);
    setSavingPct(false);
    setPctDraft('');
  };

  return (
    <div>
      {/* % de projeção de avaliação (org settings) */}
      <div className="bg-card border border-border rounded-xl p-3 mb-3">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
          <Percent size={12} /> Projeção de avaliação
        </p>
        <p className="text-[11px] text-muted-foreground mb-2">
          Quando o imóvel não tem avaliação informada, o match usa o preço acrescido desta %.
          Imóvel sem entrada exige avaliação ≥ preço.
        </p>
        <div className="flex items-center gap-2">
          <input type="number" min={0} value={pctDraft} onChange={e => setPctDraft(e.target.value)}
            placeholder={String(pct)} className="w-24 px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-foreground" />
          <span className="text-xs text-muted-foreground">% atual: {pct}%</span>
          <button onClick={savePct} disabled={pctDraft === '' || savingPct}
            className="ml-auto px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium active:scale-95 disabled:opacity-50">
            {savingPct ? <Loader2 size={14} className="animate-spin" /> : 'Salvar %'}
          </button>
        </div>
        {pctDraft !== '' && Number.isFinite(draftVal) && (
          <p className="text-[10px] text-muted-foreground mt-1">Ex.: imóvel de {brl(200000)} → avaliação projetada {brl(Math.round(200000 * (1 + draftVal / 100)))}</p>
        )}
      </div>

      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-muted-foreground">{properties.length} imóveis cadastrados</span>
        <button onClick={() => setCreating(true)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium active:scale-95 transition-transform">
          <Plus size={14} /> Novo
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-muted-foreground" /></div>
      ) : properties.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-8">Nenhum imóvel cadastrado.</p>
      ) : (
        properties.map(p => (
          <PropertyCard key={p.id} property={p}
            onEdit={() => setEditing(p)}
            onDelete={() => { if (confirm(`Excluir imóvel ${p.code}?`)) deleteProperty(p.id); }}
            onToggle={() => updateProperty(p.id, { isActive: !p.isActive })} />
        ))
      )}

      {(creating || editing) && (
        <PropertyForm
          property={editing ?? undefined}
          projectionPct={pct}
          onSave={async (input) => {
            if (editing) await updateProperty(editing.id, input);
            else await addProperty(input);
            setCreating(false); setEditing(null);
          }}
          onCancel={() => { setCreating(false); setEditing(null); }}
        />
      )}
    </div>
  );
};

export default PropertiesManager;
