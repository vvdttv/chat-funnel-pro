

# Camada de Skills da IA — Builder visual estilo GHL com canvas drag-and-drop

Transformar o comportamento da IA em **skills nomeáveis e ativáveis por gatilho**, onde cada skill é uma reação composta (gatilho LB → ações + guardrails DO/DONT) editada num canvas visual no estilo do GoHighLevel. Inclui detecção automática de novos LBs via Lovable AI a partir dos `ia_decision_logs`.

## O que será entregue

### Conceito

Uma **skill** é uma unidade reutilizável de comportamento da IA. Cada skill tem:
- **1 nó-gatilho** (sempre no topo) — um ou mais `LB-xxx` (comportamentos do lead) que ativam a skill
- **N nós de ação** conectados — `enviar_mensagem`, `aguardar`, `coletar_dado`, `mudar_tom`, `executar_handoff`, `aplicar_ladder`, `chamar_skill` (composição), `condicao_se`
- **Guardrails laterais** — chips de regras `IA-DO/DONT/ASK/NOASK` que se aplicam enquanto a skill executa
- **Escopo** — universal, por etapa (E0–E4b) ou por tag de contexto

### Estrutura visual (canvas GHL-like)

```text
┌────────────────────────────────────────────────────────────────┐
│  [⚡ Skills]   [🧠 Comportamentos]   [🛡️ Guardrails]   [📊 Saúde] │
├──────────────┬─────────────────────────────────────────────────┤
│  Lista       │  Canvas da skill selecionada                    │
│  ──────      │  ┌──────────────────────────┐                   │
│  ✓ Recuperar │  │ 🎯 Gatilho               │                   │
│    objeção   │  │ LB-OBJ-PRECO + LB-EVASIVO│                   │
│  ✓ Coletar   │  └────────┬─────────────────┘                   │
│    renda     │           │                                     │
│  ✓ Celebrar  │  ┌────────▼─────────────┐  Guardrails ativos:   │
│    aprovação │  │ 💬 Reconhecer dor    │  • IA-DO-006          │
│  + Nova skill│  │ Tom: empático        │  • IA-DONT-014        │
│              │  └────────┬─────────────┘  • IA-NOASK-003       │
│              │           │                                     │
│              │  ┌────────▼─────────────┐  [+ adicionar]        │
│              │  │ 📤 Enviar contraprop │                       │
│              │  │ Intent: recovery_plan│  [▶ Testar skill]    │
│              │  └──────────────────────┘                       │
└──────────────┴─────────────────────────────────────────────────┘
```

Mobile: lista vira drawer superior, canvas ocupa tela toda com pinch-to-zoom e pan.

## Sprints

### S27 — Fundação de dados (migrations)

Três tabelas novas + RLS padrão da org:

- **`ia_skills`** — `id, organization_id, code, name, description, scope_type ('universal'|'stage'|'context'), scope_id, is_active, position, created_at, updated_at`
- **`ia_skill_nodes`** — `id, skill_id, organization_id, kind ('trigger'|'send_message'|'wait'|'collect'|'set_tone'|'handoff'|'apply_ladder'|'call_skill'|'condition'), position_x, position_y, config jsonb, parent_node_id` (árvore — não DAG arbitrário, simplifica execução)
- **`ia_skill_guardrails`** — `skill_id, rule_code, organization_id` (M:N para `ia_rules.code`)

Snapshots reutilizam `playbook_override_snapshots` com novo `scope_type='skill'`.

### S28 — Hook `useSkills` + motor `composeActiveSkill`

Arquivo `src/hooks/useSkills.ts` (CRUD + realtime opcional) e `src/lib/skillComposer.ts` (puro, com testes):
- `composeActiveSkill(detectedBehaviors, stageCode, contextTags, allSkills)` → retorna a skill com maior especificidade que casa com os LBs detectados
- `expandSkillToActions(skill, runtimeContext)` → array linear de ações executáveis (resolve `call_skill` recursivamente com proteção contra ciclo)
- Integra com `playbookComposer` existente: skills entram como camada acima do playbook da etapa

### S29 — Canvas builder (`SkillCanvasEditor.tsx`)

Componente principal usando `react-flow` (instalar `@xyflow/react`) — biblioteca padrão do mercado para o estilo GHL/n8n/Zapier:
- Nós custom estilizados com tokens do design system (sem cores cruas — `bg-card`, `border-primary/30` etc.)
- Paleta lateral arrastável com os 8 tipos de nó
- Painel inferior abre ao clicar num nó: edição de `config` específica do tipo (ex.: `send_message` mostra textarea + seletor de tom; `collect` mostra qual dado e onde gravar)
- Validação visual em tempo real: nó-gatilho obrigatório, sem ciclos, todos os caminhos terminam, guardrails sem conflito (ex.: DO e DONT contraditórios marcam o nó em amarelo)
- Salva debounced em `ia_skill_nodes` (upsert por id)

### S30 — Gestor de Skills (`IASkillsManager.tsx`)

Container principal, montado como nova aba "Skills" em `IABehaviorManager.tsx`:
- Split view desktop (lista 320px + canvas), drawer mobile
- Lista mostra: nome, escopo (chip), # de gatilhos LB, # de nós, toggle ativo/inativo, badge "auto-sugerida" se veio da IA
- Botões: duplicar, exportar JSON, ver snapshots, testar contra mensagem fictícia
- "Testar skill" reaproveita o sandbox do `PlaybookFourColumnEditor` — renderiza como a IA reagiria

### S31 — Detecção automática de LBs via Lovable AI

Edge function nova `supabase/functions/suggest-lead-behaviors/index.ts`:
- Lê últimos 200 `ia_decision_logs` da org com `outcome` neutro/negativo
- Usa `google/gemini-3-flash-preview` via Lovable AI com **tool calling** para extrair candidatos a `LeadBehavior` (label, category, detection_hints, default_reaction)
- Filtra duplicatas vs `lead_behaviors` existentes (similaridade por label + hints)
- Retorna lista de drafts; admin aprova um por um na nova aba "Sugestões IA" do gestor de comportamentos
- Botão "Sugerir agora" no painel + opção de cron diário (deixa desligado por padrão)

### S32 — Wiring no runtime + migração suave

- `useIABehavior` ganha campo `skills` reativo
- `IADecisionLogger` registra qual skill foi ativada em cada decisão (nova coluna `activated_skill_code` em `ia_decision_logs` via migration)
- Painel de saúde (S26 já entregue) ganha widget "Top 5 skills ativadas" + "Skills ativas mas nunca usadas"
- Migração suave: ao seedar a org, gera 6 skills-base a partir dos playbooks E0–E4b já existentes (script idempotente na edge function `seed-ia-behavior`)

## Detalhes técnicos

- **Dependência nova:** `@xyflow/react` (~150kb gzip, padrão do mercado, MIT). Sem ela, drag-and-drop visual de qualidade GHL não acontece em prazo razoável.
- **Tipos:** `src/data/iaSkills.ts` espelha o padrão de `iaBehavior.ts` com tipos puros + seed de 6 skills-base.
- **Testes:** `skillComposer.test.ts` cobre seleção por especificidade, ciclo em `call_skill`, expansão recursiva. Meta: manter suíte verde (132 → ~150).
- **RLS:** todas as 3 tabelas seguem o padrão existente — admins CRUD, membros SELECT da própria org.
- **Sem regressão:** `playbook_overrides`, `ia_rules`, `lead_behaviors` ficam intocados. Skills é uma camada acima.

## Validação

- `tsc --noEmit` limpo
- `vitest run` com novos testes verdes
- Fluxo manual: criar skill nova → arrastar 3 nós → conectar → adicionar 2 guardrails → salvar → testar com mensagem fictícia → ver no log de decisão qual skill foi ativada
- Sugestão de LB: clicar "Sugerir agora" → ver 3–5 candidatos → aprovar 1 → aparece em `lead_behaviors`

## Arquivos novos / editados

```text
NOVOS
src/data/iaSkills.ts                                  [tipos + seed]
src/hooks/useSkills.ts                                [CRUD + realtime]
src/lib/skillComposer.ts                              [motor puro]
src/components/IASkillsManager.tsx                    [container split]
src/components/SkillCanvasEditor.tsx                  [react-flow canvas]
src/components/SkillNodeInspector.tsx                 [painel inferior]
src/components/LBSuggestionsPanel.tsx                 [aprovação de LBs IA]
src/test/skillComposer.test.ts                        [~12 testes]
supabase/functions/suggest-lead-behaviors/index.ts    [edge function IA]

EDITADOS
src/components/IABehaviorManager.tsx                  [nova aba "Skills" + "Sugestões IA"]
src/hooks/useIABehavior.ts                            [expõe skills reativo]
src/lib/iaDecisionLogger.ts                           [campo activated_skill_code]
src/components/IASystemHealthPanel.tsx                [widgets de skills]
supabase/functions/seed-ia-behavior/index.ts          [seed 6 skills-base]
package.json                                           [+ @xyflow/react]

MIGRATIONS
- create table ia_skills (+ RLS)
- create table ia_skill_nodes (+ RLS)
- create table ia_skill_guardrails (+ RLS)
- alter table ia_decision_logs add column activated_skill_code text
```

Aprovando, executo S27 + S28 + S29 na próxima mensagem (fundação + canvas funcional). S30–S32 entram em seguida.

