import { describe, expect, it } from 'vitest';
import { inferForcedStep } from '@/lib/activityBlocking';

const NOW = new Date('2026-04-24T12:00:00Z');
const past = (offsetMs: number) => new Date(NOW.getTime() - offsetMs).toISOString();
const future = (offsetMs: number) => new Date(NOW.getTime() + offsetMs).toISOString();

describe('inferForcedStep', () => {
  it('retorna null quando lost+arquivado independente de atividades', () => {
    expect(inferForcedStep({ status: 'lost', lostSubstage: 'arquivado' }, NOW)).toBeNull();
  });

  it('retorna null quando ganho sem próxima atividade', () => {
    expect(inferForcedStep({ status: 'won', lastActivityAt: past(1000) }, NOW)).toBeNull();
  });

  it('retorna null quando perdido sem próxima atividade', () => {
    expect(inferForcedStep({ status: 'lost', lastActivityAt: past(1000) }, NOW)).toBeNull();
  });

  it('retorna resolve_overdue quando há próxima vencida sem registro posterior', () => {
    expect(inferForcedStep({
      status: 'open',
      nextActionAt: past(60_000),
      lastActivityAt: past(120_000),
    }, NOW)).toBe('resolve_overdue');
  });

  it('retorna resolve_overdue quando há próxima vencida e nenhuma atividade registrada', () => {
    expect(inferForcedStep({
      status: 'open',
      nextActionAt: past(60_000),
      lastActivityAt: null,
    }, NOW)).toBe('resolve_overdue');
  });

  it('retorna register_outcome quando deal está aberto sem nenhum registro nem próxima', () => {
    expect(inferForcedStep({ status: 'open' }, NOW)).toBe('register_outcome');
  });

  it('retorna schedule_next quando há registro recente mas sem próxima', () => {
    expect(inferForcedStep({
      status: 'open',
      lastActivityAt: past(60_000),
      nextActionAt: null,
    }, NOW)).toBe('schedule_next');
  });

  it('retorna null quando há próxima atividade futura agendada', () => {
    expect(inferForcedStep({
      status: 'open',
      lastActivityAt: past(60_000),
      nextActionAt: future(86_400_000),
    }, NOW)).toBeNull();
  });

  it('retorna null quando aberto, sem registro mas com próxima futura agendada', () => {
    expect(inferForcedStep({
      status: 'open',
      lastActivityAt: null,
      nextActionAt: future(3_600_000),
    }, NOW)).toBeNull();
  });
});
