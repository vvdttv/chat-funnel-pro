# 02 — Admin / Config (as 18 abas, A→Z)

> Este capítulo é só pra **admin**. Se você não é admin, pula pro seu capítulo.

A tela de Config é a sala de controle do OmniMob. Aqui você configura tudo: funis, etapas, IA, equipe, imóveis, correspondentes, seguradoras, vistoriadores, campos do contrato, números de WhatsApp, e por aí vai.

São **18 abas** organizadas no topo da tela. A maioria é admin-only (você só vê se for admin/superadmin); algumas são acessíveis a usuários comuns.

`[📸 PRINT 02-00: tela Config completa, com barra de abas no topo visível | logado: admin | anotações: retângulo destacando a barra de abas, número em cada aba]`

Lista oficial das 18 abas, na ordem que aparecem:

| # | Aba | Label | Admin-only? |
|---|-----|-------|-------------|
| 1 | Config IA | **Config IA** | Sim |
| 2 | Funis | **Funis** | Não |
| 3 | Critérios | **Critérios** | Sim |
| 4 | Personas | **Personas** | Sim |
| 5 | Equipe | **Equipe** | Sim |
| 6 | Correspondentes | **Correspondentes** | Sim |
| 7 | Campos Devolutiva | **Campos Devolutiva** | Sim |
| 8 | Seguradoras | **Seguradoras** | Sim |
| 9 | Vistoriadores | **Vistoriadores** | Sim |
| 10 | Campos Contrato | **Campos Contrato** | Sim |
| 11 | Corretores | **Corretores** | Sim |
| 12 | Segurança | **Segurança** | Não |
| 13 | Card | **Card** | Não |
| 14 | Campos | **Campos** | Não |
| 15 | Atividades | **Atividades** | Sim |
| 16 | Imóveis | **Imóveis** | Sim |
| 17 | Números WA | **Números WA** | Sim |
| 18 | Modo Treinador | **Modo Treinador** | Sim |

> A primeira aba selecionada quando admin abre Config é **Config IA**. Pra usuário comum, é **Funis**.

---
## 1. Config IA

A aba mais importante pro admin. É onde você **configura comportamentos da IA em linguagem natural** -- sem mexer em prompt, sem mexer em código.

Dentro dela, **4 sub-abas** no topo:

`[PRINT 02-01 aba Config IA, sub-abas visíveis]`

### 1.1 Configurar

Fluxo guiado em **5 etapas**.

`- Etapa 1 Descrever: caixa de texto pra você escrever em português normal.
Placeholder: Ex: Quando o lead pedir desconto, a IA não pode prometer nada só consultar comigo.
Botão Próximo habilita ao digitar ao menos 5 caracteres.

- Etapa 2 Trio fixo: 3 perguntas padrão que toda configuração responde. 1. Em que contexto essa regra se aplica? 2. O que a IA deve fazer quando esse contexto acontece? 3. O que a IA não deve fazer?

- Etapa 3 Perguntas personalizadas: a IA gera dinamicamente 2-4 perguntas adicionais.

- Etapa 4 Revisão: a IA mostra o plano estruturado. Você pode:
  - Salvar: aplica imediatamente.
  - Ajustar: volta pra etapa 3 com contexto preservado.

- Etapa 5 Salvo: confirmação.
`

> A configuração fica gravada em playbook_overrides. A engine de IA lê isso a cada resposta.

### 1.2 Configurações salvas

Lista de TUDO que você já configurou. Cada linha: resumo, etapa, data, botão Ajustar.

### 1.3 Auditoria

Lista de decisões da IA: cada resposta gerada vira um registro com lead, etapa, prompt, comportamentos detectados, regras aplicadas, overrides aplicados, intent, tone. Útil pra entender POR QUE a IA falou o que falou.

### 1.4 Simulador

Você escolhe funil, etapa, digita mensagem simulada, clica Simular. A IA responde sem mandar pra WhatsApp real.

---
## 2. Funis

Onde você **cria, edita e organiza os funis** da imobiliária. O OmniMob já vem com 5 funis padrão:

| Funil | O que é | Etapas | É de IA? |
|-------|---------|--------|----------|
| `fun-ia-mcmv` | Funil principal MCMV (IA atende, qualifica, distribui) | 9 | Sim |
| `fun-corretor-mcmv` | Funil do corretor pós-qualificação MCMV | 8 | Não |
| `fun-nutricao-mcmv` | Funil de nutrição (lead que perdeu, volta aqui) | 5 | Não |
| `fun-ia-locacao` | Funil principal de locação (IA atende, qualifica) | 9 | Sim |
| `fun-corretor-locacao` | Funil do corretor de locação | 7 | Não |

`[PRINT 02-05 aba Funis com seletor e botão Novo Funil]`

### Criando um novo funil

Wizard com:
1. Nome (Ex: Funil de venda residencial), descrição, ícone (10+ opções) e cor (paleta de 8).
2. Etapas iniciais (pode pular e adicionar depois).
3. Confirmação e botão **Criar**.

### Editando um funil existente

**Cabeçalho**: nome e descrição (lápis pra editar), contador X Etapas, botão Nova Etapa.

**Lista de etapas**: cada etapa tem bolinha colorida com posição, nome (editável), **papel** (role) selecionável, setas pra reordenar, botão de excluir.

### Por que papel importa

Os papéis são **âncoras semânticas**: o motor dispara automações por papel, não por nome de etapa.

- Etapa com papel `vistoria_entrada` — ao chegar um deal, a **vistoria é criada automaticamente**.
- Etapa com papel `contrato` — libera o botão **Criar contrato** no card.
- Etapa com papel `analise_credito` — dispara atribuição ao correspondente bancário.

Você pode renomear a etapa — o sistema continua disparando, porque o que importa é o **papel** não o nome.

---

## 3. Critérios

Define **os campos obrigatórios de cada etapa**.

| Campo | O que é |
|-------|---------|
| **Funil** | Em qual funil |
| **Etapa** | Em qual etapa |
| **Chave** | Identificador interno (ex: renda_familiar) |
| **Rótulo** | Como aparece (ex: Renda Familiar) |
| **Tipo** | boolean / threshold / enum / text / select_single / select_multi |
| **Owner** | IA / corretor / ambos |
| **Options** | Lista padronizada (uma por linha, formato `valor|rotulo`) |
| **Question hint** | Texto-guia pra IA usar na conversa |
| **Obrigatório?** | Trava o avanço da etapa se faltar |

### O que isso bloqueia

- **IA** (owner=ia ou ambos) — não consegue avançar o lead se o critério não tem valor coletado.
- **Corretor** (owner=corretor ou ambos) — vê badge vermelha no card; tentar mover manualmente dá erro `campos_obrigatorios_pendentes`.

### O que vem pronto

Os 5 funis vêm com **36 critérios seedados**. Você edita, desativa ou cria novos à vontade.

---

## 4. Personas

Define as **personas da IA** -- quem ela é, como fala.

| Campo | Exemplo |
|-------|---------|
| Nome | Marina |
| Gênero | feminino |
| Tom | Cordial, consultivo, sem pressão |
| Personalidade | Empática, paciente, didática |
| Estilo de mensagem | Mensagens curtas, linguagem acessível, emojis pontuais |
| Missão | Avançar o lead respeitando seu ritmo |
| Notas de identidade | (livre) observações que reforçam quem ela é |

### Tipos de persona

O sistema diferencia **duas personas OmniMob padrão** (seedadas):
- **Passiva** — recebe mensagens, qualifica leads novos.
- **Ativa** — envia mensagens proativas (cadência, retomada).

---
## 5. Equipe (Usuários)

Onde você **cadastra os usuários do sistema**.

### Operações

- **Adicionar usuário** — formulário inline: Usuário (ex: `joao`), Nome de exibição, Senha (mín. 6). Botão **Adicionar**.
- **Trocar senha** — botão "Nova senha" em cada linha.
- **Desativar / reativar** — toggle ao lado de cada usuário.

O cadastro de papel é feito separado: depois de criar o usuário, vai pra **Corretores** / **Correspondentes** / **Seguradoras** / **Vistoriadores** e linka o `user_id` ao papel correspondente.

---

## 6. Correspondentes

Cadastra os **bancos parceiros** e seus **atendentes**.

**Banco parceiro**: nome ("Ex: Banco Parceiro X"), ativo/inativo.

**Atendente** (cada banco tem vários):
- Nome, e-mail, telefone.
- `user_id` (UUID do usuário com role `atendente`).
- Peso na roleta (1-10).
- Ativo / inativo.

### Roleta de distribuição

Dispara quando um lead é qualificado e precisa ir pra análise de crédito:
1. Acha atendentes ativos.
2. Pondera por **peso × carga atual**.
3. Sorteia.
4. Atribui.

Tudo com lock advisory (sem disputa) e idempotente (mesmo lead não distribui 2x).

---

## 7. Campos Devolutiva

Os **campos customizados** que o correspondente preenche quando devolve a análise.

Cada campo:
- **Chave** (ex: `banco`).
- **Rótulo** (ex: "Banco").
- **Tipo**: text / number / select_single / select_multi / boolean.
- **Opções** (se select): uma por linha.
- **Obrigatório** sim/não.
- **Ativo** sim/não.

Esses campos aparecem no formulário de devolutiva no painel do correspondente.

---

## 8. Seguradoras

Cadastra **seguradoras parceiras** e seus **atendentes**.

**Seguradora**: nome ("Ex: Porto Seguro"), CNPJ (`00.000.000/0000-00`), telefone, e-mail, ativo/inativo.

**Atendente**: nome, e-mail, telefone, `user_id`, ativo/inativo.

### Roleta dupla

Quando o administrativo define o tipo de garantia como `seguro_fianca` ou `titulo_capitalizacao`:
1. **Sorteia a seguradora** (proporcional, carga atual).
2. **Sorteia o atendente** dentro da seguradora (proporcional, carga atual).
3. Atribui ambos à análise de garantia.

O admin pode **forçar uma seguradora ou atendente específico** depois (override no GarantiaPanel).

---

## 9. Vistoriadores

Cadastra **vistoriadores** -- peritos externos ou colaboradores internos.

**Vistoriador**:
- Nome ("Ex: João Silva").
- **Tipo**: `perito_externo` ou `administrativo`.
- E-mail, telefone.
- `user_id` (role `vistoriador`).
- Ativo / inativo.

### Modo de atribuição

Em Config -> Funis -> `fun-corretor-locacao` (ou via metadata da org), você escolhe:
- **Roleta** (sistema sorteia).
- **Fila** (admin pega manual).

Default: só fila. Pra ligar roleta, precisa de superadmin alterar a config.

---
## 10. Campos Contrato

Os **campos customizados do contrato de locação**. O OmniMob já vem com **23 campos seedados em 4 seções**:

| Seção | O que cobre |
|-------|------------|
| **Dados do cliente** | Locatário (nome, CPF, RG, nascimento, profissão, renda, etc) |
| **Dados da imobiliária / locador** | Razão social, CNPJ, endereço da imobiliária, locador |
| **Endereço do imóvel** | Logradouro, número, complemento, bairro, cidade, CEP |
| **Garantia** | Tipo (fiador / caução / seguro-fiança / título de capitalização), provedor, dados específicos |

Cada campo tem:
- **Chave** (ex: `cpf_locatario`).
- **Rótulo** ("Ex: CPF do locatário").
- **Tipo**: text / number / date / select_single / select_multi / boolean.
- **Seção** (uma das 4).
- **Options** (se select).
- **Obrigatório**, **ativo**, **posição**.

Você adiciona, remove e reordena. Quando o administrativo cria um contrato, o formulário monta os campos dinamicamente a partir dessa configuração.

---

## 11. Corretores

Cadastra os **corretores da imobiliária** (vendas e locação).

**Corretor**:
- Nome ("Nome do corretor").
- E-mail.
- Telefone (`+5511999999999`).
- WAHA session (default: `default`) -- qual sessão do WhatsApp ele usa pra atendimento.
- `user_id` (role `corretor`).
- Peso na roleta (1-10).
- Ativo / inativo.

### Permissão por funil

Cada corretor tem **acesso configurável por funil**. Corretor de locação != corretor de vendas: você escolhe os funis que cada um tem acesso.

- Admin e superadmin: acesso a todos os funis automaticamente.
- Corretor sem acesso a um funil: não vê os deals desse funil no Kanban, não é sorteado pela roleta desse funil.

### Visão filtrada

No FunisPage, quando um corretor abre o sistema:
- Só vê os funis que tem acesso.
- Dentro do funil, só vê deals atribuídos a ele (a não ser que admin).

---

## 12. Segurança

Onde você cadastra a sua **pergunta + resposta de segurança** pra recuperação de senha.

**Todo usuário deve fazer isso na primeira vez que entra.^*

Campos:
- **Pergunta**: "Ex: Nome do meu primeiro animal de estimação".
- **Resposta**: a sua resposta (mín. 3 caracteres).
- **Confirmar resposta**: repete pra garantir.

A resposta é gravada com hash (bcrypt + salt). Ninguém -- nem admin, nem desenvolvedor -- consegue ler ela depois.

> Se você esquecer a senha e nunca cadastrou pergunta de segurança, o admin precisa **resetar sua senha manualmente** na aba Equipe -> "Nova senha". Não tem outra forma de recuperar.

---

## 13. Card

Configuração de **como os cards do Kanban aparecem visualmente**. Você escolhe quais widgets aparecem em cada card.

Widgets disponíveis:
- Foto / iniciais do lead.
- Nome do lead.
- Telefone (mascarado ou completo).
- Tags coloridas.
- Etapa atual (badge).
- Tempo na etapa.
- Valor estimado.
- Corretor / correspondente atribuído.
- Último contato.
- Próxima ação.
- Status (open / won / lost).

O resultado é refletido em tempo real numa **prévia** ao lado.

---
## 14. Campos

Os **campos extras** que aparecem no formulário do card (quando você abre o detalhe de um deal). Diferente dos critérios obrigatórios (aba 3), estes são campos auxiliares, não-bloqueantes.

Cada campo:
- Nome ("Ex: Renda Familiar").
- Chave técnica (`renda_familiar`).
- Tipo: texto / número / select / multi / date / boolean.
- Opções (se select).
- Texto de exemplo / ajuda.

---

## 15. Atividades

Define os **tipos de atividade** disponíveis na agenda do corretor (aba Atividades do BottomNav).

Cada tipo:
- **Rótulo** ("Ex: Reunião comercial").
- **Chave** (`reuniao_comercial`).
- Ícone.
- Cor.

Vem com tipos seedados: Reunião, Ligação, Visita, Follow-up, Envio de proposta.

---

## 16. Imóveis

Cadastra **imóveis disponíveis** pra match com leads.

**Imóvel**:
- **Código** (ex: `AP-001`).
- **Título** ("Apto 2 quartos, Jardim…").
- **Operação**: venda / locação / ambos.
- **Preço** (R$).
- **Avaliação projetada** (calculada automaticamente como % do preço).
- **Avaliação confirmada** (após laudo).
- Endereço completo.
- Quartos, banheiros, vagas, área (m²).
- Foto principal + URL.
- Tags (ex: "Pronto pra morar", "MCMV", "Mobiliado").
- Ativo / inativo.

### Match com leads

Quando o corretor abre o briefing de um deal, o sistema calcula o match 100/80/0:
- **100**: imóvel cabe 100% no perfil aprovado.
- **80**: cabe com entrada.
- **0**: não dá pra esse lead.

---

## 17. Números WA (WhatsApp)

Onde você cadastra os números de WhatsApp que recebem leads.

**Número**:
- **Rótulo** ("Número P1").
- **Telefone E.164** (`+5511999999999`).
- **WAHA session** (`default`).
- **External Number ID** (Cloud API Meta).
- **Funil padrão**.
- **Persona ativa**.
- Ativo / inativo.

### Roteamento

Quando uma mensagem chega:
1. O webhook identifica qual número recebeu.
2. Cria o deal no `default_funnel_id` do número.
3. Atende com a persona ligada ao número.

Você pode ter múltiplos números (venda MCMV, locação), cada um com persona e funil próprios.

---

## 18. Modo Treinador

Cadastra quem pode treinar a IA via WhatsApp (canal 2).

**Permissão**:
- **Número** (E.164).
- **Senha** (mín. 6 caracteres).
- **Rótulo** ("Nome/rótulo").

A senha é gravada com hash bcrypt + salt.

### Como funciona o canal WhatsApp

1. Usuário cadastrado manda mensagem começando com `#modofeedback`.
2. A IA pede a senha.
3. Usuário responde a senha.
4. Sessão de feedback abre (timeout 30 min).
5. Usuário descreve o ajuste em português normal.
6. A IA interpreta, mostra, pede confirmação.
7. Usuário confirma → ajuste salvo → próxima resposta já aplica.
8. Ao terminar: "Quer continuar treinando ou voltar à conversa normal?"

> Detalhes completos no capítulo **04 — IA: Sugestões + Modo Treinador**.

---

## Pra fechar

Você passou pelas 18 abas de Config. Próximos:

- **03 — Kanban / Funis**
- **04 — IA: Sugestões + Modo Treinador**
- **05 — Indicadores e Relatórios**
- **06 — Atividades / Agenda**
