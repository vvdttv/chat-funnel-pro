// _shared/aiGateway.ts
// Camada de abstração de gateway de IA plug-and-play (Omnimob).
//
// Objetivo: desacoplar as edge functions de um provedor específico (antes
// hardcoded em ai.gateway.lovable.dev). O provedor, a chave e os modelos
// passam a vir de variáveis de ambiente, podendo apontar para kiro-gateway,
// API Bridge, ou qualquer endpoint OpenAI-compatible (Google, Anthropic via
// proxy, OpenAI, Moonshot, Qwen, etc.) sem alterar código.
//
// Compatibilidade retroativa: se as novas variáveis não estiverem definidas,
// faz fallback para o gateway Lovable e a chave LOVABLE_API_KEY, preservando
// exatamente o comportamento anterior.

export interface AIGatewayConfig {
  /** Base URL do endpoint OpenAI-compatible (sem /chat/completions). */
  baseUrl: string
  /** Bearer token / API key do provedor. */
  apiKey: string
  /** Modelo para tarefas rápidas/baratas (detecção, classificação). */
  fastModel: string
  /** Modelo para tarefas de raciocínio (geração de resposta, composição). */
  smartModel: string
  /** Esforço de raciocínio (reasoning_effort): 'low' | 'medium' | 'high' | ''. Vazio = não envia. */
  reasoningEffort: string
}

/**
 * Resolve a configuração do gateway a partir das variáveis de ambiente.
 *
 * Variáveis (novas, plug-and-play):
 * - AI_GATEWAY_URL      — ex: https://claudecode-vvdttv.duckdns.org/v1
 * - AI_GATEWAY_KEY      — chave do provedor
 * - AI_MODEL_FAST       — ex: claude-sonnet-4.6
 * - AI_MODEL_SMART      — ex: claude-sonnet-4.6
 * - AI_REASONING_EFFORT — low | medium | high (default 'medium'; vazio desliga)
 *
 * Fallback (legado Lovable) quando as novas não existem.
 */
export function getAIGatewayConfig(): AIGatewayConfig {
  const baseUrl =
    Deno.env.get('AI_GATEWAY_URL')?.replace(/\/+$/, '') ??
    'https://ai.gateway.lovable.dev/v1'
  const apiKey =
    Deno.env.get('AI_GATEWAY_KEY') ??
    Deno.env.get('LOVABLE_API_KEY') ??
    ''
  const fastModel = Deno.env.get('AI_MODEL_FAST') ?? 'google/gemini-2.5-flash'
  const smartModel = Deno.env.get('AI_MODEL_SMART') ?? 'google/gemini-2.5-pro'
  const reasoningEffort = Deno.env.get('AI_REASONING_EFFORT') ?? 'medium'
  return { baseUrl, apiKey, fastModel, smartModel, reasoningEffort }
}

/**
 * Bloco de conteúdo multimodal (formato OpenAI-compatible).
 * O kiro-gateway aceita `image_url` com data URL base64 (validado empiricamente).
 * PDF NÃO é suportado pelo gateway — converter para imagem antes (ver _shared/pdf.ts).
 */
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  /** Texto simples (caso comum) ou array de blocos multimodais (texto + imagem). */
  content: string | ContentBlock[]
  [key: string]: unknown
}

/**
 * Helper: monta um bloco de imagem a partir de um data URL
 * (ex.: `data:image/png;base64,iVBOR...`).
 */
export function imageUrlBlock(dataUrl: string): ContentBlock {
  return { type: 'image_url', image_url: { url: dataUrl } }
}

/** Helper: bloco de texto. */
export function textBlock(text: string): ContentBlock {
  return { type: 'text', text }
}

export interface ChatCompletionOptions {
  /** 'fast' usa fastModel, 'smart' usa smartModel. Ignorado se `model` for passado. */
  tier?: 'fast' | 'smart'
  /** Sobrescreve o modelo resolvido pelo tier. */
  model?: string
  messages: ChatMessage[]
  tools?: unknown[]
  tool_choice?: unknown
  temperature?: number
  /** Sobrescreve o reasoning_effort da config. Passe '' para desligar nesta chamada. */
  reasoningEffort?: string
  /** Config já resolvida; se ausente, é resolvida de env. */
  config?: AIGatewayConfig
}

/**
 * Chama o endpoint de chat completions do gateway configurado.
 * Retorna a resposta `fetch` crua para que o chamador trate status
 * (429 rate_limited, 402 sem_creditos, etc.) como já faz hoje.
 */
export async function aiChatCompletion(
  opts: ChatCompletionOptions,
): Promise<Response> {
  const config = opts.config ?? getAIGatewayConfig()
  const model =
    opts.model ?? (opts.tier === 'smart' ? config.smartModel : config.fastModel)

  const body: Record<string, unknown> = {
    model,
    messages: opts.messages,
  }
  if (opts.tools) body.tools = opts.tools
  if (opts.tool_choice) body.tool_choice = opts.tool_choice
  if (typeof opts.temperature === 'number') body.temperature = opts.temperature
  // reasoning_effort: usa o override da chamada ou o default da config; vazio não envia.
  const effort = opts.reasoningEffort ?? config.reasoningEffort
  if (effort) body.reasoning_effort = effort

  return await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}
