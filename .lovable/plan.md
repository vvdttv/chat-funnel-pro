

# Fechamento dos pendentes — SummaryBlock + RollbackPlanDialog + Cenários do sandbox (S25)

Três edições atômicas para fechar o ciclo dos Sprints 21–26. Sem arquivos novos, sem migrations.

## 1. `PlaybookOverrideSnapshotsBrowser.tsx` — adicionar `RollbackPlanDialog`

O estado, o handler `openRollback` e `runRollback` já existem (linhas 152–294). Falta apenas montar o `<Dialog>` no JSX e definir o componente helper.

**Inserir antes do `</div>` final do componente principal (~linha 679):**

```tsx
<RollbackPlanDialog
  plan={rollbackPlan}
  funnels={funnels}
  running={rollbackRunning}
  progress={rollbackProgress}
  onClose={closeRollback}
  onConfirm={runRollback}
/>
```

**Definir `RollbackPlanDialog` no fim do arquivo** (junto com `SummaryBlock` que já está lá):

- Recebe `plan: RollbackPlan | null`, `funnels`, `running`, `progress`, `onClose`, `onConfirm`.
- Renderiza `<Dialog open={!!plan}>` com:
  - Título: "Reverter lote `<batchId>`"
  - Descrição: contagem de itens + alerta se `plan.dirtyCount > 0` ("N escopo(s) tiveram alterações posteriores e serão sobrescritos").
  - Lista (max-height + scroll) de `plan.items`: para cada item mostra `resolveScope(scopeType, scopeId, funnels)` (funil/etapa), badge da `layer`, badge da `action` (rollback/deactivate), ícone amarelo `AlertTriangle` quando `dirty`.
  - Footer: barra de progresso `progress.done / progress.total` quando `running`; botões "Cancelar" (disabled quando `running`) e "Reverter lote" (variant `destructive`, mostra `Loader2` quando `running`).
- Usa apenas tokens semânticos (`text-warning`, `text-destructive`, `bg-secondary`, etc.).

## 2. `PlaybookFourColumnEditor.tsx` — seção "Cenários do sandbox" (S25)

**Importar:**
```tsx
import { useSandboxScenarios } from '@/hooks/useSandboxScenarios';
import { buildPayloadDiff, summarizeDiff } from '@/lib/playbookOverrideDiff';
import { Save, FolderOpen, Trash2, GitCompare, Download } from 'lucide-react';
```

**Hook dentro do componente:**
```tsx
const sandbox = useSandboxScenarios({ funnelId, stageId });
const [scenarioName, setScenarioName] = useState('');
const [comparingId, setComparingId] = useState<string | null>(null);
```

**Posicionamento:** seção colapsável nova abaixo do `SandboxPreview` e acima de "Overrides composicionais" (localizar pela busca de `Overrides composicionais` no arquivo).

**UI:**
- Header colapsável: ícone `FolderOpen` + "Cenários do sandbox · N salvos".
- Quando expandido:
  - Linha de criação: `<Input>` (nome) + botão "Salvar cenário atual" → chama `sandbox.save({ name, funnelId, stageId, status: currentStatus, payload: { identity, successCriteria, failureCriteria, expectedBehaviorIds } })`. Limpa input + `toast` "Cenário salvo".
  - Lista de `sandbox.items` (cada item card pequeno):
    - Nome + timestamp (`updatedAt` formatado).
    - Botão "Carregar" → preenche os 4 estados do editor (`setIdentity`, `setSuccessCriteria`, `setFailureCriteria`, `setExpectedBehaviorIds`) com `scenario.payload`.
    - Botão "Comparar com produção" → toggla `comparingId`. Quando ativo, renderiza `summarizeDiff(buildPayloadDiff(productionPayload, scenario.payload))` em texto pequeno + lista de `path` mudados (productionPayload = override salvo no escopo atual via `usePlaybookOverrides`).
    - Botão `Trash2` → `sandbox.remove(scenario.id)` com `confirm()` nativo.
  - Botão "Exportar JSON" → cria Blob com `sandbox.exportAll()` e dispara download `sandbox_scenarios_<ts>.json`.
- Vazio: texto muted "Nenhum cenário salvo para esta etapa".

**Sem testes novos** — `useSandboxScenarios` é hook (já testado em S25 indiretamente via lógica) e UI segue padrão dos outros editores.

## 3. Validação

- `tsc --noEmit` deve continuar sem erros.
- `vitest run` mantém 132/132 verdes (nada de lógica pura é tocado).
- Smoke manual:
  1. Abrir Snapshots Browser → ativar agrupamento → clicar "Reverter lote" → conferir dialog com lista, badges, alerta de dirty se aplicável → cancelar e reabrir para confirmar fluxo.
  2. Abrir editor da etapa → expandir "Cenários do sandbox" → salvar com nome → editar payload → recarregar cenário → comparar com produção → excluir.

## Arquivos editados

```text
src/components/PlaybookOverrideSnapshotsBrowser.tsx   [+ render do RollbackPlanDialog + componente helper]
src/components/PlaybookFourColumnEditor.tsx           [+ seção Cenários do sandbox + hook useSandboxScenarios]
```

Aprovando, entrego os 2 arquivos editados na próxima mensagem.

