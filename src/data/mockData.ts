export interface Lead {
  id: string;
  name: string;
  phone: string;
  avatar: string;
  origin: string;
}

export interface Deal {
  id: string;
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

export const STAGES = ['Novos', 'Qualificação', 'Visita', 'Proposta', 'Fechamento'] as const;

export const STAGE_PROBABILITIES: Record<string, number> = {
  'Novos': 10,
  'Qualificação': 25,
  'Visita': 50,
  'Proposta': 75,
  'Fechamento': 90,
};

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

export const leads: Lead[] = [
  { id: 'l1', name: 'Carlos Mendes', phone: '+55 11 98765-4321', avatar: 'CM', origin: 'WhatsApp Business' },
  { id: 'l2', name: 'Ana Beatriz Silva', phone: '+55 21 97654-3210', avatar: 'AS', origin: 'Site Imobiliária' },
  { id: 'l3', name: 'Roberto Almeida', phone: '+55 11 96543-2109', avatar: 'RA', origin: 'Instagram Ads' },
  { id: 'l4', name: 'Juliana Costa', phone: '+55 21 95432-1098', avatar: 'JC', origin: 'Indicação' },
  { id: 'l5', name: 'Fernando Oliveira', phone: '+55 11 94321-0987', avatar: 'FO', origin: 'Portal ZAP' },
  { id: 'l6', name: 'Mariana Santos', phone: '+55 11 93210-9876', avatar: 'MS', origin: 'WhatsApp QR' },
];

export const deals: Deal[] = [
  { id: 'd1', leadId: 'l1', leadName: 'Carlos Mendes', property: 'Apt 302 - Ed. Aurora, Vila Mariana', propertyCode: 'APT-302', value: 850000, stage: 'Proposta', probability: 75, createdAt: '2024-01-15', secondaryContacts: [{ name: 'Maria Mendes', role: 'Cônjuge' }] },
  { id: 'd2', leadId: 'l2', leadName: 'Ana Beatriz Silva', property: 'Cobertura Duplex - Ipanema', propertyCode: 'COB-101', value: 2400000, stage: 'Visita', probability: 50, createdAt: '2024-01-20' },
  { id: 'd3', leadId: 'l3', leadName: 'Roberto Almeida', property: 'Casa 4 suítes - Alphaville', propertyCode: 'CAS-045', value: 1200000, stage: 'Qualificação', probability: 25, createdAt: '2024-02-01' },
  { id: 'd4', leadId: 'l1', leadName: 'Carlos Mendes', property: 'Sala Comercial 80m² - Faria Lima', propertyCode: 'COM-220', value: 650000, stage: 'Novos', probability: 10, createdAt: '2024-02-05', secondaryContacts: [{ name: 'Paulo Mendes', role: 'Sócio' }] },
  { id: 'd5', leadId: 'l4', leadName: 'Juliana Costa', property: 'Studio 35m² - Botafogo', propertyCode: 'STU-018', value: 480000, stage: 'Fechamento', probability: 90, createdAt: '2024-01-10' },
  { id: 'd6', leadId: 'l5', leadName: 'Fernando Oliveira', property: 'Apt 3 quartos - Moema', propertyCode: 'APT-155', value: 720000, stage: 'Novos', probability: 10, createdAt: '2024-02-08' },
  { id: 'd7', leadId: 'l6', leadName: 'Mariana Santos', property: 'Loft 60m² - Pinheiros', propertyCode: 'LFT-033', value: 550000, stage: 'Qualificação', probability: 25, createdAt: '2024-02-10' },
  { id: 'd8', leadId: 'l2', leadName: 'Ana Beatriz Silva', property: 'Casa Condomínio - Barra', propertyCode: 'CAS-112', value: 1850000, stage: 'Proposta', probability: 75, createdAt: '2024-01-25' },
];

export const activities: Activity[] = [
  { id: 'a1', type: 'call', title: 'Ligar para Carlos - Proposta apt', dealId: 'd1', leadName: 'Carlos Mendes', property: 'Apt 302 - Ed. Aurora', dueDate: '2024-02-12', dueTime: '10:00', done: false, recurring: false },
  { id: 'a2', type: 'visit', title: 'Visita com Ana - Cobertura Ipanema', dealId: 'd2', leadName: 'Ana Beatriz Silva', property: 'Cobertura Duplex', dueDate: '2024-02-12', dueTime: '14:00', done: false, recurring: false },
  { id: 'a3', type: 'followup', title: 'Follow-up Roberto - Enviar fotos', dealId: 'd3', leadName: 'Roberto Almeida', property: 'Casa Alphaville', dueDate: '2024-02-11', dueTime: '09:00', done: false, recurring: true },
  { id: 'a4', type: 'proposal', title: 'Enviar proposta Juliana - Studio', dealId: 'd5', leadName: 'Juliana Costa', property: 'Studio 35m²', dueDate: '2024-02-12', dueTime: '16:00', done: false, recurring: false },
  { id: 'a5', type: 'call', title: 'Ligar Fernando - Qualificação', dealId: 'd6', leadName: 'Fernando Oliveira', property: 'Apt Moema', dueDate: '2024-02-10', dueTime: '11:00', done: false, recurring: false },
  { id: 'a6', type: 'followup', title: 'Follow-up Mariana - Loft docs', dealId: 'd7', leadName: 'Mariana Santos', property: 'Loft 60m²', dueDate: '2024-02-13', dueTime: '10:00', done: true, recurring: false },
];

export const chatThreads: ChatThread[] = [
  { id: 't1', leadId: 'l1', leadName: 'Carlos Mendes', avatar: 'CM', lastMessage: 'Olá, consigo agendar a visita para sábado?', timestamp: '10:32', unread: 2, waNumber: 'Business', dealValue: 850000, dealStage: 'Proposta' },
  { id: 't2', leadId: 'l2', leadName: 'Ana Beatriz Silva', avatar: 'AS', lastMessage: 'Preciso ver as fotos da cobertura', timestamp: '09:15', unread: 0, waNumber: 'Business', dealValue: 2400000, dealStage: 'Visita' },
  { id: 't3', leadId: 'l4', leadName: 'Juliana Costa', avatar: 'JC', lastMessage: 'Vamos fechar! Quando posso assinar?', timestamp: 'Ontem', unread: 1, waNumber: 'QR Code', dealValue: 480000, dealStage: 'Fechamento' },
  { id: 't4', leadId: 'l5', leadName: 'Fernando Oliveira', avatar: 'FO', lastMessage: 'Tem algo parecido em Moema?', timestamp: 'Ontem', unread: 0, waNumber: 'Business', dealValue: 720000, dealStage: 'Novos' },
  { id: 't5', leadId: 'l6', leadName: 'Mariana Santos', avatar: 'MS', lastMessage: 'Qual o valor do condomínio?', timestamp: '07/02', unread: 0, waNumber: 'QR Code', dealValue: 550000, dealStage: 'Qualificação' },
];

export const chatMessages: ChatMessage[] = [
  { id: 'm1', threadId: 't1', content: 'Boa tarde Carlos! Tudo bem?', sender: 'agent', timestamp: '10:20' },
  { id: 'm2', threadId: 't1', content: 'Boa tarde! Sim, tudo ótimo', sender: 'lead', timestamp: '10:22' },
  { id: 'm3', threadId: 't1', content: '💡 Carlos demonstrou alto interesse. Mencione a condição especial de pagamento para criar urgência. Sugira: "Carlos, temos uma condição exclusiva para fechar até sexta!"', sender: 'ai', timestamp: '10:23' },
  { id: 'm4', threadId: 't1', content: 'Gostaria de saber mais sobre as condições de pagamento do apartamento', sender: 'lead', timestamp: '10:25' },
  { id: 'm5', threadId: 't1', content: 'Claro! Temos entrada facilitada de 20% e financiamento direto com a construtora em até 120x', sender: 'agent', timestamp: '10:28' },
  { id: 'm6', threadId: 't1', content: 'Olá, consigo agendar a visita para sábado?', sender: 'lead', timestamp: '10:32' },
  { id: 'm7', threadId: 't1', content: '🎯 Lead pedindo visita é sinal forte de compra. Confirme horário e prepare material do imóvel. Após visita, envie proposta formal em até 24h.', sender: 'ai', timestamp: '10:32' },
];

export const properties: Property[] = [
  { id: 'p1', code: 'APT-302', title: 'Apartamento 3 quartos - Ed. Aurora', value: 850000, tourLink: 'https://tour.example.com/apt302', address: 'R. Domingos de Morais, 1200 - Vila Mariana, SP' },
  { id: 'p2', code: 'COB-101', title: 'Cobertura Duplex 4 suítes', value: 2400000, tourLink: 'https://tour.example.com/cob101', address: 'R. Prudente de Morais, 800 - Ipanema, RJ' },
  { id: 'p3', code: 'CAS-045', title: 'Casa 4 suítes com piscina', value: 1200000, tourLink: 'https://tour.example.com/cas045', address: 'Alameda Araguaia, 500 - Alphaville, SP' },
  { id: 'p4', code: 'STU-018', title: 'Studio moderno 35m²', value: 480000, tourLink: 'https://tour.example.com/stu018', address: 'R. São Clemente, 300 - Botafogo, RJ' },
  { id: 'p5', code: 'APT-155', title: 'Apartamento 3 quartos reformado', value: 720000, tourLink: '', address: 'Al. dos Maracatins, 780 - Moema, SP' },
  { id: 'p6', code: 'LFT-033', title: 'Loft industrial 60m²', value: 550000, tourLink: 'https://tour.example.com/lft033', address: 'R. dos Pinheiros, 1500 - Pinheiros, SP' },
];

export const waNumbers: WANumber[] = [
  { id: 'w1', number: '+55 11 3000-0001', label: 'WhatsApp Business', type: 'official', agents: ['João Silva', 'Maria Oliveira'] },
  { id: 'w2', number: '+55 21 3000-0002', label: 'WA QR Code', type: 'qr', agents: ['Pedro Santos'] },
];

export const aiFlows: AIFlow[] = [
  { id: 'f1', name: 'Follow-up Automático 3 dias', description: 'Envia mensagem de acompanhamento após 3 dias sem resposta', active: true, blocks: 5 },
  { id: 'f2', name: 'Qualificação de Crédito', description: 'Pergunta renda, entrada disponível e prazo desejado', active: true, blocks: 8 },
  { id: 'f3', name: 'Agendamento de Visita', description: 'Oferece horários e confirma visita automaticamente', active: false, blocks: 4 },
  { id: 'f4', name: 'Envio de Catálogo', description: 'Envia imóveis compatíveis com o perfil do lead', active: true, blocks: 6 },
];

export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).format(value);
};
