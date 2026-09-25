// ── TIPOS PARTILHADOS — INTEGRAÇÕES DE EMAIL ────────────────────────
// Contrato que qualquer adaptador de fornecedor de email (Outlook, ou
// um futuro fornecedor como Gmail) tem de cumprir. As funções de OAuth
// e de sincronização só conhecem esta forma — não sabem nada da API
// específica de cada fornecedor.

export interface TokensEmail {
  access_token: string;
  refresh_token: string;
  expires_at: string; // ISO timestamp
}

export interface AnexoPdfCandidato {
  id: string;
  nome: string;
}

export interface MensagemEmailCandidata {
  id: string; // chave de dedup ESTÁVEL entre sincronizações (ex: internetMessageId no Outlook)
  idInterno: string; // id específico do fornecedor, só válido nesta sessão — usado para
                      // pedidos seguintes (ex: obterAnexoPdf), pode não ser o mesmo que `id`
  remetente: string;
  assunto: string;
  dataRecebido: string; // ISO timestamp
  anexosPdf: AnexoPdfCandidato[];
}

export interface AdaptadorEmail {
  // OAuth
  obterUrlAutorizacao(state: string, redirectUri: string): string;
  trocarCodigoPorTokens(code: string, redirectUri: string): Promise<TokensEmail & { conta_email?: string }>;
  atualizarToken(tokens: TokensEmail): Promise<TokensEmail>;

  // Sincronização
  listarMensagensRecentes(tokens: TokensEmail, desde: Date): Promise<MensagemEmailCandidata[]>;
  obterAnexoPdf(tokens: TokensEmail, idInternoMensagem: string, anexoId: string): Promise<Uint8Array>;
}
