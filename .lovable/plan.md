

# Camada comportamental da IA — execução faseada do documento refinado

Naming: o documento usa "AIA" como nome próprio da IA. Eu vou tratar como **"a IA"** em toda copy visível ao usuário (UI, labels, mensagens, descrições, mock data e seed). Os IDs estáveis usados como código de referência interna nos dados (`AIA-DO-001`, `AIA-DONT-007`, `AIA-ASK-004`, `AIA-NOASK-015`) ficam como estão — são chaves técnicas, não texto exibido. Onde aparecem em descrição visível, troco para `IA-DO-001`, `IA-DONT-007`, etc., para manter consistência.

---

## Visão geral

O documento refinado define 6 partes operacionais que precisam virar código:

1. **Princípios universais** — 25 deveres (DO) + 28 proibições (DONT) + 11 perguntas obrigatórias (ASK) + 18 perguntas proibidas (NOASK) válidos em qualquer etapa.
2. **Biblioteca de 85 comportamentos do lead** (LB-001 a LB-085) — sinais de detecção, reação padrão, próximo passo.
3. **6 playbooks de etapa** (E0, E1, E2, E3, E4a, E4b) — objetivo, critérios de sucesso/falha, comportamentos esperados, DO/DONT específicos, ASK/NOASK específicos, encaminhamentos, escada de follow-up.
4. **Matriz de 30 comportamentos top** + matriz de gatilhos de handoff (P0–P3) + matriz de escadas de follow-up.
5. **Política de identidade da IA + LGPD + calibração de tom**.
6. **Modelo de dados** (LeadBehavior, StageBehaviorPlaybook, HandoffPackage, LeadState, LGPDPolicy, FollowUpLadder, IABehavior) e runtime com guardrails.

Tudo isso vai virar **dados editáveis em Lovable Cloud** + extensões ao construtor visual existente. Nada hardcoded.

---

## Plano em 5 fases

Cada fase é entregue por inteiro, validada por você, e só então avanço. Fases 1–3 são puramente front-end + dados (sem motor real de execução). Fases 4–5 ligam o motor de runtime e o handoff.

### Fase 1 — Modelo de dados + biblioteca seed (frontend, sem backend)

Estende `src/data/mockData.ts` com os tipos e a seed completa do documento.

**Tipos novos:**
- `LeadBehaviorCategory = 'positive' | 'neutral' | 'evasive' | 'negative' | 'objection'`
- `LeadBehavior` — id, label, category, typicalStages[], detectionHints[], defaultReaction, nextStep
- `IABehaviorRule` — id (ex. `IA-DO-001`), kind ('do' | 'dont' | 'ask' | 'noask'), scope ('universal' | stageId), text, optional bannedReason
- `StageBehaviorPlaybook` — stageId, goal, successCriteria[], failureCriteria[], expectedBehaviorIds[] (ref LB), stageRules[] (ref IABehaviorRule), handoffTriggers[], followUpLadder, archiveTriggers[]
- `HandoffPackage` — summary5lines, timeline[], collectedData{}, persona, objectionsRaised[], suggestedNextStep, lossRisk(1-5)
- `FollowUpStep` — afterHours, tone, sampleMessage
- `HandoffTrigger` — priority ('P0'|'P1'|'P2'|'P3'), label, condition, action

**Seeds incluídas (constantes exportadas):**
- `IA_UNIVERSAL_RULES` — 25 DO + 28 DONT + 11 ASK + 18 NOASK (Parte 2 do doc).
- `LEAD_BEHAVIORS` — 85 itens com sinais de detecção e reação padrão (Parte 3).
- `STAGE_PLAYBOOKS` — 6 playbooks (E0, E1, E2, E3, E4a, E4b) referenciando LBs e regras.
- `HANDOFF_TRIGGERS_MATRIX` — 12 gatilhos P0/P1/P2/P3 (matriz da Parte 5.2).
- `FOLLOWUP_LADDERS` — 3 escadas padrão (rápida 1h-6h-24h, média 24h-72h-semanal, longa 30d-90d-180d).
- `IA_IDENTITY_POLICY` e `LGPD_POLICY` — textos do doc, editáveis.

**Funil padrão atualizado** para 6 etapas alinhadas ao documento: `E0 Primeiro contato → E1 Pré-qualificação → E2 Captação de documentos → E3 Análise de crédito → E4a Aprovado → E4b Reprovado` (E4a e E4b são etapas terminais paralelas). Cada etapa já vem com seu `playbookId` apontando para a seed.

**Validação:** abrir Config > Funil Padrão e ver as 6 etapas com playbooks pré-vinculados; nada quebra na UI atual.

---

### Fase 2 — Editor de Playbook por etapa (Config UI)

Em `src/pages/ConfigPage.tsx`, no editor de etapa expandido, adiciono uma nova seção **"Comportamento da IA nesta etapa"** acima do touchpoint, com 6 abas internas (mobile-friendly, scroll horizontal):

1. **Objetivo** — campo único editável: o que a IA precisa conseguir nesta etapa. Pré-preenchido com a goal do playbook seed.
2. **Comportamentos do lead** — lista de LBs ativos na etapa; toggle ativar/desativar cada um, botão editar reação padrão, "+ adicionar comportamento" (escolhe da biblioteca ou cria novo).
3. **A IA deve / não deve** — duas listas lado a lado (DO/DONT específicos + universais herdados marcados como cinza/somente leitura). Botão "+ adicionar regra".
4. **Perguntas (ASK / NOASK)** — mesmo padrão: lista de fraseologia pronta com dado capturado, e lista de perguntas banidas com motivo.
5. **Follow-up** — escolhe escada padrão ou edita passos (afterHours, tom, mensagem-modelo).
6. **Encaminhamento** — gatilhos de avanço, gatilhos de handoff (lista referenciando matriz P0–P3), gatilhos de descarte.

Cada aba tem search/filtro e badges de categoria/prioridade. Tudo persiste em estado React por enquanto (mock).

**Componentes novos em `src/components/`:**
- `StagePlaybookEditor.tsx` — sheet bottom full-height com as 6 abas
- `LeadBehaviorList.tsx` — lista virtualizada com filtros por categoria
- `IARuleList.tsx` — DO/DONT/ASK/NOASK
- `FollowUpLadderEditor.tsx`
- `HandoffTriggerList.tsx`

**Validação:** consigo abrir cada etapa, ver e editar todas as 6 abas, alterações persistem enquanto a sessão continua aberta.

---

### Fase 3 — Construtor de fluxo da IA com metadados comportamentais

Estende `src/components/AIWorkflowBuilder.tsx` para que cada bloco ganhe os campos comportamentais previstos no doc:

- **`intent`** — dropdown: `collect_income | send_doc_list | reassure_privacy | confirm_understanding | celebrate_approval | recovery_plan | …` (lista vinda da seed, editável).
- **`tone`** — `consultivo | objetivo | empático | urgente | educativo | acolhedor`.
- **`reactsToBehaviorIds`** — multi-select de LBs (mostra hints da biblioteca). Se vazio, é fluxo padrão.
- **`fallbackBlockId`** — qual bloco rodar se a reação não funcionar (ex.: handoff).
- **`guardrails`** — checkboxes ligando regras universais relevantes (ex.: "não prometer aprovação", "uma pergunta por mensagem").

Tipo atualizado em `mockData.ts`:
```ts
export interface AIWorkflowBlock {
  id; type; config;
  intent?: string;
  tone?: 'consultivo' | 'objetivo' | 'empatico' | 'urgente' | 'educativo' | 'acolhedor';
  reactsToBehaviorIds?: string[];
  fallbackBlockId?: string;
  guardrailRuleIds?: string[];
}
```

A UI de cada `BlockCard` ganha um collapsible "Comportamento" com esses 5 campos. Os tipos de bloco existentes (send_message, wait, typing, recording, condition, wait_reply) continuam funcionando — só ganham metadados opcionais.

**Validação:** abrir um bloco no construtor, configurar intent + tom + comportamento que dispara, fechar e reabrir mantendo tudo.

---

### Fase 4 — Persistência em Lovable Cloud + edição multiusuário

Migra todas as seeds (universais + 85 LBs + 6 playbooks + matrizes) para tabelas do Lovable Cloud, com RLS por organização. A seed roda na primeira execução.

**Tabelas (migrações via tool):**
- `ia_rules` — universal/stage rules (DO/DONT/ASK/NOASK), `org_id`, `scope`, `kind`, `code`, `text`, `is_seed`, `is_active`.
- `lead_behaviors` — 85 LBs editáveis por org, com `detection_hints` JSONB, `default_reaction`, `next_step`.
- `stage_playbooks` — 1 por etapa por funil por org; vincula `stage_id` + `goal` + `success_criteria` JSONB + `failure_criteria` JSONB + `archive_triggers` JSONB.
- `playbook_behavior_links` — many-to-many playbook ↔ lead_behavior (com possível override de reação).
- `playbook_rule_links` — many-to-many playbook ↔ ia_rules específicas de etapa.
- `followup_ladders` + `followup_steps` — escadas reutilizáveis por etapa.
- `handoff_triggers` — gatilhos com priority, condition, action, escopo (universal ou por etapa).
- `ai_workflow_blocks` — blocos do construtor com os novos campos comportamentais.

RLS: leitura/escrita restritas a membros da org via `has_role`. Função `seed_default_ia_library(org_id)` que popula tudo a partir das constantes da Fase 1 quando uma org é criada (ou via botão "Restaurar padrão" no Config).

Hooks novos:
- `useIARules(scope)`, `useLeadBehaviors()`, `useStagePlaybook(stageId)`, `useFollowUpLadders()`, `useHandoffTriggers()`.

A UI da Fase 2 e Fase 3 deixa de operar em mock e passa a ler/escrever via esses hooks.

**Validação:** dois usuários da mesma org veem e editam os mesmos playbooks; ao restaurar padrão, tudo volta à seed.

---

### Fase 5 — Runtime, guardrails e HandoffPackage

Edge function nova `ia-conversation` que finalmente executa a camada comportamental contra mensagens reais (ou simuladas) do lead.

Fluxo por mensagem recebida:

```text
Mensagem do lead
  ↓
1. Carrega LeadState do deal (etapa atual, persona, dados já coletados)
  ↓
2. Classifica mensagem contra LeadBehaviors do playbook ativo
   (Lovable AI Gateway, gemini-2.5-flash, prompt com hints de detecção)
  ↓
3. Aplica guardrails universais (DONT + NOASK) — bloqueia respostas proibidas
  ↓
4. Seleciona bloco do AIWorkflow cujo reactsToBehaviorIds bate
   (fallback: bloco padrão da etapa)
  ↓
5. Gera resposta usando: goal da etapa + tom do bloco + DO+ASK aplicáveis
   + dados já em LeadState (nunca pergunta de novo)
  ↓
6. Pós-processa: valida 1 pergunta por msg, ≤4 linhas, sem promessa de prazo
  ↓
7. Atualiza LeadState (novos dados, persona, próximo follow-up agendado)
  ↓
8. Avalia handoff triggers; se bater P0/P1, gera HandoffPackage
   e marca o deal para corretor humano
```

**Tabelas adicionais:**
- `lead_states` — 1 por deal: `persona` JSONB, `collected_data` JSONB, `objections_raised[]`, `loss_risk_score`, `last_followup_at`, `next_followup_at`, `current_playbook_id`.
- `handoff_packages` — registro por handoff: `summary`, `timeline` JSONB, `collected_data` JSONB, `next_step`, `status`.
- `ia_decision_logs` — auditabilidade: cada turno registra mensagem do lead, LB classificado, bloco escolhido, regras aplicadas, resposta gerada, latência.

**Reescrita de `ai-chat-analysis`** para reusar a mesma camada quando o corretor pergunta no Modo IA dentro do chat — passa a citar regras e LBs reconhecidos no histórico, virando um co-piloto consciente do playbook.

**UI nova mínima:**
- No chat de oportunidade, chip lateral "Estado da IA": etapa atual do playbook, último LB detectado, próximo passo previsto, próximo follow-up agendado.
- No card do deal, badge "📦 Pacote de handoff pronto" quando gerado, abrindo um sheet com o resumo estruturado.

**Validação:** simular conversa em ambiente de teste — IA detecta LB-018 (negativado), aplica reação correta, não promete aprovação (guardrail ativo), pede 1 dado por vez, agenda follow-up. Ao receber LB-061 ("quero humano"), gera HandoffPackage e marca deal.

---

## Detalhes técnicos

```text
src/data/mockData.ts
└─ + tipos LeadBehavior, IABehaviorRule, StagePlaybook, HandoffPackage, FollowUpStep
└─ + constantes IA_UNIVERSAL_RULES (82), LEAD_BEHAVIORS (85), STAGE_PLAYBOOKS (6),
     HANDOFF_TRIGGERS_MATRIX (12), FOLLOWUP_LADDERS (3)
└─ + extensão de AIWorkflowBlock com intent/tone/reactsToBehaviorIds/fallback/guardrails

src/components/
├─ StagePlaybookEditor.tsx  (Fase 2)
├─ LeadBehaviorList.tsx     (Fase 2)
├─ IARuleList.tsx           (Fase 2)
├─ FollowUpLadderEditor.tsx (Fase 2)
├─ HandoffTriggerList.tsx   (Fase 2)
└─ AIWorkflowBuilder.tsx    (Fase 3 — adiciona collapsible "Comportamento")

src/pages/ConfigPage.tsx    (Fase 2 — abre StagePlaybookEditor)

Lovable Cloud (Fase 4)
└─ tabelas ia_rules, lead_behaviors, stage_playbooks, playbook_behavior_links,
   playbook_rule_links, followup_ladders, followup_steps, handoff_triggers,
   ai_workflow_blocks  (todas com RLS por org)

supabase/functions/
├─ ia-conversation/         (Fase 5 — engine de runtime)
└─ ai-chat-analysis/        (Fase 5 — refatorado para usar a camada)

Lovable Cloud (Fase 5)
└─ tabelas lead_states, handoff_packages, ia_decision_logs
```

**Texto vs IDs:** internamente os códigos (`IA-DO-001`, `LB-018`) são chaves estáveis e ficam no banco. Em toda copy exibida ao usuário, escrevo "a IA" — nunca "AIA". Onde o doc refinado dizia "AIA deve…", a UI dirá "A IA deve…".

**Decisões deferidas (cada uma vira conversa própria depois):**
- Conexão real com WhatsApp Business (canal de entrada).
- Parser de áudio do lead (transcrição via gateway).
- Análise de documentos enviados (OCR + classificação de tipo).
- Calibração fina de prompts por persona detectada (formal/informal, técnico/leigo).
- Tela de auditoria das `ia_decision_logs` em Indicadores.

---

## O que acontece após aprovar

Começo pela **Fase 1**: estendo `mockData.ts` com tipos e seeds completas das 25 DO + 28 DONT + 11 ASK + 18 NOASK + 85 LBs + 6 playbooks + 12 gatilhos + 3 escadas, atualizo o funil padrão para 6 etapas e te chamo para validar antes de avançar para a Fase 2.

