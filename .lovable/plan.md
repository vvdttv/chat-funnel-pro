

# Wiring final dos Sprints 21–26

A lógica pura e os componentes standalone já foram entregues na mensagem anterior (6 módulos + 30 testes verdes). Falta plugar tudo nas UIs existentes. Esta execução fecha o ciclo sem criar arquivos novos — apenas edições.

## O que será plugado

### 1. `PlaybookOverrideSnapshotsBrowser.tsx` — S21 + S22
- **Toggle "Agrupar por lote"** no topo dos filtros. Quando ligado, snapshots com `[batch_xxx]` no `note` são agrupados em headers colapsáveis ("Lote batch_xxx · N escopos · há 2h"), reusando `groupSnapshotsByBatch` de `playbookSnapshotRollback.ts`.
- **Botão "Reverter lote inteiro"** em cada header. Abre confirm modal listando o que será revertido (via `buildRollbackPlan`). Executa upserts encadeados + `recordSnapshot` com `action='rollback'` e nota `[rollback de batch_xxx]`. Avisa "dirty" quando há snapshot posterior ao lote no mesmo escopo.
- **Botões "Exportar CSV" e "Exportar JSON"** no header da lista. Respeitam filtros ativos (`visible`). Usam `buildSnapshotsCSV` / `buildSnapshotsJSON` + download via Blob (mesmo padrão de `iaDecisionLogsExport.ts`).
- **Card "Resumo do período"** colapsável acima da lista, alimentado por `summarizeAuditPeriod(visible)` — mostra totais por escopo, layer, ação, autor e contagem de batches.

### 2. `PlaybookOverrideSuggestionsPanel.tsx` — S23
- Nova seção **"Efetividade das sugestões aplicadas (30d)"** acima da lista de sugestões pendentes, visível só quando há snapshots `auto-sugestão`.
- Para cada sugestão aplicada nos últimos 30d, renderiza linha com: título, escopo, delta de `failureRate` (▼ verde / ▲ vermelho / ~ neutro / "sem dados"), via `evaluateSnapshotEffectiveness(snapshot, logs)`.
- Sugestões com delta positivo (piora ≥ 5pp) ganham botão **"Reverter"** que faz upsert do payload anterior + snapshot `action='rollback'` com nota `"reverter sugestão ineficaz"`.

### 3. `PlaybookFourColumnEditor.tsx` — S25
- Nova seção colapsável **"Cenários do sandbox"** abaixo do `SandboxPreview` e acima de "Overrides composicionais".
- Usa `useSandboxScenarios({ funnelId, stageId })`.
- UI: input "nome do cenário" + botão "Salvar cenário atual" (snapshot do `{ identity, successCriteria, failureCriteria, expectedBehaviorIds }` no formato `payload`).
- Lista de cenários salvos com botões "Carregar" (preenche os 4 estados do editor), "Comparar com produção" (renderiza diff via `buildPayloadDiff` entre o cenário e o payload em `playbook_overrides` salvo), "Excluir".
- Botão "Exportar JSON" usa `exportAll()` + Blob download.

### 4. `IABehaviorManager.tsx` — S26
- Adicionar terceira aba **"Saúde"** ao tabset existente (`'rules' | 'behaviors' | 'health'`).
- Quando ativa, renderiza `<IASystemHealthPanel />` direto (componente já criado).
- Tab fica com ícone `Activity` e contador omitido (não é CRUD).

### 5. `IndicadoresPage.tsx` — S24
- Nova seção colapsável **"Saúde composicional"** após "Decisões da IA", com chave `'composicional'` no accordion.
- Renderiza `<FunnelStatusHeatmap />` (componente já criado).
- Ícone `Layers`, mesmo padrão visual das outras seções.

## Arquivos editados

```text
src/components/PlaybookOverrideSnapshotsBrowser.tsx   [+ agrupamento, rollback, exports, resumo]
src/components/PlaybookOverrideSuggestionsPanel.tsx   [+ card de efetividade + reverter]
src/components/PlaybookFourColumnEditor.tsx           [+ seção cenários sandbox]
src/components/IABehaviorManager.tsx                  [+ aba Saúde]
src/pages/IndicadoresPage.tsx                         [+ seção Saúde composicional]
```

Nenhum arquivo novo. Nenhuma migration. Nenhum hook novo. Apenas integração visual da lógica já testada.

## Validação

- `tsc --noEmit` deve continuar sem erros.
- `vitest run` deve manter 132/132 verdes (nenhum teste de UI alterado, nenhum módulo puro tocado).
- Smoke manual: abrir Snapshots Browser → ativar agrupamento → reverter um lote dummy; abrir Sugestões → ver card efetividade; abrir editor da etapa → salvar/carregar cenário; abrir IABehaviorManager → aba Saúde; abrir Indicadores → expandir nova seção.

Aprovando, entrego os 5 arquivos editados na próxima mensagem.

