

# Sprint 1 — Rodada 2: fechar Melhorias 1 e 2

## Escopo desta rodada

Encerrar tudo que envolve **atividades** (tipos customizáveis + bloqueio estilo Enermac). Melhorias 3 (IA Indicadores), 4 (touchpoints) e o PDF v2 ficam para a próxima rodada.

---

## Melhoria 1 — Plugar `ActivityTypesManager` no Config

O componente já existe, só falta exibi-lo:

- **`src/pages/ConfigPage.tsx`** — adicionar bloco `{activeTab === 'atividades' && <ActivityTypesManager />}` junto aos outros tabs (linha ~1120) + import no topo.
- **Seed dos tipos system** por organização: `useActivityTypes` ganha um `useEffect` que, se `types.length === 0` e usuário é admin, insere `call`, `proposal`, `visit`, `followup` (com `is_system=true`) via Supabase. Isso resolve o caso "org nova sem nenhum tipo".

---

## Melhoria 2 — Registro de atendimento estilo Enermac (3 blocos + bloqueio)

### 2.1 Reescrita do `NextStepPopup` → `RegisterActivityPopup`

Manter o mesmo arquivo (`src/pages/FunisPage.tsx`, linhas 652–824), mas reorganizar em **3 blocos colapsáveis** com checkboxes shadcn:

```text
┌─ ① Atividade pendente (se houver) ────┐
│ Tipo · Data/hora · Descrição           │
│ [Resolver agora] [Adiar 1 dia/3d/7d]   │
└────────────────────────────────────────┘
┌─ ② Resultado do atendimento ──────────┐
│ Resumo (textarea + Extrair com IA)     │
│ Temperatura do lead                    │
│ [☐] Mudar etapa → <Select>             │
│ [☐] Mudar status → Aberto/Ganho/Perdido│
│      └ se Perdido: motivo (LossSheet)  │
│ [☐] Arquivar oportunidade              │
└────────────────────────────────────────┘
┌─ ③ Próxima atividade ─────────────────┐
│ Tipo (vem do useActivityTypes) · Data  │
│ Hora · Descrição                       │
│ — OU —                                 │
│ [☐] Sem próxima ação por enquanto      │
└────────────────────────────────────────┘
[Registrar e continuar]
```

**Submissão:** chama a RPC `resolve_deal_activity` (já existe no banco) com:
```ts
{
  p_deal_id, p_done_activity_id, p_outcome_summary,
  p_next_type_code, p_next_scheduled_at, p_next_description,
  p_new_stage_id?, p_new_status?, p_loss_reason?, p_archive
}
```

A RPC já cuida de marcar a atividade pendente como feita, criar a próxima, mover etapa e mudar status atomicamente.

### 2.2 Novo `lib/activityBlocking.ts`

```ts
export type ForcedStep =
  | 'resolve_overdue'   // tem atividade pendente vencida
  | 'register_outcome'  // sem registro recente e sem próxima
  | 'schedule_next'     // tem registro mas falta próxima
  | null;

export function inferForcedStep(deal: Deal, now = new Date()): ForcedStep;
```

Regras:
- `status === 'lost' && lost_substage === 'arquivado'` → null
- `status === 'won' || 'lost'` && sem `next_action_at` futura → null
- `next_action_at < now` && `last_activity_at < next_action_at` → `resolve_overdue`
- `!last_activity_at` && `!next_action_at` → `register_outcome`
- `last_activity_at && !next_action_at` → `schedule_next`
- Caso contrário → null

Testes em `src/test/activityBlocking.test.ts` cobrindo todas as branches.

### 2.3 Novo `DealActivityOverlay`

Componente sobre o card no `FunisPage` (modos lead e funnel). Quando `inferForcedStep(deal) !== null`:

- Cobre o card com `bg-background/85 backdrop-blur-sm`
- Mostra ícone (Lock/Clock/AlertTriangle conforme step) + label em PT-BR
- Botão único "Registrar atendimento" → abre `RegisterActivityPopup` já no bloco certo expandido
- Não bloqueia abrir o chat (só bloqueia mover/avançar etapa)

### 2.4 Hook auxiliar `useDealActivities(dealId)`

Em `src/hooks/useDealActivities.ts`:
- `pendingActivity`: próxima `deal_activities` com `done_at IS NULL` mais antiga
- `lastDoneActivity`: última com `done_at NOT NULL`
- `resolveActivity(payload)`: wrapper sobre `supabase.rpc('resolve_deal_activity', …)` com tratamento de erro PT-BR (segue padrão de `dealTransitions.ts`)

### 2.5 Integração no `AtividadesPage`

Quando o usuário clica num card (não swipe), abrir `RegisterActivityPopup` direto no bloco "Resultado do atendimento" — em vez do antigo placeholder. Manter swipe direita (Feita) e esquerda (Adiar) como atalhos rápidos que disparam `resolveActivity` com payloads pré-preenchidos.

### 2.6 Substituir `Object.entries(ACTIVITY_TYPES)` pelo hook

Em `FunisPage.tsx` (linha 755), `AtividadesPage.tsx` e `ChatThread`, trocar por `types.filter(t => t.is_active).map(...)` vindo de `useActivityTypes()`. O constante `ACTIVITY_TYPES` em `mockData.ts` permanece como fallback para code-paths antigos não migrados, mas marcado `@deprecated`.

---

## Detalhes técnicos

- **Stack:** sem novas dependências. `lucide-react` já cobre os ícones; `Sheet`/`Checkbox`/`Select` shadcn já estão no projeto.
- **RPC:** `resolve_deal_activity` já existe e aceita todos os parâmetros necessários — sem migration nesta rodada.
- **RLS:** as policies de `deal_activities` já permitem corretor inserir/atualizar nos próprios deals e admin em todos.
- **Testes:** vitest para `inferForcedStep` (8 cenários) e snapshot do payload enviado à RPC.
- **Memória:** atualizar `mem://index.md` com a regra "Cards com atividade vencida sem registro são bloqueados pelo `DealActivityOverlay`; resolução via `resolve_deal_activity` RPC."

## Ordem de execução

1. Plug `ActivityTypesManager` no Config + auto-seed dos 4 tipos system.
2. `lib/activityBlocking.ts` + testes.
3. `useDealActivities` hook.
4. Reescrita do `NextStepPopup` → `RegisterActivityPopup` (3 blocos).
5. `DealActivityOverlay` no `FunisPage` (modos lead + funnel).
6. Integração no `AtividadesPage` (clique → popup; swipe → resolveActivity rápido).
7. Substituir `ACTIVITY_TYPES` estático pelo hook nos 3 arquivos.
8. Atualizar `mem://index.md`.

Próxima rodada (não inclusa): IA Indicadores, ajuste cosmético dos touchpoints e regeneração do manual PDF v2 com ReportLab Platypus.
