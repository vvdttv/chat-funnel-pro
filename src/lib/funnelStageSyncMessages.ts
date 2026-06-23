/**
 * Tradução dos erros (RAISE) da RPC sync_funnel_stages para mensagens claras
 * ao operador (pt-BR). Extraído do hook para ser testável sem o client supabase
 * (lição J-1.4c: importar do hook puxa o client e exige env). Função pura.
 */
export function translateSyncError(msg: string): string {
  if (msg.includes('papel_critico_removido')) {
    const m = msg.match(/papel "([^"]+)"/);
    const papel = m ? m[1] : 'crítico';
    return 'Não é possível remover a etapa com papel "' + papel + '": ela é necessária para as automações. Reatribua o papel a outra etapa antes de remover.';
  }
  if (msg.includes('papel_duplicado')) {
    const m = msg.match(/papel "([^"]+)"/);
    const papel = m ? m[1] : '';
    return 'O papel "' + papel + '" foi atribuído a mais de uma etapa do mesmo funil. Cada papel só pode existir em uma etapa.';
  }
  if (msg.includes('papel_desconhecido')) return 'Papel desconhecido. Escolha um papel válido da lista.';
  if (msg.includes('funil_sem_etapas')) return 'Um funil precisa de ao menos uma etapa.';
  if (msg.includes('sem_permissao')) return 'Você não tem permissão para editar etapas deste funil.';
  if (msg.includes('funil_nao_encontrado')) return 'Funil não encontrado.';
  return 'Não foi possível salvar as etapas: ' + msg;
}
