# Project Memory

## Core
Responsivo CRM imobiliário: mobile-first (até 768px) com adaptação real pra desktop (≥1024px usa lg:max-w-7xl, KPIs/listas em multi-coluna, tabs de Config viram sidebar). Bottom-nav presente em todos os tamanhos (full-width no desktop, ícones centralizados via max-w-2xl interno). Dark theme bg #0a0a0a, WhatsApp green #25D366. Touch-only no mobile (active:scale-95). Portuguese-BR UI. Lucide icons. 4-tab nav: Funis, Atividades, Indicadores, Config.
Tipos de atividade são customizáveis por organização via tabela `activity_types` (hook `useActivityTypes`); evite o constante deprecated `ACTIVITY_TYPES` de mockData.
Cards com atividade vencida/sem registro/sem próxima ação são bloqueados pelo `DealActivityOverlay`; resolução acontece via RPC `resolve_deal_activity` (hook `useDealActivities` + `RegisterActivityPopup`).
IA de Indicadores via edge function `analyze-indicators` (Gemini 2.5 Flash + tool-calling) renderiza kpi/bar/line/pie/table; áudio via `transcribe-audio` (MediaRecorder → base64 → Gemini multimodal). Snapshot enviado é apenas agregado (sem dados crus de leads).

## Memories
- [Design tokens](mem://design/tokens) — Dark theme colors, WhatsApp green accent, surface/card hierarchy
- [App structure](mem://features/navigation) — 4-tab bottom nav, multi-funnel system (MCMV, Alto Padrão, Aluguel, Inquilinos)
