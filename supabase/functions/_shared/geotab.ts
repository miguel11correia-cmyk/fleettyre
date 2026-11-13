// ── ADAPTADOR GEOTAB ─────────────────────────────────────────────────
// Implementa o contrato AdaptadorTelemetria para a API JSON-RPC da
// Geotab (MyGeotab SDK). `credenciais` esperadas (gravadas em
// integracoes_telemetria.credenciais):
//   { "database": "nome_da_base", "username": "...", "password": "..." }
//
// ATENÇÃO — por confirmar com um teste real: ao contrário do adaptador
// Cartrack (testado contra uma conta real), este foi escrito a partir da
// documentação pública da Geotab (developers.geotab.com), sem acesso a
// uma conta para validar a resposta exacta. Confirmado por documentação:
// o fluxo de autenticação (Authenticate → sessionId + servidor) e o
// padrão geral de pedir o odómetro via StatusData com o diagnóstico
// DiagnosticOdometerId. NÃO totalmente confirmado: se esse é sempre o
// diagnóstico certo para todos os dispositivos (pode variar consoante o
// modelo do tracker), nem o nome exacto do campo de matrícula no
// objecto Device. Testa com uma conta real antes de confiar nisto.

import type { AdaptadorTelemetria, LeituraOdometro } from "./telemetria-tipos.ts";

interface SessaoGeotab {
  servidor: string;
  credenciais: { database: string; userName: string; sessionId: string };
}

async function chamarApi(servidor: string, metodo: string, params: Record<string, unknown>): Promise<any> {
  const resp = await fetch(`https://${servidor}/apiv1`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method: metodo, params, id: 1 }),
  });
  if (!resp.ok) {
    throw new Error(`Geotab ${resp.status} em ${metodo}: ${await resp.text()}`);
  }
  const payload = await resp.json();
  if (payload.error) {
    throw new Error(`Geotab: ${payload.error.message ?? JSON.stringify(payload.error)}`);
  }
  return payload.result;
}

async function autenticar(credenciais: Record<string, unknown>): Promise<SessaoGeotab | null> {
  const database = String(credenciais.database ?? "");
  const userName = String(credenciais.username ?? credenciais.userName ?? "");
  const password = String(credenciais.password ?? "");
  if (!database || !userName || !password) return null;

  try {
    // Autentica sempre contra my.geotab.com — a Geotab redirige (no
    // campo "path" da resposta) para o servidor real da base de dados
    // do cliente, que é o que se usa nas chamadas seguintes.
    const resultado = await chamarApi("my.geotab.com", "Authenticate", { database, userName, password });
    const servidor = String(resultado?.path ?? "my.geotab.com");
    const sessionId = String(resultado?.credentials?.sessionId ?? "");
    if (!sessionId) return null;
    return { servidor, credenciais: { database, userName, sessionId } };
  } catch {
    return null;
  }
}

async function obterDispositivo(sessao: SessaoGeotab, matricula: string): Promise<{ id: string } | null> {
  // "name" é o campo onde a Geotab guarda normalmente a matrícula/
  // identificador do veículo configurado na conta — pode variar consoante
  // como o cliente configurou os dispositivos.
  const dispositivos = await chamarApi(sessao.servidor, "Get", {
    typeName: "Device",
    credentials: sessao.credenciais,
    search: { name: matricula },
  });
  if (Array.isArray(dispositivos) && dispositivos.length > 0) {
    return { id: String(dispositivos[0].id) };
  }
  return null;
}

// Diagnóstico padrão da Geotab para odómetro acumulado — devolvido em
// metros (convenção SI usada em toda a API), por isso divide-se por
// 1000 para km, tal como no adaptador Cartrack.
const DIAGNOSTIC_ODOMETER_ID = "DiagnosticOdometerId";

async function obterUltimoOdometro(sessao: SessaoGeotab, deviceId: string): Promise<number | null> {
  const leituras = await chamarApi(sessao.servidor, "Get", {
    typeName: "StatusData",
    credentials: sessao.credenciais,
    search: {
      deviceSearch: { id: deviceId },
      diagnosticSearch: { id: DIAGNOSTIC_ODOMETER_ID },
    },
    resultsLimit: 1,
  });
  if (Array.isArray(leituras) && leituras.length > 0 && typeof leituras[0].data === "number") {
    return leituras[0].data / 1000;
  }
  return null;
}

export const geotab: AdaptadorTelemetria = {
  async testarCredenciais(credenciais): Promise<boolean> {
    const sessao = await autenticar(credenciais);
    return sessao != null;
  },

  async obterOdometro(matricula, credenciais): Promise<LeituraOdometro | null> {
    const sessao = await autenticar(credenciais);
    if (!sessao) throw new Error("Geotab: não foi possível autenticar (verifica database/utilizador/password).");

    const dispositivo = await obterDispositivo(sessao, matricula);
    if (!dispositivo) return null;

    const km = await obterUltimoOdometro(sessao, dispositivo.id);
    if (km == null) throw new Error(`Geotab: sem leitura de odómetro (diagnóstico ${DIAGNOSTIC_ODOMETER_ID}) para o dispositivo ${dispositivo.id}.`);

    return { km: Math.round(km), em: new Date().toISOString() };
  },
};
