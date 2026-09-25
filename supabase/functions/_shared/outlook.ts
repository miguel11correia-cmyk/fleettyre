// ── ADAPTADOR OUTLOOK / MICROSOFT 365 ────────────────────────────────
// Implementa o contrato AdaptadorEmail para o Microsoft Graph.
//
// Regista a App no Azure AD como multi-tenant ("Accounts in any
// organizational directory") — cada empresa cliente tem o seu próprio
// tenant Microsoft 365, por isso usamos sempre o endpoint "organizations"
// em vez de um tenant específico.

import type { AdaptadorEmail, MensagemEmailCandidata, TokensEmail } from "./email-tipos.ts";

const MS_CLIENT_ID     = Deno.env.get("MS_CLIENT_ID")     ?? "";
const MS_CLIENT_SECRET = Deno.env.get("MS_CLIENT_SECRET") ?? "";

const AUTHORIZE_URL = "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize";
const TOKEN_URL      = "https://login.microsoftonline.com/organizations/oauth2/v2.0/token";
const GRAPH_BASE     = "https://graph.microsoft.com/v1.0";

const SCOPES = "offline_access Mail.Read";

function tokensExpiramEm(expiresInSegundos: number): string {
  return new Date(Date.now() + expiresInSegundos * 1000).toISOString();
}

async function pedirTokens(params: Record<string, string>): Promise<TokensEmail> {
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: MS_CLIENT_ID,
      client_secret: MS_CLIENT_SECRET,
      ...params,
    }),
  });

  if (!resp.ok) {
    throw new Error(`Microsoft token endpoint ${resp.status}: ${await resp.text()}`);
  }

  const payload = await resp.json();
  return {
    access_token: payload.access_token,
    // A Microsoft pode devolver um refresh_token novo em cada renovação —
    // se não vier (nem sempre acontece), mantém o antigo.
    refresh_token: payload.refresh_token ?? params.refresh_token ?? "",
    expires_at: tokensExpiramEm(payload.expires_in ?? 3600),
  };
}

// `caminho` pode ser um caminho relativo (prefixado com GRAPH_BASE) ou
// uma URL absoluta completa (ex: o @odata.nextLink da paginação).
async function pedidoGraph(caminho: string, accessToken: string): Promise<any> {
  const url = caminho.startsWith("http") ? caminho : `${GRAPH_BASE}${caminho}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    throw new Error(`Microsoft Graph ${resp.status} em ${caminho}: ${await resp.text()}`);
  }
  return resp.json();
}

// Formato exigido pelo filtro OData da Graph: ISO 8601 UTC.
function paraOData(d: Date): string {
  return d.toISOString();
}

export const outlook: AdaptadorEmail = {
  obterUrlAutorizacao(state, redirectUri) {
    const params = new URLSearchParams({
      client_id: MS_CLIENT_ID,
      response_type: "code",
      redirect_uri: redirectUri,
      response_mode: "query",
      scope: SCOPES,
      state,
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  },

  async trocarCodigoPorTokens(code, redirectUri) {
    const tokens = await pedirTokens({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      scope: SCOPES,
    });

    // Guarda também o email da conta ligada, para mostrar na UI.
    let contaEmail: string | undefined;
    try {
      const perfil = await pedidoGraph("/me?$select=mail,userPrincipalName", tokens.access_token);
      contaEmail = perfil.mail || perfil.userPrincipalName || undefined;
    } catch {
      // Não crítico — a integração continua a funcionar sem o email visível.
    }

    return { ...tokens, conta_email: contaEmail };
  },

  async atualizarToken(tokens) {
    return pedirTokens({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      scope: SCOPES,
    });
  },

  async listarMensagensRecentes(tokens, desde): Promise<MensagemEmailCandidata[]> {
    const select = "id,internetMessageId,subject,from,receivedDateTime,hasAttachments";
    const filtro = `hasAttachments eq true and receivedDateTime ge ${paraOData(desde)}`;
    let caminho: string | null =
      `/me/messages?$select=${select}&$filter=${encodeURIComponent(filtro)}&$top=50`;

    const mensagens: MensagemEmailCandidata[] = [];
    let paginas = 0;

    while (caminho && paginas < 10) { // teto de segurança — 500 mensagens por sincronização
      const resp: any = await pedidoGraph(caminho, tokens.access_token);

      for (const m of resp.value ?? []) {
        if (!m.hasAttachments || !m.internetMessageId) continue;

        // Os anexos concretos (e se são PDF) só se sabem com um pedido à
        // parte — feito ao apanhar cada anexo (obterAnexoPdf), não aqui.
        // Aqui listamos a mensagem com o(s) anexo(s) identificados via um
        // segundo pedido leve (só metadados, sem conteúdo).
        let anexosPdf: MensagemEmailCandidata["anexosPdf"] = [];
        try {
          const anexos = await pedidoGraph(
            `/me/messages/${m.id}/attachments?$select=id,name,contentType`,
            tokens.access_token
          );
          anexosPdf = (anexos.value ?? [])
            .filter((a: any) => a.contentType === "application/pdf" || String(a.name || "").toLowerCase().endsWith(".pdf"))
            .map((a: any) => ({ id: a.id, nome: a.name }));
        } catch {
          continue; // não conseguimos saber os anexos desta mensagem — ignora-a nesta ronda
        }

        if (anexosPdf.length === 0) continue;

        mensagens.push({
          id: m.internetMessageId,
          idInterno: m.id,
          remetente: m.from?.emailAddress?.address || "",
          assunto: m.subject || "",
          dataRecebido: m.receivedDateTime,
          anexosPdf,
        });
      }

      caminho = resp["@odata.nextLink"] ?? null;
      paginas++;
    }

    return mensagens;
  },

  async obterAnexoPdf(tokens, idInternoMensagem, anexoId): Promise<Uint8Array> {
    const anexo = await pedidoGraph(`/me/messages/${idInternoMensagem}/attachments/${anexoId}`, tokens.access_token);
    const base64 = anexo.contentBytes;
    if (!base64) {
      throw new Error("Anexo sem contentBytes — provavelmente maior que ~3MB (não suportado nesta versão).");
    }
    const binario = atob(base64);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    return bytes;
  },
};
