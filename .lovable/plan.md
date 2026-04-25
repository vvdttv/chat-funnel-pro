# Plano — Configurador Conversacional da IA (chat-funnel-pro)

## Decisões fechadas (suas respostas)
- **Escopo runtime:** tudo (configurador grava + runtime executa web search e geração de imagem).
- **Ordem:** tudo numa rodada (Fases 1-5 juntas).
- **BottomNav:** 5º item visível para admin.
- **Modelo do `compose_plan`:** `google/gemini-2.5-pro`.
- **WhatsApp:** edge `send-whatsapp-media` pronta com checagem de janela 24h e bucket `whatsapp-media-public`; sem secrets, retorna erro amigável até você colar `WHATSAPP_PHONE_NUMBER_ID`/`WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_API_VERSION`.
- **Web research:** edge `web-research` usa fallback nativo via `gemini-2.5-pro` (sintetiza resposta com fontes plausíveis); migrável para Firecrawl/Perplexity depois sem quebrar contrato.

---

## Fase 1 — Banco de dados (1 migration)

**Arquivo:** `supabase/migrations/<ts>_ia_config_sessions.sql`

1. `public.ia_config_sessions` (histórico + undo): id, organization_id, user_id, original_message, fixed_answers (jsonb), custom_questions (jsonb), custom_answers (jsonb), generated_plan (jsonb), human_summary, created_artifacts (jsonb), status (`draft|approved|reverted`), created_at, approved_at, reverted_at, reverted_by. Índice por `(organization_id, created_at DESC)`. RLS: SELECT para membros da org, INSERT autenticados da org, UPDATE só admin (para revert).
2. `public.ia_config_prefs` (reuso por usuário): user_id PK, organization_id, last_scope, last_scope_ids (jsonb), last_trigger, last_polarity, last_tone, last_format, updated_at. RLS: SELECT/INSERT/UPDATE apenas o próprio `user_id`.
3. **Bucket de Storage** `whatsapp-media-public` (público, 5 MB max para image, 100 MB para document) — criado via SQL `storage.buckets`.

Não modifica nenhuma tabela existente. Não toca `stage_archetypes`/`status_archetypes`.

---

## Fase 2 — Edge function `behavior-composer` (núcleo)

**Arquivo:** `supabase/functions/behavior-composer/index.ts`

Padrão idêntico a `compose-playbook`/`seed-ia-behavior` (CORS, JWT, derivar `organization_id` via `profiles`, service role só dentro da edge para writes em snapshots).

3 modos despachados por `body.mode`:

### `mode: "generate_questions"`
- Recebe: `userMessage`, `fixedAnswers`, `previousAnswers`.
- Carrega snapshot do catálogo da org (lead_behaviors codes+labels, ia_rules ativas, ia_skills ativas, funnels, arquétipos).
- Chama Gateway `gemini-3-flash-preview` com system prompt em pt-BR pedindo 2-5 perguntas + `clarifyingSummary` + `duplicateAlerts`.
- **Parser tolerante de JSON**: strip de ```json fences, retry uma vez com instrução reforçada se inválido.
- Devolve `{ questions, clarifyingSummary, duplicateAlerts }`.

### `mode: "compose_plan"`
- Recebe: tudo do passo anterior + custom answers.
- Chama Gateway **`google/gemini-2.5-pro`** com system prompt detalhado (regras: reuso preferível a criar, codes únicos com prefixo correto + slug + sufixo random, decidir regra-vs-skill, override só quando escopo é funnel/stage, detectar conflitos, gerar `humanSummary` ≤4 frases).
- Devolve `{ humanSummary, artifacts: { leadBehaviors, iaRules, skills, playbookOverrides }, warnings }`.
- Skills geradas incluem `position_x/position_y` calculados em cascata vertical (offset 200px) para ficarem bonitas no canvas avançado.
- Skills podem usar campos extras em `config` jsonb dos nós `send_message`: `useWebSearch`, `generateImage`, `imagePromptTemplate`, `attachStatic`, `whatsappAttachmentType`. Sem novos `kind`.

### `mode: "persist_plan"`
- Recebe plano aprovado.
- Em ordem (com tratamento de erro por etapa):
  1. Snapshot prévio em `playbook_override_snapshots` para cada override afetado (action='upsert').
  2. Upsert `lead_behaviors` (idempotente via `ON CONFLICT (organization_id, code)`).
  3. Upsert `ia_rules` (mesmo padrão).
  4. Insert `ia_skills` + `ia_skill_nodes` + `ia_skill_guardrails`.
  5. Upsert `playbook_overrides`.
  6. Insert `ia_config_sessions` com `status='draft'` e todos os ids criados.
  7. Atualiza `ia_config_prefs` com últimas respostas.
- Devolve `{ sessionId, createdIds }`.

### `mode: "revert_session"`
- Marca sessão como `status='reverted'`.
- Desativa `is_active=false` em LBs/regras/skills/overrides criados.
- Restaura snapshot prévio dos overrides.

### Tratamento de erros
- 429 → `"O sistema está com muita demanda agora. Tenta de novo em alguns minutos."`
- 402 → `"Os créditos da IA da sua organização acabaram. Avise o admin."` + log em `ia_decision_logs` com `intent='credits_exhausted'`.
- JSON inválido → 1 retry com instrução reforçada.

---

## Fase 3 — Edges auxiliares (capacidades novas)

### `supabase/functions/web-research/index.ts`
- Recebe `{ query }`.
- Implementação atual (fallback): chama Gateway `gemini-2.5-pro` com system prompt "responda como pesquisador, cite fontes plausíveis no formato [título — domínio.com]".
- Devolve `{ summary, sources }`.
- Estrutura preparada para trocar por Firecrawl quando conector for adicionado.

### `supabase/functions/send-whatsapp-media/index.ts`
- Recebe `{ leadPhone, type: 'image'|'document'|'audio', link?, prompt?, caption? }`.
- Verifica secrets `WHATSAPP_PHONE_NUMBER_ID`/`WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_API_VERSION`. Sem eles → 200 com `{ ok: false, reason: 'capacidade_nao_configurada', message: 'WhatsApp ainda não foi configurado. Peça ao admin para conectar.' }`.
- **Checagem de janela 24h:** consulta `deal_activities` ou tabela equivalente para última mensagem recebida. Fora da janela → 200 com `{ ok: false, reason: 'fora_da_janela_24h' }`.
- Se `prompt` → gera imagem via Gateway `gemini-2.5-flash-image`, faz upload no bucket `whatsapp-media-public`, pega URL pública.
- POST para `https://graph.facebook.com/{API_VERSION}/{PHONE_ID}/messages` com `image.link` ou `document.link`.

### Atualização de `ai-chat-analysis/index.ts`
- Após resolver skill ativa via composer, antes de mandar mensagem ao Gateway:
  - Se nó `send_message` tem `useWebSearch=true` → chama `web-research`, injeta `summary` no contexto.
  - Se tem `generateImage=true` → chama `send-whatsapp-media` com `prompt = imagePromptTemplate` (placeholders `{nome_lead}`, `{cidade}` substituídos).
  - Se tem `attachStatic.storagePath` → resolve URL e anexa.
- Logs continuam em `ia_decision_logs`.

---

## Fase 4 — Frontend: tela conversacional

### Rota e arquivos
- `src/App.tsx`: nova rota `/configurar-ia` dentro de `<ProtectedRoute>`.
- `src/pages/ConfigurarIaPage.tsx`: container das 3 zonas (cabeçalho, conversa, painel de plano).
- `src/components/configurador-ia/ChatCanvas.tsx`: bolhas + textarea + chips de resposta.
- `src/components/configurador-ia/FixedTrioQuestions.tsx`: trio fixo (abrangência/gatilho/polaridade) com chips e cascatas.
- `src/components/configurador-ia/CustomQuestions.tsx`: renderiza perguntas geradas (`open|chips|multi_select|conditional`).
- `src/components/configurador-ia/PlanPanel.tsx`: painel lateral em desktop / Sheet inferior em mobile, lista artefatos sendo planejados.
- `src/components/configurador-ia/ReviewScreen.tsx`: humanSummary + chips coloridos + warnings + ver detalhes técnicos colapsado + 3 botões (Salvar/Ajustar/Cancelar).
- `src/components/configurador-ia/UndoBanner.tsx`: banner de 60s pós-save com countdown.
- `src/components/configurador-ia/HistorySheet.tsx`: lista últimas 30 sessões.
- `src/hooks/useBehaviorComposer.ts`: invoca a edge nos 3 modos via `supabase.functions.invoke`.
- `src/hooks/useIaConfigPrefs.ts`: lê/escreve `ia_config_prefs`.

### UX (mobile-first 411px, conforme glossário pt-BR já estabelecido)
- Zona A (cabeçalho ~10%): voltar, título dinâmico, breadcrumb 4 passos, menu overflow (Começar de novo / Modo avançado / Minhas configurações anteriores).
- Zona B (chat ~70%): primeira mensagem fixa pedindo descrição livre, depois trio fixo (chips com `↻ da última vez` para reuso), depois perguntas customizadas, depois revisão.
- Zona C (plano ~30%): em mobile vira Sheet inferior puxável; lista chips coloridos por tipo de artefato.
- Tom da IA: calmo, direto, sem jargão, máx 1 emoji.
- Indicador "A IA está pensando…" com `Loader2`. Timeout 25s.
- Acessibilidade: aria-labels, role=button em chips, foco lógico.

---

## Fase 5 — Pontos de entrada e modo avançado

1. **CTA primário no topo da aba `fluxos`** em `src/pages/ConfigPage.tsx`: card destacado com ícone Sparkles + título "Configurar a IA em linguagem natural" + subtítulo. Antes do `IABehaviorSeedBanner`.
2. **Banner em touchpoints `ai`/`both`** em `src/pages/ConfigPage.tsx` (TouchpointCard sheet `Configurar comportamento da IA`): "Prefere configurar isso conversando? → Configurador conversacional".
3. **5º item no `BottomNav`** em `src/components/BottomNav.tsx`: ícone Sparkles, label "Config IA", roteia para `/configurar-ia`. Visível só se `useAuth().isAdmin`. Os 4 itens existentes ficam ligeiramente mais apertados.
4. **Link "Modo avançado →"** em ambos os lados (no topo do configurador volta para aba fluxos; no topo da aba fluxos abre o configurador).

---

## Fase 6 — Glossário pt-BR (já documentado em mem://index.md)

A nova tela respeita o glossário: nada de "override", "guardrail", "scope", "skill", "playbook" no texto da UI. Usa "ajuste personalizado", "regra de proteção", "abrangência", "habilidade", "roteiro da etapa".

System prompt do `behavior-composer` instruído explicitamente a falar em pt-BR coloquial sem jargão.

---

## Critérios de pronto (E2E que vou validar)

1. Rota `/configurar-ia` renderiza.
2. CTA + banner + item BottomNav (admin) visíveis.
3. Edge `behavior-composer` responde aos 3 modos (validado via curl).
4. Migration aplicada, RLS funcionando.
5. **E2E 1**: "Quando o lead pedir desconto, a IA não pode prometer nada — só consultar comigo" → 1 LB + 1 DON'T + 1 skill criados, aparecem em IABehaviorManager e IASkillsManager.
6. **E2E 2**: "Quando lead perguntar sobre um bairro, pesquise online e mande uma imagem resumida" → skill com `useWebSearch=true` + `generateImage=true`; edges `web-research` + `send-whatsapp-media` existem.
7. **E2E 3**: 2ª sessão mostra trio fixo pré-selecionado com `↻`.
8. **E2E 4**: warning de conflito aparece quando regra contradiz IA-DONT universal.
9. **E2E 5**: undo de 60s reverte tudo.
10. **E2E 6**: tudo criado é editável no modo avançado.
11. 429/402 do Gateway → mensagens amigáveis em pt-BR.
12. Sem regressão na aba `fluxos` original.

---

## O que NÃO vou fazer
- Não deletar nem deprecar nenhum componente existente.
- Não criar novos `kind` de nó em `ia_skill_nodes`.
- Não alterar tabelas globais (`stage_archetypes`, `status_archetypes`).
- Não duplicar artefatos silenciosamente.
- Não expor JSON do plano na revisão por default.
- Não persistir nada sem botão "Salvar" explícito.
- Não pedir secrets do WhatsApp agora (edge fica pronta esperando).

---

## Riscos conhecidos e mitigações
- **`gemini-3-flash-preview` envelopa em ```json fences**: parser tolerante + retry.
- **`gemini-2.5-pro` lento em compose_plan**: aceito como tradeoff por qualidade. Loader bem comunicado.
- **Codes em paralelo**: sufixo random curto (4 chars) + ON CONFLICT DO UPDATE.
- **Web research é fallback, não busca real**: instrução explícita ao usuário no detalhe técnico ("a IA pode citar fontes que não foram efetivamente verificadas — ative Firecrawl para busca real"). Não é exposto na UI conversacional.
- **WhatsApp sem secrets**: edge retorna erro amigável estruturado; configurador não bloqueia geração da skill.
- **RLS x service role**: edge usa service role só após validar `organization_id` derivado do JWT.

---

## Estimativa de esforço
- Migration + bucket: 1 arquivo
- Edges (`behavior-composer`, `web-research`, `send-whatsapp-media`) + update `ai-chat-analysis`: 4 arquivos
- Frontend: ~10 arquivos (página + 8 componentes + 2 hooks)
- Atualizações em `App.tsx`, `BottomNav.tsx`, `ConfigPage.tsx`: 3 arquivos
- **Total: ~18 arquivos novos/alterados, 1 rodada longa**

Pronto para executar assim que aprovar.