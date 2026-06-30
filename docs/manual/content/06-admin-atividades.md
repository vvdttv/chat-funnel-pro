# 06 — Atividades / Agenda

> Capítulo pra **admin** e **corretor**. Sua agenda pessoal de visitas, ligações e follow-ups.

Acessada pelo ícone **Atividades** (Clock) no BottomNav.

`[📸 PRINT 06-00: aba Atividades aberta | logado: corretor]`

---

## Cabeçalho

- **Título** "Atividades".
- **Botão calendário** (canto direito) — abre o seletor de data pra navegar pra qualquer dia.

---

## Filtros (chips)

3 chips clicáveis no topo:

| Chip | O que mostra |
|------|--------------|
| **Hoje** | Atividades com data de hoje (default) |
| **Atrasadas** | Atividades com data < hoje e não-marcadas-como-feitas |
| **Semana** | Atividades dos próximos 7 dias |

O chip ativo fica em destaque (background azul).

`[📸 PRINT 06-01: chips de filtro com Hoje selecionado | logado: corretor]`

---

## Lista de atividades

Cada item da lista mostra:

- **Tipo** (ícone + label cadastrados em Config → Atividades).
- **Lead vinculado** (clica pra abrir o DealDetailSheet).
- **Descrição curta**.
- **Data e hora**.
- **Status** (pendente / feita).
- **Checkbox** (marca como feita).

`[📸 PRINT 06-02: lista com 3-4 atividades | logado: corretor]`

### Marcar como feita

Clica no checkbox. A atividade some da lista "Hoje" / "Atrasadas" (mas ainda aparece no histórico do deal).

### Clicar na atividade

Abre o **DealDetailSheet** do lead vinculado (mesmo painel descrito no capítulo 03).

---

## Salvar na Agenda (modal)

Quando você cria uma atividade nova (a partir do DealDetailSheet, opção **Registrar Atendimento**), aparece a opção de **agendar próxima ação**.

`[📸 PRINT 06-03: modal Salvar na Agenda | logado: corretor]`

Campos:
- **Tipo** (select de tipos cadastrados).
- **Descrição** (placeholder: "Descreva brevemente a próxima ação...").
- **Data** (date picker).
- **Hora** (time picker).
- Botão **Salvar**.

A atividade cadastrada aparece na lista de Atividades do corretor responsável (ou do próprio admin) na data agendada.

---

## CalendarBottomSheet

Botão calendário no canto superior direito abre um **bottom sheet** com calendário visual.

`[📸 PRINT 06-04: calendário aberto | logado: corretor]`

Você clica numa data → a tela volta filtrada pelas atividades daquele dia.

Útil pra ver agenda futura ou histórico de dias passados.

---

## Próximo

- **07 — Correspondente bancário** (analisa crédito MCMV)
- **08 — Corretor** (kanban + agendamento)
- **09 — Garantia** (administrativo + atendente seguradora)
- **10 — Vistoria** (administrativo + vistoriador)
- **11 — Contrato** (administrativo)
