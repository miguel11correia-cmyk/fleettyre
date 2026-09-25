// ── EMAIL IMAP — LIGAR ──────────────────────────────────────────────
// Autenticado. Recebe host/porta/utilizador/password, TESTA a ligação
// (login + SELECT INBOX) antes de gravar — para não guardar
// credenciais erradas silenciosamente. Sem OAuth: é a alternativa ao
// par email-oauth-iniciar/callback para fornecedores sem API própria.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { obterEmpresaId } from "../_shared/auth.ts";
import { ClienteIMAP } from "../_shared/imap-cliente.ts";
import { CORS_HEADERS, tratarPreflight } from "../_shared/cors.ts";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const preflight = tratarPreflight(req);
  if (preflight) return preflight;

  const empresaId = await obterEmpresaId(req);
  if (!empresaId) {
    return new Response(JSON.stringify({ ok: false, erro: "Não autenticado ou sem empresa associada." }), { status: 401, headers: CORS_HEADERS });
  }

  let dados: any;
  try { dados = await req.json(); } catch { dados = {}; }

  const host    = String(dados.host || "").trim();
  const port    = parseInt(dados.port) || 993;
  const usuario = String(dados.usuario || "").trim();
  const password = String(dados.password || "");

  if (!host || !usuario || !password) {
    return new Response(JSON.stringify({ ok: false, erro: "Preenche o servidor, o utilizador e a password." }), { status: 400, headers: CORS_HEADERS });
  }

  // Testar a ligação antes de gravar qualquer coisa.
  try {
    const cliente = await ClienteIMAP.ligar(host, port);
    try {
      await cliente.login(usuario, password);
      await cliente.selecionarInbox();
    } finally {
      await cliente.fechar();
    }
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, erro: `Não foi possível ligar: ${String(e)}` }), { status: 400, headers: CORS_HEADERS });
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { error } = await sb.from("integracoes_email").upsert(
    {
      empresa_id: empresaId,
      fornecedor: "imap",
      conta_email: usuario,
      tokens: { host, port, usuario, password },
      ativo: true,
    },
    { onConflict: "empresa_id,fornecedor" }
  );

  if (error) {
    return new Response(JSON.stringify({ ok: false, erro: error.message }), { status: 500, headers: CORS_HEADERS });
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
});
