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
  remetenteNome: string; // nome de exibição do remetente (ex: "Sobral Pneus") — muitos
                          // fornecedores facturam através de plataformas terceiras (Moloni,
                          // InvoiceXpress, Vendus, ...) cujo domínio de email nada tem a ver
                          // com o do fornecedor; o nome de exibição continua a ser o do
                          // fornecedor nesses casos, por isso serve de segundo critério de match
  assunto: string;
  resumoCorpo: string; // resumo/preview do corpo — usado no filtro além do assunto
  dataRecebido: string; // ISO timestamp
  anexosPdf: AnexoPdfCandidato[];
}

export interface ResultadoListagem {
  mensagens: MensagemEmailCandidata[];
  // false quando o adaptador parou antes de cobrir a janela toda (ex: um
  // limite de segurança de CPU no IMAP) — nesse caso `ateData` diz até
  // onde chegou, para a próxima sincronização continuar exactamente daí
  // em vez de saltar para "agora" e perder o que ficou por analisar no
  // meio. Adaptadores que conseguem cobrir sempre a janela toda numa só
  // chamada (Outlook, Google) devolvem sempre `completo: true`.
  completo: boolean;
  ateData?: Date;
  // Diagnóstico — quantas mensagens existiam na janela e quantas foram
  // mesmo examinadas nesta chamada (visível na app, não só nos logs).
  totalNaJanela?: number;
  examinadas?: number;
}

export interface AdaptadorEmail {
  // OAuth — adaptadores de credenciais directas (ex: IMAP) não usam
  // nenhum destes três; a ligação faz-se por outra função própria
  // (ver email-imap-ligar), nunca através de email-oauth-iniciar/callback.
  obterUrlAutorizacao(state: string, redirectUri: string): string;
  trocarCodigoPorTokens(code: string, redirectUri: string): Promise<TokensEmail>;
  atualizarToken(tokens: TokensEmail): Promise<TokensEmail>;

  // Sincronização. `dominiosConhecidos`/`nomesFornecedores` são opcionais
  // — adaptadores que conseguem filtrar de forma barata sem eles (ex:
  // Graph) podem ignorá-los; adaptadores onde descarregar a mensagem
  // completa é caro (ex: IMAP) usam-nos para decidir o que vale a pena
  // descarregar.
  listarMensagensRecentes(tokens: TokensEmail, desde: Date, dominiosConhecidos: string[], nomesFornecedores: string[]): Promise<ResultadoListagem>;
  obterAnexoPdf(tokens: TokensEmail, idInternoMensagem: string, anexoId: string): Promise<Uint8Array>;
}
