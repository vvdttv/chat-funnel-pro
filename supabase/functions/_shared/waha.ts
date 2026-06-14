// _shared/waha.ts
// Camada de integração com o WAHA (WhatsApp HTTP API, engine WEBJS) — Omnimob.
//
// Objetivo: centralizar config + envio de mensagens + resolução de LID, para
// que `whatsapp-webhook` (recebimento) e `send-whatsapp-message` (envio)
// reusem a mesma lógica sem duplicar fetch/headers/parsing.
//
// O WAHA é o canal NÃO-oficial (dentro da janela de 24h). O canal oficial
// (Meta Cloud API, 1º contato/fora da janela) é tratado em send-whatsapp-message.
//
// Endpoints WAHA (confirmados na doc devlike.pro):
//   POST /api/sendText   { session, chatId, text }
//   POST /api/sendImage  { session, chatId, file:{url,mimetype,filename}, caption }
//   POST /api/sendFile   { session, chatId, file:{url,mimetype,filename}, caption }
//   GET  /api/contacts?session=&contactId=<lid>   → resolve LID → número real
// Header de auth: X-Api-Key. chatId de usuário: <numero>@c.us.

export interface WahaConfig {
  /** Base URL da API WAHA (sem barra final). Ex.: https://evolution-api-enermac.duckdns.org */
  apiUrl: string
  /** API key do WAHA (header X-Api-Key). */
  apiKey: string
  /** Nome da sessão WAHA. Ex.: 'default'. */
  session: string
}

/**
 * Resolve a config do WAHA a partir das variáveis de ambiente do edge-runtime.
 *
 * - WAHA_API_URL  — base URL da API (pública HTTPS preferida)
 * - WAHA_API_KEY  — chave do header X-Api-Key
 * - WAHA_SESSION  — nome da sessão (default: 'default')
 */
export function getWahaConfig(): WahaConfig {
  const apiUrl = Deno.env.get('WAHA_API_URL')?.replace(/\/+$/, '') ?? ''
  const apiKey = Deno.env.get('WAHA_API_KEY') ?? ''
  const session = Deno.env.get('WAHA_SESSION') ?? 'default'
  return { apiUrl, apiKey, session }
}

/** Converte um identificador de telefone em chatId do WAHA (<numero>@c.us). */
export function toChatId(idOrPhone: string): string {
  const v = String(idOrPhone).trim()
  // já é um chatId/grupo/lid — não mexe
  if (v.includes('@')) return v
  // remove tudo que não é dígito e adiciona o sufixo de usuário
  const digits = v.replace(/\D/g, '')
  return `${digits}@c.us`
}

export interface WahaContact {
  /** chatId resolvido, ex.: '5514998236041@c.us'. */
  id: string
  /** número sem sufixo, ex.: '5514998236041'. */
  number: string
  /** telefone em E.164 (com +), derivado de number. */
  phoneE164: string
}

/**
 * Resolve um LID do WhatsApp (ex.: '86775989030954@lid') para o contato real
 * via `GET /api/contacts`. Retorna null se não conseguir resolver.
 *
 * O WhatsApp passou a usar LID (Linked ID) opaco no campo `from`; ele NÃO é o
 * telefone. Sempre resolver antes de localizar o lead_channels.
 */
export async function resolveWahaContact(
  contactId: string,
  config: WahaConfig = getWahaConfig(),
): Promise<WahaContact | null> {
  if (!config.apiUrl || !config.apiKey) return null
  try {
    const url =
      `${config.apiUrl}/api/contacts` +
      `?session=${encodeURIComponent(config.session)}` +
      `&contactId=${encodeURIComponent(contactId)}`
    const resp = await fetch(url, {
      method: 'GET',
      headers: { 'X-Api-Key': config.apiKey, 'Accept': 'application/json' },
    })
    if (!resp.ok) {
      console.error('[waha] resolveWahaContact não-ok:', resp.status)
      return null
    }
    const data = await resp.json()
    const id: string | undefined = data?.id ?? data?.chatId
    if (!id) return null
    const number = String(id).split('@')[0].replace(/\D/g, '')
    if (!number) return null
    return { id, number, phoneE164: `+${number}` }
  } catch (e) {
    console.error('[waha] resolveWahaContact erro:', e)
    return null
  }
}

export interface WahaSendResult {
  ok: boolean
  /** id da mensagem no WAHA, para correlação/dedup. */
  externalId?: string
  status: number
  error?: string
  raw?: unknown
}

/** Extrai o id da mensagem do retorno do WAHA (varia conforme versão). */
function extractMessageId(data: unknown): string | undefined {
  const d = data as Record<string, any> | null
  return (
    d?.id?._serialized ??
    d?.id?.id ??
    (typeof d?.id === 'string' ? d.id : undefined) ??
    d?.key?.id ??
    undefined
  )
}

async function wahaPost(
  path: string,
  body: Record<string, unknown>,
  config: WahaConfig,
): Promise<WahaSendResult> {
  if (!config.apiUrl || !config.apiKey) {
    return { ok: false, status: 0, error: 'waha_nao_configurado' }
  }
  try {
    const resp = await fetch(`${config.apiUrl}${path}`, {
      method: 'POST',
      headers: {
        'X-Api-Key': config.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const text = await resp.text()
    let data: unknown = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = text
    }
    if (!resp.ok) {
      console.error('[waha] POST', path, 'não-ok:', resp.status, text)
      return { ok: false, status: resp.status, error: `waha_${resp.status}`, raw: data }
    }
    return { ok: true, status: resp.status, externalId: extractMessageId(data), raw: data }
  } catch (e) {
    console.error('[waha] POST', path, 'erro:', e)
    return { ok: false, status: 0, error: e instanceof Error ? e.message : 'erro_desconhecido' }
  }
}

/** Envia mensagem de texto via WAHA. */
export async function wahaSendText(
  args: { chatId: string; text: string },
  config: WahaConfig = getWahaConfig(),
): Promise<WahaSendResult> {
  return await wahaPost(
    '/api/sendText',
    { session: config.session, chatId: toChatId(args.chatId), text: args.text },
    config,
  )
}

export interface WahaMediaFile {
  url: string
  mimetype?: string
  filename?: string
}

/** Envia imagem (por URL pública) via WAHA. */
export async function wahaSendImage(
  args: { chatId: string; file: WahaMediaFile; caption?: string },
  config: WahaConfig = getWahaConfig(),
): Promise<WahaSendResult> {
  return await wahaPost(
    '/api/sendImage',
    {
      session: config.session,
      chatId: toChatId(args.chatId),
      file: args.file,
      ...(args.caption ? { caption: args.caption } : {}),
    },
    config,
  )
}

/** Envia documento/arquivo (por URL pública) via WAHA. */
export async function wahaSendFile(
  args: { chatId: string; file: WahaMediaFile; caption?: string },
  config: WahaConfig = getWahaConfig(),
): Promise<WahaSendResult> {
  return await wahaPost(
    '/api/sendFile',
    {
      session: config.session,
      chatId: toChatId(args.chatId),
      file: args.file,
      ...(args.caption ? { caption: args.caption } : {}),
    },
    config,
  )
}
