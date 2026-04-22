

# Plano consolidado — Sprints 21 a 26 em uma única execução

Você pediu para mapear **tudo o que ainda faz sentido construir sobre a fundação atual** (sprints 1–20 já entregues) e executar em lote. Abaixo está o conjunto fechado de 6 sprints adicionais que considero o "encerramento natural" do ciclo composicional + auto-sugestões + auditoria. Depois disto, novos sprints só fariam sentido com mudanças de produto (não mais melhorias incrementais).

## O que será entregue

### Sprint 21 — Rollback de lote pelo `batchId`
No `PlaybookOverrideSnapshotsBrowser`, snapshots criados pelo Sprint 20 já carregam `[batch_xxx]` no `note`. Vou:
- Agrupar visualmente snapshots do mesmo `batchId` (header colapsável "Lote batch_xxx · N escopos · há 2h").
- Botão **"Reverter lote inteiro"** que itera todos os itens do grupo, faz upsert do `payload` *anterior* ao lote (lookup do snapshot imediatamente anterior por scope+layer), e grava novos snapshots com `action='rollback'` + nota `"rollback do lote batch_xxx"`.
- Confirmação modal listando exatamente o que será revertido.

### Sprint 22 — Diff agregado e exportação de auditoria
- Botão **"Exportar histórico (CSV/JSON)"** no snapshots browser respeitando filtros ativos.
- Nova visão **"Resumo de mudanças do período"**: agrega snapshots em uma janela (7/30/90 dias) e mostra contadores por escopo, autor e layer (ex.: "Funil Locação: 4 upserts, 1 rollback por João").
- Reusa `iaDecisionLogsExport.ts` como referência de estrutura.

### Sprint 23 — Telemetria de sugestões aplicadas (efetividade)
Mede se as sugestões do Sprint 18/20 *funcionaram*:
- Novo módulo puro `src/lib/playbookSuggestionEffectiveness.ts`: dado o `batchId` (ou snapshot avulso de auto-sugestão), compara `failureRate` dos logs **antes** vs. **depois** da aplicação no mesmo escopo.
- Card "Efetividade" no `PlaybookOverrideSuggestionsPanel` listando sugestões aplicadas nos últimos 30d com delta (▼ 18% falha = verde; ▲ = vermelho/atenção).
- Sugestões com efetividade negativa ganham botão **"Reverter"** rápido (atalho para o rollback do S21).

### Sprint 24 — Heatmap funnel × status no IndicadoresPage
Pendência da Parte 6 do plano original do Opus (métricas novas):
- Componente `FunnelStatusHeatmap`: matriz funis (linhas) × status `open/won/lost` (colunas) com:
  - cor de intensidade pela contagem de deals
  - tooltip com taxa `open→won` por arquétipo
  - barra inferior de fallbacks IA do período
- Plugado como nova seção colapsável no `IndicadoresPage` ("Saúde composicional").
- Reusa `useDeals`, `useFunnels`, `useIADecisionLogs`, `useArchetypes`.

### Sprint 25 — Sandbox composicional persistente (cenários salvos)
Hoje o sandbox (Sprint 4) é volátil. Vou:
- Tabela `playbook_sandbox_scenarios` (id, organization_id, name, funnel_id, stage_id, status, mock_overrides jsonb, created_by, created_at) + RLS admin-only.
- Hook `useSandboxScenarios` (CRUD) e UI dentro do `PlaybookFourColumnEditor`: salvar cenário atual com nome, listar/recarregar cenários, "comparar com produção" (renderiza diff entre o playbook simulado e o efetivo real).
- Permite responder perguntas do tipo: *"se eu desativar override X no funil Y, quem fica afetado?"*

### Sprint 26 — Painel "Saúde do sistema IA" no IABehaviorManager
Aba final de fechamento, agregando indicadores que hoje estão dispersos:
- Contagem de regras ativas/inativas por kind (do/dont/ask/noask).
- Cobertura de LBs por status (% LBs com `applicable_statuses` ≠ default).
- Top 5 overrides mais "tocados" no período (via snapshots).
- Lista de etapas SEM nenhum override + com `failureRate` alto (gap de configuração).
- Botão "Ir para sugestões" prefiltrando essas etapas no painel S18.

## Arquitetura técnica

```text
src/
├── lib/
│   ├── playbookSuggestionEffectiveness.ts   [novo – S23]
│   ├── playbookSnapshotRollback.ts          [novo – S21, util pura]
│   └── playbookOverrideAuditExport.ts       [novo – S22]
├── hooks/
│   └── useSandboxScenarios.ts               [novo – S25]
├── components/
│   ├── PlaybookOverrideSnapshotsBrowser.tsx [edit – S21+S22 grupos+export]
│   ├── PlaybookOverrideSuggestionsPanel.tsx [edit – S23 efetividade]
│   ├── PlaybookFourColumnEditor.tsx         [edit – S25 cenários]
│   ├── IABehaviorManager.tsx                [edit – S26 saúde]
│   ├── FunnelStatusHeatmap.tsx              [novo – S24]
│   └── IASystemHealthPanel.tsx              [novo – S26]
├── pages/
│   └── IndicadoresPage.tsx                  [edit – S24]
└── test/
    ├── playbookSnapshotRollback.test.ts     [novo]
    ├── playbookSuggestionEffectiveness.test.ts [novo]
    ├── playbookOverrideAuditExport.test.ts  [novo]
    └── funnelStatusHeatmap.test.ts          [novo]
```

## Mudanças de banco (uma migration consolidada)

```sql
-- 13_sandbox_scenarios.sql
CREATE TABLE public.playbook_sandbox_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  name text NOT NULL,
  funnel_id text NOT NULL,
  stage_id text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  mock_overrides jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.playbook_sandbox_scenarios ENABLE ROW LEVEL SECURITY;
-- policies admin-only (CRUD), members SELECT
-- + trigger update_updated_at_column
```

Apenas **uma** tabela nova. Tudo mais reutiliza tabelas existentes (`playbook_override_snapshots`, `ia_decision_logs`, `deals`).

## Validação

- Cada sprint vem com testes unitários do módulo puro respectivo.
- Rodada final: `vitest run` + `tsc --noEmit`. Meta: manter 100% verde (atualmente 102/102).
- QA manual via preview: rollback de lote, export CSV, abrir heatmap, salvar cenário, abrir saúde do sistema.

## Escopo explícito — o que NÃO entra

- **Edge functions novas** (não há necessidade — toda a lógica é client-side sobre dados já carregados).
- **Mudanças no `seed-ia-behavior`** ou `ai-chat-analysis` (já completos).
- **Multi-org / overrides cross-organização** (item 8 das decisões abertas: adiado).
- **Permitir empresas criarem arquétipos próprios** (item 4: não nos 6 primeiros meses).
- Qualquer coisa fora do eixo "auditoria + auto-sugestão + observabilidade composicional".

## Nota sobre encerramento

Após o S26, os 6 sprints originais do Opus + 20 sprints de extensão + 6 de fechamento = **32 sprints entregues**. O sistema composicional fica completo de ponta a ponta: criação → sugestão → preview → aplicação em lote → rollback → medição de efetividade → simulação → saúde agregada. Próximas iterações seriam mudanças de produto (novos tipos de regra, integrações externas), não mais refinamentos da fundação.

Confirme com **"Sim, executar S21–S26 em lote"** e eu implemento tudo na próxima mensagem.

