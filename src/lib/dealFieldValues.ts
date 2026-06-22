/**
 * Helpers de campos por etapa (Fase 1.4c).
 *
 * "Campo preenchido" replica EXATAMENTE a régua da trava de avanço
 * (`list_missing_required_fields`, migration 1.4b): value não-nulo, não
 * `null` jsonb, não array vazio e não string vazia/só-espaços. Usado na UI
 * para sinalizar quais obrigatórios ainda faltam para avançar.
 */

import type { QualificationCriterion } from '@/hooks/useQualificationCriteria';

/** Valor de um campo coletado por deal (espelha deal_field_values). */
export interface DealFieldValue {
  id: string;
  dealId: string;
  criterionId: string | null;
  fieldKey: string;
  value: unknown;
  owner: 'ia' | 'corretor' | 'ambos';
  source: 'ia' | 'corretor' | 'admin';
  updatedAt: string;
}

/** Mesma régua da trava 1.4b: o valor conta como preenchido? */
export function isFilled(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  // boolean false É um valor preenchido (decisão consciente: a régua SQL só
  // exclui null/'null'/array vazio/string vazia — não exclui false nem 0).
  return true;
}

/** Quem pode editar pelo humano (corretor/admin) — campos owner ia são read-only. */
export function isHumanEditable(c: Pick<QualificationCriterion, 'owner'>): boolean {
  return c.owner === 'corretor' || c.owner === 'ambos';
}

/** Opções padronizadas de um critério select_single/select_multi. */
export function criterionOptions(c: QualificationCriterion): Array<{ value: string; label: string }> {
  const raw = (c.config as { options?: unknown } | undefined)?.options;
  if (!Array.isArray(raw)) return [];
  return raw
    .map(o => {
      const obj = o as { value?: unknown; label?: unknown };
      const value = obj?.value != null ? String(obj.value) : '';
      const label = obj?.label != null ? String(obj.label) : value;
      return { value, label };
    })
    .filter(o => o.value !== '');
}
