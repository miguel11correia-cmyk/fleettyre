// ── TIPOS PARTILHADOS — INTEGRAÇÕES DE EMAIL ────────────────────────
// Contrato que qualquer adaptador de fornecedor de email (Outlook, ou
// um futuro fornecedor como Gmail) tem de cumprir. As funções de OAuth
// e de sincronização só conhecem esta forma — não sabem nada da API
// específica de cada fornecedor.

// Credenciais de uma integração — a forma varia por fornecedor, por
// isso quase todos os campos são opcionais aqui; cada adaptador só usa
// os que lhe interessam (OAuth: access_token/refresh_token/expires_at;
// IMAP: host/port/usuario/password).
export interface TokensEmail {
  access_token?: string;
  refresh_token?: string;
  expires_at?: string; // ISO timestamp — quando ausente, nunca é considerado "a expirar"
  conta_email?: string;
  host?: string;
  port?: number;
  usuario?: string;
  password?: string;
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
  resumoCorpo: string; // resumo/preview do corpo — usado no filtro além do assunto
  dataRecebido: string; // ISO timestamp
  anexosPdf: AnexoPdfCandidato[];
}

export interface AdaptadorEmail {
  // OAuth — adaptadores de credenciais directas (ex: IMAP) não usam
  // nenhum destes três; a ligação faz-se por outra função própria
  // (ver email-imap-ligar), nunca através de email-oauth-iniciar/callback.
  obterUrlAutorizacao(state: string, redirectUri: string): string;
  trocarCodigoPorTokens(code: string, redirectUri: string): Promise<TokensEmail>;
  atualizarToken(tokens: TokensEmail): Promise<TokensEmail>;

  // Sincronização. `dominiosConhecidos` é opcional — adaptadores que
  // conseguem filtrar de forma barata sem ele (ex: Graph) podem
  // ignorá-lo; adaptadores onde descarregar a mensagem completa é caro
  // (ex: IMAP) usam-no para decidir o que vale a pena descarregar.
  listarMensagensRecentes(tokens: TokensEmail, desde: Date, dominiosConhecidos: string[]): Promise<MensagemEmailCandidata[]>;
  obterAnexoPdf(tokens: TokensEmail, idInternoMensagem: string, anexoId: string): Promise<Uint8Array>;
}
