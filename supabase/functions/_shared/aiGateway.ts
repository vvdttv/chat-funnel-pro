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
}

/**
 * Resolve a configuração do gateway a partir das variáveis de ambiente.
 *
 * Variáveis (novas, plug-and-play):
 * - AI_GATEWAY_URL   — ex: https://apibridge.duckdns.org/v1  ou  https://claudecode-vvdttv.duckdns.org/v1
 * - AI_GATEWAY_KEY   — chave do provedor
 * - AI_MODEL_FAST    — ex: google/gemini-2.5-flash, gpt-4o-mini, claude-haiku-4-5
 * - AI_MODEL_SMART   — ex: google/gemini-2.5-pro, gpt-4o, claude-sonnet-4-6
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
  return { baseUrl, apiKey, fastModel, smartModel }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  [key: string]: unknown
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

  return await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}
