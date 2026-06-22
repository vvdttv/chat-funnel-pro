import { describe, it, expect } from 'vitest';
import { translate } from '@/lib/transitionMessages';

describe('dealTransitions.translate', () => {
  it('traduz erros conhecidos', () => {
    expect(translate('deal_nao_encontrado')).toMatch(/não existe mais/);
    expect(translate('sem_permissao')).toMatch(/permissão/);
  });

  it('campos_obrigatorios_pendentes preserva a lista de campos do RAISE', () => {
    const raw = 'campos_obrigatorios_pendentes: preencha antes de avancar: Renda compatível, Região atendida';
    const out = translate(raw);
    expect(out).toContain('Renda compatível, Região atendida');
    expect(out).toMatch(/Preencha os campos obrigatórios/);
    expect(out).not.toContain('campos_obrigatorios_pendentes');
  });

  it('campos_obrigatorios_pendentes sem lista cai no fallback amigável', () => {
    expect(translate('campos_obrigatorios_pendentes:')).toMatch(/Preencha os campos obrigatórios/);
  });

  it('erro desconhecido passa cru', () => {
    expect(translate('algum_erro_novo')).toBe('algum_erro_novo');
    expect(translate(null)).toBe('Erro desconhecido');
  });
});
