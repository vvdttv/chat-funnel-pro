# 08 — Corretor

> Capítulo pra **corretor** (papel `corretor`) e **admin**.

O Painel do Corretor é onde você acompanha **agendamentos** (visitas) e **briefings** dos leads que a IA / o correspondente passaram pra você. Acesso pela URL `/corretor` ou pelo atalho **Painéis → Corretor** no BottomNav.

> Importante: o corretor também usa o **Kanban / Funis** (capítulo 03) pra mexer nos cards dele. O Painel do Corretor é especializado em **agendamentos + briefings**.

`[📸 PRINT 08-00: Painel do Corretor com 3 abas | logado: corretor]`

---

## Cabeçalho

- **Ícone UserRound** + **"Painel do Corretor"**.
- Username (`@ana`) abaixo.
- Botão **Sair** (canto direito) — logout.

---

## 3 abas de status

| Aba | Status interno | O que mostra |
|-----|----------------|--------------|
| **Agendadas** (default) | `confirmed` | Visitas com data confirmada — sua agenda |
| **A agendar** | `proposed` | Visitas que o sistema sugeriu mas você ainda não confirmou data |
| **Concluídas** | `done` / `no_show` / `cancelled` | Histórico de visitas passadas |

---

## Card de agendamento

Cada item mostra:

- **Nome do lead** + telefone.
- **Data e hora** propostas ou confirmadas.
- **Endereço do imóvel** (se já foi escolhido).
- **Match score** (badge 100/80/0).
- **Status do briefing**: pronto / em construção / sem briefing ainda.

`[📸 PRINT 08-01: card de agendamento confirmado | logado: corretor]`

Clica → abre o **BriefingDetail** (drawer com tudo).

---

## BriefingDetail

Drawer lateral com 3 blocos principais:

### Bloco 1 — Briefing do lead

Tudo o que a IA + correspondente coletaram, formatado pro corretor consumir:

`[📸 PRINT 08-02: bloco 1 do briefing, dados do lead | logado: corretor]`

- **Dados pessoais**: nome, idade, telefone, e-mail.
- **Perfil**: renda comprovada, FGTS, dependentes, estado civil, cidade.
- **Aprovação bancária**: valor aprovado, exige entrada, modalidade, banco, taxa.
- **Faixa MCMV** (se aplicável).
- **Histórico de mensagens** — últimas 5 mensagens da conversa com a IA.

### Bloco 2 — Imóveis-match

Lista de imóveis cadastrados que dão match com o perfil aprovado.

Cada imóvel:
- Foto.
- Código + título.
- Preço.
- Match score:
  - **100** — verde, cabe 100%.
  - **80** — amarelo, precisa de entrada.
  - **0** — vermelho, não cabe (geralmente não aparece).
- Endereço.
- Tags (Pronto pra morar, MCMV, etc).

`[📸 PRINT 08-03: lista de imóveis-match | logado: corretor]`

Clica num imóvel → ficha detalhada + botão **"Selecionar pra visita"**.

### Bloco 3 — Agendamento

Se ainda não confirmou data:
- Sistema mostrou 2 slots ("mais breve possível, respeitando `broker_availability`").
- Você confirma um dos slots ou propõe outro.
- Botão **Confirmar agendamento**.

Se já confirmou:
- Card com data + endereço + nome do lead.
- Botões: **Reagendar**, **Cancelar**, **Marcar como visitada** (após a visita), **Marcar no-show**.

---

## Após a visita

Você marca como **Visitada** ou **No-show**:

**Visitada**: aparece modal pra registrar resultado da visita:
- O lead gostou?
- Quer dar prosseguimento?
- Próxima ação (proposta, segunda visita, etc).

**No-show**: lead não apareceu. Sistema marca, você decide se tenta reagendar ou marca como perdido.

---

## Cadência automática

O sistema dispara lembrete automático:
- **24h antes** da visita (notification + WhatsApp pro lead se autonomia permitir).
- **1h antes** (notification).

Você não precisa fazer nada — só aparecer na visita.

---

## Briefing automático (IA)

Quando o correspondente devolve "aprovado", a IA gera **automaticamente**:

1. **broker_briefing** — texto formatado com tudo do lead.
2. **property_match** — calcula imóveis-match.
3. **appointments** — sugere 2 slots ("mais breve possível").
4. Atribui você (roleta de corretores com peso × carga, filtrada por `funnel_access`).

Você abre o painel e já tá lá tudo. **Não copia-cola. Não pergunta de novo. Não perde tempo.**

---

## Lastro bidirecional

O deal do funil IA tem um espelho no funil de corretor. Quando você muda o status do agendamento (visitada / cancelada / no-show), o espelho atualiza, e o deal-IA também atualiza (via `mirror_deal_id`).

Você não precisa pensar nisso — o sistema sincroniza.

---

## Próximo

- **09 — Garantia** (administrativo + atendente seguradora)
- **10 — Vistoria** (administrativo + vistoriador)
- **11 — Contrato** (administrativo)
