

# Merge Inbox + Funnels into Multi-Funnel System

## What Changes

The "Caixa de Entrada" and "Funis" tabs merge into a single **"Funis"** tab. The bottom nav goes from 5 to 4 tabs. Each funnel is a separate pipeline with its own stages and deals — not a single pipeline with shared stages.

## New Data Model

```text
Funnel (e.g. "MCMV", "Alto Padrão", "Aluguel", "Inquilinos")
  ├── name, description, color/icon
  ├── stages[] (each funnel has its OWN stages)
  │     └── e.g. MCMV: Novo Lead → Qualificação Crédito → Visita → Proposta → Contrato
  │     └── e.g. Aluguel: Novo Lead → Visita → Análise Docs → Contrato
  │     └── e.g. Inquilinos: Ativo → Renovação → Rescisão
  └── deals[] (assigned to this funnel + one of its stages)
```

**Mock funnels:**
- **MCMV** — Leads from paid ads, Minha Casa Minha Vida program. Stages: Novo Lead → Simulação Crédito → Visita → Proposta → Contrato Assinado
- **Alto Padrão** — High-end leads from social media/video. Stages: Novo Lead → Qualificação → Visita → Negociação → Fechamento
- **Aluguel** — Rental leads. Stages: Novo Lead → Visita → Análise Documentos → Contrato
- **Inquilinos** — Post-contract tenants (from Aluguel). Stages: Ativo → Renovação → Rescisão

## UI Changes

### Bottom Nav (4 tabs)
1. **Funis** (ClipboardList) — merged module
2. **Atividades** (Clock)
3. **Indicadores** (BarChart3)
4. **Config** (Settings)

### Funis Page — New Layout
1. **Funnel selector** at top — horizontal pill tabs to switch between funnels (MCMV, Alto Padrão, Aluguel, Inquilinos)
2. Below that, **stage tabs** for the selected funnel (each funnel shows its own stages)
3. Below that, the existing deal cards, summary bar, group-by-lead toggle, loss bottom sheet — all scoped to the selected funnel
4. Chat threads from InboxPage get integrated: tapping a deal card opens the deal detail sheet which now includes a "Conversa" (chat) section with the WhatsApp thread and AI coach notes

### Deal Detail Sheet — Enhanced
- Existing info (value, probability, stage, contacts)
- New "Conversa" tab: shows the WhatsApp chat thread for that lead with AI coach notes inline
- Smart header (lead name, deal value, current stage) stays at top

## Files to Change

1. **`src/data/mockData.ts`** — Add `Funnel` interface with `stages[]`, create 4 mock funnels, assign each deal to a funnel, remove standalone `STAGES` constant
2. **`src/components/BottomNav.tsx`** — Remove inbox tab, rename to 4-tab nav
3. **`src/pages/FunisPage.tsx`** — Add funnel selector at top, dynamic stage tabs per funnel, integrate chat view into deal detail sheet
4. **`src/pages/Index.tsx`** — Remove inbox case, remove InboxPage import, default to 'funnels'
5. **`src/pages/InboxPage.tsx`** — Delete (merged into Funis)
6. **`mem://index.md`** — Update nav structure to 4 tabs

## Technical Notes
- Each `Deal` gets a new `funnelId` field
- Each `Funnel` has `id`, `name`, `icon`, `color`, `stages: { name: string, probability: number }[]`
- Chat functionality moves into the deal detail bottom sheet as a sub-view
- The funnel selector uses the same pill-tab pattern as the current stage tabs

