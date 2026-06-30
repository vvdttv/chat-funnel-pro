# 13 — Glossario, FAQ e atalhos

Capitulo de referencia. Volte aqui quando precisar.

---

## Glossario

### Conceitos do sistema

| Termo | Significado |
|-------|-------------|
| **Deal** | Um lead que entrou no sistema. Cada conversa de WhatsApp vira 1 deal. |
| **Funil** | Sequencia de etapas pelas quais um deal passa. O OmniMob tem 5 funis (3 MCMV + 2 locacao). |
| **Etapa** | Cada parada dentro de um funil. Ex: ia-novo-lead, ia-coleta, ia-analise. |
| **Papel (role)** | Ancora semantica de uma etapa. Aciona automacoes (vistoria_entrada, contrato, analise_credito). |
| **Criterio** | Campo que precisa ser preenchido em uma etapa pra ela ser considerada completa. |
| **Owner** | Quem preenche um criterio: IA, corretor ou ambos. |
| **Match** | Calculo automatico de quais imoveis cabem no perfil aprovado de um lead. 100/80/0. |
| **Briefing** | Texto formatado consolidando tudo do lead, gerado pra corretor. |
| **Lastro bidirecional** | Espelho de um deal entre 2 funis (IA + corretor). Sincronizados via mirror_deal_id. |
| **Override** | Ajuste de comportamento da IA gravado em playbook_overrides. Aplicado a cada resposta. |
| **Roleta** | Algoritmo de distribuicao automatica (peso x carga atual). Idempotente, com lock advisory. |
| **SLA** | Prazo limite pra uma acao (default 24h pra correspondente devolver analise). |
| **Nutricao** | Funil dedicado a leads perdidos com motivo recuperavel. Cadencia de retomada. |

### Termos tecnicos que aparecem na UI

| Termo | O que e |
|-------|---------|
| **WAHA** | API que conecta o sistema ao WhatsApp (alternativa a Cloud API Meta). |
| **Cloud API Meta** | API oficial do WhatsApp Business (concorrente da WAHA). |
| **HMAC** | Autenticacao criptografica do webhook do WhatsApp (seguranca). |
| **Realtime** | Atualizacao instantanea da tela quando algo muda no banco (postgres_changes). |
| **RLS** | Row Level Security: cada usuario so ve as linhas que tem permissao. |
| **RPC** | Funcao do banco chamada pelo frontend (operacoes seguras com permissao definida). |
| **`*_internal`** | RPC interna, so chamavel pelo backend (service_role). Nao pelo usuario. |

### Papeis (roles)

| Role | Papel |
|------|-------|
| **admin / superadmin** | Acesso total |
| **corretor** | Vendedor / locador |
| **atendente** | Correspondente bancario OU atendente de seguradora (mesmo role, contextos diferentes) |
| **vistoriador** | Perito externo ou interno que executa vistoria |
| **administrativo** | Dpto administrativo da imobiliaria (opera garantia, vistoria, contrato) |

---

## FAQ

### Geral

**P: A IA atende 24/7?**
Sim. Se a sessao do WhatsApp esta ativa, a IA responde a qualquer hora.

**P: Quanto tempo a IA leva pra responder?**
Em media 5-15 segundos. Depende do gateway de IA configurado.

**P: A IA fala portugues bem?**
Sim, e pt-BR nativo. As personas vem configuradas com tom brasileiro.

**P: Posso desligar a IA num lead especifico?**
Sim. No card do deal, mude a autonomia pra manual ou marque uma tag de bloqueio.

**P: O sistema funciona sem internet?**
Nao. E web. Mas o painel funciona em qualquer celular ou desktop com browser.

### Operacao

**P: Como saber quem atribuiu o lead pra mim?**
No card do deal, ve o campo assigned_to e o evento mais recente em deal_stage_events.

**P: Posso atribuir lead pra mim mesmo se a roleta atribuiu pra outro?**
Admin: sim, edita o assigned_to no card. Corretor comum: nao (rls bloqueia).

**P: Como mudar de qual numero o sistema envia?**
Em Config Numeros WA, marca o numero como ativo / inativo. Lead novo cai no funil do numero ativo.

**P: Da pra criar mais de uma persona IA?**
Sim. Em Config Personas, crie quantas quiser. Cada numero WA pode ter persona diferente.

### Modo Treinador

**P: Quando eu treino, vale pra todos os leads ou so pra este?**
Por default, vale pra **etapa** (todos os leads naquela etapa). Voce pode escolher escopo mais restrito (funil, deal especifico) no fluxo do Configurador.

**P: Quanto tempo demora pra IA aplicar o ajuste?**
Imediato. Proxima resposta ja sai ajustada. Sem deploy.

**P: Posso desfazer um treinamento?**
Sim. Vai em Config Config IA Configuracoes salvas, acha o registro, clica Ajustar e desabilite.

**P: Quem viu que eu treinei?**
Fica registrado em ia_feedback_events: quem, quando, qual override gerou. Auditavel.

### Garantia e contrato

**P: O sistema gera o PDF do contrato?**
Nao. Voce gera o PDF fora (Word, sistema juridico) e cola a URL no campo do contrato.

**P: Da pra ter contrato sem garantia?**
Nao. RPC create_lease_contract bloqueia se nao houver guarantee_analyses aprovada.

**P: Posso mudar o tipo de garantia depois de aprovado?**
Sim, mas implicaria reabrir a analise. Caminho: voltar deal pra etapa de garantia.

**P: A seguradora ve dados de outras seguradoras?**
Nao. RLS filtra: cada atendente ve so as analises da sua propria seguradora.

### Vistoria

**P: A vistoria precisa de internet no momento de executar?**
Sim, pra salvar foto e checklist em tempo real. Sem internet, voce anota e preenche depois.

**P: Quantas fotos por item posso colocar?**
Sem limite explicito. Depende do limite de armazenamento da org no Supabase Storage.

**P: Da pra exportar o checklist como PDF?**
Hoje nao tem export PDF nativo. Voce pode imprimir a tela ou anexar URL externa.

---

## Atalhos

### Atalhos de URL (digite no browser)

| URL | Onde leva |
|-----|-----------|
| `/auth` | Tela de login |
| `/` | Home (varia por papel) |
| `/correspondente` | Painel Correspondente |
| `/garantia` | Painel Garantia |
| `/corretor` | Painel Corretor |
| `/vistorias` | Painel Vistorias |
| `/contratos` | Painel Contratos |
| `/configurar-ia` | Pagina dedicada do Configurador IA |

### Atalhos do BottomNav (icones)

| Icone | Atalho |
|-------|--------|
| Users | Leads (Kanban) |
| Bot | IA (Caixa de Sugestoes) |
| Clock | Atividades (agenda) |
| RefreshCw (centro) | Sync (forca recarga) |
| BarChart3 | Indicadores |
| Settings | Config |
| LayoutGrid | Paineis (dropdown) |

### Dicas de produtividade

- **Realtime**: deixa a aba IA aberta em segundo plano enquanto trabalha em outra coisa. Sugestoes aparecem sem voce recarregar.
- **Modo Treinador WhatsApp**: pra treinar em movimento, sem abrir o sistema. So lembrar `#modofeedback`.
- **Atalho Painei**s: corretor que so opera locacao pode favoritar `/corretor` no celular. Vira app pseudo-instalado.
- **Indicadores 30d**: o periodo default e 30 dias. Mude pra 90d na primeira semana de uso, ai nao tem dado suficiente em 30d.

---

## Onde pedir ajuda

- **Erro de sistema** (algo travou, erro 500): operador tecnico (quem implantou o OmniMob na sua imobiliaria).
- **Treinar a IA pra se comportar diferente**: voce mesmo, com o Modo Treinador.
- **Cadastrar correspondente, corretor, seguradora**: admin da imobiliaria, em Config.
- **Recuperar senha**: clica Esqueci minha senha no login (precisa ter cadastrado pergunta de seguranca).
- **Mudar funil ou criar funil novo**: admin, em Config Funis.

---

## Pra fechar

Voce passou pelos 13 capitulos do manual. Voce sabe:

- Como o sistema funciona ponta a ponta (capitulo 12).
- Como cada papel opera (capitulos 07-11).
- Como o admin configura tudo (capitulos 01-06).
- O que e cada termo e como tirar duvida (capitulo 13).

A proxima decisao e sua: ligar o sistema e comecar a usar. O OmniMob esta pronto.

> Volta nesse manual sempre que precisar. Ele e a fonte da verdade do que o sistema faz hoje.
