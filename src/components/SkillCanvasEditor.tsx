/**
 * Canvas visual estilo GoHighLevel para edição de Skills da IA.
 *
 * Usa @xyflow/react. Nós custom estilizados com tokens do design system.
 * Persistência debounced (800ms). Validação visual em tempo real.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState, addEdge,
  type Node, type Edge, type Connection, type NodeProps,
  Handle, Position, MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Zap, MessageSquare, Clock, Database, Palette, UserCheck,
  ListOrdered, Workflow, GitBranch, Plus, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import type { IASkillNode, SkillNodeKind } from '@/data/iaSkills';
import { NODE_KIND_META } from '@/data/iaSkills';
import type { SkillWithNodes } from '@/lib/skillComposer';
import { SkillNodeInspector } from '@/components/SkillNodeInspector';

const KIND_ICON: Record<SkillNodeKind, typeof Zap> = {
  trigger: Zap,
  send_message: MessageSquare,
  wait: Clock,
  collect: Database,
  set_tone: Palette,
  handoff: UserCheck,
  apply_ladder: ListOrdered,
  call_skill: Workflow,
  condition: GitBranch,
};

const KIND_ACCENT: Record<SkillNodeKind, string> = {
  trigger:      'border-primary/60 bg-primary/10',
  send_message: 'border-border bg-card',
  wait:         'border-muted-foreground/30 bg-muted',
  collect:      'border-border bg-card',
  set_tone:     'border-[hsl(var(--ai-note-border))] bg-[hsl(var(--ai-note))]',
  handoff:      'border-destructive/40 bg-destructive/10',
  apply_ladder: 'border-border bg-card',
  call_skill:   'border-border bg-card',
  condition:    'border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/10',
};

type SkillNodeData = {
  kind: SkillNodeKind;
  label: string;
  preview: string;
  hasWarning: boolean;
};

function SkillFlowNode({ data, selected }: NodeProps) {
  const d = data as SkillNodeData;
  const Icon = KIND_ICON[d.kind];
  return (
    <div
      className={`min-w-[180px] max-w-[240px] rounded-xl border-2 px-3 py-2 transition ${
        KIND_ACCENT[d.kind]
      } ${selected ? 'ring-2 ring-primary' : ''}`}
    >
      {d.kind !== 'trigger' && (
        <Handle type="target" position={Position.Top} className="!bg-primary !w-2 !h-2" />
      )}
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-foreground/80" />
        <span className="text-xs font-semibold text-foreground">{d.label}</span>
        {d.hasWarning && (
          <AlertTriangle className="w-3.5 h-3.5 text-[hsl(var(--warning))] ml-auto" />
        )}
      </div>
      {d.preview && (
        <p className="text-[11px] text-muted-foreground line-clamp-2 leading-tight">
          {d.preview}
        </p>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-primary !w-2 !h-2" />
    </div>
  );
}

const nodeTypes = { skill: SkillFlowNode };

function previewOf(kind: SkillNodeKind, config: Record<string, unknown>): string {
  switch (kind) {
    case 'trigger': {
      const codes = (config.behaviorCodes as string[]) ?? [];
      return codes.length ? codes.join(' · ') : 'Nenhum LB selecionado';
    }
    case 'send_message': return (config.content as string) ?? '—';
    case 'wait': return `${config.duration ?? '?'} ${config.unit ?? ''}`;
    case 'collect': return (config.question as string) ?? (config.field as string) ?? '—';
    case 'set_tone': return `Tom: ${config.tone ?? '—'}`;
    case 'handoff': return `${config.priority ?? 'P2'} — ${config.reason ?? ''}`;
    case 'apply_ladder': return (config.ladderCode as string) ?? '—';
    case 'call_skill': return (config.skillCode as string) ?? '—';
    case 'condition': return (config.expression as string) ?? '—';
  }
}

function toFlow(nodes: IASkillNode[], warnings: Set<string>): { rfNodes: Node[]; rfEdges: Edge[] } {
  const rfNodes: Node[] = nodes.map(n => ({
    id: n.id,
    type: 'skill',
    position: { x: n.positionX, y: n.positionY },
    data: {
      kind: n.kind,
      label: NODE_KIND_META[n.kind].label,
      preview: previewOf(n.kind, n.config as Record<string, unknown>),
      hasWarning: warnings.has(n.id),
    } satisfies SkillNodeData,
    draggable: n.kind !== 'trigger',
  }));

  const rfEdges: Edge[] = nodes
    .filter(n => n.parentNodeId)
    .map(n => ({
      id: `e-${n.parentNodeId}-${n.id}`,
      source: n.parentNodeId!,
      target: n.id,
      label: n.branchLabel ?? undefined,
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
    }));

  return { rfNodes, rfEdges };
}

function detectWarnings(nodes: IASkillNode[]): Set<string> {
  const warnings = new Set<string>();
  const trigger = nodes.find(n => n.kind === 'trigger');
  if (trigger) {
    const codes = (trigger.config as Record<string, unknown>).behaviorCodes as string[] | undefined;
    if (!codes || codes.length === 0) warnings.add(trigger.id);
  }
  for (const n of nodes) {
    if (n.kind === 'send_message') {
      const content = (n.config as Record<string, unknown>).content as string | undefined;
      if (!content || content.trim() === '') warnings.add(n.id);
    }
    if (n.kind === 'collect') {
      const q = (n.config as Record<string, unknown>).question as string | undefined;
      if (!q) warnings.add(n.id);
    }
  }
  // Detecção de ciclo
  const childrenOf = new Map<string, string[]>();
  for (const n of nodes) {
    if (n.parentNodeId) {
      const arr = childrenOf.get(n.parentNodeId) ?? [];
      arr.push(n.id);
      childrenOf.set(n.parentNodeId, arr);
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const dfs = (id: string): boolean => {
    if (visiting.has(id)) { warnings.add(id); return true; }
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const c of childrenOf.get(id) ?? []) if (dfs(c)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  for (const n of nodes) if (!visited.has(n.id)) dfs(n.id);
  return warnings;
}

const PALETTE_KINDS: SkillNodeKind[] = [
  'send_message', 'wait', 'collect', 'set_tone',
  'handoff', 'apply_ladder', 'call_skill', 'condition',
];

function NodePalette({ onAdd }: { onAdd: (kind: SkillNodeKind) => void }) {
  return (
    <div className="space-y-1.5">
      {PALETTE_KINDS.map(k => {
        const Icon = KIND_ICON[k];
        const meta = NODE_KIND_META[k];
        return (
          <button
            key={k} type="button" onClick={() => onAdd(k)}
            className="w-full flex items-start gap-2 px-3 py-2 rounded-lg bg-secondary hover:bg-accent border border-border transition text-left"
          >
            <Icon className="w-4 h-4 text-foreground/70 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground">{meta.label}</p>
              <p className="text-[10px] text-muted-foreground line-clamp-1">{meta.description}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export interface SkillCanvasEditorProps {
  skill: SkillWithNodes;
  behaviorOptions: Array<{ code: string; label: string }>;
  stageOptions: Array<{ code: string; name: string }>;
  onUpsertNode: (n: Omit<IASkillNode, 'id'> & { id?: string }) => Promise<{ id: string | null; error: string | null }>;
  onDeleteNode: (id: string) => Promise<{ error: string | null }>;
}

export function SkillCanvasEditor({
  skill, behaviorOptions, stageOptions, onUpsertNode, onDeleteNode,
}: SkillCanvasEditorProps) {
  const { toast } = useToast();
  const warnings = useMemo(() => detectWarnings(skill.nodes), [skill.nodes]);
  const { rfNodes, rfEdges } = useMemo(() => toFlow(skill.nodes, warnings), [skill.nodes, warnings]);

  const [nodes, setNodes, onNodesChange] = useNodesState(rfNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    setNodes(rfNodes);
    setEdges(rfEdges);
  }, [rfNodes, rfEdges, setNodes, setEdges]);

  const positionTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const persistPosition = useCallback((id: string, x: number, y: number) => {
    if (positionTimers.current[id]) clearTimeout(positionTimers.current[id]);
    positionTimers.current[id] = setTimeout(() => {
      const original = skill.nodes.find(n => n.id === id);
      if (!original) return;
      void onUpsertNode({
        id: original.id,
        skillId: original.skillId,
        kind: original.kind,
        parentNodeId: original.parentNodeId,
        branchLabel: original.branchLabel,
        positionX: x,
        positionY: y,
        config: original.config,
        position: original.position,
      });
    }, 800);
  }, [skill.nodes, onUpsertNode]);

  const handleNodesChange = useCallback((changes: Parameters<typeof onNodesChange>[0]) => {
    onNodesChange(changes);
    for (const ch of changes) {
      if (ch.type === 'position' && ch.position && !ch.dragging) {
        persistPosition(ch.id, ch.position.x, ch.position.y);
      }
    }
  }, [onNodesChange, persistPosition]);

  const onConnect = useCallback(async (conn: Connection) => {
    if (!conn.source || !conn.target) return;
    setEdges((eds) => addEdge({
      ...conn, type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
    }, eds));
    const target = skill.nodes.find(n => n.id === conn.target);
    if (!target) return;
    await onUpsertNode({
      id: target.id,
      skillId: target.skillId,
      kind: target.kind,
      parentNodeId: conn.source,
      branchLabel: target.branchLabel,
      positionX: target.positionX,
      positionY: target.positionY,
      config: target.config,
      position: target.position,
    });
  }, [skill.nodes, onUpsertNode, setEdges]);

  const handleAddBlock = useCallback(async (kind: SkillNodeKind) => {
    const trigger = skill.nodes.find(n => n.kind === 'trigger');
    const maxY = Math.max(0, ...skill.nodes.map(n => n.positionY));
    const result = await onUpsertNode({
      skillId: skill.skill.id,
      kind,
      parentNodeId: trigger?.id ?? null,
      branchLabel: null,
      positionX: 0,
      positionY: maxY + 140,
      config: {},
      position: skill.nodes.length,
    });
    if (result.error) {
      toast({ title: 'Erro ao adicionar bloco', description: result.error, variant: 'destructive' });
    } else {
      setPaletteOpen(false);
    }
  }, [skill, onUpsertNode, toast]);

  const handleConfigChange = useCallback(async (patch: Partial<IASkillNode>) => {
    if (!selectedNodeId) return;
    const original = skill.nodes.find(n => n.id === selectedNodeId);
    if (!original) return;
    await onUpsertNode({
      id: original.id,
      skillId: original.skillId,
      kind: original.kind,
      parentNodeId: original.parentNodeId,
      branchLabel: original.branchLabel,
      positionX: original.positionX,
      positionY: original.positionY,
      config: (patch.config as Record<string, unknown>) ?? original.config,
      position: original.position,
    });
  }, [selectedNodeId, skill.nodes, onUpsertNode]);

  const handleDeleteNode = useCallback(async (id: string) => {
    const result = await onDeleteNode(id);
    if (result.error) {
      toast({ title: 'Erro ao remover', description: result.error, variant: 'destructive' });
    }
  }, [onDeleteNode, toast]);

  const selectedNode = selectedNodeId
    ? skill.nodes.find(n => n.id === selectedNodeId) ?? null
    : null;

  const warningCount = warnings.size;

  return (
    <div className="relative h-[70vh] w-full rounded-xl border border-border bg-surface overflow-hidden">
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-3 py-2 bg-card/80 backdrop-blur border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-semibold text-foreground truncate">{skill.skill.name}</h3>
          <Badge variant="outline" className="text-[10px] shrink-0">
            {skill.nodes.length} blocos
          </Badge>
          {warningCount > 0 && (
            <Badge className="bg-[hsl(var(--warning))]/20 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/40 text-[10px] shrink-0">
              <AlertTriangle className="w-3 h-3 mr-1" /> {warningCount}
            </Badge>
          )}
        </div>

        <Sheet open={paletteOpen} onOpenChange={setPaletteOpen}>
          <SheetTrigger asChild>
            <Button size="sm" variant="default" className="h-8">
              <Plus className="w-4 h-4 mr-1" /> Bloco
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[280px] bg-card border-border">
            <SheetHeader>
              <SheetTitle className="text-sm">Adicionar bloco</SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              <NodePalette onAdd={handleAddBlock} />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <div className="absolute inset-0 pt-12">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          onNodeClick={(_, node) => {
            setSelectedNodeId(node.id);
            setInspectorOpen(true);
          }}
          fitView
          minZoom={0.3}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} color="hsl(var(--border))" />
          <Controls className="!bg-card !border-border [&_button]:!bg-card [&_button]:!border-border [&_button]:!text-foreground" />
          <MiniMap
            className="!bg-card !border-border"
            nodeColor={() => 'hsl(var(--primary))'}
            maskColor="hsl(var(--background) / 0.6)"
            pannable zoomable
          />
        </ReactFlow>
      </div>

      <SkillNodeInspector
        node={selectedNode}
        open={inspectorOpen}
        onOpenChange={setInspectorOpen}
        onChange={handleConfigChange}
        onDelete={handleDeleteNode}
        behaviorOptions={behaviorOptions}
        stageOptions={stageOptions}
      />
    </div>
  );
}
