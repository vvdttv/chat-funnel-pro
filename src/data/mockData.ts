export interface Lead {
  id: string;
  name: string;
  phone: string;
  avatar: string;
  origin: string;
}

export interface Touchpoint {
  id: string;
  type: 'agent' | 'ai';
  action: string;
  description: string;
  delayHours: number;
  channel: 'whatsapp' | 'email' | 'sms' | 'ligação';
}

export interface FunnelStage {
  name: string;
  probability: number;
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

// ========== FUNNELS ==========

export const funnels: Funnel[] = [
  {
    id: 'fun-mcmv',
    name: 'MCMV',
    description: 'Minha Casa Minha Vida — Leads de tráfego pago',
    icon: 'Home',
    color: 'hsl(var(--primary))',
    stages: [
      { name: 'Novo Lead', probability: 10 },
      { name: 'Simulação Crédito', probability: 25 },
      { name: 'Visita', probability: 50 },
      { name: 'Proposta', probability: 75 },
      { name: 'Contrato Assinado', probability: 95 },
    ],
  },
  {
    id: 'fun-alto',
    name: 'Alto Padrão',
    description: 'Imóveis de alto padrão — Leads de redes sociais',
    icon: 'Crown',
    color: '#F59E0B',
    stages: [
      { name: 'Novo Lead', probability: 10 },
      { name: 'Qualificação', probability: 25 },
      { name: 'Visita', probability: 50 },
      { name: 'Negociação', probability: 75 },
      { name: 'Fechamento', probability: 90 },
    ],
  },
  {
    id: 'fun-aluguel',
    name: 'Aluguel',
    description: 'Leads interessados em alugar imóveis',
    icon: 'Key',
    color: '#8B5CF6',
    stages: [
      { name: 'Novo Lead', probability: 10 },
      { name: 'Visita', probability: 40 },
      { name: 'Análise Documentos', probability: 70 },
      { name: 'Contrato', probability: 90 },
    ],
  },
  {
    id: 'fun-inquilinos',
    name: 'Inquilinos',
    description: 'Inquilinos ativos — pós-contrato de aluguel',
    icon: 'Users',
    color: '#06B6D4',
    stages: [
      { name: 'Ativo', probability: 100 },
      { name: 'Renovação', probability: 80 },
      { name: 'Rescisão', probability: 10 },
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
