/**
 * Motor puro de seleção e expansão de Skills da IA.
 *
 * Funções deste módulo são determinísticas e não tocam I/O — toda a parte
 * reativa fica em `useSkills.ts`. Isto permite testes unitários rápidos e
 * reutilização tanto no cliente quanto em edge functions.
 *
 * Conceitos:
 *   - selectActiveSkills:  filtra skills aplicáveis ao contexto atual
 *   - rankSkillsByMatch:   pontua casamento gatilho × LBs detectados
 *   - composeActiveSkill:  retorna a skill vencedora
 *   - expandSkillToActions: linearização da árvore de nós em ações executáveis,
 *     resolvendo recursivamente `call_skill` com proteção contra ciclo
 */

import type {
  IASkill, IASkillNode, TriggerConfig, CallSkillConfig,
} from '@/data/iaSkills';

// ============================================================================
// Tipos auxiliares
// ============================================================================

export interface SkillRuntimeContext {
  detectedBehaviorCodes: string[];
  stageCode?: string | null;
  contextTags?: string[];
}

export interface SkillWithNodes {
  skill: IASkill;
  nodes: IASkillNode[];
  guardrailRuleCodes: string[];
}

export interface RankedSkill {
  skill: IASkill;
  score: number;
  matchedBehaviorCodes: string[];
}

// ============================================================================
// Helpers
// ============================================================================

const triggerOf = (nodes: IASkillNode[]): IASkillNode | undefined =>
  nodes.find(n => n.kind === 'trigger' && n.parentNodeId === null);

const triggerConfig = (node: IASkillNode | undefined): TriggerConfig | null => {
  if (!node) return null;
  return node.config as unknown as TriggerConfig;
};

const intersect = <T,>(a: T[], b: T[]): T[] =>
  a.filter(x => b.includes(x));

// ============================================================================
// Seleção
// ============================================================================

/**
 * Filtra skills aplicáveis ao contexto. Uma skill é aplicável quando:
 *   - is_active === true
 *   - escopo bate com o contexto (universal | stage casa stageCode | context casa contextTags)
 *   - tem nó-gatilho válido com behaviorCodes não vazio
 *   - intersecta os LBs detectados em pelo menos 1
 *   - se trigger.contextTags definido, todos devem estar em context.contextTags
 *   - se trigger.stageCodes definido, stageCode atual deve estar nele
 */
export function selectActiveSkills(
  allSkillsWithNodes: SkillWithNodes[],
  ctx: SkillRuntimeContext,
): SkillWithNodes[] {
  const detected = ctx.detectedBehaviorCodes ?? [];
  const stage = ctx.stageCode ?? null;
  const tags = ctx.contextTags ?? [];

  return allSkillsWithNodes.filter(({ skill, nodes }) => {
    if (!skill.isActive) return false;

    // Escopo da skill
    if (skill.scopeType === 'stage' && skill.scopeId && stage && skill.scopeId !== stage) {
      return false;
    }
    if (skill.scopeType === 'context' && skill.scopeId && !tags.includes(skill.scopeId)) {
      return false;
    }

    // Gatilho
    const trigger = triggerOf(nodes);
    const cfg = triggerConfig(trigger);
    if (!cfg || !cfg.behaviorCodes || cfg.behaviorCodes.length === 0) return false;

    if (intersect(cfg.behaviorCodes, detected).length === 0) return false;

    if (cfg.contextTags && cfg.contextTags.length > 0) {
      const ok = cfg.contextTags.every(t => tags.includes(t));
      if (!ok) return false;
    }
    if (cfg.stageCodes && cfg.stageCodes.length > 0) {
      if (!stage || !cfg.stageCodes.includes(stage)) return false;
    }
    return true;
  });
}

/**
 * Pontua skills por especificidade (maior = melhor):
 *   +10 por LB casado
 *   +5  se escopo === 'stage' e bate
 *   +3  se escopo === 'context' e bate
 *   +2  por contextTag exigida e satisfeita no trigger
 *   -1  por LB do gatilho não detectado (penaliza skill genérica demais)
 */
export function rankSkillsByMatch(
  candidates: SkillWithNodes[],
  ctx: SkillRuntimeContext,
): RankedSkill[] {
  const detected = ctx.detectedBehaviorCodes ?? [];
  const tags = ctx.contextTags ?? [];

  const ranked: RankedSkill[] = candidates.map(({ skill, nodes }) => {
    const cfg = triggerConfig(triggerOf(nodes))!;
    const matched = intersect(cfg.behaviorCodes, detected);
    const unmatched = cfg.behaviorCodes.filter(b => !detected.includes(b));

    let score = matched.length * 10;
    if (skill.scopeType === 'stage') score += 5;
    if (skill.scopeType === 'context') score += 3;
    if (cfg.contextTags) score += intersect(cfg.contextTags, tags).length * 2;
    score -= unmatched.length;

    return { skill, score, matchedBehaviorCodes: matched };
  });

  return ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // desempate: skill com posição menor vence
    return a.skill.position - b.skill.position;
  });
}

/**
 * Combina selectActiveSkills + rankSkillsByMatch e retorna a vencedora.
 */
export function composeActiveSkill(
  allSkillsWithNodes: SkillWithNodes[],
  ctx: SkillRuntimeContext,
): SkillWithNodes | null {
  const candidates = selectActiveSkills(allSkillsWithNodes, ctx);
  if (candidates.length === 0) return null;
  const ranked = rankSkillsByMatch(candidates, ctx);
  if (ranked.length === 0) return null;
  const winner = ranked[0];
  return candidates.find(c => c.skill.id === winner.skill.id) ?? null;
}

// ============================================================================
// Expansão de árvore -> ações executáveis
// ============================================================================

export interface ExpandedAction {
  /** ID estável dentro da expansão (skillCode + nodeId, com prefixos para call_skill) */
  id: string;
  sourceSkillCode: string;
  node: IASkillNode;
  depth: number;
}

const childrenOf = (nodes: IASkillNode[], parentId: string | null): IASkillNode[] =>
  nodes
    .filter(n => n.parentNodeId === parentId)
    .sort((a, b) => a.position - b.position);

interface ExpandOptions {
  /** Mapa de todas as skills da org, indexado por code, para resolver call_skill */
  skillByCode?: Map<string, SkillWithNodes>;
  /** Profundidade máxima de chamadas aninhadas (proteção contra explosão). Default 5 */
  maxDepth?: number;
}

/**
 * Linearização DFS da árvore de nós a partir do gatilho (raiz). Para cada
 * nó `call_skill`, expande recursivamente a skill referenciada. Detecta
 * ciclos via stack de codes visitados.
 *
 * Nó `condition` é incluído tal qual; o runtime concreto avaliará a expressão
 * e seguirá os filhos com branchLabel adequado. Aqui devolvemos AMBOS os
 * ramos para inspeção/testing.
 */
export function expandSkillToActions(
  swn: SkillWithNodes,
  opts: ExpandOptions = {},
): ExpandedAction[] {
  const { skillByCode, maxDepth = 5 } = opts;
  const out: ExpandedAction[] = [];
  const visiting = new Set<string>();

  const walk = (
    current: SkillWithNodes,
    parentId: string | null,
    depth: number,
    keyPrefix: string,
  ): void => {
    if (depth > maxDepth) return;
    const code = current.skill.code;
    if (visiting.has(code)) {
      // ciclo — emite nó sentinela e para
      out.push({
        id: `${keyPrefix}:CYCLE:${code}`,
        sourceSkillCode: code,
        node: {
          id: `cycle-${code}`,
          skillId: current.skill.id,
          kind: 'condition',
          parentNodeId: null,
          branchLabel: null,
          positionX: 0, positionY: 0, position: 0,
          config: { expression: `[ciclo detectado em ${code}]` },
        },
        depth,
      });
      return;
    }
    visiting.add(code);

    const kids = childrenOf(current.nodes, parentId);
    for (const node of kids) {
      out.push({
        id: `${keyPrefix}:${node.id}`,
        sourceSkillCode: code,
        node,
        depth,
      });
      if (node.kind === 'call_skill' && skillByCode) {
        const cfg = node.config as unknown as CallSkillConfig;
        const target = skillByCode.get(cfg.skillCode);
        if (target) {
          const targetTrigger = triggerOf(target.nodes);
          if (targetTrigger) {
            walk(target, targetTrigger.id, depth + 1, `${keyPrefix}:${node.id}>`);
          }
        }
      }
      // Recurse normalmente nos filhos do nó atual
      walk(current, node.id, depth, keyPrefix);
    }

    visiting.delete(code);
  };

  const trigger = triggerOf(swn.nodes);
  if (!trigger) return [];
  // Inclui o próprio gatilho como primeira ação
  out.push({
    id: `${swn.skill.code}:${trigger.id}`,
    sourceSkillCode: swn.skill.code,
    node: trigger,
    depth: 0,
  });
  walk(swn, trigger.id, 0, swn.skill.code);
  return out;
}

// ============================================================================
// Validação estrutural (consumida pelo canvas para marcar nós inválidos)
// ============================================================================

export interface SkillValidationIssue {
  nodeId: string | null;
  severity: 'error' | 'warning';
  message: string;
}

export function validateSkill(swn: SkillWithNodes): SkillValidationIssue[] {
  const issues: SkillValidationIssue[] = [];
  const trigger = triggerOf(swn.nodes);
  if (!trigger) {
    issues.push({ nodeId: null, severity: 'error', message: 'A skill precisa de um nó de gatilho na raiz.' });
  } else {
    const cfg = triggerConfig(trigger);
    if (!cfg || !cfg.behaviorCodes || cfg.behaviorCodes.length === 0) {
      issues.push({ nodeId: trigger.id, severity: 'error', message: 'O gatilho precisa de pelo menos 1 comportamento.' });
    }
  }

  // Triggers extras
  const extraTriggers = swn.nodes.filter(n => n.kind === 'trigger' && n.id !== trigger?.id);
  for (const t of extraTriggers) {
    issues.push({ nodeId: t.id, severity: 'error', message: 'Apenas um gatilho é permitido por skill.' });
  }

  // Órfãos (não-gatilho sem parent)
  const orphans = swn.nodes.filter(n => n.kind !== 'trigger' && n.parentNodeId === null);
  for (const o of orphans) {
    issues.push({ nodeId: o.id, severity: 'warning', message: 'Nó desconectado — não será executado.' });
  }

  // Conflitos óbvios entre guardrails (DO + DONT mesma raiz)
  const codes = swn.guardrailRuleCodes;
  for (const code of codes) {
    const opposite = code.startsWith('IA-DO-')
      ? code.replace('IA-DO-', 'IA-DONT-')
      : code.startsWith('IA-DONT-')
        ? code.replace('IA-DONT-', 'IA-DO-')
        : null;
    if (opposite && codes.includes(opposite)) {
      issues.push({ nodeId: null, severity: 'warning', message: `Guardrails conflitantes: ${code} vs ${opposite}.` });
    }
  }

  return issues;
}
