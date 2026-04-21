

# Plano consolidado — Atualização pós-6 fases (revisão 2 do Opus)

Documento do Opus recebido e analisado integralmente (38 páginas). Ele **substitui** as instruções anteriores como fonte única e aplica **duas mudanças sobrepostas** sobre o que já foi entregue nas 6 fases:

- **Mudança A — Desacoplamento do funil padrão**: introdução de `StageArchetype` (10 arquétipos canônicos) × `StatusArchetype` (open/won/lost) com playbook composicional de 4 camadas (seed → status overlay → funnel override → stage override).
- **Mudança B — Renaming AIA → IA**: alinhar IDs (`AIA-DO-*` → `IA-DO-*`), constantes e strings residuais.

Tudo o que já foi entregue nas 6 fases permanece **base intacta**; nada é descartado.

## Execução em 6 sprints

### Sprint 1 — Renaming AIA → IA (curto e reversível)
- Find/replace nos arquivos: `iaBehavior.ts`, `IABehaviorManager.tsx`, `StagePlaybookEditor.tsx`, `AIWorkflowBuilder.tsx`, testes.
- Migration `01_rename_aia_to_ia.sql`: `UPDATE ia_rules SET code = REPLACE(code, 'AIA-', 'IA-') WHERE code LIKE 'AIA-%'`.
- Bloquear botão de seed durante a janela.
- Smoke test (codes IA-*, edição, criar nova regra, seed idempotente, painel de logs).

### Sprint 2 — Schema + pendências da auditoria
Migrations sequenciais:
- `02_handoff_priority_enum.sql` — `CREATE TYPE handoff_priority AS ENUM ('P0','P1','P2','P3')` + ALTER coluna.
- `03_fks_formais.sql` — FK `organization_id` em todas as 6 tabelas comportamentais.
- `04_stage_archetypes` + `05_status_archetypes` + `06_playbook_overrides` + `07_deal_status_events` (criação + RLS).
- `08_deals_add_status` (status NOT NULL DEFAULT 'open' + status_changed_at + status_reason + lost_substage + won_date + backfill).
- `09_funnels_funnel_stages_cols` (stage_archetype_id, context_tags, purpose, is_default).
- `10_stage_playbooks_cols` (archetype_id, kind, status_archetype_id).
- `11_lead_behaviors_context_tags` (applicable_context_tags, applicable_statuses + backfill + deprecação de applicable_stages).

### Sprint 3 — Seeds + re-tagging
- Seed dos **10 stage_archetypes** (first_contact, qualification, discovery_call, scheduling, appointment_followup, documentation, external_review, proposal, negotiation, closing) + **3 status_archetypes** (open/won/lost).
- Atualizar `iaBehavior.ts` com `STAGE_ARCHETYPES`, `STATUS_ARCHETYPES`, 4 novos playbooks-seed (discovery_call, scheduling, appointment_followup, negotiation) e 2 overlays (won, lost).
- Re-tagging dos **85 LBs** (mapeamento explícito do Opus, Parte 6.3).
- 8 novos LBs de pós-venda (LB-086 a LB-093).
- Migration `12_backfill_funnel_padrao.sql` atribuindo arquétipos às etapas E0–E4a; tratamento de E4b conforme decisão aberta.
- Estender edge function `seed-ia-behavior` para popular tudo isso.

### Sprint 4 — UI atualizada
- Wizard de 3 passos para criar funil novo (identidade → etapas/template → revisão).
- Dropdown obrigatório de arquétipo no formulário de criar/editar etapa.
- **Tela de 4 colunas** no `StagePlaybookEditor` (seed | overlay | funnel | stage) com célula efetiva destacada, "limpar override", "desativar item".
- Toggle Aberto/Ganho/Perdido acima das colunas.
- Sandbox de teste com seletor (funnel, stage, status) mostrando qual camada gerou cada decisão.
- Warnings de UI (impacto em N etapas, troca de arquétipo, desativar regra universal).

### Sprint 5 — Runtime composicional
- `resolveEffectivePlaybook(funnelId, stageId, status)` no hook `useIABehavior` aplicando merge das 4 camadas (escalares: superior sobrescreve; listas: additions/disabled; conflito DO×DONT: mais restritivo vence).
- Cache por chave `(funnel_id, stage_id, stage_archetype_id, status, overrides_version)` com invalidação em writes.
- Pipeline de 10 passos com filtro de LBs por `context_tags ∩ stage.context_tags ≠ ∅` e `applicable_statuses CONTAINS deal.status`.
- Transições de status (open↔won↔lost) registrando em `deal_status_events`.

### Sprint 6 — Writer de logs + CRUD unificado
- Adicionar colunas `stage_archetype_id`, `status_archetype_id`, `effective_playbook_layers`, `outcome` em `ia_decision_logs`.
- Writer fire-and-forget na edge function `ai-chat-analysis` após cada resposta (resolve pendência da auditoria).
- Eventos extras: `fallback_to_mock`, `status_transition`, `handoff` sem resposta direta.
- Telemetria de fallback no `useIABehavior` (chama `logFallback(reason)` + console.warn).
- Novas seções no `IABehaviorManager`: Escadas, Gatilhos, Playbooks de arquétipo (admin master), Overrides agregados, Arquétipos (read-only).
- Métricas novas no `IndicadoresPage` (heatmap funnel×status, taxa open→won por arquétipo, NPS won, fallbacks, distribuição de outcomes).

## Decisões abertas (Opus, Parte 10.2) — preciso de confirmação

Adoto as **sugestões do Opus** como default, mas peço confirmação dos itens potencialmente disruptivos:

| # | Decisão | Default proposto |
|---|---------|------------------|
| 1 | Etapa "E4b Fechamento Perdido" | **Remover** + migrar deals existentes para `status='lost'` + `lost_substage='closing'` |
| 2 | Renaming AIA → IA nos IDs persistidos | **Sim**, aplicar tudo |
| 3 | "AIA" como nome de persona em material externo | **Preservar** se for nome próprio (não há código a mudar) |
| 4 | Empresas criam arquétipos próprios? | **Não** nos primeiros 6 meses |
| 5 | Transição lost → open | **Manual** (corretor confirma) |
| 6 | 8 novos LBs de pós-venda | **Incluir no S3** |
| 7 | Indicação no overlay won | **Ativa por default**, override desativa |
| 8 | Overrides de organização (acima do funil) | **Adiar** para release futuro |
| 9 | Arquivamento automático de lost após 365d | **Ativo por default**, configurável |

Se concordar com todos os defaults, basta responder "Sim, todos os defaults". Caso queira mudar algum, indique o número.

## Critérios de pronto (resumo verificável)
- `SELECT COUNT(*) FROM ia_rules WHERE code LIKE 'AIA-%'` retorna 0.
- Busca por "AIA-" no TS retorna 0 ocorrências.
- 10 arquétipos + 3 status + tabelas novas com RLS e FKs.
- `funnel_stages.stage_archetype_id` NOT NULL; `deals.status` NOT NULL DEFAULT 'open'.
- 85 LBs re-tagueados + 8 novos LBs de pós-venda.
- Editor com 4 colunas funcionando; sandbox mostrando origem da decisão.
- Writer de logs ativo gravando ao menos 1 log por resposta.
- IABehaviorManager com seções de ladders, triggers, overrides.

## Riscos principais
- **Renaming em produção com seed rodado** → janela de baixa atividade + bloqueio de seed durante migration.
- **Cache stale** → invalidação eager em todos os writes + TTL curto.
- **UI de 4 colunas em mobile** → accordion responsivo abaixo do breakpoint tablet.
- **Race conditions em mudança de status** → transação SQL com `SELECT FOR UPDATE`.

## Observação sobre escopo

Este é um plano de **6 sprints sequenciais**. Em cada resposta de execução implementarei **um sprint por vez** (após sua aprovação), validando antes de avançar. Sprint 1 é o mais curto e seguro — recomendo começar por ele assim que confirmar os defaults das decisões abertas.

**Próximo passo aguardado:** confirmação dos 9 defaults (ou ajustes) + autorização para iniciar Sprint 1 (Renaming).

