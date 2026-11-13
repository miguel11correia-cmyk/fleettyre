// ── ADAPTADOR FROTCOM ────────────────────────────────────────────────
// Implementa o contrato AdaptadorTelemetria para a API V2 da Frotcom.
// `credenciais` esperadas (gravadas em integracoes_telemetria.credenciais):
//   { "provider": "thirdparty", "username": "...", "password": "..." }
// "provider" é o que a Frotcom chama ao tipo de login da API — pede-se
// ao suporte deles ao gerar as credenciais; "thirdparty" é o valor de
// exemplo da documentação oficial, usado como default.
//
// ATENÇÃO — por confirmar com um teste real: ao contrário do adaptador
// Cartrack (testado contra uma conta real), este foi escrito a partir da
// documentação pública da Frotcom (v2api.frotcom.com/documentation),
// sem acesso a uma conta para validar a resposta exacta. Confirmado por
// documentação: o endpoint de autenticação e o modelo de veículo com os
// campos odometerGps/odometerCanbus. NÃO confirmado: o nome exacto do
// campo que devolve o token de autenticação — por isso tentam-se vários
// candidatos abaixo. Testa com uma conta real antes de confiar nisto.

import type { AdaptadorTelemetria, LeituraOdometro } from "./telemetria-tipos.ts";

const BASE = "https://v2api.frotcom.com/v2";

async function obterToken(credenciais: Record<string, unknown>): Promise<string | null> {
  const provider = String(credenciais.provider ?? "thirdparty");
  const username = String(credenciais.username ?? "");
  const password = String(credenciais.password ?? "");
  if (!username || !password) return null;

  const resp = await fetch(`${BASE}/authorize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, username, password }),
  });
  if (!resp.ok) return null;

  const payload = await resp.json().catch(() => null);
  if (payload == null) return null;
  if (typeof payload === "string") return payload;
  if (typeof payload !== "object") return null;

  const obj = payload as Record<string, unknown>;
  const candidatos = ["token", "api_key", "apiKey", "accessToken", "access_token"];
  for (const chave of candidatos) {
    const v = obj[chave];
    if (typeof v === "string" && v.trim() !== "") return v;
  }
  return null;
}

// Candidatos ao nome do campo de matrícula no modelo de veículo da
// Frotcom — "licensePlate" é o confirmado na documentação; os outros
// ficam como reserva caso a resposta real use outra grafia.
function extrairMatricula(v: Record<string, unknown>): string {
  for (const chave of ["licensePlate", "coupledLicensePlate", "plate"]) {
    const val = v[chave];
    if (typeof val === "string" && val.trim() !== "") return val;
  }
  return "";
}

// odometerGps é mais fiável na prática (não depende de cablagem CAN
// instalada no veículo); odometerCanbus fica como reserva mais precisa
// quando existir. Ambos documentados como parte do mesmo modelo de
// veículo devolvido por vários endpoints (lista de veículos, alarmes).
function extrairOdometro(v: Record<string, unknown>): number | null {
  for (const chave of ["odometerGps", "odometerCanbus"]) {
    const val = v[chave];
    if (typeof val === "number") return val;
    if (typeof val === "string" && val.trim() !== "" && !isNaN(Number(val))) return Number(val);
  }
  return null;
}

async function obterVeiculos(token: string): Promise<Record<string, unknown>[]> {
  const resp = await fetch(`${BASE}/vehicles?api_key=${encodeURIComponent(token)}`, {
    headers: { Accept: "application/json" },
  });
  if (!resp.ok) {
    throw new Error(`Frotcom ${resp.status} em /vehicles: ${await resp.text()}`);
  }
  const payload = await resp.json();
  return Array.isArray(payload) ? (payload as Record<string, unknown>[]) : [];
}

export const frotcom: AdaptadorTelemetria = {
  async testarCredenciais(credenciais): Promise<boolean> {
    try {
      const token = await obterToken(credenciais);
      return token != null;
    } catch {
      return false;
    }
  },

  async obterOdometro(matricula, credenciais): Promise<LeituraOdometro | null> {
    const token = await obterToken(credenciais);
    if (!token) throw new Error("Frotcom: não foi possível autenticar (verifica provider/utilizador/password).");

    const veiculos = await obterVeiculos(token);
    const veiculo = veiculos.find(v => extrairMatricula(v).toUpperCase() === matricula.toUpperCase());
    if (!veiculo) return null;

    const km = extrairOdometro(veiculo);
    if (km == null) throw new Error(`Frotcom: campo de odómetro não reconhecido na resposta: ${JSON.stringify(veiculo)}`);

    return { km: Math.round(km), em: new Date().toISOString() };
  },
};
