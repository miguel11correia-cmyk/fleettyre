// ── ADAPTADOR CARTRACK ──────────────────────────────────────────────
// Implementa o contrato AdaptadorTelemetria para a API da Cartrack.
// `credenciais` esperadas (gravadas em integracoes_telemetria.credenciais):
//   { "username": "TRAN00108", "password": "...", "region": "pt" }

import type { AdaptadorTelemetria, LeituraOdometro } from "./telemetria-tipos.ts";

// A Cartrack quer o formato "Y-m-d H:i:s" (ex: 2026-08-10 16:19:45),
// não ISO 8601 — daí o formatador manual em vez de toISOString().
function formatarData(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} `
    + `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

// Confirmado num teste real: a resposta vem em
// {"data": {"current_odometer_value": <metros>, "end_odometer_value": <metros>, ...}}
// — os valores estão em METROS, por isso dividimos por 1000 para km.
// "current_odometer_value" é o mais actual (ligeiramente à frente do
// fim do período pedido); "end_odometer_value" fica como reserva.
function extrairOdometro(payload: unknown): number | null {
  if (payload == null || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  const data = (obj.data && typeof obj.data === "object") ? (obj.data as Record<string, unknown>) : obj;

  const candidatos = ["current_odometer_value", "end_odometer_value", "start_odometer_value"];
  for (const chave of candidatos) {
    const v = data[chave];
    if (typeof v === "number") return v / 1000;
    if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) return Number(v) / 1000;
  }
  return null;
}

export const cartrack: AdaptadorTelemetria = {
  async obterOdometro(matricula, credenciais): Promise<LeituraOdometro | null> {
    const username = String(credenciais.username ?? "");
    const password = String(credenciais.password ?? "");
    const region   = String(credenciais.region ?? "pt");
    if (!username || !password) return null;

    const base = `https://fleetapi-${region}.cartrack.com/rest`;
    const auth = "Basic " + btoa(`${username}:${password}`);

    // Período consultado: últimos 7 dias até agora — queremos o odómetro
    // mais recente (fim do período), não interessa tanto o início.
    const agora      = new Date();
    const haSeteDias = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000);
    const url = `${base}/vehicles/${encodeURIComponent(matricula)}/odometer`
      + `?start_timestamp=${encodeURIComponent(formatarData(haSeteDias))}`
      + `&end_timestamp=${encodeURIComponent(formatarData(agora))}`;

    const resp = await fetch(url, { headers: { Authorization: auth } });
    if (!resp.ok) return null;

    const payload = await resp.json();
    const km = extrairOdometro(payload);
    if (km == null) return null;

    return { km: Math.round(km), em: new Date().toISOString() };
  },
};
