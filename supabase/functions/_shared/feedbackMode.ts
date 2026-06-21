// _shared/feedbackMode.ts
// Modo Treinador via WhatsApp (Fase I-B). Máquina de estado do feedback por número.
//
// Fluxo:
//   1. Admin envia "#modofeedback ..." → se número permitido, cria sessão
//      'aguardando_senha' e pede a senha. (NÃO entra no fluxo de lead.)
//   2. Próxima msg = senha → verify_feedback_password_internal. OK → 'ativo'.
//   3. Em 'ativo': cada msg é FEEDBACK. Se não há interpretação pendente, chama
//      ia-feedback (interpret) e mostra o que entendeu + "responda SALVAR p/ gravar".
//      Se há interpretação pendente e a msg é "salvar" → ia-feedback (apply) +
//      pergunta "continuar no modo feedback ou voltar à conversa normal?".
//   4. "conversa normal"/"sair" → encerra a sessão.
//   Timeout: 30 min de inatividade (expires_at).
//
// Retorna { handled:true } quando a mensagem foi tratada como feedback (o webhook
// deve PARAR e não seguir o fluxo de lead). { handled:false } = segue normal.

import { wahaSendText } from "./waha.ts";

const PREFIX = "#modofeedback";

// deno-lint-ignore no-explicit-any
type Admin = any;

interface HandleArgs {
  admin: Admin;
  SUPABASE_URL: string;
  SERVICE_ROLE: string;
  INTERNAL_TOKEN: string;
  phoneE164: string;        // remetente normalizado (+55...)
  text: string;            // texto da mensagem
  replyChatId: string;     // chatId p/ responder via WAHA
  wahaSession?: string | null;
}

async function reply(args: HandleArgs, msg: string) {
  try {
    const cfg = (await import("./waha.ts")).getWahaConfig();
    if (args.wahaSession) cfg.session = args.wahaSession;
    await wahaSendText({ chatId: args.replyChatId, text: msg }, cfg);
  } catch (e) {
    console.error("[feedbackMode] erro ao responder:", e);
  }
}

/**
 * Resolve o funil/etapa-alvo do feedback. Default: funil de IA da org + a etapa
 * mencionada no texto OU 'ia-novo-lead'. (No começo, escopo por etapa — §I-B.)
 * Heurística simples: procura uma stage_id conhecida no texto; senão usa default.
 */
async function resolveTarget(admin: Admin, org: string, text: string): Promise<{ funnel_id: string; stage_id: string } | null> {
  const { data: f } = await admin.from("funnels").select("id").eq("organization_id", org).eq("is_ai_funnel", true).maybeSingle();
  const funnelId = (f as { id?: string } | null)?.id;
  if (!funnelId) return null;
  const { data: stages } = await admin.from("funnel_stages").select("stage_id").eq("funnel_id", funnelId).order("position");
  const known = ((stages ?? []) as Array<{ stage_id: string }>).map((s) => s.stage_id);
  const lower = text.toLowerCase();
  const matched = known.find((s) => lower.includes(s));
  return { funnel_id: funnelId, stage_id: matched ?? "ia-novo-lead" };
}

export async function handleFeedbackMode(args: HandleArgs): Promise<{ handled: boolean }> {
  const { admin, phoneE164, text } = args;
  if (!phoneE164) return { handled: false };
  const now = new Date();
  const trimmed = text.trim();
  const isTrigger = trimmed.toLowerCase().startsWith(PREFIX);

  // Sessão ativa/aguardando p/ este número (não expirada).
  const { data: sess } = await admin
    .from("ia_feedback_sessions")
    .select("id, organization_id, permission_id, status, expires_at, context")
    .eq("phone_e164", phoneE164)
    .in("status", ["aguardando_senha", "ativo"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  // deno-lint-ignore no-explicit-any
  let session: any = sess;
  if (session && new Date(session.expires_at) < now) {
    await admin.from("ia_feedback_sessions").update({ status: "encerrado" }).eq("id", session.id);
    session = null;
  }

  // Sem sessão e sem gatilho → não é modo feedback.
  if (!session && !isTrigger) return { handled: false };

  // --- Gatilho #modofeedback: inicia o fluxo (pede senha) ---
  if (isTrigger && !session) {
    const { data: perm } = await admin
      .from("feedback_permissions")
      .select("id, organization_id")
      .eq("phone_e164", phoneE164)
      .eq("is_active", true)
      .maybeSingle();
    if (!perm) {
      // número sem permissão: ignora silenciosamente o gatilho (segurança).
      console.warn("[feedbackMode] gatilho de número sem permissão:", phoneE164);
      return { handled: true };
    }
    await admin.from("ia_feedback_sessions").insert([{
      organization_id: (perm as { organization_id: string }).organization_id,
      permission_id: (perm as { id: number }).id,
      phone_e164: phoneE164,
      status: "aguardando_senha",
      last_activity_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 30 * 60000).toISOString(),
    }]);
    await reply(args, "🔐 Modo Treinador. Digite sua senha para continuar.");
    return { handled: true };
  }

  if (!session) return { handled: false };

  const bump = { last_activity_at: now.toISOString(), expires_at: new Date(now.getTime() + 30 * 60000).toISOString() };

  // --- Aguardando senha ---
  if (session.status === "aguardando_senha") {
    const { data: ver } = await admin.rpc("verify_feedback_password_internal", { p_phone_e164: phoneE164, p_password: trimmed });
    const ok = Array.isArray(ver) ? ver.length > 0 : !!ver;
    if (!ok) {
      await reply(args, "Senha incorreta. Tente novamente ou envie 'sair'.");
      if (trimmed.toLowerCase() === "sair") {
        await admin.from("ia_feedback_sessions").update({ status: "encerrado" }).eq("id", session.id);
      }
      return { handled: true };
    }
    await admin.from("ia_feedback_sessions").update({ status: "ativo", ...bump }).eq("id", session.id);
    await reply(args, "✅ Modo Treinador ativo. Me diga o que quer ajustar no comportamento da IA (ex.: 'na abertura, seja mais objetiva'). Envie 'sair' para voltar ao normal.");
    return { handled: true };
  }

  // --- Sessão ativa ---
  if (session.status === "ativo") {
    const low = trimmed.toLowerCase();
    // sair / conversa normal
    if (["sair", "conversa normal", "modo de conversa normal", "voltar", "encerrar"].some((k) => low === k || low.includes("conversa normal"))) {
      await admin.from("ia_feedback_sessions").update({ status: "encerrado" }).eq("id", session.id);
      await reply(args, "Saindo do Modo Treinador. Voltei ao atendimento normal. 👍");
      return { handled: true };
    }

    const ctx = session.context ?? {};
    const pending = ctx.pending_payload as Record<string, unknown> | undefined;

    // Há interpretação pendente + usuário confirma salvar
    if (pending && ["salvar", "salva", "confirmar", "confirma", "pode salvar", "sim"].some((k) => low === k || low.includes("salv"))) {
      const tgt = ctx.target as { funnel_id: string; stage_id: string };
      const resp = await fetch(`${args.SUPABASE_URL}/functions/v1/ia-feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-internal-token": args.INTERNAL_TOKEN },
        body: JSON.stringify({
          action: "apply",
          feedback_text: ctx.feedback_text ?? "(via whatsapp)",
          interpreted_summary: ctx.summary ?? null,
          funnel_id: tgt.funnel_id, stage_id: tgt.stage_id,
          organization_id: session.organization_id, channel: "whatsapp",
          payload: pending,
        }),
      });
      const jr = await resp.json().catch(() => ({}));
      const okApply = jr?.ok && jr?.applied;
      await admin.from("ia_feedback_sessions")
        .update({ context: { ...ctx, pending_payload: null }, ...bump })
        .eq("id", session.id);
      await reply(args, okApply
        ? "✅ Salvo! A próxima resposta da IA nesta etapa já vai aplicar esse ajuste.\n\nQuer continuar no Modo Treinador ou voltar à conversa normal?"
        : "Não consegui salvar agora. Pode repetir o ajuste?");
      return { handled: true };
    }

    // Caso contrário: trata a mensagem como NOVO feedback → interpreta.
    const target = await resolveTarget(admin, session.organization_id, trimmed);
    if (!target) { await reply(args, "Não encontrei o funil da IA p/ ajustar. Avise o suporte."); return { handled: true }; }
    const resp = await fetch(`${args.SUPABASE_URL}/functions/v1/ia-feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-token": args.INTERNAL_TOKEN },
      body: JSON.stringify({
        action: "interpret", feedback_text: trimmed,
        funnel_id: target.funnel_id, stage_id: target.stage_id,
        organization_id: session.organization_id, channel: "whatsapp",
      }),
    });
    const jr = await resp.json().catch(() => ({}));
    if (!jr?.ok || !jr?.interpreted) {
      await reply(args, "Não consegui interpretar. Pode reformular o ajuste?");
      return { handled: true };
    }
    await admin.from("ia_feedback_sessions")
      .update({ context: { target, summary: jr.summary, pending_payload: jr.payload, feedback_text: trimmed }, ...bump })
      .eq("id", session.id);
    await reply(args, `Entendi assim (etapa: ${target.stage_id}):\n\n“${jr.summary}”\n\nResponda *SALVAR* para gravar, ou reformule o ajuste.`);
    return { handled: true };
  }

  return { handled: false };
}

