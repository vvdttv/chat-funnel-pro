export interface Lead {
  id: string;
  name: string;
  phone: string;
  avatar: string;
  origin: string;
}

export type TouchpointExecutor = 'agent' | 'ai' | 'both';
export type MessageType = 'text' | 'image' | 'audio' | 'video';

export type AIWorkflowBlockType =
  | 'send_message'
  | 'wait'
  | 'typing'
  | 'recording'
  | 'condition'
  | 'wait_reply';

export interface AIWorkflowBlock {
  id: string;
  type: AIWorkflowBlockType;
  config: Record<string, any>;
}

export interface AIWorkflow {
  id: string;
  showTypingIndicator?: boolean;
  maxResponseSeconds?: number;
  blocks: AIWorkflowBlock[];
}

export interface Touchpoint {
  id: string;
  /** @deprecated mantido para compatibilidade; usar `executor` */
  type?: 'agent' | 'ai';
  executor: TouchpointExecutor;
  action: string;
  description: string;
  delayHours: number;
  channel: 'whatsapp' | 'email' | 'sms' | 'ligação';
  messageTypes: MessageType[];
  aiWorkflow?: AIWorkflow;
}

export interface FunnelStage {
  id: string;
  name: string;
  probability: number;
  /** Tempo máximo (em dias) que uma oportunidade pode ficar na etapa */
  maxDaysInStage: number;
  touchpoints: Touchpoint[];
}

export interface Funnel {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  stages: FunnelStage[];
}

export interface Deal {
  id: string;
  funnelId: string;
  leadId: string;
  leadName: string;
  property: string;
  propertyCode: string;
  value: number;
  stage: string;
  probability: number;
  createdAt: string;
  secondaryContacts?: { name: string; role: string }[];
}

export interface Activity {
  id: string;
  type: 'call' | 'proposal' | 'visit' | 'followup';
  title: string;
  dealId: string;
  leadName: string;
  property: string;
  dueDate: string;
  dueTime: string;
  done: boolean;
  recurring: boolean;
}

export interface ChatThread {
  id: string;
  leadId: string;
  dealId: string;
  leadName: string;
  avatar: string;
  lastMessage: string;
  timestamp: string;
  unread: number;
  waNumber: string;
  dealValue: number;
  dealStage: string;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  content: string;
  sender: 'lead' | 'agent' | 'ai';
  timestamp: string;
}

export interface Property {
  id: string;
  code: string;
  title: string;
  value: number;
  tourLink: string;
  address: string;
}

export interface WANumber {
  id: string;
  number: string;
  label: string;
  type: 'official' | 'qr';
  agents: string[];
}

export interface AIFlow {
  id: string;
  name: string;
  description: string;
  active: boolean;
  blocks: number;
}

// ========== CUSTOM FIELDS (GoHighLevel model) ==========

export type FieldType =
  | 'text' | 'textarea' | 'number' | 'monetary' | 'phone' | 'email'
  | 'date' | 'datetime' | 'dropdown' | 'multiselect' | 'checkbox'
  | 'radio' | 'url' | 'file' | 'signature' | 'toggle';

export type FieldObject = 'lead' | 'deal' | 'property';

export interface CustomField {
  id: string;
  name: string;
  key: string;
  type: FieldType;
  object: FieldObject;
  required: boolean;
  system: boolean; // true = built-in, cannot delete
  options?: string[]; // for dropdown, multiselect, radio
  placeholder?: string;
  description?: string;
}

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Texto',
  textarea: 'Texto Longo',
  number: 'Número',
  monetary: 'Monetário',
  phone: 'Telefone',
  email: 'E-mail',
  date: 'Data',
  datetime: 'Data e Hora',
  dropdown: 'Lista Suspensa',
  multiselect: 'Seleção Múltipla',
  checkbox: 'Caixa de Seleção',
  radio: 'Opção Única',
  url: 'URL',
  file: 'Arquivo',
  signature: 'Assinatura',
  toggle: 'Liga/Desliga',
};

export const FIELD_OBJECT_LABELS: Record<FieldObject, string> = {
  lead: 'Lead / Contato',
  deal: 'Negócio',
  property: 'Imóvel',
};

export const customFields: CustomField[] = [
  // Lead system fields
  { id: 'cf-l1', name: 'Nome', key: 'name', type: 'text', object: 'lead', required: true, system: true },
  { id: 'cf-l2', name: 'Telefone', key: 'phone', type: 'phone', object: 'lead', required: true, system: true },
  { id: 'cf-l3', name: 'E-mail', key: 'email', type: 'email', object: 'lead', required: false, system: true },
  { id: 'cf-l4', name: 'Origem', key: 'origin', type: 'dropdown', object: 'lead', required: false, system: true, options: ['Facebook Ads', 'Instagram Ads', 'Instagram Reels', 'Google Ads', 'Portal ZAP', 'Indicação', 'YouTube', 'Site', 'Outro'] },
  { id: 'cf-l5', name: 'CPF', key: 'cpf', type: 'text', object: 'lead', required: false, system: false, placeholder: '000.000.000-00' },
  { id: 'cf-l6', name: 'Data de Nascimento', key: 'birth_date', type: 'date', object: 'lead', required: false, system: false },
  { id: 'cf-l7', name: 'Renda Mensal', key: 'monthly_income', type: 'monetary', object: 'lead', required: false, system: false },
  { id: 'cf-l8', name: 'Estado Civil', key: 'marital_status', type: 'dropdown', object: 'lead', required: false, system: false, options: ['Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)', 'União Estável'] },
  { id: 'cf-l9', name: 'Profissão', key: 'profession', type: 'text', object: 'lead', required: false, system: false },
  { id: 'cf-l10', name: 'Endereço', key: 'address', type: 'textarea', object: 'lead', required: false, system: false },
  { id: 'cf-l11', name: 'Tags', key: 'tags', type: 'multiselect', object: 'lead', required: false, system: false, options: ['VIP', 'Investidor', 'Primeiro Imóvel', 'MCMV', 'Alto Padrão', 'Aluguel'] },
  { id: 'cf-l12', name: 'Aceita Comunicação', key: 'opt_in', type: 'toggle', object: 'lead', required: false, system: false },
  { id: 'cf-l13', name: 'Observações', key: 'notes', type: 'textarea', object: 'lead', required: false, system: false },
  { id: 'cf-l14', name: 'Documentos', key: 'documents', type: 'file', object: 'lead', required: false, system: false },
  // Deal system fields
  { id: 'cf-d1', name: 'Nome do Lead', key: 'leadName', type: 'text', object: 'deal', required: true, system: true },
  { id: 'cf-d2', name: 'Imóvel', key: 'property', type: 'text', object: 'deal', required: true, system: true },
  { id: 'cf-d3', name: 'Código do Imóvel', key: 'propertyCode', type: 'text', object: 'deal', required: false, system: true },
  { id: 'cf-d4', name: 'Valor', key: 'value', type: 'monetary', object: 'deal', required: true, system: true },
  { id: 'cf-d5', name: 'Etapa', key: 'stage', type: 'text', object: 'deal', required: true, system: true },
  { id: 'cf-d6', name: 'Probabilidade', key: 'probability', type: 'number', object: 'deal', required: false, system: true },
  { id: 'cf-d7', name: 'Data de Criação', key: 'createdAt', type: 'date', object: 'deal', required: false, system: true },
  { id: 'cf-d8', name: 'Fonte do Lead', key: 'lead_source', type: 'dropdown', object: 'deal', required: false, system: false, options: ['Tráfego Pago', 'Orgânico', 'Indicação', 'Portal', 'Evento'] },
  { id: 'cf-d9', name: 'Tipo de Financiamento', key: 'financing_type', type: 'dropdown', object: 'deal', required: false, system: false, options: ['MCMV', 'SFH', 'SFI', 'À Vista', 'Permuta', 'Consórcio'] },
  { id: 'cf-d10', name: 'Valor da Entrada', key: 'down_payment', type: 'monetary', object: 'deal', required: false, system: false },
  { id: 'cf-d11', name: 'FGTS Disponível', key: 'fgts', type: 'monetary', object: 'deal', required: false, system: false },
  { id: 'cf-d12', name: 'Data Prevista Fechamento', key: 'expected_close', type: 'date', object: 'deal', required: false, system: false },
  { id: 'cf-d13', name: 'Motivo da Perda', key: 'loss_reason', type: 'dropdown', object: 'deal', required: false, system: false, options: ['Preço', 'Concorrência', 'Crédito Reprovado', 'Desistência', 'Localização', 'Outro'] },
  { id: 'cf-d14', name: 'Contrato Assinado', key: 'contract_signed', type: 'toggle', object: 'deal', required: false, system: false },
  { id: 'cf-d15', name: 'Anexos do Negócio', key: 'deal_attachments', type: 'file', object: 'deal', required: false, system: false },
  // Property system fields
  { id: 'cf-p1', name: 'Código', key: 'code', type: 'text', object: 'property', required: true, system: true },
  { id: 'cf-p2', name: 'Título', key: 'title', type: 'text', object: 'property', required: true, system: true },
  { id: 'cf-p3', name: 'Valor', key: 'value', type: 'monetary', object: 'property', required: true, system: true },
  { id: 'cf-p4', name: 'Endereço', key: 'address', type: 'text', object: 'property', required: true, system: true },
  { id: 'cf-p5', name: 'Link Tour Virtual', key: 'tourLink', type: 'url', object: 'property', required: false, system: true },
  { id: 'cf-p6', name: 'Tipo', key: 'property_type', type: 'dropdown', object: 'property', required: false, system: false, options: ['Apartamento', 'Casa', 'Cobertura', 'Loft', 'Studio', 'Sala Comercial', 'Terreno', 'Loja', 'Galpão'] },
  { id: 'cf-p7', name: 'Quartos', key: 'bedrooms', type: 'number', object: 'property', required: false, system: false },
  { id: 'cf-p8', name: 'Banheiros', key: 'bathrooms', type: 'number', object: 'property', required: false, system: false },
  { id: 'cf-p9', name: 'Área (m²)', key: 'area', type: 'number', object: 'property', required: false, system: false },
  { id: 'cf-p10', name: 'Vagas', key: 'parking', type: 'number', object: 'property', required: false, system: false },
  { id: 'cf-p11', name: 'Condomínio', key: 'condo_fee', type: 'monetary', object: 'property', required: false, system: false },
  { id: 'cf-p12', name: 'IPTU', key: 'iptu', type: 'monetary', object: 'property', required: false, system: false },
  { id: 'cf-p13', name: 'Características', key: 'features', type: 'multiselect', object: 'property', required: false, system: false, options: ['Piscina', 'Academia', 'Churrasqueira', 'Varanda', 'Elevador', 'Portaria 24h', 'Pet Friendly', 'Mobiliado'] },
  { id: 'cf-p14', name: 'Status', key: 'status', type: 'dropdown', object: 'property', required: false, system: false, options: ['Disponível', 'Reservado', 'Vendido', 'Alugado', 'Indisponível'] },
  { id: 'cf-p15', name: 'Fotos', key: 'photos', type: 'file', object: 'property', required: false, system: false },
  { id: 'cf-p16', name: 'Descrição', key: 'description', type: 'textarea', object: 'property', required: false, system: false },
  { id: 'cf-p17', name: 'Aceita Permuta', key: 'accepts_trade', type: 'toggle', object: 'property', required: false, system: false },
];

export const LOSS_REASONS = [
  'Preço acima do orçamento',
  'Concorrência',
  'Crédito reprovado',
  'Desistência pessoal',
  'Localização inadequada',
  'Imóvel não atendeu expectativa',
];

export const ACTIVITY_TYPES = {
  call: { label: 'Ligar', icon: 'Phone' },
  proposal: { label: 'Enviar Proposta', icon: 'FileText' },
  visit: { label: 'Visita', icon: 'MapPin' },
  followup: { label: 'Follow-up', icon: 'MessageCircle' },
} as const;

export const LEAD_TEMPERATURES = ['Quente', 'Morno', 'Frio'] as const;

export interface NextStepRecord {
  dealId: string;
  summary: string;
  nextActivityType: keyof typeof ACTIVITY_TYPES;
  nextActivityDate: string;
  nextActivityTime: string;
  nextActivityDescription: string;
  temperature: typeof LEAD_TEMPERATURES[number];
  createdAt: string;
}

// ========== FUNNELS ==========

export const funnels: Funnel[] = [
  {
    id: 'fun-mcmv',
    name: 'MCMV',
    description: 'Minha Casa Minha Vida — Leads de tráfego pago',
    icon: 'Home',
    color: 'hsl(var(--primary))',
    stages: [
      { name: 'Novo Lead', probability: 10, touchpoints: [
        { id: 'tp1', type: 'ai', action: 'Mensagem de boas-vindas', description: 'IA envia saudação automática e pergunta interesse', delayHours: 0, channel: 'whatsapp' },
        { id: 'tp2', type: 'agent', action: 'Ligar para qualificar', description: 'Corretor liga para confirmar interesse e coletar dados', delayHours: 1, channel: 'ligação' },
      ]},
      { name: 'Simulação Crédito', probability: 25, touchpoints: [
        { id: 'tp3', type: 'ai', action: 'Coletar dados financeiros', description: 'IA pergunta renda, entrada e FGTS', delayHours: 0, channel: 'whatsapp' },
        { id: 'tp4', type: 'agent', action: 'Simular na Caixa', description: 'Corretor faz simulação oficial e envia resultado', delayHours: 24, channel: 'whatsapp' },
      ]},
      { name: 'Visita', probability: 50, touchpoints: [
        { id: 'tp5', type: 'agent', action: 'Agendar visita', description: 'Corretor oferece horários disponíveis', delayHours: 0, channel: 'whatsapp' },
        { id: 'tp6', type: 'ai', action: 'Lembrete de visita', description: 'IA envia lembrete 2h antes da visita', delayHours: 0, channel: 'whatsapp' },
      ]},
      { name: 'Proposta', probability: 75, touchpoints: [
        { id: 'tp7', type: 'agent', action: 'Enviar proposta formal', description: 'Corretor envia contrato com valores e condições', delayHours: 0, channel: 'email' },
        { id: 'tp8', type: 'ai', action: 'Follow-up proposta', description: 'IA pergunta se houve dúvidas após 48h', delayHours: 48, channel: 'whatsapp' },
      ]},
      { name: 'Contrato Assinado', probability: 95, touchpoints: [
        { id: 'tp9', type: 'agent', action: 'Colher assinaturas', description: 'Corretor agenda assinatura do contrato', delayHours: 0, channel: 'ligação' },
      ]},
    ],
  },
  {
    id: 'fun-alto',
    name: 'Alto Padrão',
    description: 'Imóveis de alto padrão — Leads de redes sociais',
    icon: 'Crown',
    color: '#F59E0B',
    stages: [
      { name: 'Novo Lead', probability: 10, touchpoints: [
        { id: 'tp10', type: 'ai', action: 'Boas-vindas VIP', description: 'IA envia mensagem personalizada com portfólio', delayHours: 0, channel: 'whatsapp' },
      ]},
      { name: 'Qualificação', probability: 25, touchpoints: [
        { id: 'tp11', type: 'agent', action: 'Reunião de perfil', description: 'Corretor agenda call para entender necessidades', delayHours: 2, channel: 'ligação' },
      ]},
      { name: 'Visita', probability: 50, touchpoints: [
        { id: 'tp12', type: 'agent', action: 'Visita exclusiva', description: 'Corretor acompanha visita presencial ao imóvel', delayHours: 0, channel: 'whatsapp' },
      ]},
      { name: 'Negociação', probability: 75, touchpoints: [
        { id: 'tp13', type: 'agent', action: 'Proposta personalizada', description: 'Corretor prepara proposta sob medida', delayHours: 0, channel: 'email' },
        { id: 'tp14', type: 'ai', action: 'Análise de objeções', description: 'IA sugere argumentos para objeções comuns', delayHours: 0, channel: 'whatsapp' },
      ]},
      { name: 'Fechamento', probability: 90, touchpoints: [
        { id: 'tp15', type: 'agent', action: 'Contrato final', description: 'Corretor envia minuta e agenda assinatura', delayHours: 0, channel: 'email' },
      ]},
    ],
  },
  {
    id: 'fun-aluguel',
    name: 'Aluguel',
    description: 'Leads interessados em alugar imóveis',
    icon: 'Key',
    color: '#8B5CF6',
    stages: [
      { name: 'Novo Lead', probability: 10, touchpoints: [
        { id: 'tp16', type: 'ai', action: 'Boas-vindas aluguel', description: 'IA envia opções de imóveis disponíveis', delayHours: 0, channel: 'whatsapp' },
      ]},
      { name: 'Visita', probability: 40, touchpoints: [
        { id: 'tp17', type: 'agent', action: 'Agendar visita', description: 'Corretor combina horário de visita', delayHours: 0, channel: 'whatsapp' },
      ]},
      { name: 'Análise Documentos', probability: 70, touchpoints: [
        { id: 'tp18', type: 'ai', action: 'Solicitar documentos', description: 'IA envia checklist de documentos necessários', delayHours: 0, channel: 'whatsapp' },
        { id: 'tp19', type: 'agent', action: 'Análise cadastral', description: 'Corretor analisa ficha e documentos', delayHours: 24, channel: 'email' },
      ]},
      { name: 'Contrato', probability: 90, touchpoints: [
        { id: 'tp20', type: 'agent', action: 'Assinatura do contrato', description: 'Corretor envia contrato para assinatura', delayHours: 0, channel: 'email' },
      ]},
    ],
  },
  {
    id: 'fun-inquilinos',
    name: 'Inquilinos',
    description: 'Inquilinos ativos — pós-contrato de aluguel',
    icon: 'Users',
    color: '#06B6D4',
    stages: [
      { name: 'Ativo', probability: 100, touchpoints: [
        { id: 'tp21', type: 'ai', action: 'Pesquisa de satisfação', description: 'IA envia pesquisa mensal de satisfação', delayHours: 720, channel: 'whatsapp' },
      ]},
      { name: 'Renovação', probability: 80, touchpoints: [
        { id: 'tp22', type: 'agent', action: 'Proposta de renovação', description: 'Corretor envia proposta com novo valor', delayHours: 0, channel: 'email' },
        { id: 'tp23', type: 'ai', action: 'Lembrete de renovação', description: 'IA avisa sobre prazo de renovação', delayHours: 0, channel: 'whatsapp' },
      ]},
      { name: 'Rescisão', probability: 10, touchpoints: [
        { id: 'tp24', type: 'agent', action: 'Vistoria de saída', description: 'Corretor agenda vistoria do imóvel', delayHours: 0, channel: 'ligação' },
      ]},
    ],
  },
];

// ========== LEADS ==========

export const leads: Lead[] = [
  { id: 'l1', name: 'Carlos Mendes', phone: '+55 11 98765-4321', avatar: 'CM', origin: 'Facebook Ads' },
  { id: 'l2', name: 'Ana Beatriz Silva', phone: '+55 21 97654-3210', avatar: 'AS', origin: 'Instagram Reels' },
  { id: 'l3', name: 'Roberto Almeida', phone: '+55 11 96543-2109', avatar: 'RA', origin: 'Instagram Ads' },
  { id: 'l4', name: 'Juliana Costa', phone: '+55 21 95432-1098', avatar: 'JC', origin: 'Indicação' },
  { id: 'l5', name: 'Fernando Oliveira', phone: '+55 11 94321-0987', avatar: 'FO', origin: 'Portal ZAP' },
  { id: 'l6', name: 'Mariana Santos', phone: '+55 11 93210-9876', avatar: 'MS', origin: 'Google Ads' },
  { id: 'l7', name: 'Thiago Nascimento', phone: '+55 11 91234-5678', avatar: 'TN', origin: 'Facebook Ads' },
  { id: 'l8', name: 'Patrícia Ferreira', phone: '+55 21 99876-5432', avatar: 'PF', origin: 'YouTube' },
];

// ========== DEALS ==========

export const deals: Deal[] = [
  // MCMV
  { id: 'd1', funnelId: 'fun-mcmv', leadId: 'l1', leadName: 'Carlos Mendes', property: 'Apt 2Q - Res. Jardins, Guarulhos', propertyCode: 'MCM-101', value: 230000, stage: 'Proposta', probability: 75, createdAt: '2024-01-15', secondaryContacts: [{ name: 'Maria Mendes', role: 'Cônjuge' }] },
  { id: 'd2', funnelId: 'fun-mcmv', leadId: 'l7', leadName: 'Thiago Nascimento', property: 'Apt 2Q - Cond. Vida Nova, Osasco', propertyCode: 'MCM-205', value: 198000, stage: 'Simulação Crédito', probability: 25, createdAt: '2024-02-01' },
  { id: 'd3', funnelId: 'fun-mcmv', leadId: 'l5', leadName: 'Fernando Oliveira', property: 'Apt 3Q - Res. Esperança, Campinas', propertyCode: 'MCM-310', value: 265000, stage: 'Novo Lead', probability: 10, createdAt: '2024-02-08' },
  { id: 'd4', funnelId: 'fun-mcmv', leadId: 'l6', leadName: 'Mariana Santos', property: 'Apt 2Q - Cond. Sol Nascente, SP', propertyCode: 'MCM-112', value: 245000, stage: 'Visita', probability: 50, createdAt: '2024-02-10' },
  // Alto Padrão
  { id: 'd5', funnelId: 'fun-alto', leadId: 'l2', leadName: 'Ana Beatriz Silva', property: 'Cobertura Duplex - Ipanema', propertyCode: 'COB-101', value: 2400000, stage: 'Visita', probability: 50, createdAt: '2024-01-20' },
  { id: 'd6', funnelId: 'fun-alto', leadId: 'l3', leadName: 'Roberto Almeida', property: 'Casa 4 suítes - Alphaville', propertyCode: 'CAS-045', value: 1200000, stage: 'Qualificação', probability: 25, createdAt: '2024-02-01' },
  { id: 'd7', funnelId: 'fun-alto', leadId: 'l2', leadName: 'Ana Beatriz Silva', property: 'Penthouse 280m² - Leblon', propertyCode: 'PNT-050', value: 3800000, stage: 'Negociação', probability: 75, createdAt: '2024-01-25', secondaryContacts: [{ name: 'Ricardo Silva', role: 'Cônjuge' }] },
  { id: 'd8', funnelId: 'fun-alto', leadId: 'l8', leadName: 'Patrícia Ferreira', property: 'Mansão Condomínio Fechado - Barra', propertyCode: 'MAN-008', value: 4500000, stage: 'Novo Lead', probability: 10, createdAt: '2024-02-12' },
  // Aluguel
  { id: 'd9', funnelId: 'fun-aluguel', leadId: 'l4', leadName: 'Juliana Costa', property: 'Studio 35m² - Botafogo', propertyCode: 'STU-018', value: 2800, stage: 'Contrato', probability: 90, createdAt: '2024-01-10' },
  { id: 'd10', funnelId: 'fun-aluguel', leadId: 'l1', leadName: 'Carlos Mendes', property: 'Sala Comercial 80m² - Faria Lima', propertyCode: 'COM-220', value: 8500, stage: 'Novo Lead', probability: 10, createdAt: '2024-02-05', secondaryContacts: [{ name: 'Paulo Mendes', role: 'Sócio' }] },
  { id: 'd11', funnelId: 'fun-aluguel', leadId: 'l6', leadName: 'Mariana Santos', property: 'Loft 60m² - Pinheiros', propertyCode: 'LFT-033', value: 4200, stage: 'Visita', probability: 40, createdAt: '2024-02-10' },
  // Inquilinos
  { id: 'd12', funnelId: 'fun-inquilinos', leadId: 'l4', leadName: 'Juliana Costa', property: 'Apt 1Q - Tijuca (aluguel ativo)', propertyCode: 'ALG-044', value: 1800, stage: 'Ativo', probability: 100, createdAt: '2023-06-01' },
  { id: 'd13', funnelId: 'fun-inquilinos', leadId: 'l3', leadName: 'Roberto Almeida', property: 'Sala Comercial - Centro, SP', propertyCode: 'ALG-078', value: 3500, stage: 'Renovação', probability: 80, createdAt: '2023-03-15' },
];

// ========== ACTIVITIES ==========

export const activities: Activity[] = [
  { id: 'a1', type: 'call', title: 'Ligar para Carlos - Proposta MCMV', dealId: 'd1', leadName: 'Carlos Mendes', property: 'Apt 2Q - Res. Jardins', dueDate: '2024-02-12', dueTime: '10:00', done: false, recurring: false },
  { id: 'a2', type: 'visit', title: 'Visita com Ana - Cobertura Ipanema', dealId: 'd5', leadName: 'Ana Beatriz Silva', property: 'Cobertura Duplex', dueDate: '2024-02-12', dueTime: '14:00', done: false, recurring: false },
  { id: 'a3', type: 'followup', title: 'Follow-up Roberto - Enviar fotos Alphaville', dealId: 'd6', leadName: 'Roberto Almeida', property: 'Casa Alphaville', dueDate: '2024-02-11', dueTime: '09:00', done: false, recurring: true },
  { id: 'a4', type: 'proposal', title: 'Enviar contrato Juliana - Studio Botafogo', dealId: 'd9', leadName: 'Juliana Costa', property: 'Studio 35m²', dueDate: '2024-02-12', dueTime: '16:00', done: false, recurring: false },
  { id: 'a5', type: 'call', title: 'Ligar Fernando - Novo lead MCMV', dealId: 'd3', leadName: 'Fernando Oliveira', property: 'Apt 3Q - Campinas', dueDate: '2024-02-10', dueTime: '11:00', done: false, recurring: false },
  { id: 'a6', type: 'followup', title: 'Follow-up Mariana - Loft Pinheiros', dealId: 'd11', leadName: 'Mariana Santos', property: 'Loft 60m²', dueDate: '2024-02-13', dueTime: '10:00', done: true, recurring: false },
];

// ========== CHAT ==========

export const chatThreads: ChatThread[] = [
  { id: 't1', leadId: 'l1', dealId: 'd1', leadName: 'Carlos Mendes', avatar: 'CM', lastMessage: 'Olá, consigo agendar a visita para sábado?', timestamp: '10:32', unread: 2, waNumber: 'Business', dealValue: 230000, dealStage: 'Proposta' },
  { id: 't2', leadId: 'l2', dealId: 'd5', leadName: 'Ana Beatriz Silva', avatar: 'AS', lastMessage: 'Preciso ver as fotos da cobertura', timestamp: '09:15', unread: 0, waNumber: 'Business', dealValue: 2400000, dealStage: 'Visita' },
  { id: 't3', leadId: 'l4', dealId: 'd9', leadName: 'Juliana Costa', avatar: 'JC', lastMessage: 'Vamos fechar! Quando posso assinar?', timestamp: 'Ontem', unread: 1, waNumber: 'QR Code', dealValue: 2800, dealStage: 'Contrato' },
  { id: 't4', leadId: 'l5', dealId: 'd3', leadName: 'Fernando Oliveira', avatar: 'FO', lastMessage: 'Tem algo parecido em Campinas?', timestamp: 'Ontem', unread: 0, waNumber: 'Business', dealValue: 265000, dealStage: 'Novo Lead' },
  { id: 't5', leadId: 'l6', dealId: 'd4', leadName: 'Mariana Santos', avatar: 'MS', lastMessage: 'Qual o valor do condomínio?', timestamp: '07/02', unread: 0, waNumber: 'QR Code', dealValue: 245000, dealStage: 'Visita' },
  { id: 't6', leadId: 'l7', dealId: 'd2', leadName: 'Thiago Nascimento', avatar: 'TN', lastMessage: 'Minha renda é de R$ 4.500, consigo financiar?', timestamp: '08/02', unread: 1, waNumber: 'Business', dealValue: 198000, dealStage: 'Simulação Crédito' },
];

export const chatMessages: ChatMessage[] = [
  { id: 'm1', threadId: 't1', content: 'Boa tarde Carlos! Tudo bem?', sender: 'agent', timestamp: '10:20' },
  { id: 'm2', threadId: 't1', content: 'Boa tarde! Sim, tudo ótimo', sender: 'lead', timestamp: '10:22' },
  { id: 'm3', threadId: 't1', content: '💡 Carlos demonstrou alto interesse. Mencione a condição especial de pagamento para criar urgência. Sugira: "Carlos, temos uma condição exclusiva para fechar até sexta!"', sender: 'ai', timestamp: '10:23' },
  { id: 'm4', threadId: 't1', content: 'Gostaria de saber mais sobre as condições de pagamento do apartamento', sender: 'lead', timestamp: '10:25' },
  { id: 'm5', threadId: 't1', content: 'Claro! Temos entrada facilitada de 20% e financiamento pela Caixa em até 360x pelo MCMV', sender: 'agent', timestamp: '10:28' },
  { id: 'm6', threadId: 't1', content: 'Olá, consigo agendar a visita para sábado?', sender: 'lead', timestamp: '10:32' },
  { id: 'm7', threadId: 't1', content: '🎯 Lead pedindo visita é sinal forte de compra. Confirme horário e prepare material do imóvel. Após visita, envie proposta formal em até 24h.', sender: 'ai', timestamp: '10:32' },
  { id: 'm8', threadId: 't6', content: 'Olá Thiago! Bem-vindo. Vamos verificar seu potencial de financiamento pelo MCMV.', sender: 'agent', timestamp: '14:00' },
  { id: 'm9', threadId: 't6', content: 'Minha renda é de R$ 4.500, consigo financiar?', sender: 'lead', timestamp: '14:05' },
  { id: 'm10', threadId: 't6', content: '📊 Com renda de R$ 4.500, o lead se enquadra na Faixa 2 do MCMV. Parcela máxima estimada: R$ 1.350. Imóvel até R$ 264.000. Sugira simulação na Caixa.', sender: 'ai', timestamp: '14:06' },
];

// ========== PROPERTIES ==========

export const properties: Property[] = [
  { id: 'p1', code: 'MCM-101', title: 'Apt 2Q - Res. Jardins, Guarulhos', value: 230000, tourLink: 'https://tour.example.com/mcm101', address: 'R. das Palmeiras, 500 - Guarulhos, SP' },
  { id: 'p2', code: 'COB-101', title: 'Cobertura Duplex 4 suítes - Ipanema', value: 2400000, tourLink: 'https://tour.example.com/cob101', address: 'R. Prudente de Morais, 800 - Ipanema, RJ' },
  { id: 'p3', code: 'CAS-045', title: 'Casa 4 suítes com piscina - Alphaville', value: 1200000, tourLink: 'https://tour.example.com/cas045', address: 'Alameda Araguaia, 500 - Alphaville, SP' },
  { id: 'p4', code: 'STU-018', title: 'Studio moderno 35m² - Botafogo', value: 2800, tourLink: 'https://tour.example.com/stu018', address: 'R. São Clemente, 300 - Botafogo, RJ' },
  { id: 'p5', code: 'LFT-033', title: 'Loft industrial 60m² - Pinheiros', value: 4200, tourLink: 'https://tour.example.com/lft033', address: 'R. dos Pinheiros, 1500 - Pinheiros, SP' },
  { id: 'p6', code: 'PNT-050', title: 'Penthouse 280m² - Leblon', value: 3800000, tourLink: 'https://tour.example.com/pnt050', address: 'Av. Delfim Moreira, 200 - Leblon, RJ' },
];

export const waNumbers: WANumber[] = [
  { id: 'w1', number: '+55 11 3000-0001', label: 'WhatsApp Business', type: 'official', agents: ['João Silva', 'Maria Oliveira'] },
  { id: 'w2', number: '+55 21 3000-0002', label: 'WA QR Code', type: 'qr', agents: ['Pedro Santos'] },
];

export const aiFlows: AIFlow[] = [
  { id: 'f1', name: 'Follow-up Automático 3 dias', description: 'Envia mensagem de acompanhamento após 3 dias sem resposta', active: true, blocks: 5 },
  { id: 'f2', name: 'Qualificação de Crédito MCMV', description: 'Pergunta renda, entrada disponível e faixa do programa', active: true, blocks: 8 },
  { id: 'f3', name: 'Agendamento de Visita', description: 'Oferece horários e confirma visita automaticamente', active: false, blocks: 4 },
  { id: 'f4', name: 'Envio de Catálogo', description: 'Envia imóveis compatíveis com o perfil do lead', active: true, blocks: 6 },
];

export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).format(value);
};
