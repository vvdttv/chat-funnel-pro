# 01 — Começando

> O que este capítulo entrega: você vai entender a estrutura do OmniMob, os 6 papéis que existem, como cada um faz login, o que cada um vê na barra inferior, e por onde navegar.

---

## Os 6 papéis do sistema

O OmniMob tem 6 papéis distintos. Cada papel vê coisas diferentes. Cada papel tem permissões diferentes. O sistema decide o que mostrar **a partir do papel do usuário logado** — não tem "modo de visão" pra trocar.

| Papel | Quem é | O que faz no sistema |
|-------|--------|----------------------|
| **Admin** (ou superadmin) | Dono da imobiliária, gerente | Configura tudo, vê todos os funis, treina a IA, acompanha indicadores |
| **Corretor** | Vendedor / locador | Atende leads qualificados, agenda visitas, vê só os funis que tem acesso |
| **Correspondente bancário** | Quem analisa crédito MCMV | Recebe leads do funil IA, analisa, devolve aprovado/reprovado/condicional |
| **Atendente de seguradora** | Funcionário da seguradora parceira | Analisa pedidos de seguro-fiança / título de capitalização |
| **Administrativo** | Departamento administrativo da imobiliária | Opera vistoria, contrato e garantia locatícia |
| **Vistoriador** | Perito externo ou interno | Executa a vistoria do imóvel, preenche checklist por cômodo |

> Um usuário pode ter mais de um papel. Exemplo: o dono da imobiliária é admin **e** corretor — vê os dois mundos.

---

## Tela de login

`[📸 PRINT 01-01: tela /auth — formulário "Entrar" | logado: nenhum | anotações: círculo em "Usuário", círculo em "Senha", seta apontando pro botão "Entrar", seta apontando pro link "Esqueci minha senha"]`

A tela de login tem dois campos:

- **Usuário** — o nome de usuário (não é e-mail; é o que o admin definiu quando cadastrou você)
- **Senha** — mínimo 6 caracteres

Abaixo do botão **Entrar** tem um link discreto: **Esqueci minha senha**. Esse link inicia o fluxo de recuperação por pergunta de segurança (não por e-mail). É a opção segura pra uma imobiliária que opera em rede interna.

### Esqueci minha senha — fluxo

1. Você clica em **Esqueci minha senha**
2. Digita seu nome de usuário
3. O sistema mostra **a sua pergunta de segurança** (que você cadastrou na primeira vez)
4. Você digita a resposta
5. Se acertar, define uma nova senha (mín. 6 caracteres) e confirma
6. Sistema mostra **"Senha redefinida"** e volta pro login

`[📸 PRINT 01-02: fluxo "Recuperar senha" passo 3 — pergunta de segurança visível | logado: nenhum | anotações: círculo na pergunta]`

> Se você nunca cadastrou pergunta de segurança, vá em **Config → Segurança** depois do primeiro login. É a primeira coisa que todo usuário deve fazer.

---

## A barra inferior (BottomNav)

Depois do login, você cai numa tela com uma **barra inferior fixa**. Ela é o coração da navegação. Tudo se acessa por ela.

`[📸 PRINT 01-03: tela inicial pós-login — BottomNav visível, com todos os ícones | logado: admin | anotações: numerar cada ícone de 1 a 7]`

Da esquerda pra direita:

| # | Ícone | Label | O que faz |
|---|-------|-------|-----------|
| 1 | 👥 (Users) | **Leads** | Vai pra página de Funis / Kanban (a tela principal de operação) |
| 2 | 🤖 (Bot) | **IA** | Caixa de Sugestões da IA — respostas aguardando aprovação |
| 3 | ⏰ (Clock) | **Atividades** | Sua agenda — visitas, ligações, follow-ups |
| 4 | 🔄 (RefreshCw) | **Sync** | Botão central destacado — força atualização e sincroniza dados |
| 5 | 📊 (BarChart3) | **Indicadores** | Relatórios e dashboards |
| 6 | ⚙️ (Settings) | **Config** | Configurações do sistema (admin vê 18 abas; usuário comum vê só as suas) |
| 7 | 🟫 (LayoutGrid) | **Painéis** | Atalho pros painéis dedicados: Correspondente, Garantia, Vistorias, Contratos, Corretor |

> **Importante**: o ícone **7 (Painéis)** só aparece se você tem permissão pra pelo menos UM dos painéis dedicados. Corretor só de locação, por exemplo, talvez não veja esse ícone.

### O botão Sync (4) em detalhe

O botão central — redondo, destacado — não é só estético. Ele:

1. Limpa o cache local do navegador
2. Re-busca todos os dados do servidor
3. Mostra um toast "Atualizando sistema…"
4. Se der erro, mostra "Erro ao atualizar — Tente recarregar manualmente"

Use sempre que você suspeitar que está vendo dado antigo (raro, mas acontece em conexão instável).

---

## O atalho "Painéis" (ícone 7)

Quando você clica em **Painéis**, abre um menu suspenso (pra cima, já que a barra é inferior) com os atalhos disponíveis pro **seu papel**:

`[📸 PRINT 01-04: BottomNav com dropdown "Painéis" aberto | logado: admin | anotações: círculo no ícone aberto, lista de itens visível]`

| Painel | Quem vê |
|--------|---------|
| **Correspondente** | Admin, atendente (correspondente bancário) |
| **Garantia (locação)** | Admin |
| **Vistorias** | Admin |
| **Contratos** | Admin |
| **Corretor** | Admin, corretor |

> Mesmo se um usuário curioso clicar em uma URL que ele não tem permissão pra ver, o painel **redireciona automaticamente pra tela inicial**. Não tem como vazar acesso.

---

## A primeira tela depois do login

Depende do papel.

**Admin / corretor**: cai direto na aba **Leads** (Funis / Kanban). É o quadro de cards do funil.

`[📸 PRINT 01-05: Kanban do funil IA visível | logado: admin | anotações: seta no seletor de funil no topo, círculo num card]`

**Correspondente puro**: cai no **/correspondente**. É a fila de leads pra analisar crédito.

**Vistoriador puro**: cai no **/vistorias** mas só vê as próprias vistorias atribuídas.

**Atendente de seguradora**: cai no **/garantia** filtrado pelas análises atribuídas.

> O sistema decide a "home" certa pra cada papel via componente `HomeByRole`. Você não escolhe.

---

## A sininha (notificações)

No canto superior direito da tela tem um sino (ícone Bell). Ele:

- Mostra um número vermelho quando há notificações não lidas
- Atualiza em tempo real (sem precisar recarregar)
- Cobre eventos: novo lead, deal parado (mais de N dias sem mexer), crédito aprovado, briefing pronto, lembrete do sistema

`[📸 PRINT 01-06: sininha com badge "3" no canto superior direito | logado: admin | anotações: círculo no badge]`

Ao clicar, abre um painel lateral com a lista de notificações. Clicar em cada uma marca como lida. Tem botão "Marcar todas como lidas".

---

## Atualizações automáticas (realtime)

Várias telas do OmniMob **atualizam sozinhas** quando algo muda no banco:

- Kanban — quando um deal muda de etapa, o card pula sozinho
- Caixa de Sugestões — quando a IA gera uma nova sugestão, aparece sem você precisar recarregar
- Painéis (Correspondente, Garantia, Vistorias, Contratos) — quando um item é atribuído ou muda de status, atualiza

Isso significa que você pode deixar a tela aberta em segundo plano e voltar pra ver o que aconteceu enquanto trabalhava em outra coisa. Não é polling de minuto em minuto — é instantâneo (postgres_changes via Supabase Realtime).

---

## Logout

Em **Config → Equipe (sua conta)** tem o botão de sair. Em alguns lugares também aparece um menu de avatar no canto, dependendo da versão. Limpa a sessão local e te leva de volta pra `/auth`.

---

## Próximo

Se você é **admin**, vai pro capítulo **[02 — Admin / Config (18 abas, A→Z)](02-admin-config.md)**. É o mais denso. Reserve 25 minutos.

Se você é **corretor**, **correspondente**, **administrativo**, **atendente de seguradora** ou **vistoriador**, pula pro seu capítulo correspondente — você não precisa do 02-06.
