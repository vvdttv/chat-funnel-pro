/**
 * Edge `extract-devolutiva-attachment` — extração assistida por IA (Fase 3B).
 *
 * O correspondente sobe um anexo (foto/PDF da devolutiva bancária) e pede para a
 * IA pré-ler os dados. Esta função:
 *   1. valida o JWT do usuário (atendente dono da análise OU admin/superadmin);
 *   2. baixa o arquivo do bucket whatsapp-media-public (service role);
 *   3. se PDF -> converte para PNG via mupdf (_shared/pdf.ts; fallback gracioso);
 *   4. manda a(s) imagem(ns) ao gateway de visão com tool-calling para extrair
 *      { approved_financing_amount, requires_entry, conditions, raw_text };
 *   5. grava em credit_analyses.extracted_data (via RPC M2M) e DEVOLVE ao front.
 *
 * IMPORTANTE: a extração é ASSISTIVA. O correspondente confirma/edita os valores
 * antes de submeter a devolutiva. O match NUNCA depende desta extração — se ela
 * falhar, o correspondente preenche na mão.
 *
 * Gateway: lê IMAGEM (image_url), NÃO lê PDF — por isso convertemos PDF->imagem.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  aiChatCompletion,
  getAIGatewayConfig,
  imageUrlBlock,
  textBlock,
  type ChatMessage,
  type ContentBlock,
} from "../_shared/aiGateway.ts";
import { pdfToPngBase64, uint8ToBase64 } from "../_shared/pdf.ts";

// Endpoint chamado pelo front (browser) — CORS sem "*", lista de headers fixa.
const ALLOWED_ORIGIN = Deno.env.get("FRONTEND_ORIGIN") ?? "https://chat-funnel-pro.duckdns.org";
const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const BUCKET = "whatsapp-media-public";
const MAX_BYTES = 25 * 1024 * 1024;
const IMAGE_MIMES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const PDF_MIME = "application/pdf";

interface Body {
  analysis_id: string;
  /** Caminho do arquivo dentro do bucket whatsapp-media-public. */
  document_path: string;
  mime_type?: string;
}

interface Extracted {
  approved_financing_amount: number | null;
  requires_entry: boolean | null;
  conditions: string | null;
  raw_text: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "metodo_invalido" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "sem_token" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    // H6: valida env sem vazar nomes de variáveis na resposta.
    if (!supabaseUrl || !anonKey || !serviceKey) {
      console.error("[extract-devolutiva] env ausente (url/anon/service)");
      return json({ error: "configuracao_invalida" }, 500);
    }

    // Client com o JWT do usuário — respeita RLS para validar posse da análise.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "nao_autenticado" }, 401);

    const { analysis_id, document_path, mime_type } = (await req.json()) as Body;
    if (!analysis_id || !document_path) {
      return json({ error: "analysis_id e document_path obrigatórios" }, 400);
    }
    // M6: valida formato UUID antes de tocar no banco.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(analysis_id)) {
      return json({ error: "analysis_id_invalido" }, 400);
    }

    // Validação de posse: SELECT via RLS. Se o usuário não pode ver a análise,
    // retorna 0 linhas. (RLS de credit_analyses já é org+role-scoped na 2C.)
    const { data: analysis, error: aErr } = await userClient
      .from("credit_analyses")
      .select("id, organization_id")
      .eq("id", analysis_id)
      .maybeSingle();
    if (aErr) return json({ error: "erro_consulta_analise" }, 500);
    if (!analysis) return json({ error: "analise_nao_encontrada_ou_sem_acesso" }, 403);

    const orgId = analysis.organization_id as string;

    // H2: normaliza o path (resolve ../) antes de validar o prefixo da org.
    const normalizedPath = new URL(document_path, "file:///").pathname.slice(1);
    if (!normalizedPath.startsWith(`${orgId}/`)) {
      return json({ error: "documento_fora_da_org" }, 403);
    }

    // Download do arquivo com service role (bucket é público mas baixamos server-side).
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: blob, error: dErr } = await admin.storage.from(BUCKET).download(normalizedPath);
    if (dErr || !blob) return json({ error: "falha_download_documento" }, 404);

    // H1: rejeita por tamanho ANTES de materializar o buffer (anti-OOM).
    if (blob.size > MAX_BYTES) return json({ error: "documento_muito_grande" }, 413);
    const bytes = new Uint8Array(await blob.arrayBuffer());

    // H3: confia primeiro no MIME real do blob; mime_type do cliente é só fallback
    // quando o storage não informa (ou informa genérico octet-stream).
    const blobMime = (blob.type || "").split(";")[0].trim().toLowerCase();
    const clientMime = (mime_type || "").split(";")[0].trim().toLowerCase();
    const mime = (blobMime && blobMime !== "application/octet-stream") ? blobMime : clientMime;
    // SVG explicitamente rejeitado (pode carregar script).
    if (mime === "image/svg+xml") return json({ error: "svg_nao_permitido" }, 415);

    // Monta os blocos de imagem (PDF -> PNG; imagem -> direto).
    const imageBlocks: ContentBlock[] = [];
    if (mime === PDF_MIME) {
      const pngs = await pdfToPngBase64(bytes, { maxPages: 3 });
      if (pngs.length === 0) {
        // Fallback gracioso: não conseguimos converter — front preenche manual.
        return json({
          ok: false,
          fallback: true,
          reason: "pdf_conversao_falhou",
          extracted: null,
        });
      }
      for (const b64 of pngs) imageBlocks.push(imageUrlBlock(`data:image/png;base64,${b64}`));
    } else if (IMAGE_MIMES.has(mime)) {
      const b64 = uint8ToBase64(bytes);
      const normMime = mime === "image/jpg" ? "image/jpeg" : mime;
      imageBlocks.push(imageUrlBlock(`data:${normMime};base64,${b64}`));
    } else {
      return json({ error: "tipo_nao_suportado", mime }, 415);
    }

    const aiConfig = getAIGatewayConfig();
    if (!aiConfig.apiKey) return json({ error: "gateway_nao_configurado" }, 500);

    // Tool-calling para forçar saída estruturada.
    const tools = [{
      type: "function",
      function: {
        name: "report_devolutiva_data",
        description:
          "Reporta os dados extraídos da devolutiva de crédito imobiliário (MCMV).",
        parameters: {
          type: "object",
          properties: {
            approved_financing_amount: {
              type: ["number", "null"],
              description:
                "Valor de financiamento APROVADO pelo banco, em reais (apenas o número, sem R$ nem separadores). Null se não constar.",
            },
            requires_entry: {
              type: ["boolean", "null"],
              description:
                "true se a aprovação exige entrada/recursos próprios do comprador; false se cobre 100%; null se não der para saber.",
            },
            conditions: {
              type: ["string", "null"],
              description: "Condições/observações da aprovação, se houver. Null se não houver.",
            },
            raw_text: {
              type: ["string", "null"],
              description: "Texto relevante lido do documento (resumo), para conferência humana.",
            },
          },
          required: ["approved_financing_amount", "requires_entry", "conditions", "raw_text"],
          additionalProperties: false,
        },
      },
    }];

    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "Você lê devolutivas de crédito imobiliário (financiamento MCMV) no Brasil. " +
          "Extraia EXATAMENTE o que está no documento. Para o valor aprovado, devolva apenas o número em reais " +
          "(ex.: 250000 para R$ 250.000,00). Se um campo não constar no documento, devolva null. " +
          "NÃO invente valores. Sempre chame a função report_devolutiva_data.",
      },
      {
        role: "user",
        content: [
          textBlock("Extraia os dados desta devolutiva de crédito:"),
          ...imageBlocks,
        ],
      },
    ];

    const resp = await aiChatCompletion({
      config: aiConfig,
      tier: "smart",
      messages,
      tools,
      tool_choice: { type: "function", function: { name: "report_devolutiva_data" } },
      temperature: 0,
    });

    if (!resp.ok) {
      const errText = (await resp.text()).slice(0, 500);
      console.error("[extract-devolutiva] gateway erro:", resp.status, errText);
      return json({ ok: false, fallback: true, reason: `gateway_${resp.status}`, extracted: null });
    }

    const data = await resp.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    let extracted: Extracted | null = null;
    if (toolCall?.function?.arguments) {
      try {
        const args = JSON.parse(toolCall.function.arguments);
        extracted = {
          approved_financing_amount:
            typeof args.approved_financing_amount === "number" ? args.approved_financing_amount : null,
          requires_entry: typeof args.requires_entry === "boolean" ? args.requires_entry : null,
          conditions: typeof args.conditions === "string" ? args.conditions : null,
          raw_text: typeof args.raw_text === "string" ? args.raw_text : null,
        };
      } catch (e) {
        console.error("[extract-devolutiva] parse tool args falhou:", e);
      }
    }

    if (!extracted) {
      return json({ ok: false, fallback: true, reason: "sem_extracao", extracted: null });
    }

    // Persiste o que foi extraído (M2M; correspondente confirma/edita depois).
    const { error: rpcErr } = await admin.rpc("save_devolutiva_extraction_internal", {
      p_analysis_id: analysis_id,
      p_org: orgId,
      p_extracted: extracted,
    });
    // C1: se a persistência falhar, NÃO reportar sucesso — front trata como
    // não-salvo (preenche o form mas sabe que precisa salvar ao submeter).
    if (rpcErr) {
      console.error("[extract-devolutiva] save RPC erro:", rpcErr);
      return json({ ok: false, fallback: true, reason: "rpc_save_failed", extracted });
    }

    return json({ ok: true, extracted });
  } catch (e) {
    console.error("[extract-devolutiva] erro:", e);
    return json({ error: e instanceof Error ? e.message : "erro_desconhecido" }, 500);
  }
});
