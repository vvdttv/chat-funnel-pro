/**
 * Camada de Skills da IA — tipos puros + seed inicial.
 *
 * Uma SKILL é uma unidade reutilizável de comportamento da IA: dado um
 * gatilho (um ou mais comportamentos LB-xxx detectados), executa uma
 * sequência de ações (enviar mensagem, aguardar, coletar dado, etc.) sob
 * a vigilância de guardrails (regras DO/DONT/ASK/NOASK).
 *
 * Espelha o padrão do `iaBehavior.ts`: tipos aqui, seed mínima abaixo, hooks
 * em `useSkills.ts` e motor puro em `lib/skillComposer.ts`.
 */

// ============================================================================
// TIPOS
// ============================================================================

export type SkillScopeType = 'universal' | 'stage' | 'context';

/**
 * Tipos dos nós do canvas. A árvore sempre começa com 'trigger' na raiz.
 *  - send_message:  envia conteúdo (text/audio/image/video) com tom + intent
 *  - wait:          pausa N segundos/min/horas
 *  - collect:       coleta um dado tipado e grava em deal.context
 *  - set_tone:      altera o tom da IA para os próximos blocos
 *  - handoff:       dispara handoff para humano com prioridade
 *  - apply_ladder:  aplica uma escada de follow-up existente
 *  - call_skill:    invoca outra skill (composição) — protegido contra ciclo
 *  - condition:     ramifica em true/false; filhos usam branch_label
 */
export type SkillNodeKind =
  | 'trigger'
  | 'send_message'
  | 'wait'
  | 'collect'
  | 'set_tone'
  | 'handoff'
  | 'apply_ladder'
  | 'call_skill'
  | 'condition';

export interface IASkill {
  id: string;
  code: string;            // ex.: 'SK-RECOVER-OBJECTION-PRICE'
  name: string;
  description: string;
  scopeType: SkillScopeType;
  scopeId: string | null;  // 'E2', 'real-estate', null
  isActive: boolean;
  isAutoSuggested: boolean;
  position: number;
}

export interface IASkillNode {
  id: string;
  skillId: string;
  kind: SkillNodeKind;
  parentNodeId: string | null;
  branchLabel: string | null;   // 'true' | 'false' para condição
  positionX: number;
  positionY: number;
  config: Record<string, unknown>;
  position: number;
}

export interface IASkillGuardrail {
  id: string;
  skillId: string;
  ruleCode: string;             // 'IA-DO-006', 'IA-DONT-014'
}

/**
 * Configurações tipadas por kind. Usadas pelo inspector e pelo motor.
 */
export interface TriggerConfig {
  /** Códigos de LB que ativam a skill. Casa por OR. */
  behaviorCodes: string[];
  /** Tags de contexto extras exigidas (AND). Vazio = qualquer. */
  contextTags?: string[];
  /** Estágios em que pode disparar. Vazio = qualquer. */
  stageCodes?: string[];
}

export interface SendMessageConfig {
  messageType: 'text' | 'image' | 'audio' | 'video';
  content: string;
  intent?: string;
  tone?: string;
}

export interface WaitConfig {
  duration: number;
  unit: 'seconds' | 'minutes' | 'hours';
}

export interface CollectConfig {
  field: string;          // ex.: 'income_range'
  question: string;
  validation?: 'currency' | 'number' | 'text' | 'phone' | 'email';
}

export interface SetToneConfig {
  tone: string;           // 'empático', 'firme', etc.
}

export interface HandoffConfig {
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  reason: string;
}

export interface ApplyLadderConfig {
  ladderCode: string;
}

export interface CallSkillConfig {
  skillCode: string;
}

export interface ConditionConfig {
  expression: string;     // linguagem natural; engine traduz depois
}

// ============================================================================
// SEED — 6 skills-base derivadas dos playbooks E0–E4b
// Aplicada pela edge function seed-ia-behavior na primeira execução.
// ============================================================================

export interface SkillSeed {
  skill: Omit<IASkill, 'id'>;
  nodes: Array<Omit<IASkillNode, 'id' | 'skillId' | 'parentNodeId'> & {
    /** índice do parent dentro do mesmo array (-1 = raiz) */
    parentIdx: number;
  }>;
  guardrailRuleCodes: string[];
}

export const SKILL_SEEDS: SkillSeed[] = [
  {
    skill: {
      code: 'SK-FIRST-CONTACT',
      name: 'Primeiro contato',
      description: 'Cumprimenta, identifica-se como IA e captura intenção do lead.',
      scopeType: 'stage',
      scopeId: 'E0',
      isActive: true,
      isAutoSuggested: false,
      position: 0,
    },
    nodes: [
      {
        kind: 'trigger', branchLabel: null, positionX: 0, positionY: 0, position: 0,
        config: { behaviorCodes: ['LB-NEW-LEAD', 'LB-CURIOUS'] } satisfies TriggerConfig as never,
        parentIdx: -1,
      },
      {
        kind: 'send_message', branchLabel: null, positionX: 0, positionY: 140, position: 1,
        config: {
          messageType: 'text',
          content: 'Oi! Aqui é a Ana, da imobiliária. Posso te ajudar a encontrar um imóvel? 🏡',
          intent: 'identity_disclosure',
          tone: 'acolhedor',
        } satisfies SendMessageConfig as never,
        parentIdx: 0,
      },
      {
        kind: 'collect', branchLabel: null, positionX: 0, positionY: 280, position: 2,
        config: {
          field: 'intent',
          question: 'Você está pensando em comprar, alugar ou só dando uma olhada?',
          validation: 'text',
        } satisfies CollectConfig as never,
        parentIdx: 1,
      },
    ],
    guardrailRuleCodes: ['IA-DO-001', 'IA-DO-002', 'IA-DO-008'],
  },
  {
    skill: {
      code: 'SK-RECOVER-OBJECTION-PRICE',
      name: 'Recuperar objeção de preço',
      description: 'Reconhece a dor, valida o ponto do lead e propõe alternativa.',
      scopeType: 'universal',
      scopeId: null,
      isActive: true,
      isAutoSuggested: false,
      position: 1,
    },
    nodes: [
      {
        kind: 'trigger', branchLabel: null, positionX: 0, positionY: 0, position: 0,
        config: { behaviorCodes: ['LB-OBJ-PRECO'] } satisfies TriggerConfig as never,
        parentIdx: -1,
      },
      {
        kind: 'set_tone', branchLabel: null, positionX: 0, positionY: 140, position: 1,
        config: { tone: 'empático' } satisfies SetToneConfig as never,
        parentIdx: 0,
      },
      {
        kind: 'send_message', branchLabel: null, positionX: 0, positionY: 280, position: 2,
        config: {
          messageType: 'text',
          content: 'Faz total sentido — o investimento não é pequeno. Deixa eu te mostrar duas opções dentro do que cabe no seu orçamento.',
          intent: 'recovery_plan',
          tone: 'empático',
        } satisfies SendMessageConfig as never,
        parentIdx: 1,
      },
    ],
    guardrailRuleCodes: ['IA-DO-006', 'IA-DONT-014'],
  },
  {
    skill: {
      code: 'SK-COLLECT-INCOME',
      name: 'Coletar renda',
      description: 'Pede a faixa de renda de forma consultiva, com tranquilização LGPD.',
      scopeType: 'stage',
      scopeId: 'E2',
      isActive: true,
      isAutoSuggested: false,
      position: 2,
    },
    nodes: [
      {
        kind: 'trigger', branchLabel: null, positionX: 0, positionY: 0, position: 0,
        config: { behaviorCodes: ['LB-READY-QUALIFY'] } satisfies TriggerConfig as never,
        parentIdx: -1,
      },
      {
        kind: 'send_message', branchLabel: null, positionX: 0, positionY: 140, position: 1,
        config: {
          messageType: 'text',
          content: 'Pra agilizar a simulação, posso te perguntar uma faixa de renda? Fica entre nós (LGPD).',
          intent: 'reassure_privacy',
          tone: 'consultivo',
        } satisfies SendMessageConfig as never,
        parentIdx: 0,
      },
      {
        kind: 'collect', branchLabel: null, positionX: 0, positionY: 280, position: 2,
        config: {
          field: 'income_range',
          question: 'Qual faixa: até 3k, 3-6k, 6-10k, 10k+?',
          validation: 'text',
        } satisfies CollectConfig as never,
        parentIdx: 1,
      },
    ],
    guardrailRuleCodes: ['IA-DO-009', 'IA-ASK-001'],
  },
  {
    skill: {
      code: 'SK-CELEBRATE-APPROVAL',
      name: 'Celebrar aprovação',
      description: 'Reage à aprovação do crédito com calor humano e CTA para próximos passos.',
      scopeType: 'stage',
      scopeId: 'E4a',
      isActive: true,
      isAutoSuggested: false,
      position: 3,
    },
    nodes: [
      {
        kind: 'trigger', branchLabel: null, positionX: 0, positionY: 0, position: 0,
        config: { behaviorCodes: ['LB-APPROVED', 'LB-EUFORIC'] } satisfies TriggerConfig as never,
        parentIdx: -1,
      },
      {
        kind: 'send_message', branchLabel: null, positionX: 0, positionY: 140, position: 1,
        config: {
          messageType: 'text',
          content: 'Que notícia maravilhosa! 🎉 Vamos agendar a próxima etapa agora?',
          intent: 'celebrate_approval',
          tone: 'acolhedor',
        } satisfies SendMessageConfig as never,
        parentIdx: 0,
      },
    ],
    guardrailRuleCodes: ['IA-DO-006'],
  },
  {
    skill: {
      code: 'SK-REENGAGE-SILENT',
      name: 'Reengajar lead silencioso',
      description: 'Quebra o silêncio sem ser invasivo, oferecendo valor.',
      scopeType: 'universal',
      scopeId: null,
      isActive: true,
      isAutoSuggested: false,
      position: 4,
    },
    nodes: [
      {
        kind: 'trigger', branchLabel: null, positionX: 0, positionY: 0, position: 0,
        config: { behaviorCodes: ['LB-SILENT', 'LB-EVASIVE'] } satisfies TriggerConfig as never,
        parentIdx: -1,
      },
      {
        kind: 'apply_ladder', branchLabel: null, positionX: 0, positionY: 140, position: 1,
        config: { ladderCode: 'ladder-media' } satisfies ApplyLadderConfig as never,
        parentIdx: 0,
      },
    ],
    guardrailRuleCodes: ['IA-DONT-007'],
  },
  {
    skill: {
      code: 'SK-ESCALATE-COMPLAINT',
      name: 'Escalar reclamação',
      description: 'Identifica frustração séria e faz handoff prioritário.',
      scopeType: 'universal',
      scopeId: null,
      isActive: true,
      isAutoSuggested: false,
      position: 5,
    },
    nodes: [
      {
        kind: 'trigger', branchLabel: null, positionX: 0, positionY: 0, position: 0,
        config: { behaviorCodes: ['LB-FRUSTRATED', 'LB-COMPLAINT'] } satisfies TriggerConfig as never,
        parentIdx: -1,
      },
      {
        kind: 'set_tone', branchLabel: null, positionX: 0, positionY: 140, position: 1,
        config: { tone: 'empático' } satisfies SetToneConfig as never,
        parentIdx: 0,
      },
      {
        kind: 'handoff', branchLabel: null, positionX: 0, positionY: 280, position: 2,
        config: { priority: 'P1', reason: 'Lead frustrado/reclamação detectada' } satisfies HandoffConfig as never,
        parentIdx: 1,
      },
    ],
    guardrailRuleCodes: ['IA-DO-006', 'IA-DO-007'],
  },
];

// ============================================================================
// METADADOS DE UI — labels, ícones, cores por kind (consumido pelo canvas)
// ============================================================================

export interface NodeKindMeta {
  label: string;
  description: string;
  /** Categoria visual: gatilho / mensagem / fluxo / dados */
  category: 'trigger' | 'message' | 'flow' | 'data' | 'control';
}

export const NODE_KIND_META: Record<SkillNodeKind, NodeKindMeta> = {
  trigger:      { label: 'Gatilho',           description: 'Comportamentos do lead que ativam',     category: 'trigger' },
  send_message: { label: 'Enviar mensagem',   description: 'Texto, áudio, imagem ou vídeo',         category: 'message' },
  wait:         { label: 'Aguardar',          description: 'Pausa antes do próximo bloco',          category: 'flow'    },
  collect:      { label: 'Coletar dado',      description: 'Pergunta e grava em campo do deal',     category: 'data'    },
  set_tone:     { label: 'Mudar tom',         description: 'Altera a postura da IA daqui em diante',category: 'control' },
  handoff:      { label: 'Passar para humano',description: 'Encaminha o atendimento',               category: 'flow'    },
  apply_ladder: { label: 'Aplicar escada',    description: 'Dispara uma sequência de follow-up',    category: 'flow'    },
  call_skill:   { label: 'Chamar skill',      description: 'Invoca outra skill como sub-rotina',    category: 'flow'    },
  condition:    { label: 'Condição',          description: 'Ramifica em sim/não',                   category: 'control' },
};
