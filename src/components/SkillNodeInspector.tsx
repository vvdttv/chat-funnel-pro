/**
 * Painel de edição do nó selecionado no canvas de Skills.
 *
 * Renderiza campos específicos por `kind`. Persistência é responsabilidade
 * do parent via callback `onChange`. Sheet inferior responsivo.
 */

import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Trash2 } from 'lucide-react';
import type { IASkillNode, SkillNodeKind } from '@/data/iaSkills';
import { NODE_KIND_META } from '@/data/iaSkills';

interface SkillNodeInspectorProps {
  node: IASkillNode | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (patch: Partial<IASkillNode>) => void;
  onDelete: (id: string) => void;
  behaviorOptions: Array<{ code: string; label: string }>;
  stageOptions: Array<{ code: string; name: string }>;
}

const TONES = ['acolhedor', 'consultivo', 'empático', 'firme', 'comemorativo', 'neutro'];

export function SkillNodeInspector({
  node, open, onOpenChange, onChange, onDelete,
  behaviorOptions, stageOptions,
}: SkillNodeInspectorProps) {
  const [local, setLocal] = useState<Record<string, unknown>>({});

  useEffect(() => {
    setLocal((node?.config as Record<string, unknown>) ?? {});
  }, [node?.id]);

  if (!node) return null;

  const meta = NODE_KIND_META[node.kind as SkillNodeKind];

  const update = (patch: Record<string, unknown>) => {
    const next = { ...local, ...patch };
    setLocal(next);
    onChange({ config: next });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[80vh] overflow-y-auto bg-card border-border md:max-w-md md:mx-auto rounded-t-2xl"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2">
            <span>{meta.label}</span>
            <Badge variant="outline" className="text-xs">{node.kind}</Badge>
          </SheetTitle>
          <p className="text-xs text-muted-foreground">{meta.description}</p>
        </SheetHeader>

        <div className="space-y-4 mt-4 pb-8">
          {node.kind === 'trigger' && (
            <TriggerFields
              value={local} onChange={update}
              behaviorOptions={behaviorOptions} stageOptions={stageOptions}
            />
          )}
          {node.kind === 'send_message' && <SendMessageFields value={local} onChange={update} />}
          {node.kind === 'wait' && <WaitFields value={local} onChange={update} />}
          {node.kind === 'collect' && <CollectFields value={local} onChange={update} />}
          {node.kind === 'set_tone' && <SetToneFields value={local} onChange={update} />}
          {node.kind === 'handoff' && <HandoffFields value={local} onChange={update} />}
          {node.kind === 'apply_ladder' && <ApplyLadderFields value={local} onChange={update} />}
          {node.kind === 'call_skill' && <CallSkillFields value={local} onChange={update} />}
          {node.kind === 'condition' && <ConditionFields value={local} onChange={update} />}

          {node.kind !== 'trigger' && (
            <Button
              variant="destructive" className="w-full mt-6"
              onClick={() => { onDelete(node.id); onOpenChange(false); }}
            >
              <Trash2 className="w-4 h-4 mr-2" /> Remover bloco
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface FieldProps {
  value: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
}

function TriggerFields({
  value, onChange, behaviorOptions, stageOptions,
}: FieldProps & {
  behaviorOptions: Array<{ code: string; label: string }>;
  stageOptions: Array<{ code: string; name: string }>;
}) {
  const codes = (value.behaviorCodes as string[]) ?? [];
  const stages = (value.stageCodes as string[]) ?? [];
  const toggle = (arr: string[], k: string) =>
    arr.includes(k) ? arr.filter(x => x !== k) : [...arr, k];

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm">Comportamentos do lead (qualquer)</Label>
        <p className="text-xs text-muted-foreground mb-2">
          A skill ativa quando algum destes for detectado.
        </p>
        <div className="flex flex-wrap gap-2">
          {behaviorOptions.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhum comportamento cadastrado.</p>
          )}
          {behaviorOptions.map(b => (
            <button
              key={b.code} type="button"
              onClick={() => onChange({ behaviorCodes: toggle(codes, b.code) })}
              className={`px-3 py-1.5 rounded-full text-xs border transition ${
                codes.includes(b.code)
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-secondary text-secondary-foreground border-border'
              }`}
            >{b.label}</button>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-sm">Etapas em que pode disparar</Label>
        <p className="text-xs text-muted-foreground mb-2">Vazio = qualquer etapa.</p>
        <div className="flex flex-wrap gap-2">
          {stageOptions.map(s => (
            <button
              key={s.code} type="button"
              onClick={() => onChange({ stageCodes: toggle(stages, s.code) })}
              className={`px-3 py-1.5 rounded-full text-xs border transition ${
                stages.includes(s.code)
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-secondary text-secondary-foreground border-border'
              }`}
            >{s.name}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SendMessageFields({ value, onChange }: FieldProps) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm">Tipo</Label>
        <Select value={(value.messageType as string) ?? 'text'} onValueChange={(v) => onChange({ messageType: v })}>
          <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="text">Texto</SelectItem>
            <SelectItem value="audio">Áudio</SelectItem>
            <SelectItem value="image">Imagem</SelectItem>
            <SelectItem value="video">Vídeo</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-sm">Conteúdo</Label>
        <Textarea
          value={(value.content as string) ?? ''}
          onChange={(e) => onChange({ content: e.target.value })}
          placeholder="O que a IA vai dizer..."
          className="bg-secondary border-border min-h-[100px]"
        />
      </div>
      <div>
        <Label className="text-sm">Tom</Label>
        <Select value={(value.tone as string) ?? 'neutro'} onValueChange={(v) => onChange({ tone: v })}>
          <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TONES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-sm">Intenção (opcional)</Label>
        <Input
          value={(value.intent as string) ?? ''}
          onChange={(e) => onChange({ intent: e.target.value })}
          placeholder="ex.: recovery_plan"
          className="bg-secondary border-border"
        />
      </div>
    </div>
  );
}

function WaitFields({ value, onChange }: FieldProps) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm">Duração</Label>
        <Input
          type="number" min={1}
          value={(value.duration as number) ?? 1}
          onChange={(e) => onChange({ duration: Number(e.target.value) })}
          className="bg-secondary border-border"
        />
      </div>
      <div>
        <Label className="text-sm">Unidade</Label>
        <Select value={(value.unit as string) ?? 'minutes'} onValueChange={(v) => onChange({ unit: v })}>
          <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="seconds">segundos</SelectItem>
            <SelectItem value="minutes">minutos</SelectItem>
            <SelectItem value="hours">horas</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function CollectFields({ value, onChange }: FieldProps) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm">Campo (onde grava)</Label>
        <Input
          value={(value.field as string) ?? ''}
          onChange={(e) => onChange({ field: e.target.value })}
          placeholder="ex.: income_range"
          className="bg-secondary border-border"
        />
      </div>
      <div>
        <Label className="text-sm">Pergunta</Label>
        <Textarea
          value={(value.question as string) ?? ''}
          onChange={(e) => onChange({ question: e.target.value })}
          placeholder="O que perguntar ao lead?"
          className="bg-secondary border-border"
        />
      </div>
      <div>
        <Label className="text-sm">Validação</Label>
        <Select value={(value.validation as string) ?? 'text'} onValueChange={(v) => onChange({ validation: v })}>
          <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="text">Texto livre</SelectItem>
            <SelectItem value="number">Número</SelectItem>
            <SelectItem value="currency">Valor monetário</SelectItem>
            <SelectItem value="phone">Telefone</SelectItem>
            <SelectItem value="email">Email</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function SetToneFields({ value, onChange }: FieldProps) {
  return (
    <div>
      <Label className="text-sm">Novo tom</Label>
      <Select value={(value.tone as string) ?? 'neutro'} onValueChange={(v) => onChange({ tone: v })}>
        <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
        <SelectContent>
          {TONES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function HandoffFields({ value, onChange }: FieldProps) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm">Prioridade</Label>
        <Select value={(value.priority as string) ?? 'P2'} onValueChange={(v) => onChange({ priority: v })}>
          <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="P0">P0 — emergência</SelectItem>
            <SelectItem value="P1">P1 — urgente</SelectItem>
            <SelectItem value="P2">P2 — normal</SelectItem>
            <SelectItem value="P3">P3 — quando puder</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-sm">Motivo</Label>
        <Textarea
          value={(value.reason as string) ?? ''}
          onChange={(e) => onChange({ reason: e.target.value })}
          placeholder="Por que está passando para humano?"
          className="bg-secondary border-border"
        />
      </div>
    </div>
  );
}

function ApplyLadderFields({ value, onChange }: FieldProps) {
  return (
    <div>
      <Label className="text-sm">Código da escada</Label>
      <Input
        value={(value.ladderCode as string) ?? ''}
        onChange={(e) => onChange({ ladderCode: e.target.value })}
        placeholder="ex.: ladder-media"
        className="bg-secondary border-border"
      />
    </div>
  );
}

function CallSkillFields({ value, onChange }: FieldProps) {
  return (
    <div>
      <Label className="text-sm">Código da skill a chamar</Label>
      <Input
        value={(value.skillCode as string) ?? ''}
        onChange={(e) => onChange({ skillCode: e.target.value })}
        placeholder="ex.: SK-COLLECT-INCOME"
        className="bg-secondary border-border"
      />
      <p className="text-xs text-muted-foreground mt-2">
        Ciclos são bloqueados automaticamente.
      </p>
    </div>
  );
}

function ConditionFields({ value, onChange }: FieldProps) {
  return (
    <div>
      <Label className="text-sm">Condição (linguagem natural)</Label>
      <Textarea
        value={(value.expression as string) ?? ''}
        onChange={(e) => onChange({ expression: e.target.value })}
        placeholder="ex.: lead disse que tem urgência"
        className="bg-secondary border-border min-h-[80px]"
      />
      <p className="text-xs text-muted-foreground mt-2">
        Os blocos filhos devem ter ramo "sim" ou "não".
      </p>
    </div>
  );
}
