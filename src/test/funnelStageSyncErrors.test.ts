import { describe, it, expect } from 'vitest';
import { translateSyncError } from '@/lib/funnelStageSyncMessages';

describe('translateSyncError (J-2b-0b)', () => {
  it('traduz papel critico removido preservando o nome do papel', () => {
    const msg = translateSyncError('papel_critico_removido: a etapa com papel "aprovado_aguardando" e necessaria');
    expect(msg).toContain('aprovado_aguardando');
    expect(msg).toContain('Reatribua o papel');
  });

  it('traduz papel duplicado preservando o nome', () => {
    const msg = translateSyncError('papel_duplicado: o papel "transferido" foi atribuido a mais de uma etapa');
    expect(msg).toContain('transferido');
    expect(msg).toContain('uma etapa');
  });

  it('traduz papel desconhecido', () => {
    expect(translateSyncError('papel_desconhecido: "xpto" nao esta no catalogo')).toContain('Papel desconhecido');
  });

  it('traduz funil sem etapas', () => {
    expect(translateSyncError('funil_sem_etapas: ...')).toContain('ao menos uma etapa');
  });

  it('traduz sem permissao', () => {
    expect(translateSyncError('sem_permissao')).toContain('permissão');
  });

  it('fallback para mensagem desconhecida mantem o texto original', () => {
    const msg = translateSyncError('algum_erro_inesperado: detalhe');
    expect(msg).toContain('algum_erro_inesperado');
  });
});
