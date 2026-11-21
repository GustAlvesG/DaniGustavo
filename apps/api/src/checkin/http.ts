import type { Database } from "@casamento/db";
import {
  CHECKIN_SEARCH_MIN,
  invitationTokenFromCode,
  type CheckinLookupResult,
} from "@casamento/shared";
import type { Context } from "hono";
import { apiError, ERROR_CODES } from "../errors.ts";
import type { EventCtx } from "../tenancy/types.ts";
import { findByInvitationToken, searchInvitations } from "./service.ts";

/**
 * `?code=` (texto lido do QR: `/c/<token>` ou o token) ou `?q=` (nome, mínimo 2 letras).
 * Código de convite de outro evento ou inexistente → 404.
 */
export async function lookupResponse(c: Context, ev: EventCtx, db: Database, secret: string) {
  const code = c.req.query("code")?.trim();
  const q = c.req.query("q")?.trim();
  if (code) {
    const token = invitationTokenFromCode(code.slice(0, 300));
    if (!token) {
      return apiError(
        c,
        422,
        ERROR_CODES.invalidRequest,
        "Esse código não é de um convite. Confira e tente de novo.",
      );
    }
    const invitation = await findByInvitationToken(ev, db, secret, token);
    if (!invitation) {
      return apiError(c, 404, ERROR_CODES.notFound, "Convite não encontrado neste evento.");
    }
    return c.json({ invitations: [invitation] } satisfies CheckinLookupResult);
  }
  if (!q || q.length < CHECKIN_SEARCH_MIN) {
    return apiError(
      c,
      422,
      ERROR_CODES.invalidRequest,
      `Digite pelo menos ${CHECKIN_SEARCH_MIN} letras do nome.`,
    );
  }
  const invitations = await searchInvitations(ev, db, secret, q.slice(0, 100));
  return c.json({ invitations } satisfies CheckinLookupResult);
}
