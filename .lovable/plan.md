

# Manual detalhado do sistema CRM imobiliário

Vou montar um manual completo (PDF + DOCX) explicando cada parte do sistema, com prints reais de cada tela. O conteúdo cobrirá toda a lógica do CRM, da autenticação à composição de IA.

## Estrutura do manual

### 1. Visão geral
- O que o sistema faz: CRM imobiliário multi-funil com IA composicional
- Arquitetura: mobile-first com adaptação real para desktop
- 4 abas principais (Funis, Atividades, Indicadores, Config) + autenticação por usuário/senha + recuperação por pergunta de segurança

### 2. Autenticação (AuthPage)
- Login por usuário/senha
- Recuperação de senha em 3 passos (usuário → pergunta de segurança → nova senha)
- Limite de tentativas configurável (3 tentativas em janela de 15min)

### 3. Aba Leads / Funis (FunisPage)
- Dois modos de visualização: por **Lead** (4 status de conversa) e por **Funil**
- Status de leitura: não lidas pelo corretor, não lidas pelo cliente, lidas sem resposta dos dois lados
- Card customizável (widgets configuráveis)
- Sheet de detalhe do deal com abas: Conversa, Dados, Atividades, Histórico
- Chat integrado com modo IA (perguntar à IA sobre o lead, anexar imagem/áudio/arquivo)
- Indicadores de "atrasado" e "sem dono" no card
- Bottom sheet de motivo da perda

### 4. Aba Atividades
- Filtros rápidos: Hoje, Atrasadas, Semana
- Cards com swipe (mobile): direita = concluir, esquerda = adiar
- Tipos: ligação, visita, proposta, follow-up
- Indicador de tarefa recorrente
- Botão calendário (Google/Outlook/Apple)

### 5. Aba Indicadores
- Card "Previsão de Receita" com barra de progresso ganho/meta
- 4 KPIs: Total Leads, Conversão, Ticket Médio, Ciclo Médio
- Acordeões: Funis de Vendas, Motivos de Perda (gráfico de pizza), Origem/Canal, Decisões da IA, Saúde Composicional (heatmap funil × status)

### 6. Aba Config (8 sub-abas)
- **Funis**: editar funis, etapas, probabilidades, dias máximos, touchpoints (corretor / IA / ambos), playbook 4 colunas
- **Equipe** (admin): gestão de usuários e papéis (admin / corretor)
- **Segurança**: pergunta de segurança para recuperação
- **Card**: configurar widgets visíveis no card do deal
- **Campos**: campos personalizados (lead/deal/imóvel)
- **Imóveis**: catálogo
- **Números WA**: WhatsApp oficial e QR
- **Fluxos IA**: workflows da IA (gestor de comportamento, skills com canvas drag-and-drop, sugestões automáticas de LBs)

### 7. Camada de IA composicional
- Comportamentos do lead (LB-xxx) detectados automaticamente
- Skills (gatilho LB → ações) editáveis em canvas visual
- Guardrails (regras DO / DONT / ASK / NOASK)
- Playbooks por etapa com overrides em vários escopos
- Logs de decisão + painel de saúde do sistema

### 8. Fluxos típicos passo a passo
- Como criar um novo funil do zero
- Como configurar um touchpoint da IA
- Como aprovar uma sugestão de comportamento detectada pela IA
- Como personalizar o card do deal
- Como recuperar a senha

## Como vou capturar os prints

Aqui preciso da sua decisão. O ambiente onde gero documentos não consegue ler arquivos da sessão do navegador remoto (limitação técnica), e o login do app exige usuário/senha real. Tenho **três caminhos**:

**Opção A — você fornece um login de teste** (preferível): você me passa um par usuário/senha de uma conta de demonstração. Eu rodo um script que loga via Supabase, navega por todas as telas no Chromium local em viewports mobile (390px) e desktop (1280px), captura ~25 prints reais e embute todos no PDF.

**Opção B — eu monto o manual sem prints, só com diagramas ASCII** das telas (caixas, posições, fluxos) + PDF com layout limpo. Mais rápido, mas sem fidelidade visual.

**Opção C — eu gero o manual com prints "mock"**: capturo a tela de login (única acessível sem auth) e desenho as outras telas como wireframes estilizados gerados via SVG/Pillow, mantendo fielmente cores, posições e textos do código. Não é o app rodando, é uma reconstrução visual a partir do código.

## Entregáveis

- `/mnt/documents/manual_crm.pdf` — manual ilustrado completo (~30 páginas)
- `/mnt/documents/manual_crm.docx` — versão editável

## Detalhes técnicos
- PDF gerado com ReportLab (Platypus), Letter, fontes Helvetica/Helvetica-Bold, paleta dark (#0a0a0a, #25D366) nos blocos de destaque
- DOCX gerado com docx-js (Arial, headings com outlineLevel para TOC)
- QA visual obrigatório: converter cada página em JPG e revisar antes de entregar
- Em A/C: imagens embutidas como base64 (PDF) e ImageRun (DOCX)

---

Qual opção você prefere — **A**, **B** ou **C**? Se for A, me mande as credenciais de teste numa mensagem separada.

