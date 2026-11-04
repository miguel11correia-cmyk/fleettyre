// ── CORS ──────────────────────────────────────────────────────────
// Funções chamadas directamente do browser (fetch com cabeçalho
// Authorization) disparam sempre um pedido de preflight OPTIONS — sem
// isto o browser bloqueia a resposta antes de chegar ao código da
// função. Não é preciso em email-oauth-callback (é um redirect do
// fornecedor, não um fetch) nem em email-sync (só cron).
//
// A origem é restringida à app em produção (e a localhost em
// desenvolvimento) em vez de "*" — isto não substitui a autenticação
// (todas estas funções exigem JWT via obterEmpresaId), mas reduz a
// superfície caso o token alguma vez seja exfiltrado por outra via.

const ORIGENS_PERMITIDAS = new Set([
  "https://fleet-tyre.com",
  "http://localhost:3000",
]);

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
  if (ORIGENS_PERMITIDAS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

// Devolve uma Response de preflight se o pedido for OPTIONS, ou null
// caso contrário (para o chamador continuar o processamento normal).
export function tratarPreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }
  return null;
}
