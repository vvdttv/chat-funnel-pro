/**
 * Tradução de erros de transição de deal (PL/pgSQL → pt-BR para toast).
 * Mantido SEM dependência do client Supabase para ser testável isoladamente.
 */

const ERROR_MESSAGES: Record<string, string> = {
  deal_nao_encontrado: 'Esse deal não existe mais ou foi reatribuído.',
  sem_permissao: 'Você não tem permissão para alterar este deal.',
  sem_organizacao: 'Sua sessão não está vinculada a uma organização.',
  status_invalido: 'Status inválido.',
};

export const translate = (raw: string | null | undefined): string => {
  if (!raw) return 'Erro desconhecido';
  // Trava de campos obrigatórios (Fase 1.4b/1.4c): preserva a lista de campos
  // que vem após "campos_obrigatorios_pendentes: preenche antes de avancar: ...".
  if (raw.includes('campos_obrigatorios_pendentes')) {
    const m = raw.match(/campos_obrigatorios_pendentes:[^:]*:\s*(.+)$/);
    const campos = m?.[1]?.trim();
    return campos
      ? `Preencha os campos obrigatórios da etapa antes de avançar: ${campos}.`
      : 'Preencha os campos obrigatórios da etapa antes de avançar.';
  }
  for (const key of Object.keys(ERROR_MESSAGES)) {
    if (raw.includes(key)) return ERROR_MESSAGES[key];
  }
  return raw;
};
