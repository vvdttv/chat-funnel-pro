

## Pop-up Obrigatório de Registro Pós-Conversa

### O que muda

Quando o corretor envia uma mensagem na conversa de um lead, ele fica **bloqueado** no sistema até preencher o registro obrigatório. O pop-up cobre toda a tela (z-50+, sem fechar ao clicar fora) e impede qualquer interação — fechar card, trocar aba, navegar.

### Campos do Pop-up

**1. Resumo do atendimento (obrigatório)**
- Textarea onde o corretor escreve o que aconteceu
- Botão "Extrair com IA" (ícone Sparkles) que:
  - Puxa as mensagens da conversa do deal
  - Gera um resumo automático (mock por enquanto, preparado para Lovable AI)
  - Mescla com o que o corretor já escreveu e aprimora o texto
  - Preenche o campo automaticamente

**2. Próxima atividade (obrigatório)**
- Dropdown com tipo: Ligar, Enviar Proposta, Visita, Follow-up (usa `ACTIVITY_TYPES`)
- Seletor de data (date input)
- Seletor de hora (time input)
- Textarea curto: "O que vai fazer?" (descrição da atividade)

**3. Botão "Registrar e Continuar"**
- Desabilitado até todos os campos obrigatórios serem preenchidos
- Ao confirmar, libera o sistema normalmente
- **Sem botão de cancelar** — o corretor DEVE registrar

### Bloqueio Total

- O pop-up é renderizado no nível do `Index.tsx` (acima de tudo)
- Estado `pendingNextStep` elevado para `Index.tsx`
- `BottomNav` recebe prop para bloquear troca de aba
- `DealDetailSheet.onClose` bloqueado enquanto pendente
- Overlay escuro sem onClick de fechar

### Alterações por arquivo

**`src/data/mockData.ts`**
- Adicionar interface `NextStepRecord` com campos do registro

**`src/pages/FunisPage.tsx`**
- `DealChatView`: adicionar callback `onMessageSent` ao clicar Send
- `DealDetailSheet`: receber `onInteraction` prop, bloquear `onClose` se interação pendente
- Criar componente `NextStepPopup` como bottom sheet full-screen obrigatório com:
  - Resumo textarea + botão IA
  - Campos de próxima atividade
  - Validação de todos os campos antes de habilitar botão

**`src/pages/Index.tsx`**
- Estado `hasPendingStep` controlado via callback de `FunisPage`
- Bloquear `onTabChange` do `BottomNav` quando `hasPendingStep === true`
- Mostrar toast "Registre o próximo passo antes de sair" ao tentar trocar

