// ── ADAPTADOR GOOGLE / GMAIL ─────────────────────────────────────────
// Implementa o contrato AdaptadorEmail para a Gmail API. Serve tanto
// contas Google Workspace (empresa) como Gmail pessoal — a Google não
// distingue os dois no OAuth, ao contrário da Microsoft.

import type { AdaptadorEmail, MensagemEmailCandidata, ResultadoListagem, TokensEmail } from "./email-tipos.ts";

const GOOGLE_CLIENT_ID     = Deno.env.get("GOOGLE_CLIENT_ID")     ?? "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL      = "https://oauth2.googleapis.com/token";
const GMAIL_BASE      = "https://gmail.googleapis.com/gmail/v1/users/me";

// gmail.readonly é suficiente — só precisamos de ler mensagens/anexos,
// nunca de enviar nem apagar nada.
const SCOPES = "https://www.googleapis.com/auth/gmail.readonly";

function tokensExpiramEm(expiresInSegundos: number): string {
  return new Date(Date.now() + expiresInSegundos * 1000).toISOString();
}

async function pedirTokens(params: Record<string, string>): Promise<TokensEmail> {
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      ...params,
    }),
  });

  if (!resp.ok) {
    throw new Error(`Google token endpoint ${resp.status}: ${await resp.text()}`);
  }

  const payload = await resp.json();
  return {
    access_token: payload.access_token,
    // A Google só devolve refresh_token na primeira autorização
    // (access_type=offline + prompt=consent) — nas renovações seguintes
    // não vem, por isso mantemos o antigo.
    refresh_token: payload.refresh_token ?? params.refresh_token ?? "",
    expires_at: tokensExpiramEm(payload.expires_in ?? 3600),
  };
}

async function pedidoGmail(caminho: string, accessToken: string): Promise<any> {
  const url = caminho.startsWith("http") ? caminho : `${GMAIL_BASE}${caminho}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    throw new Error(`Gmail API ${resp.status} em ${caminho}: ${await resp.text()}`);
  }
  return resp.json();
}

// Base64url → base64 normal, para poder usar atob().
function base64UrlParaBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const binario = atob(b64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

function decodificarHeaderAssunto(headers: any[], nome: string): string {
  const h = (headers ?? []).find((h: any) => h.name?.toLowerCase() === nome.toLowerCase());
  return h?.value ?? "";
}

// Extrai o email de dentro de "Nome Apelido <email@dominio.pt>".
function extrairEmail(remetenteHeader: string): string {
  const match = remetenteHeader.match(/<([^>]+)>/);
  return (match ? match[1] : remetenteHeader).trim();
}

// Extrai o nome de exibição de dentro de "Nome Apelido <email@dominio.pt>".
function extrairNomeExibicao(remetenteHeader: string): string {
  const semEndereco = remetenteHeader.replace(/<[^>]*>/, "").trim();
  return semEndereco.replace(/^"|"$/g, "").trim();
}

// Percorre as partes da mensagem (pode ser aninhado, ex: multipart/mixed
// com um multipart/alternative lá dentro) à procura de anexos PDF.
function encontrarAnexosPdf(parte: any, acc: { id: string; nome: string }[] = []): { id: string; nome: string }[] {
  if (!parte) return acc;
  const nome = parte.filename || "";
  const tipo = parte.mimeType || "";
  if (nome && parte.body?.attachmentId && (tipo === "application/pdf" || nome.toLowerCase().endsWith(".pdf"))) {
    acc.push({ id: parte.body.attachmentId, nome });
  }
  for (const sub of parte.parts ?? []) {
    encontrarAnexosPdf(sub, acc);
  }
  return acc;
}

export const google: AdaptadorEmail = {
  obterUrlAutorizacao(state, redirectUri) {
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: SCOPES,
      access_type: "offline", // necessário para receber refresh_token
      prompt: "consent",      // força mostrar sempre o consentimento, para garantir refresh_token mesmo em reconexões
      state,
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  },

  async trocarCodigoPorTokens(code, redirectUri) {
    const tokens = await pedirTokens({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });

    let contaEmail: string | undefined;
    try {
      const perfil = await pedidoGmail("/profile", tokens.access_token!);
      contaEmail = perfil.emailAddress || undefined;
    } catch {
      // Não crítico — a integração continua a funcionar sem o email visível.
    }

    return { ...tokens, conta_email: contaEmail };
  },

  async atualizarToken(tokens) {
    return pedirTokens({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token!,
    });
  },

  async listarMensagensRecentes(tokens, desde, _dominiosConhecidos, _nomesFornecedores): Promise<ResultadoListagem> {
    // A pesquisa da Gmail usa a sintaxe própria dela (não OData) — "after:"
    // só tem resolução ao dia, por isso o filtro por hora exacta fica a
    // cargo do _shared/email-sync-logica.ts (que já tem sobreposição).
    const depoisDe = Math.floor(desde.getTime() / 1000);
    const query = `has:attachment after:${depoisDe}`;

    const mensagens: MensagemEmailCandidata[] = [];
    let pageToken: string | undefined;
    let paginas = 0;

    do {
      const qs = new URLSearchParams({ q: query, maxResults: "50" });
      if (pageToken) qs.set("pageToken", pageToken);

      const lista: any = await pedidoGmail(`/messages?${qs.toString()}`, tokens.access_token!);

      for (const ref of lista.messages ?? []) {
        let msg: any;
        try {
          msg = await pedidoGmail(`/messages/${ref.id}?format=full`, tokens.access_token!);
        } catch {
          continue; // não conseguimos ler esta mensagem — ignora-a nesta ronda
        }

        const anexosPdf = encontrarAnexosPdf(msg.payload);
        if (anexosPdf.length === 0) continue;

        const headers = msg.payload?.headers ?? [];
        const messageIdHeader = decodificarHeaderAssunto(headers, "Message-ID") || msg.id;
        const fromHeader = decodificarHeaderAssunto(headers, "From");

        mensagens.push({
          id: messageIdHeader, // chave de dedup estável — o header Message-ID, tal como no Outlook
          idInterno: msg.id,
          remetente: extrairEmail(fromHeader),
          remetenteNome: extrairNomeExibicao(fromHeader),
          assunto: decodificarHeaderAssunto(headers, "Subject"),
          resumoCorpo: msg.snippet || "",
          dataRecebido: new Date(Number(msg.internalDate)).toISOString(),
          anexosPdf,
        });
      }

      pageToken = lista.nextPageToken;
      paginas++;
    } while (pageToken && paginas < 10); // teto de segurança — 500 mensagens por sincronização

    return { mensagens, completo: true };
  },

  async obterAnexoPdf(tokens, idInternoMensagem, anexoId): Promise<Uint8Array> {
    const anexo = await pedidoGmail(`/messages/${idInternoMensagem}/attachments/${anexoId}`, tokens.access_token!);
    const dados = anexo.data;
    if (!dados) {
      throw new Error("Anexo sem dados — resposta inesperada da Gmail API.");
    }
    return base64UrlParaBytes(dados);
  },
};
