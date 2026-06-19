/**
 * Edge function: send-email-notification
 * Envia e-mails transacionais via Resend (ou mock se API key ausente).
 * Templates: briefing | devolutiva | lembrete | welcome | generic
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface EmailRequest {
  organization_id?: string;
  deal_id?: string;
  template: "briefing" | "devolutiva" | "lembrete" | "welcome" | "generic";
  to_email: string;
  to_name?: string;
  subject?: string;
  data?: Record<string, unknown>;
}

const TEMPLATES: Record<string, (data: Record<string, unknown>) => { html: string; text: string; subject: string }> = {
  briefing: (d) => ({
    subject: `Briefing do seu imóvel - ${d.property_title || "Imóvel"}`,
    html: `<h1>Briefing do Imóvel</h1>
<p>Olá ${d.lead_name || "Cliente"},</p>
<p>Seu imóvel foi localizado! Seguem os detalhes:</p>
<ul>
  <li><strong>Título:</strong> ${d.property_title || "N/A"}</li>
  <li><strong>Valor:</strong> R$ ${d.property_price || "N/A"}</li>
  <li><strong>Localização:</strong> ${d.property_city || "N/A"}</li>
</ul>
<p>Acesse seu painel para mais detalhes.</p>`,
    text: `Briefing do Imóvel\n\nOlá ${d.lead_name || "Cliente"},\n\nSeu imóvel foi localizado! Seguem os detalhes:\n- Título: ${d.property_title || "N/A"}\n- Valor: R$ ${d.property_price || "N/A"}\n- Localização: ${d.property_city || "N/A"}\n\nAcesse seu painel para mais detalhes.`,
  }),
  devolutiva: (d) => ({
    subject: `Resultado da sua análise - ${d.result || "Aguardando"}`,
    html: `<h1>Resultado da Análise</h1>
<p>Olá ${d.lead_name || "Cliente"},</p>
<p>O banco retornou o seguinte resultado:</p>
<ul>
  <li><strong>Resultado:</strong> ${d.result || "Aguardando"}</li>
  <li><strong>Valor aprovado:</strong> R$ ${d.approved_amount || "N/A"}</li>
  <li><strong>Observações:</strong> ${d.notes || "Nenhuma"}</li>
</ul>`,
    text: `Resultado da Análise\n\nOlá ${d.lead_name || "Cliente"},\n\nO banco retornou: ${d.result || "Aguardando"}\nValor aprovado: R$ ${d.approved_amount || "N/A"}\nObservações: ${d.notes || "Nenhuma"}`,
  }),
  lembrete: (d) => ({
    subject: `Lembrete: ${d.title || "Agendamento"}`,
    html: `<h1>Lembrete</h1><p>Olá ${d.lead_name || "Cliente"},</p><p>${d.message || "Você tem um agendamento em breve."}</p>`,
    text: `Lembrete: ${d.title || "Agendamento"}\n\nOlá ${d.lead_name || "Cliente"},\n\n${d.message || "Você tem um agendamento em breve."}`,
  }),
  welcome: (d) => ({
    subject: `Bem-vindo ao OmniMob!`,
    html: `<h1>Bem-vindo!</h1><p>Olá ${d.name || "novo usuário"},</p><p>Seu cadastro foi realizado com sucesso.</p>`,
    text: `Bem-vindo!\n\nOlá ${d.name || "novo usuário"},\n\nSeu cadastro foi realizado com sucesso.`,
  }),
  generic: (d) => ({
    subject: d.subject as string || "Mensagem",
    html: `<p>${d.message || ""}</p>`,
    text: d.message as string || "",
  }),
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  let body: EmailRequest;
  try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }

  if (!body.to_email || !body.template) return json(400, { error: "missing_fields" });

  const templateFn = TEMPLATES[body.template];
  if (!templateFn) return json(400, { error: "invalid_template" });

  const { html, text, subject } = templateFn(body.data || {});
  const finalSubject = body.subject || subject;

  // Setup Supabase admin
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Log inicial (pending)
  const { data: logRow, error: logErr } = await admin.from("email_logs").insert([{
    organization_id: body.organization_id || null,
    deal_id: body.deal_id || null,
    template: body.template,
    to_email: body.to_email,
    to_name: body.to_name || null,
    subject: finalSubject,
    body_html: html,
    body_text: text,
    status: "pending",
    provider: "resend",
  }]).select("id").single();

  if (logErr) console.error("[send-email] log insert err:", logErr);

  // Enviar via Resend (ou mock)
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  let externalId: string | null = null;
  let status = "pending";
  let errorMsg: string | null = null;

  if (RESEND_API_KEY && RESEND_API_KEY !== "re_xxx") {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: Deno.env.get("EMAIL_FROM") || "OmniMob <noreply@omnimob.com.br>",
          to: body.to_email,
          subject: finalSubject,
          html,
          text,
        }),
      });
      const resData = await res.json();
      if (res.ok) {
        externalId = resData.id || null;
        status = "sent";
      } else {
        status = "failed";
        errorMsg = resData.message || "Resend API error";
      }
    } catch (e) {
      status = "failed";
      errorMsg = e instanceof Error ? e.message : "unknown";
    }
  } else {
    // Mock: simula sucesso sem Resend configurado
    externalId = `mock-${Date.now()}`;
    status = "sent";
    console.log(`[send-email] MOCK mode: to=${body.to_email} subject=${finalSubject}`);
  }

  // Atualizar log
  if (logRow?.id) {
    await admin.from("email_logs").update({
      status,
      external_id: externalId,
      error_message: errorMsg,
      sent_at: status === "sent" ? new Date().toISOString() : null,
    }).eq("id", logRow.id);
  }

  return json(200, { ok: status === "sent", status, external_id: externalId, log_id: logRow?.id });
});
