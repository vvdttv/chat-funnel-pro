/**
 * FunnelWizard — Sprint 4 / Mudança A
 *
 * Wizard de criação de funil em 4 passos (mobile-first, Sheet bottom 411px):
 *   1. Identidade   → nome, descrição, ícone, cor, marcar como default
 *   2. Contexto     → tags de contexto que descrevem este funil
 *   3. Etapas       → adiciona etapas vinculadas a um stage_archetype
 *   4. Revisão      → confirma e cria
 *
 * Cria o funil via `addFunnel(...)` do contexto. As etapas com arquétipo
 * vinculado são persistidas em `funnel_stages` (mapeamento físico) após o
 * funil existir — feito em paralelo pelo wizard.
 */

import { useState } from 'react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  ChevronLeft, ChevronRight, Check, Loader2, Plus, X, Sparkles, Layers,
  Tag, Star,
} from 'lucide-react';
import type { Funnel, FunnelStage } from '@/data/mockData';
import { useArchetypes, type StageArchetype } from '@/hooks/useArchetypes';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// Tags de contexto canônicas (alinhadas com LB_CONTEXT_MAP do Sprint 3).
const CONTEXT_TAG_OPTIONS = [
  'venda',
  'locação',
  'pos_venda',
  'lançamento',
  'investidor',
  'alto_padrão',
  'comercial',
  'rural',
  'reativação',
  'qualificação',
] as const;

const ICON_OPTIONS = ['Zap', 'Home', 'Building', 'Briefcase', 'Sparkles', 'Target', 'Layers', 'TrendingUp'];

const COLOR_OPTIONS = [
  { name: 'Verde', value: 'hsl(var(--primary))' },
  { name: 'Azul',  value: 'hsl(210, 80%, 55%)' },
  { name: 'Roxo',  value: 'hsl(270, 70%, 60%)' },
  { name: 'Âmbar', value: 'hsl(40, 90%, 55%)' },
  { name: 'Coral', value: 'hsl(15, 75%, 60%)' },
  { name: 'Ciano', value: 'hsl(190, 70%, 50%)' },
];

interface DraftStage {
  id: string;
  name: string;
  archetypeId: string;
  archetypeCode: string;
  probability: number;
  maxDaysInStage: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (funnel: Funnel) => void;
  addFunnel: (f: Funnel) => void;
}

export const FunnelWizard = ({ open, onOpenChange, onCreated, addFunnel }: Props) => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const { stageArchetypes, loading: loadingArchetypes } = useArchetypes();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Step 1
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('Zap');
  const [color, setColor] = useState(COLOR_OPTIONS[0].value);
  const [isDefault, setIsDefault] = useState(false);
  // Step 2
  const [contextTags, setContextTags] = useState<string[]>([]);
  // Step 3
  const [draftStages, setDraftStages] = useState<DraftStage[]>([]);

  const reset = () => {
    setStep(1); setName(''); setDescription(''); setIcon('Zap');
    setColor(COLOR_OPTIONS[0].value); setIsDefault(false);
    setContextTags([]); setDraftStages([]);
  };

  const close = () => { onOpenChange(false); setTimeout(reset, 300); };

  const toggleTag = (tag: string) => {
    setContextTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const addStage = (archetype: StageArchetype) => {
    const id = `stage-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setDraftStages(prev => [...prev, {
      id,
      name: archetype.name,
      archetypeId: archetype.id,
      archetypeCode: archetype.code,
      probability: Math.min(95, 10 + prev.length * 15),
      maxDaysInStage: 5,
    }]);
  };

  const updateStage = (idx: number, patch: Partial<DraftStage>) => {
    setDraftStages(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
  };

  const removeStage = (idx: number) => {
    setDraftStages(prev => prev.filter((_, i) => i !== idx));
  };

  const moveStage = (idx: number, dir: -1 | 1) => {
    setDraftStages(prev => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };

  const canAdvance = () => {
    if (step === 1) return name.trim().length >= 2;
    if (step === 2) return true; // tags opcionais
    if (step === 3) return draftStages.length >= 1;
    return true;
  };

  const handleCreate = async () => {
    if (!profile?.organization_id) return;
    setSubmitting(true);
    const funnelId = `fun-${Date.now()}`;
    const stages: FunnelStage[] = draftStages.map((s) => ({
      id: s.id,
      name: s.name,
      probability: s.probability,
      maxDaysInStage: s.maxDaysInStage,
      touchpoints: [],
    }));
    const newFunnel: Funnel = {
      id: funnelId,
      name: name.trim(),
      description: description.trim() || 'Sem descrição',
      icon,
      color,
      stages,
    };

    try {
      // Cria o funil (com is_default + context_tags via update direto, pois o
      // hook ainda usa o schema mínimo).
      addFunnel(newFunnel);
      // Aguarda 1 tick para garantir o insert do hook antes de patch
      await new Promise(r => setTimeout(r, 250));

      // Patch com campos novos do schema (is_default, context_tags) + se for
      // default, desmarca os outros funis da org.
      if (isDefault) {
        await supabase
          .from('funnels')
          .update({ is_default: false })
          .eq('organization_id', profile.organization_id);
      }
      await supabase
        .from('funnels')
        .update({
          is_default: isDefault,
          context_tags: contextTags as unknown as never,
        })
        .eq('id', funnelId);

      // Cria o mapeamento físico em funnel_stages (vincula etapa ao arquétipo).
      const funnelStageRows = draftStages.map((s, idx) => ({
        funnel_id: funnelId,
        stage_id: s.id,
        organization_id: profile.organization_id,
        stage_archetype_id: s.archetypeId,
        position: idx,
        purpose: '',
        context_tags: contextTags as unknown as never,
      }));
      if (funnelStageRows.length > 0) {
        const { error: fsErr } = await supabase.from('funnel_stages').insert(funnelStageRows);
        if (fsErr) console.error('[FunnelWizard] funnel_stages insert', fsErr);
      }

      toast({ title: 'Funil criado', description: `"${newFunnel.name}" pronto para uso.` });
      onCreated(newFunnel);
      close();
    } catch (err) {
      console.error('[FunnelWizard] erro ao criar funil', err);
      toast({
        title: 'Erro ao criar funil',
        description: err instanceof Error ? err.message : 'Tente novamente',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <SheetContent side="bottom" className="h-[92vh] p-0 flex flex-col bg-background">
        <SheetHeader className="px-4 pt-4 pb-2 border-b border-border shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={16} className="text-primary" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Novo funil · passo {step} de 4
            </span>
          </div>
          <SheetTitle className="text-base text-left">
            {step === 1 && 'Identidade do funil'}
            {step === 2 && 'Contexto e tags'}
            {step === 3 && 'Etapas do funil'}
            {step === 4 && 'Revisão'}
          </SheetTitle>
          {/* Stepper */}
          <div className="flex gap-1 mt-2">
            {[1, 2, 3, 4].map(n => (
              <div
                key={n}
                className={`h-1 flex-1 rounded-full ${
                  n <= step ? 'bg-primary' : 'bg-secondary'
                }`}
              />
            ))}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4">
          {step === 1 && (
            <Step1Identity
              name={name} setName={setName}
              description={description} setDescription={setDescription}
              icon={icon} setIcon={setIcon}
              color={color} setColor={setColor}
              isDefault={isDefault} setIsDefault={setIsDefault}
            />
          )}
          {step === 2 && (
            <Step2Context tags={contextTags} onToggle={toggleTag} />
          )}
          {step === 3 && (
            <Step3Stages
              stages={draftStages}
              archetypes={stageArchetypes}
              loading={loadingArchetypes}
              onAdd={addStage}
              onUpdate={updateStage}
              onRemove={removeStage}
              onMove={moveStage}
            />
          )}
          {step === 4 && (
            <Step4Review
              name={name} description={description} icon={icon} color={color}
              isDefault={isDefault} contextTags={contextTags} stages={draftStages}
            />
          )}
        </div>

        <div className="border-t border-border p-3 flex gap-2 shrink-0 bg-background">
          <Button
            variant="outline"
            onClick={() => step === 1 ? close() : setStep(s => s - 1)}
            disabled={submitting}
            className="flex-1"
          >
            <ChevronLeft size={16} />
            {step === 1 ? 'Cancelar' : 'Voltar'}
          </Button>
          {step < 4 ? (
            <Button
              onClick={() => setStep(s => s + 1)}
              disabled={!canAdvance() || submitting}
              className="flex-1"
            >
              Próximo <ChevronRight size={16} />
            </Button>
          ) : (
            <Button
              onClick={handleCreate}
              disabled={submitting}
              className="flex-1"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              Criar funil
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

// ============================================================================
// Steps
// ============================================================================

const Step1Identity = ({
  name, setName, description, setDescription, icon, setIcon,
  color, setColor, isDefault, setIsDefault,
}: {
  name: string; setName: (v: string) => void;
  description: string; setDescription: (v: string) => void;
  icon: string; setIcon: (v: string) => void;
  color: string; setColor: (v: string) => void;
  isDefault: boolean; setIsDefault: (v: boolean) => void;
}) => (
  <div className="space-y-4">
    <div>
      <Label htmlFor="funnel-name" className="text-xs">Nome do funil</Label>
      <Input
        id="funnel-name"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Ex: Funil de venda residencial"
        maxLength={60}
        className="mt-1.5"
      />
      <p className="text-[10px] text-muted-foreground mt-1">{name.length}/60</p>
    </div>

    <div>
      <Label htmlFor="funnel-desc" className="text-xs">Descrição (opcional)</Label>
      <textarea
        id="funnel-desc"
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="Para que serve este funil?"
        maxLength={180}
        rows={3}
        className="mt-1.5 w-full bg-card border border-input rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
      />
    </div>

    <div>
      <Label className="text-xs">Ícone</Label>
      <Select value={icon} onValueChange={setIcon}>
        <SelectTrigger className="mt-1.5">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ICON_OPTIONS.map(i => (
            <SelectItem key={i} value={i}>{i}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>

    <div>
      <Label className="text-xs">Cor</Label>
      <div className="flex gap-2 mt-1.5 flex-wrap">
        {COLOR_OPTIONS.map(c => (
          <button
            key={c.value}
            onClick={() => setColor(c.value)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border active:scale-95 ${
              color === c.value ? 'border-primary bg-primary/10' : 'border-border bg-card'
            }`}
          >
            <span
              className="w-3 h-3 rounded-full"
              style={{ background: c.value }}
            />
            {c.name}
          </button>
        ))}
      </div>
    </div>

    <button
      onClick={() => setIsDefault(!isDefault)}
      className={`w-full flex items-center gap-2 p-3 rounded-lg border active:scale-[0.99] ${
        isDefault ? 'border-primary bg-primary/10' : 'border-border bg-card'
      }`}
    >
      <Star
        size={16}
        className={isDefault ? 'text-primary fill-primary' : 'text-muted-foreground'}
      />
      <div className="flex-1 text-left">
        <p className="text-xs font-semibold text-foreground">Funil padrão da organização</p>
        <p className="text-[10px] text-muted-foreground">
          Novos leads sem regra explícita cairão aqui.
        </p>
      </div>
      {isDefault && <Check size={14} className="text-primary" />}
    </button>
  </div>
);

const Step2Context = ({
  tags, onToggle,
}: { tags: string[]; onToggle: (t: string) => void }) => (
  <div className="space-y-3">
    <div className="flex items-start gap-2 bg-card border border-border rounded-lg p-3">
      <Tag size={14} className="text-primary shrink-0 mt-0.5" />
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        As tags ajudam a IA a saber <strong className="text-foreground">quando</strong> aplicar
        este funil e quais comportamentos esperar. Selecione todas as que se aplicam.
      </p>
    </div>
    <div className="flex flex-wrap gap-1.5">
      {CONTEXT_TAG_OPTIONS.map(tag => {
        const active = tags.includes(tag);
        return (
          <button
            key={tag}
            onClick={() => onToggle(tag)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border active:scale-95 transition-colors ${
              active
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-secondary text-muted-foreground border-border'
            }`}
          >
            {active && <Check size={10} className="inline mr-1" />}
            {tag}
          </button>
        );
      })}
    </div>
    {tags.length === 0 && (
      <p className="text-[10px] text-muted-foreground italic">
        Nenhuma tag selecionada — o funil servirá como genérico.
      </p>
    )}
  </div>
);

const Step3Stages = ({
  stages, archetypes, loading, onAdd, onUpdate, onRemove, onMove,
}: {
  stages: DraftStage[];
  archetypes: StageArchetype[];
  loading: boolean;
  onAdd: (a: StageArchetype) => void;
  onUpdate: (idx: number, patch: Partial<DraftStage>) => void;
  onRemove: (idx: number) => void;
  onMove: (idx: number, dir: -1 | 1) => void;
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 size={18} className="animate-spin mr-2" />
        <span className="text-xs">Carregando arquétipos…</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 bg-card border border-border rounded-lg p-3">
        <Layers size={14} className="text-primary shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Cada etapa é vinculada a um <strong className="text-foreground">arquétipo</strong> que
          define o comportamento padrão da IA. Você pode renomear a etapa livremente.
        </p>
      </div>

      {stages.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-6">
          Nenhuma etapa adicionada ainda
        </p>
      )}

      <ul className="space-y-2">
        {stages.map((s, idx) => (
          <li key={s.id} className="bg-card border border-border rounded-lg p-2.5">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-[9px] font-bold bg-primary/15 text-primary px-1.5 py-0.5 rounded shrink-0">
                {s.archetypeCode}
              </span>
              <Input
                value={s.name}
                onChange={e => onUpdate(idx, { name: e.target.value })}
                className="h-7 text-xs flex-1"
                maxLength={40}
              />
              <button
                onClick={() => onRemove(idx)}
                className="text-muted-foreground active:scale-95 shrink-0 p-1"
                aria-label="Remover etapa"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <label className="flex items-center gap-1">
                Prob.
                <Input
                  type="number"
                  min={0} max={100}
                  value={s.probability}
                  onChange={e => onUpdate(idx, { probability: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                  className="h-6 w-14 text-[10px] px-1.5"
                />
                %
              </label>
              <label className="flex items-center gap-1">
                Máx
                <Input
                  type="number"
                  min={1}
                  value={s.maxDaysInStage}
                  onChange={e => onUpdate(idx, { maxDaysInStage: Math.max(1, Number(e.target.value) || 1) })}
                  className="h-6 w-12 text-[10px] px-1.5"
                />
                d
              </label>
              <div className="ml-auto flex gap-0.5">
                <button
                  onClick={() => onMove(idx, -1)}
                  disabled={idx === 0}
                  className="px-1.5 py-0.5 rounded bg-secondary text-muted-foreground active:scale-95 disabled:opacity-30"
                >↑</button>
                <button
                  onClick={() => onMove(idx, +1)}
                  disabled={idx === stages.length - 1}
                  className="px-1.5 py-0.5 rounded bg-secondary text-muted-foreground active:scale-95 disabled:opacity-30"
                >↓</button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {!pickerOpen ? (
        <Button
          variant="outline"
          onClick={() => setPickerOpen(true)}
          className="w-full"
        >
          <Plus size={14} /> Adicionar etapa
        </Button>
      ) : (
        <div className="bg-card border border-border rounded-lg p-2.5 space-y-1.5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Escolha o arquétipo
            </p>
            <button onClick={() => setPickerOpen(false)} className="text-muted-foreground p-0.5">
              <X size={12} />
            </button>
          </div>
          {archetypes.map(a => (
            <button
              key={a.id}
              onClick={() => { onAdd(a); setPickerOpen(false); }}
              className="w-full text-left p-2 rounded-md hover:bg-secondary active:scale-[0.98] transition-colors"
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[9px] font-bold bg-primary/15 text-primary px-1.5 py-0.5 rounded">
                  {a.code}
                </span>
                <span className="text-xs font-semibold text-foreground">{a.name}</span>
              </div>
              {a.purpose && (
                <p className="text-[10px] text-muted-foreground line-clamp-2">{a.purpose}</p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const Step4Review = ({
  name, description, icon, color, isDefault, contextTags, stages,
}: {
  name: string; description: string; icon: string; color: string;
  isDefault: boolean; contextTags: string[]; stages: DraftStage[];
}) => (
  <div className="space-y-3">
    <div className="bg-card border border-border rounded-lg p-3">
      <div className="flex items-center gap-2 mb-1">
        <span
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold"
          style={{ background: color, color: 'white' }}
        >
          {icon.slice(0, 2)}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground truncate">{name}</p>
          <p className="text-[10px] text-muted-foreground truncate">{description || 'Sem descrição'}</p>
        </div>
        {isDefault && (
          <Star size={14} className="text-primary fill-primary" />
        )}
      </div>
    </div>

    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
        Tags de contexto ({contextTags.length})
      </p>
      {contextTags.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic">Nenhuma — funil genérico</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {contextTags.map(t => (
            <span key={t} className="text-[10px] bg-secondary text-foreground px-2 py-0.5 rounded-full">
              {t}
            </span>
          ))}
        </div>
      )}
    </div>

    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
        Etapas ({stages.length})
      </p>
      <ol className="space-y-1.5">
        {stages.map((s, i) => (
          <li key={s.id} className="bg-card border border-border rounded-lg p-2 flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground w-4">{i + 1}.</span>
            <span className="text-[9px] font-bold bg-primary/15 text-primary px-1.5 py-0.5 rounded shrink-0">
              {s.archetypeCode}
            </span>
            <span className="text-xs font-medium text-foreground flex-1 truncate">{s.name}</span>
            <span className="text-[10px] text-muted-foreground">{s.probability}% · {s.maxDaysInStage}d</span>
          </li>
        ))}
      </ol>
    </div>
  </div>
);
