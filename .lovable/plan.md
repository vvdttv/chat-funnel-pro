

# LeadFlow Imob — Mobile-First Real Estate CRM

## Overview
A WhatsApp-focused real estate sales CRM built as a mobile-first app (max-width 430px, centered on desktop). Dark theme with WhatsApp green (#25D366) accents. Native app feel with bottom tab navigation.

## Architecture

### Shell & Navigation
- App shell: `max-w-md mx-auto h-screen bg-neutral-950` centered layout
- Fixed bottom navigation bar with 5 tabs: Caixa de Entrada, Funis, Atividades, Indicadores, Configurações
- Touch-optimized (active:scale-95, no hover states)
- Lucide React icons throughout

### Module 1: Caixa de Entrada (Chat)
- WhatsApp-style thread list (avatar, name, last message, connected number badge)
- Full-screen chat view with smart header card (Lead name, deal value, funnel stage)
- AI Coach notes as distinct purple/dashed-border bubbles with "🔒 Only you see this"
- Text input fixed at bottom

### Module 2: Funis (Kanban Pipeline)
- Horizontal scrollable stage tabs (Novos → Qualificação → Visita → Proposta → Fechamento)
- Deal cards showing: client name, property of interest, value (R$), closing probability %
- Toggle between "All Deals" and "Group by Lead"
- Bottom sheet for loss reason (required) when moving to "Perdido"
- Secondary contacts section (Cônjuge, Fiador, Sócio)

### Module 3: Atividades (Activities)
- Quick filters: Hoje, Atrasadas, Semana
- Activity types: Ligar, Enviar Proposta, Visita, Follow-up
- Swipe right = mark done, swipe left = postpone (date picker)
- "Save to native calendar" button with Google/Outlook/Apple options
- Recurring follow-up scheduling with AI loop option

### Module 4: Indicadores (Dashboard BI)
- Forecast card: Receita Prevista vs Receita Ganha
- 2x2 KPI grid: Total Leads, Conversion Rate, Average Ticket, Sales Cycle
- Accordion sections: Sales Funnel breakdown, Loss Reasons (donut chart), Channel/Origin analysis

### Module 5: Configurações
- Property catalog management (code, title, value, virtual tour link)
- WhatsApp numbers hub with linked agents
- AI Flow builder with vertical block tree, templates, clone option

## Implementation Priority
1. Bottom navigation shell + routing
2. Funis module (deep: cards, stages, loss bottom sheet, grouping)
3. Atividades module (deep: swipe gestures, calendar export, filters)
4. Chat module (smart header, AI notes, thread list)
5. Indicadores (forecast card, KPIs, charts)
6. Configurações (property catalog, WA numbers, flow builder)

## Design Tokens
- Background: `#0a0a0a` (neutral-950)
- Surface: `#171717` (neutral-900)
- Card: `#262626` (neutral-800)
- Primary accent: `#25D366` (WhatsApp green)
- AI notes: purple-tinted dark background with dashed border
- Text: white/neutral-400 hierarchy
- All interactions touch-based with scale transforms

## Mock Data
- Realistic Brazilian real estate deals (R$ values)
- Properties: apartments, houses in São Paulo, Rio
- Leads with Brazilian names
- Activities with realistic follow-up scenarios

