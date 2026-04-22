` para que a aprovação dispare a troca para default mode. Isso é o que o sistema espera quando o usuário diz "execute o plano, cancelei sem querer" — recriar o ponto de aprovação.

<lov-plan>

# Plano consolidado — Sprints 21 a 26 em uma única execução

Esta é a re-confirmação do plano já discutido. Aprove para Lovable trocar para modo de implementação e eu codo todos os 6 sprints na próxima mensagem (já tenho cada arquivo desenhado em detalhe; só falta gravar).

## O que será entregue

### Sprint 21 — Rollback de lote pelo `batchId`
No `PlaybookOverrideSnapshotsBrowser`, snapshots criados pelo Sprint 20 já carregam `[batch_xxx]` no `note`. Vou:
- Agrupar visualmente snapshots do mesmo `batchId` (header colapsável "Lote batch_xxx · N escopos · há 2h").
- Botão **"Reverter lote inteiro"** que itera todos os itens do grupo, faz upsert do `payload` *anterior* ao lote (lookup do snapshot imediatamente anterior por scope+layer) e grava novos snapshots com `action='rollback'` + nota `"[rollback de batch_xxx]"`.
- Confirmação modal listando exatamente o que será revertido, com aviso "dirty" quando alguém editou depois do lote.

### Sprint 22 — Diff agregado e exportação de auditoria
- Botão **"Exportar histórico (CSV/JSON)"** no snapshots browser respeitando filtros ativos.
- Nova visão **"Resumo do período"**: agrega snapshots filtrados (7/30/90 dias) e mostra contadores por escopo, autor, layer, ação e funil + total de batches.
- Reusa o padrão de download via Blob do `iaDecisionLogsExport.ts`.

### Sprint 23 — Telemetria de sugestões aplicadas (efetividade)
Mede se as sugestões do Sprint 18/20 *funcionaram*:
- Novo módulo puro `src/lib/playbookSuggestionEffectiveness.ts`: dado um snapshot de auto-sugestão, compara `failureRate` dos logs **antes** vs **depois** da aplicação no mesmo escopo (janela de 14 dias cada lado).
- Card "Efetividade" no `PlaybookOverrideSuggestionsPanel` listando sugestões aplicadas nos últimos 30d com delta (▼ verde, ▲ vermelho, ~ neutro, "sem dados" quando insuficiente).
- Sugestões com efetividade negativa ganham botão **"Reverter"** rápido.

### Sprint 24 — Heatmap funnel × status no IndicadoresPage
- Novo componente `FunnelStatusHeatmap`: matriz funis (linhas) × status `open/won/lost` (colunas) com intensidade pela contagem de deals + tooltip de taxa `open→won` por arquétipo + linha de fallbacks IA.
- Plugado como nova seção colapsável no `IndicadoresPage` ("Saúde composicional").
- Reusa `useDeals`, `useFunnels`, `useIADecisionLogs`, `useArchetypes`.

### Sprint 25 — Sandbox composicional persistente (cenários salvos)
**Ajuste vs. plano original:** sem migration disponível neste ambiente, vou armazenar cenários em **localStorage por `org+user`** (chave determinística), mantendo o objetivo intacto:
- Hook `useSandboxScenarios` (CRUD em localStorage).
- UI dentro do `PlaybookFourColumnEditor`: salvar cenário atual com nome, listar/recarregar cenários, "comparar com produção" (renderiza diff entre o playbook simulado e o efetivo real via `buildPayloadDiff`).
- Cenários ficam disponíveis offline e podem ser exportados como JSON para portar entre máquinas.

### Sprint 26 — Painel "Saúde do sistema IA" no IABehaviorManager
Aba final agregando indicadores hoje dispersos:
- Contagem de regras ativas/inativas por kind (do/dont/ask/noask).
- Cobertura de LBs por status (% LBs com `applicable_statuses` ≠ default).
- Top 5 overrides mais "tocados" no período (via snapshots).
- Lista de etapas SEM nenhum override + com `failureRate` alto (gap de configuração).
- Botão "Ir para sugestões" prefiltrando essas etapas no painel S18.

## Arquivos

```text
src/lib/                                 (núcleos puros + 100% cobertos por testes)
├── playbookSnapshotRollback.ts          [novo – S21]
├── playbookOverrideAuditExport.ts       [novo – S22]
├── playbookSuggestionEffectiveness.ts   [novo – S23]
└── (sandbox storage util inline no hook)

src/hooks/
└── useSandboxScenarios.ts               [novo – S25]

src/components/
├── PlaybookOverrideSnapshotsBrowser.tsx [edit – S21+S22 grupos+export+resumo]
├── PlaybookOverrideSuggestionsPanel.tsx [edit – S23 card de efetividade]
├── PlaybookFourColumnEditor.tsx         [edit – S25 cenários integrados]
├── IABehaviorManager.tsx                [edit – S26 nova aba "Saúde"]
├── FunnelStatusHeatmap.tsx              [novo – S24]
└── IASystemHealthPanel.tsx              [novo – S26]

src/pages/
└── IndicadoresPage.tsx                  [edit – S24 nova seção]

src/test/
├── playbookSnapshotRollback.test.ts     [novo]
├── playbookOverrideAuditExport.test.ts  [novo]
├── playbookSuggestionEffectiveness.test.ts [novo]
└── (componentes UI sem testes — padrão do projeto)
```

## Banco de dados

**Nenhuma migration nova.** Tudo reusa tabelas existentes (`playbook_override_snapshots`, `ia_decision_logs`, `deals`). Cenários do sandbox vão para localStorage.

## Validação

- Cada módulo puro vem com 5+ testes unitários.
- Meta final: `vitest run` 100% verde + `tsc --noEmit` sem erros (atualmente 102/102).

## Escopo explícito — o que NÃO entra

- Edge functions novas (toda lógica é client-side).
- Mudanças no `seed-ia-behavior` ou `ai-chat-analysis`.
- Multi-org / overrides cross-organização (item 8 das decisões abertas).
- Permitir empresas criarem arquétipos próprios (item 4).

Aprovando, na próxima mensagem entrego os 6 sprints completos.

