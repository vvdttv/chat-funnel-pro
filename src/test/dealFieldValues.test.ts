import { describe, it, expect } from 'vitest';
import { isFilled, isHumanEditable, criterionOptions } from '@/lib/dealFieldValues';
import type { QualificationCriterion } from '@/hooks/useQualificationCriteria';

// A régua de "preenchido" precisa espelhar EXATAMENTE a trava SQL 1.4b:
// value não-nulo, não array vazio, não string vazia/só-espaços. false/0 contam.
describe('dealFieldValues.isFilled (espelha a trava SQL 1.4b)', () => {
  it('null/undefined = vazio', () => {
    expect(isFilled(null)).toBe(false);
    expect(isFilled(undefined)).toBe(false);
  });
  it('string vazia ou só-espaços = vazio', () => {
    expect(isFilled('')).toBe(false);
    expect(isFilled('   ')).toBe(false);
    expect(isFilled('ok')).toBe(true);
  });
  it('array vazio = vazio; array com itens = preenchido', () => {
    expect(isFilled([])).toBe(false);
    expect(isFilled(['a'])).toBe(true);
  });
  it('false e 0 CONTAM como preenchidos (a régua SQL não os exclui)', () => {
    expect(isFilled(false)).toBe(true);
    expect(isFilled(0)).toBe(true);
    expect(isFilled(true)).toBe(true);
  });
});

const mk = (over: Partial<QualificationCriterion>): QualificationCriterion => ({
  id: 'c1', funnelId: 'f', stageId: 's', key: 'k', label: 'L',
  criterionType: 'boolean', owner: 'ia', config: {}, questionHint: '',
  isRequired: true, position: 0, isActive: true, createdAt: '', ...over,
});

describe('dealFieldValues.isHumanEditable', () => {
  it('owner ia NÃO é editável pelo humano', () => {
    expect(isHumanEditable(mk({ owner: 'ia' }))).toBe(false);
  });
  it('owner corretor/ambos são editáveis', () => {
    expect(isHumanEditable(mk({ owner: 'corretor' }))).toBe(true);
    expect(isHumanEditable(mk({ owner: 'ambos' }))).toBe(true);
  });
});

describe('dealFieldValues.criterionOptions', () => {
  it('extrai value/label do config.options', () => {
    const c = mk({ criterionType: 'select_single', config: { options: [
      { value: 'whatsapp', label: 'WhatsApp' },
      { value: 'ligacao' }, // sem label -> usa value
    ] } });
    expect(criterionOptions(c)).toEqual([
      { value: 'whatsapp', label: 'WhatsApp' },
      { value: 'ligacao', label: 'ligacao' },
    ]);
  });
  it('sem options retorna lista vazia', () => {
    expect(criterionOptions(mk({}))).toEqual([]);
  });
});
