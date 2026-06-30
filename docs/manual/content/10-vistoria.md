# 10 — Vistoria do imóvel

> Capítulo pra **administrativo** (e admin) que opera vistorias, e pro **vistoriador** que executa a vistoria no campo.

A vistoria é o registro do estado do imóvel — **antes** do locatário entrar (vistoria de entrada) e **depois** do locatário sair (vistoria de saída). É a prova de "como estava" e "como ficou".

Acesso pela URL `/vistorias` ou pelo atalho **Painéis → Vistorias** no BottomNav.

`[📸 PRINT 10-00: Painel Vistorias aberto, filtros visíveis | logado: admin]`

---

## Acesso restrito

O painel é só pra admin. Se você acessa sem ser admin, vê a tela:

> **Acesso restrito** — O painel de vistorias é do dpto administrativo. Pedir acesso ao admin da org.

---

## Cabeçalho

- Ícone **ClipboardCheck** + **"Vistorias"**.
- Nome do usuário logado.
- Botão **Sair**.

---

## Filtros (chips horizontais)

| Chip | Status interno |
|------|----------------|
| **Todas** | (sem filtro) |
| **Pendente** | `pendente` (vistoria criada, sem vistoriador atribuído ou sem data) |
| **Agendada** | `agendada` (data confirmada, aguardando dia) |
| **Em andamento** | `em_andamento` (vistoriador chegou, iniciou o trabalho) |
| **Concluída** | `concluida` (relatório finalizado) |
| **Cancelada** | `cancelada` |

`[📸 PRINT 10-01: filtros horizontais, "Agendada" selecionado | logado: admin]`

---

## Lista de vistorias

Cada card mostra:

- **Tipo** (Entrada / Saída) + ID do deal.
- **Status** (badge colorido).
- **Vistoriador atribuído** (ou "sem vistoriador").
- **Data agendada** (formatada pt-BR).

`[📸 PRINT 10-02: card de vistoria na lista | logado: admin]`

---

## Detalhe da vistoria

Clica no card → drawer com:

### Cabeçalho

- Endereço do imóvel.
- Tipo (Entrada / Saída).
- Status atual.

### Atribuição

- **Vistoriador atribuído** — select com vistoriadores ativos.
- **Modo de atribuição** (mostra o modo configurado pra org: roleta ou fila).
- Botão **Atribuir** (se ainda não tem) ou **Reatribuir**.

### Agendamento

- **Data agendada** — date+time picker.
- Placeholder: `https://...` no campo "URL do relatório" (opcional, link pro PDF do laudo).
- Notas gerais — textarea livre.

`[📸 PRINT 10-03: campos de agendamento e relatório | logado: admin]`

### Checklist por cômodo

Lista de itens já adicionados. Cada item:
- **Cômodo** (Sala, Cozinha, Quarto 1, etc).
- **Item** (Parede, Piso, Janela, etc).
- **Condição** (Ótimo, Bom, Regular, Ruim, Crítico — texto livre, padronização recomendada).
- **Fotos** (URLs).

Abaixo, formulário pra **adicionar novo item**:
- Cômodo — placeholder: *"Cômodo (sala...)"*
- Item — placeholder: *"Item (parede...)"*
- Condição — placeholder: *"Condição"*
- Botão **Adicionar**.

`[📸 PRINT 10-04: checklist com 3-4 itens e formulário pra adicionar | logado: admin]`

### Botões de status

- **Iniciar vistoria** — passa de `agendada` pra `em_andamento`.
- **Finalizar vistoria** — passa de `em_andamento` pra `concluida`. Trava edição.
- **Cancelar** — passa pra `cancelada` (motivo opcional).

---

## Vistoria de entrada — criação automática

Quando um deal de locação chega na etapa com **papel `vistoria_entrada`** (em `fun-corretor-locacao`, etapa `corloc-vistoria-entrada` por default):

1. Trigger `tg_create_inspection_on_stage` dispara.
2. Sistema cria automaticamente a vistoria com status `pendente`.
3. Se o modo de atribuição é **roleta**, atribui vistoriador automaticamente.
4. Se é **fila**, fica pendente esperando o admin atribuir.
5. Aparece no painel de Vistorias na hora.

Você **não precisa fazer nada** pra criar — só agendar e operar.

---

## Vistoria de saída — criação manual

A vistoria de saída **NÃO é automática**. Você cria manualmente quando o contrato vai ser encerrado:

1. No detalhe do contrato (capítulo 11), botão **"Solicitar vistoria de saída"**.
2. Sistema cria vistoria tipo `saida`, status `pendente`.
3. Mesma rotina: atribui vistoriador, agenda, executa.

---

## Visão do vistoriador

Quando o usuário tem role `vistoriador`, ele entra direto na rota `/vistorias`, mas **só vê as vistorias atribuídas a ele**.

Operações dele:
- Ver detalhe.
- Marcar **Iniciar vistoria** quando chegar no imóvel.
- Preencher checklist (cômodo + item + condição + foto opcional).
- Marcar **Finalizar vistoria** ao terminar.
- Anexar URL do relatório (PDF gerado).

Ele **não vê** vistorias de outros vistoriadores. **Não atribui** vistorias. **Não cancela** (admin faz).

---

## Modo de atribuição (config da org)

Em **Config → Funis → fun-corretor-locacao** (ou metadata da org):

- **`inspection_assignment = 'fila'`** (default) — vistorias nascem sem vistoriador, admin atribui manualmente.
- **`inspection_assignment = 'roleta'`** — sistema sorteia vistoriador na criação. Pra ligar, precisa de superadmin (proteção contra ativar sem querer).

---

## Escala de condições (config da org)

Em metadata da org: `inspection_condition_scale` — define o vocabulário aceito no campo "Condição".

Default: `Ótimo, Bom, Regular, Ruim, Crítico`.

Você pode customizar pra `Novo, Conservado, Desgastado, Danificado` ou qualquer outra escala.

---

## Próximo

- **11 — Contrato de locação**
