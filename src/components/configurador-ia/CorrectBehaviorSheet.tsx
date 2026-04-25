/**
 * CorrectBehaviorSheet — abre o ConfiguradorIaFlow pré-preenchido com o
 * contexto de uma decisão da IA que precisa ser corrigida.
 *
 * O admin descreve em linguagem natural o que ajustar; o fluxo
 * conversacional (trio fixo + perguntas customizadas + review) gera
 * artefatos (regra/skill/override) que ficam persistidos no banco e
 * passam a influenciar as próximas respostas da IA.
 */
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ConfiguradorIaFlow } from '@/components/configurador-ia/ConfiguradorIaFlow';
import type { SavedSession } from '@/components/configurador-ia/SavedSessionsList';
import { Wrench } from 'lucide-react';

export interface DecisionContext {
  leadMessage: string;
  generatedResponse: string | null;
  detectedBehaviorCodes: string[];
  activatedSkillCode: string | null;
  appliedRuleCodes: string[];
  archetypeCode: string | null;
  statusOverlayCode: string | null;
  contextTags: string[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  decision: DecisionContext | null;
  onSaved?: () => void;
}

export const CorrectBehaviorSheet = ({ open, onOpenChange, decision, onSaved }: Props) => {
  if (!decision) return null;

  // Monta uma "mensagem inicial" pré-preenchida descrevendo o que aconteceu
  // — o admin edita em linguagem natural o que quer corrigir.
  const detectedTxt = decision.detectedBehaviorCodes.length
    ? decision.detectedBehaviorCodes.join(', ')
    : 'nenhum';
  const skillTxt = decision.activatedSkillCode ?? 'nenhuma habilidade específica';
  const seedMessage = `Quero ajustar o comportamento da IA. Nesta situação:

— Lead disse: "${decision.leadMessage}"
— IA detectou: ${detectedTxt}
— Habilidade ativada: ${skillTxt}
— Resposta enviada: "${decision.generatedResponse ?? '(sem resposta — handoff)'}"

O que eu quero que mude: `;

  const prefill: SavedSession = {
    id: 'correction-seed',
    created_at: new Date().toISOString(),
    original_message: seedMessage,
    human_summary: '',
    fixed_answers: {
      scope: 'universal',
      trigger: 'message_moment',
      polarity: 'do',
    },
    generated_plan: { artifacts: {} },
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[92vh] flex flex-col p-0 max-w-md lg:max-w-3xl mx-auto bg-background">
        <SheetHeader className="p-4 border-b border-border">
          <SheetTitle className="flex items-center gap-2 text-foreground">
            <Wrench size={16} className="text-primary" />
            Corrigir esse comportamento
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="text-xs text-muted-foreground bg-card/50 border border-border rounded-lg p-3 mb-3">
            Conte abaixo o que a IA deveria ter feito diferente. Sua correção vira uma nova
            configuração persistida — a próxima vez que a situação se repetir, a IA já vai
            reagir do jeito certo.
          </div>
          <ConfiguradorIaFlow
            key={`correction-${decision.leadMessage.slice(0, 20)}`}
            initialPrefill={prefill}
            onSaved={() => {
              onSaved?.();
              onOpenChange(false);
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
};
