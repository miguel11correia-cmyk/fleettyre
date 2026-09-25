// ── CORS ──────────────────────────────────────────────────────────
// Funções chamadas directamente do browser (fetch com cabeçalho
// Authorization) disparam sempre um pedido de preflight OPTIONS — sem
// isto o browser bloqueia a resposta antes de chegar ao código da
// função. Não é preciso em email-oauth-callback (é um redirect do
// fornecedor, não um fetch) nem em email-sync (só cron).

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Devolve uma Response de preflight se o pedido for OPTIONS, ou null
// caso contrário (para o chamador continuar o processamento normal).
export function tratarPreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  return null;
}
