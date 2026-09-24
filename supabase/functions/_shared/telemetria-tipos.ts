// ── TIPOS PARTILHADOS — INTEGRAÇÕES DE TELEMETRIA ──────────────────
// Contrato que qualquer adaptador de fornecedor (Cartrack, ou um
// futuro fornecedor) tem de cumprir. `telemetria-sync` só conhece
// esta forma — não sabe nada da API específica de cada fornecedor.

export interface LeituraOdometro {
  km: number;
  em: string; // ISO timestamp
}

export interface AdaptadorTelemetria {
  // `credenciais` vem tal como está gravado em
  // `integracoes_telemetria.credenciais` (jsonb livre, específico do
  // fornecedor) — cada adaptador lê de lá só os campos que precisa.
  obterOdometro(
    matricula: string,
    credenciais: Record<string, unknown>
  ): Promise<LeituraOdometro | null>;
}
