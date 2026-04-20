

## Reestruturação massiva: Funis, Etapas e Construtor de IA (Workflow style GHL)

Plano dividido em **4 fases**, cada uma entregue por inteiro e validada antes da próxima. Esta passada foca em **estrutura básica** — lógica profunda dos blocos da IA fica para conversas futuras.

---

### Fase 1 — Reset de funis e novo modelo de dados

**Objetivo:** zerar os 4 funis padrão (MCMV, Alto Padrão, Aluguel, Inquilinos) e deixar **um único "Funil Padrão"**, com modelo de dados expandido.

1. **`src/data/mockData.ts`:**
   - `FunnelStage` ganha: `id`, `maxDaysInStage` (tempo máx. permitido na etapa em dias), mantém `touchpoints`.
   - `Touchpoint` evolui:
     - `executor: 'ai' | 'agent' | 'both'`
     - `messageTypes: ('text' | 'image' | 'audio' | 'video')[]`
     - `aiWorkflow?: AIWorkflow`
   - Novos tipos: `AIWorkflow`, `AIWorkflowBlock`.

2. **Funil padrão único:** "Funil Padrão" com 5 etapas: `Novo Lead → Qualificação → Visita → Proposta → Fechamento`, cada uma com 1 touchpoint exemplo (IA, WhatsApp, texto). Atualizar `deals` mock para todos apontarem nesse funil único.

3. **Consumidores:** `FunisPage`, `IndicadoresPage` e `ConfigPage` continuam dinâmicos. Botões "+ Novo Funil" e "+ Nova Etapa" suportam criação ilimitada.

**Validação:** apenas "Funil Padrão" aparece em Leads, Indicadores e Config. Criar funis e etapas adicionais funciona sem limite.

---

### Fase 2 — Métricas, SLA e indicadores de probabilidade da etapa

**Objetivo:** cada etapa expõe um painel completo de métricas no editor em **Config > Funis**.

1. **Painel de Métricas no `StageEditor` (em `ConfigPage.tsx`)** — bloco no topo do editor expandido, antes do slider de probabilidade. Métricas calculadas a partir dos `deals` (mock por enquanto):

   **Métricas básicas (já solicitadas):**
   - **Valor financeiro total** — soma de `deal.value` dos deals na etapa.
   - **Total de oportunidades** — count de deals na etapa.
   - **Tempo máximo na etapa** (input editável, em dias) → `maxDaysInStage`.

   **Novos indicadores (esta atualização):**
   - **Probabilidade de fechamento** (%) — chance de um lead nesta etapa virar venda (status "ganho"). Cálculo: `deals_ganhos_que_passaram_por_esta_etapa / total_deals_que_passaram_por_esta_etapa`. Por ora, mock derivado do campo `probability` da etapa, com placeholder claro de "calculado historicamente".
   - **Probabilidade de avanço** (%) — chance do lead avançar para a próxima etapa. Cálculo: `deals_que_avançaram_da_etapa / total_deals_que_entraram_na_etapa`. Mock por ora.
   - **Tempo médio de avanço** (dias) — média de dias que um lead leva para passar desta etapa para a seguinte. Mock derivado de timestamps simulados.
   - **Tempo médio para fechamento** (dias) — média de dias entre entrar nesta etapa e virar venda (status ganho). Mock por ora.

   **Layout do painel:** grid 2 colunas com 6 mini-cards (valor, oportunidades, prob. fechamento, prob. avanço, tempo médio avanço, tempo médio fechamento) + input editável de tempo máximo abaixo.

2. **Indicador visual de SLA estourado:** badge "⚠ atrasado" no card de oportunidade quando dias na etapa > `maxDaysInStage`. Lógica simples baseada em `deal.createdAt`.

3. **Infra de cálculo:** criar helpers em `mockData.ts` (`getStageMetrics(funnelId, stageId)`) que retornam objeto com todas as métricas. Hoje mock; preparado para vir de backend depois.

**Validação:** ao expandir uma etapa em Config aparece o painel com as 6 métricas + input de tempo máximo. Cards de leads atrasados recebem badge.

---

### Fase 3 — Editor de Touchpoint expandido

**Objetivo:** touchpoint vira nó configurável com **executor**, **tipos de mensagem múltiplos** e botão para abrir o construtor de IA.

1. **Novo `TouchpointCard` em `ConfigPage.tsx`:**
   - 3 botões de executor: `Corretor`, `IA`, `Ambos`.
   - Chips multi-seleção de tipos de mensagem: `Texto`, `Imagem`, `Áudio`, `Vídeo` (intercaláveis).
   - Mantém canal (WhatsApp / E-mail / SMS / Ligação) e delay em horas.
   - Quando executor for `IA` ou `Ambos`, mostra botão **"Configurar comportamento da IA →"** que abre o sheet do construtor (Fase 4).

2. **Touchpoints ilimitados** dentro de cada etapa via "+ Adicionar".

**Validação:** edito um touchpoint, escolho executor, marco múltiplos tipos de mensagem, vejo botão de configurar IA aparecendo nos modos IA/Ambos.

---

### Fase 4 — Construtor de fluxo da IA (estilo GoHighLevel Workflows)

**Referência GHL:** canvas vertical, ações encadeadas com botão `+` entre blocos, cada bloco com cabeçalho colorido + corpo configurável, suporta delays, envios, condições. Adaptado para mobile como pilha vertical de cards conectados.

1. **Novo `src/components/AIWorkflowBuilder.tsx`:**
   - Recebe `AIWorkflow` + `onChange`.
   - Lista vertical de blocos com linha conectora e botão `+` entre eles.
   - **Tipos de bloco básicos** (estrutura mínima nesta fase):
     - **Enviar mensagem** (sub-tipo: texto / imagem / áudio / vídeo)
     - **Aguardar** (delay em segundos/minutos/horas)
     - **Mostrar "digitando..."** (toggle + duração)
     - **Mostrar "gravando áudio..."** (toggle + duração)
     - **Condição** (placeholder, lógica detalhada depois)
     - **Aguardar resposta do lead**
   - Cada bloco: ícone, título, resumo 1 linha, editar (lápis) e excluir (lixeira). Editor inline expand/collapse.
   - "+ Adicionar bloco" abre menu com os 6 tipos.

2. **Sheet de configuração da IA:** disparado pelo botão da Fase 3. `Sheet` side="bottom" full-height. Header com nome do touchpoint, toggle "Mostrar status de digitação ao lead", input "Tempo máx. de resposta da IA" (segundos), e o `AIWorkflowBuilder` no corpo.

3. **Persistência:** mock em estado React em `Touchpoint.aiWorkflow`. Sem backend nesta fase.

**Validação:** clico em "Configurar comportamento da IA", abro o sheet, adiciono/removo/reordeno blocos, fecho e reabro mantendo estado.

---

### Detalhes técnicos (resumo)

```text
data/mockData.ts
├─ FunnelStage { id, name, probability, maxDaysInStage, touchpoints[] }
├─ Touchpoint { id, executor, channel, messageTypes[], delayHours, action, description, aiWorkflow? }
├─ AIWorkflow { id, blocks[] }
│  └─ AIWorkflowBlock { id, type, config{} }
└─ getStageMetrics(funnelId, stageId) → {
     totalValue, dealCount, closeProbability,
     advanceProbability, avgDaysToAdvance, avgDaysToClose
   }

ConfigPage.tsx
├─ StageEditor → painel de 6 métricas + input Tempo Máx.
├─ TouchpointCard → 3 executores + chips de tipos + botão "Configurar IA"
└─ <AIWorkflowSheet/> → <AIWorkflowBuilder/>

components/AIWorkflowBuilder.tsx (novo)
└─ Pilha vertical de BlockCard com conector e "+"
```

### Fora do escopo desta entrega
- Engine real de execução da IA.
- Conexão real com WhatsApp/canais.
- Persistência em Lovable Cloud (segue mock em memória, padrão atual).
- Cálculo real das probabilidades a partir de histórico (hoje mock derivado).
- Configuração profunda de cada bloco da IA (prompts, modelo, ramificações).

### Validação por fase
Após cada fase: resumo do que mudou + caminho de teste manual ("vá em X, clique Y, confirme Z"). Só avanço quando você confirmar OK.

