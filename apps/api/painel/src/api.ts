import { ea, oa } from "./nav.ts";

/*
 * Cliente das rotas /api/admin. Mesma origem da API: o cookie de sessão do Better Auth vai
 * sozinho (nunca usamos X-Web-Key aqui). Erros viram `ApiFailure` com a mensagem pt-BR da API.
 */

export class ApiFailure extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Disparado quando a sessão expira: o App volta para a tela de login. */
export const SESSION_EXPIRED = "painel:sessao-expirada";

/** Rota do evento atual: api("/gifts") chama /api/admin/events/:eventId/gifts. */
export const api = <T>(path: string, init: RequestInit = {}) => request<T>(ea(path), init);

/** Rota fora de um evento (ex.: /api/admin/me). */
export const apiRoot = <T>(path: string, init: RequestInit = {}) =>
  request<T>(`/api/admin${path}`, init);

/** Rota da organização atual (Fase 3): orgApi("/members") → /api/admin/orgs/:orgId/members. */
export const orgApi = <T>(path: string, init: RequestInit = {}) => request<T>(oa(path), init);

export const orgSend = <T>(method: string, path: string, body?: unknown) =>
  orgApi<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

/** Aceite de convite da equipe (Fase 3), sem sessão obrigatória: /api/team-invites/... */
export const teamInviteApi = <T>(path: string, init: RequestInit = {}) =>
  request<T>(`/api/team-invites${path}`, init);

async function request<T>(url: string, init: RequestInit): Promise<T> {
  const isForm = init.body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(url, {
      credentials: "same-origin",
      ...init,
      headers: {
        accept: "application/json",
        ...(init.body && !isForm ? { "content-type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiFailure(0, "Sem conexão com o servidor. Confira a internet e tente de novo.");
  }
  if (res.status === 401) window.dispatchEvent(new Event(SESSION_EXPIRED));
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (body as { error?: { message?: string } } | null)?.error?.message ??
      `Algo deu errado (erro ${res.status}). Tente de novo.`;
    throw new ApiFailure(res.status, message);
  }
  return body as T;
}

export const send = <T>(method: string, path: string, body?: unknown) =>
  api<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

export const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : "Algo deu errado. Tente de novo.";
