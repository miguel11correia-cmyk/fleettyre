// ── EMAIL OAUTH — CALLBACK ───────────────────────────────────────────
// Recebe o redirect do fornecedor (ex: Microsoft) com ?code&state.
// Pública — sem JWT do Supabase (o fornecedor não pode enviar um) — a
// confiança vem só da assinatura/validade do `state`.
//
// IMPORTANTE (passo manual, não dá para fazer por código): esta função
// precisa de ter "Verify JWT" DESLIGADO nas suas definições no
// Supabase Dashboard, senão o pedido do fornecedor é rejeitado antes
// de chegar aqui.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validarState } from "../_shared/oauth-state.ts";
import { ADAPTADORES_EMAIL } from "../_shared/email-sync-logica.ts";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const REDIRECT_URI         = `${SUPABASE_URL}/functions/v1/email-oauth-callback`;
const APP_URL               = "https://fleet-tyre.com/app.html";

Deno.serve(async (req) => {
  const url   = new URL(req.url);
  const code  = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return Response.redirect(`${APP_URL}?email_erro=1`, 302);
  }

  const payload = await validarState(state);
  if (!payload) {
    return Response.redirect(`${APP_URL}?email_erro=1`, 302);
  }

  const adaptador = ADAPTADORES_EMAIL[payload.fornecedor];
  if (!adaptador) {
    return Response.redirect(`${APP_URL}?email_erro=1`, 302);
  }

  try {
    const tokens = await adaptador.trocarCodigoPorTokens(code, REDIRECT_URI);

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { error } = await sb.from("integracoes_email").upsert(
      {
        empresa_id: payload.empresa_id,
        fornecedor: payload.fornecedor,
        conta_email: tokens.conta_email ?? null,
        tokens: { access_token: tokens.access_token, refresh_token: tokens.refresh_token, expires_at: tokens.expires_at },
        ativo: true,
      },
      { onConflict: "empresa_id,fornecedor" }
    );

    if (error) throw error;

    return Response.redirect(`${APP_URL}?email_ligado=1`, 302);
  } catch (e) {
    console.error("Erro no callback OAuth de email:", e);
    return Response.redirect(`${APP_URL}?email_erro=1`, 302);
  }
});
