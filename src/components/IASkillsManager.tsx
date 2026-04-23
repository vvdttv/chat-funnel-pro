/**
 * Container do gestor de Skills da IA — estilo split list + canvas (GHL-like).
 *
 * Esquerda: lista de skills da org com chip de escopo, # de gatilhos LB,
 *           # de blocos, toggle ativo/inativo, badge "auto-sugerida".
 * Direita:  SkillCanvasEditor da skill selecionada.
 *
 * Em mobile (≤768px) a lista vira um drawer superior; o canvas ocupa a tela.
 * Botões: nova skill, duplicar, exportar JSON, excluir.
 */

import { useMemo, useState } from 'react';
import {
  Plus, Loader2, Trash2, Copy, Download, AlertTriangle,
  Sparkles, ChevronLeft, ListTree,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useSkills } from '@/hooks/useSkills';
import { useIABehavior } from '@/hooks/useIABehavior';
import { SkillCanvasEditor } from '@/components/SkillCanvasEditor';
import type { IASkill, SkillScopeType, TriggerConfig } from '@/data/iaSkills';
import type { SkillWithNodes } from '@/lib/skillComposer';

const SCOPE_LABEL: Record<SkillScopeType, string> = {
  universal: 'Universal',
  stage: 'Por etapa',
  context: 'Por contexto',
};

const SCOPE_BADGE: Record<SkillScopeType, string> = {
  universal: 'bg-primary/15 text-primary border-primary/30',
  stage:     'bg-[hsl(var(--ai-note))] text-foreground border-[hsl(var(--ai-note-border))]',
  context:   'bg-secondary text-secondary-foreground border-border',
};

const STAGE_OPTIONS = [
  { code: 'E0',  name: 'E0 — Entrada' },
  { code: 'E1',  name: 'E1 — Sondagem' },
  { code: 'E2',  name: 'E2 — Qualificação' },
  { code: 'E3',  name: 'E3 — Proposta' },
  { code: 'E4a', name: 'E4a — Aprovado' },
  { code: 'E4b', name: 'E4b — Pós-venda' },
];

// ============================================================================
// Helpers
// ============================================================================

function triggerCodesOf(skill: SkillWithNodes): string[] {
  const trigger = skill.nodes.find(n => n.kind === 'trigger');
  if (!trigger) return [];
  const cfg = trigger.config as unknown as TriggerConfig;
  return cfg?.behaviorCodes ?? [];
}

function exportSkillJson(skill: SkillWithNodes) {
  const payload = {
    code: skill.skill.code,
    name: skill.skill.name,
    description: skill.skill.description,
    scopeType: skill.skill.scopeType,
    scopeId: skill.skill.scopeId,
    isActive: skill.skill.isActive,
    nodes: skill.nodes.map(n => ({
      kind: n.kind,
      parentNodeId: n.parentNodeId,
      branchLabel: n.branchLabel,
      positionX: n.positionX,
      positionY: n.positionY,
      config: n.config,
      position: n.position,
    })),
    guardrailRuleCodes: skill.guardrailRuleCodes,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${skill.skill.code}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ============================================================================
// Diálogo de nova skill
// ============================================================================

interface NewSkillDialogProps {
  onCreate: (s: Omit<IASkill, 'id'>) => Promise<{ id: string | null; error: string | null }>;
  nextPosition: number;
}

function NewSkillDialog({ onCreate, nextPosition }: NewSkillDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [scopeType, setScopeType] = useState<SkillScopeType>('universal');
  const [scopeId, setScopeId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const reset = () => { setName(''); setCode(''); setScopeType('universal'); setScopeId(''); };

  const handleCreate = async () => {
    if (!name.trim() || !code.trim()) {
      toast({ title: 'Preencha nome e código', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const result = await onCreate({
      code: code.trim().toUpperCase(),
      name: name.trim(),
      description: '',
      scopeType,
      scopeId: scopeType === 'universal' ? null : (scopeId || null),
      isActive: true,
      isAutoSuggested: false,
      position: nextPosition,
    });
    setSaving(false);
    if (result.error) {
      toast({ title: 'Erro ao criar skill', description: result.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Skill criada' });
    reset();
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <SheetTrigger asChild>
        <Button size="sm" className="w-full">
          <Plus className="w-4 h-4 mr-1" /> Nova skill
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-auto bg-card border-border md:max-w-md lg:max-w-2xl md:mx-auto rounded-t-2xl">
        <SheetHeader className="text-left">
          <SheetTitle>Nova skill</SheetTitle>
        </SheetHeader>
        <div className="space-y-3 mt-4 pb-6">
          <div>
            <Label className="text-sm">Nome</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex.: Recuperar objeção de prazo"
              className="bg-secondary border-border"
            />
          </div>
          <div>
            <Label className="text-sm">Código</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ex.: SK-RECOVER-DEADLINE"
              className="bg-secondary border-border font-mono text-sm"
            />
          </div>
          <div>
            <Label className="text-sm">Escopo</Label>
            <Select value={scopeType} onValueChange={(v) => setScopeType(v as SkillScopeType)}>
              <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="universal">Universal — qualquer etapa</SelectItem>
                <SelectItem value="stage">Por etapa</SelectItem>
                <SelectItem value="context">Por contexto (tag)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {scopeType === 'stage' && (
            <div>
              <Label className="text-sm">Etapa</Label>
              <Select value={scopeId} onValueChange={setScopeId}>
                <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Escolher etapa" /></SelectTrigger>
                <SelectContent>
                  {STAGE_OPTIONS.map(s => <SelectItem key={s.code} value={s.code}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {scopeType === 'context' && (
            <div>
              <Label className="text-sm">Tag de contexto</Label>
              <Input
                value={scopeId}
                onChange={(e) => setScopeId(e.target.value)}
                placeholder="ex.: real-estate"
                className="bg-secondary border-border"
              />
            </div>
          )}
          <Button onClick={handleCreate} disabled={saving} className="w-full mt-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Criar skill'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================================
// Item da lista
// ============================================================================

interface SkillListItemProps {
  skill: SkillWithNodes;
  selected: boolean;
  onSelect: () => void;
  onToggleActive: () => void;
}

function SkillListItem({ skill, selected, onSelect, onToggleActive }: SkillListItemProps) {
  const triggers = triggerCodesOf(skill);
  const trigger = skill.nodes.find(n => n.kind === 'trigger');
  const triggerInvalid = !trigger || triggers.length === 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left p-3 rounded-lg border transition ${
        selected
          ? 'bg-primary/10 border-primary/40'
          : 'bg-card border-border hover:bg-accent'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <h4 className="text-sm font-semibold text-foreground truncate">{skill.skill.name}</h4>
            {skill.skill.isAutoSuggested && (
              <Sparkles className="w-3 h-3 text-primary shrink-0" />
            )}
            {triggerInvalid && (
              <AlertTriangle className="w-3 h-3 text-[hsl(var(--warning))] shrink-0" />
            )}
          </div>
          <p className="text-[10px] text-muted-foreground font-mono truncate">{skill.skill.code}</p>
        </div>
        <Switch
          checked={skill.skill.isActive}
          onCheckedChange={(e) => { e; onToggleActive(); }}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge variant="outline" className={`text-[10px] ${SCOPE_BADGE[skill.skill.scopeType]}`}>
          {SCOPE_LABEL[skill.skill.scopeType]}
          {skill.skill.scopeId ? ` · ${skill.skill.scopeId}` : ''}
        </Badge>
        <Badge variant="outline" className="text-[10px]">
          {triggers.length} LB
        </Badge>
        <Badge variant="outline" className="text-[10px]">
          {skill.nodes.length} blocos
        </Badge>
        {skill.guardrailRuleCodes.length > 0 && (
          <Badge variant="outline" className="text-[10px]">
            {skill.guardrailRuleCodes.length} guard
          </Badge>
        )}
      </div>
    </button>
  );
}

// ============================================================================
// Componente principal
// ============================================================================

export function IASkillsManager() {
  const { toast } = useToast();
  const {
    loading, error, skills,
    createSkill, updateSkill, deleteSkill,
    upsertNode, deleteNode,
  } = useSkills();
  const { behaviors } = useIABehavior();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);

  // Auto-seleciona primeira skill
  const selected = useMemo<SkillWithNodes | null>(() => {
    if (skills.length === 0) return null;
    return skills.find(s => s.skill.id === selectedId) ?? skills[0];
  }, [skills, selectedId]);

  const behaviorOptions = useMemo(
    () => behaviors.map(b => ({ code: b.id, label: b.label })),
    [behaviors],
  );

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setListOpen(false);
  };

  const handleToggleActive = async (skill: IASkill) => {
    const result = await updateSkill(skill.id, { isActive: !skill.isActive });
    if (result.error) {
      toast({ title: 'Erro ao atualizar', description: result.error, variant: 'destructive' });
    }
  };

  const handleDuplicate = async (skill: SkillWithNodes) => {
    const baseCode = skill.skill.code.replace(/-COPY(-\d+)?$/, '');
    const newCode = `${baseCode}-COPY-${Date.now().toString().slice(-4)}`;
    const result = await createSkill({
      code: newCode,
      name: `${skill.skill.name} (cópia)`,
      description: skill.skill.description,
      scopeType: skill.skill.scopeType,
      scopeId: skill.skill.scopeId,
      isActive: false,
      isAutoSuggested: false,
      position: skills.length,
    });
    if (result.error || !result.id) {
      toast({ title: 'Erro ao duplicar', description: result.error ?? 'Falha', variant: 'destructive' });
      return;
    }
    // Recria nós preservando ordem por parentIdx
    const idMap = new Map<string, string>();
    const sorted = [...skill.nodes].sort((a, b) => {
      if (a.parentNodeId === null) return -1;
      if (b.parentNodeId === null) return 1;
      return a.position - b.position;
    });
    for (const n of sorted) {
      const newParent = n.parentNodeId ? idMap.get(n.parentNodeId) ?? null : null;
      const r = await upsertNode({
        skillId: result.id,
        kind: n.kind,
        parentNodeId: newParent,
        branchLabel: n.branchLabel,
        positionX: n.positionX,
        positionY: n.positionY,
        config: n.config,
        position: n.position,
      });
      if (r.id) idMap.set(n.id, r.id);
    }
    toast({ title: 'Skill duplicada' });
    setSelectedId(result.id);
  };

  const handleDelete = async (skill: IASkill) => {
    const result = await deleteSkill(skill.id);
    if (result.error) {
      toast({ title: 'Erro ao excluir', description: result.error, variant: 'destructive' });
      return;
    }
    setSelectedId(null);
    toast({ title: 'Skill excluída' });
  };

  // Lista renderizada (compartilhada entre desktop e drawer mobile)
  const renderList = () => (
    <div className="space-y-2">
      <NewSkillDialog
        onCreate={createSkill}
        nextPosition={skills.length}
      />
      {loading ? (
        <div className="flex items-center justify-center py-6 text-muted-foreground text-xs">
          <Loader2 size={12} className="animate-spin mr-1.5" /> Carregando…
        </div>
      ) : skills.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">
          Nenhuma skill ainda. Crie a primeira para começar.
        </p>
      ) : (
        skills.map(s => (
          <SkillListItem
            key={s.skill.id}
            skill={s}
            selected={selected?.skill.id === s.skill.id}
            onSelect={() => handleSelect(s.skill.id)}
            onToggleActive={() => handleToggleActive(s.skill)}
          />
        ))
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      {error && (
        <div className="p-2 bg-destructive/10 border border-destructive/30 rounded text-[11px] text-destructive">
          {error}
        </div>
      )}

      {/* Botão para abrir lista (mobile) + ações da skill selecionada */}
      <div className="flex items-center gap-2 md:hidden">
        <Sheet open={listOpen} onOpenChange={setListOpen}>
          <SheetTrigger asChild>
            <Button size="sm" variant="outline" className="flex-1">
              <ListTree className="w-4 h-4 mr-1.5" />
              {selected ? selected.skill.name : 'Skills'}
              <ChevronLeft className="w-3 h-3 ml-auto rotate-90" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[300px] bg-card border-border overflow-y-auto">
            <SheetHeader>
              <SheetTitle className="text-sm">Skills da org ({skills.length})</SheetTitle>
            </SheetHeader>
            <div className="mt-4">{renderList()}</div>
          </SheetContent>
        </Sheet>

        {selected && (
          <>
            <Button size="icon" variant="outline" onClick={() => handleDuplicate(selected)} title="Duplicar">
              <Copy className="w-4 h-4" />
            </Button>
            <Button size="icon" variant="outline" onClick={() => exportSkillJson(selected)} title="Exportar">
              <Download className="w-4 h-4" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="icon" variant="outline" title="Excluir">
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-card border-border">
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir esta skill?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação remove a skill "{selected.skill.name}" e todos os seus blocos.
                    Não pode ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => handleDelete(selected.skill)}>
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </div>

      <div className="md:flex md:gap-3">
        {/* Lista (desktop) */}
        <aside className="hidden md:block md:w-[300px] md:shrink-0">
          {renderList()}
        </aside>

        {/* Canvas */}
        <main className="flex-1 min-w-0">
          {/* Ações desktop */}
          {selected && (
            <div className="hidden md:flex items-center justify-end gap-2 mb-2">
              <Button size="sm" variant="outline" onClick={() => handleDuplicate(selected)}>
                <Copy className="w-3.5 h-3.5 mr-1.5" /> Duplicar
              </Button>
              <Button size="sm" variant="outline" onClick={() => exportSkillJson(selected)}>
                <Download className="w-3.5 h-3.5 mr-1.5" /> Exportar
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline">
                    <Trash2 className="w-3.5 h-3.5 mr-1.5 text-destructive" /> Excluir
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-card border-border">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir esta skill?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação remove a skill "{selected.skill.name}" e todos os seus blocos.
                      Não pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleDelete(selected.skill)}>
                      Excluir
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}

          {selected ? (
            <SkillCanvasEditor
              key={selected.skill.id}
              skill={selected}
              behaviorOptions={behaviorOptions}
              stageOptions={STAGE_OPTIONS}
              onUpsertNode={upsertNode}
              onDeleteNode={deleteNode}
            />
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-surface p-10 text-center">
              <p className="text-sm text-muted-foreground">
                Selecione ou crie uma skill para começar a montar o fluxo.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
