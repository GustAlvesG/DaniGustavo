import "server-only";

import { PRIVACY_NOTICE_VERSION, type PrivacyNotice } from "@casamento/shared";
import { z } from "zod";
import { apiGet } from "./client";
import { currentEvent, eventPath, type EventInfo } from "./event";
import { CACHE_TAGS } from "./tags";

const PrivacyNoticeSchema = z.object({
  version: z.string(),
  requireConsent: z.boolean(),
  contactEmail: z.string().nullable(),
  retentionDays: z.number().nullable(),
  eventName: z.string(),
}) satisfies z.ZodType<PrivacyNotice>;

/**
 * Aviso de privacidade do evento (`GET /api/e/<slug>/privacy-requests/notice`), cacheado com a
 * tag `site:<id>`: salvar a privacidade no painel revalida o site. Sem API, o aviso exige o
 * aceite (o lado seguro: a API decide de verdade).
 */
export async function getPrivacyNotice(event?: EventInfo): Promise<PrivacyNotice> {
  const ev = event ?? (await currentEvent());
  const fallback: PrivacyNotice = {
    version: PRIVACY_NOTICE_VERSION,
    requireConsent: true,
    contactEmail: null,
    retentionDays: null,
    eventName: ev.name,
  };
  if (ev.id === 0) return fallback;
  const result = await apiGet(eventPath(ev, "/privacy-requests/notice"), PrivacyNoticeSchema, {
    tags: [CACHE_TAGS.site(ev.id)],
  });
  return result.ok ? result.data : fallback;
}
