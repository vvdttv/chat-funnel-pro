## Plano

Vou corrigir o layout da barra horizontal do Kanban para ela ficar realmente colada na barra cinza inferior, nas duas visualizações: por lead e por funil.

### O que será ajustado
1. Remover a folga estrutural que hoje empurra o Kanban para cima.
   - O problema está no espaçamento reservado pela página de Funis (`pb-16`) somado ao menu inferior fixo.
   - Isso cria um “colchão” entre o fim do Kanban e a navegação, então a barra nunca encosta de verdade no rodapé.

2. Reorganizar a área útil da página de Leads/Funis.
   - Vou tirar o espaçamento manual do container principal da página.
   - A reserva para o menu inferior passará a ser controlada de forma consistente pelo shell/layout, em vez de sobrar dentro do Kanban.

3. Ancorar a barra horizontal no rodapé visual correto.
   - A barra de rolagem ficará presa ao limite inferior da área de conteúdo, imediatamente acima da navegação cinza.
   - O ajuste valerá igualmente para `viewMode === 'lead'` e `viewMode === 'funnel'`, porque ambas usam o mesmo `KanbanBoard`.

4. Padronizar a altura/inset do menu inferior.
   - Vou alinhar `BottomNav` e a área do Kanban com uma mesma referência de altura/inset, para não depender de `-mb-px` e compensações frágeis.
   - Isso evita que o problema volte em aparelhos com safe area diferente.

5. Refinar o acabamento visual.
   - Remover qualquer padding/margin residual entre slider e menu.
   - Garantir que o trilho horizontal ocupe a largura certa e continue funcional.

## Arquivos envolvidos
- `src/pages/FunisPage.tsx` — remover a folga estrutural da página
- `src/components/KanbanBoard.tsx` — reposicionar/ancorar corretamente a barra horizontal
- `src/components/BottomNav.tsx` — expor ou padronizar a altura útil do menu inferior
- `src/index.css` — pequenos ajustes finos do slider, se necessário

## Resultado esperado
- A barra horizontal aparece nas duas visões.
- Ela fica encostada na linha superior da barra cinza do menu inferior.
- Sem espaço preto entre Kanban e menu.
- Sem depender de gambiarra visual específica de um único modo.

## Detalhes técnicos
```text
Hoje:
[Kanban]
[gap criado por pb-16 da página]
[menu inferior fixo]

Depois:
[Kanban]
[barra horizontal]
[menu inferior fixo]
```

Implementação prevista:
- remover `pb-16` do container principal de `FunisPage`
- reservar a área do menu de forma centralizada/consistente
- alinhar a barra horizontal ao limite inferior real da área de conteúdo
- manter o mesmo comportamento em lead e funil, já que ambos passam pelo `KanbanBoard`
