import {
  and,
  asc,
  eq,
  isNull,
  or,
  platformTaskTemplateItems,
  platformTaskTemplates,
  taskTemplateItems,
  taskTemplates,
  type Database,
} from "@casamento/db";
import type {
  PlatformTaskTemplateInput,
  PlatformTaskTemplateView,
  TaskCategory,
} from "@casamento/shared";
import type { EventCtx } from "../tenancy/types.ts";
import { applyItems } from "./service.ts";

/*
 * Modelos de tarefas prontos da PLATAFORMA (Fase 6, frente E). Tabelas globais (sem organização
 * nem evento, exceção registrada no auditor): as organizações só leem, copiam para o catálogo
 * delas ou aplicam num evento; quem edita é o platform admin.
 */

async function load(
  db: Database,
  opts: { id?: number; onlyActive: boolean; eventType?: string },
): Promise<PlatformTaskTemplateView[]> {
  const rows = await db
    .select()
    .from(platformTaskTemplates)
    .where(
      and(
        opts.onlyActive ? eq(platformTaskTemplates.active, true) : undefined,
        opts.id !== undefined ? eq(platformTaskTemplates.id, opts.id) : undefined,
        opts.eventType
          ? or(
              isNull(platformTaskTemplates.eventType),
              eq(platformTaskTemplates.eventType, opts.eventType),
            )
          : undefined,
      ),
    )
    .orderBy(asc(platformTaskTemplates.sort), asc(platformTaskTemplates.id));
  if (rows.length === 0) return [];
  const items = await db
    .select()
    .from(platformTaskTemplateItems)
    .orderBy(asc(platformTaskTemplateItems.sort), asc(platformTaskTemplateItems.id));
  return rows.map((t) => ({
    id: t.id,
    code: t.code,
    name: t.name,
    eventType: t.eventType,
    description: t.description,
    active: t.active,
    items: items
      .filter((i) => i.templateId === t.id)
      .map((i) => ({
        id: i.id,
        title: i.title,
        description: i.description,
        category: i.category as TaskCategory,
        offsetDays: i.offsetDays,
      })),
  }));
}

/** Modelos ativos (para as organizações); `eventType` traz o tipo + os de qualquer tipo. */
export const listPlatformTemplates = (db: Database, eventType?: string) =>
  load(db, { onlyActive: true, ...(eventType ? { eventType } : {}) });

/** Todos, inclusive inativos (painel da plataforma). */
export const listAllPlatformTemplates = (db: Database) => load(db, { onlyActive: false });

export async function getPlatformTemplate(
  db: Database,
  id: number,
  onlyActive = true,
): Promise<PlatformTaskTemplateView | null> {
  return (await load(db, { id, onlyActive }))[0] ?? null;
}

/** Troca nome, tipo, texto, situação e itens. false = não existe. */
export async function replacePlatformTemplate(
  db: Database,
  id: number,
  input: PlatformTaskTemplateInput,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [exists] = await tx
      .select({ id: platformTaskTemplates.id })
      .from(platformTaskTemplates)
      .where(eq(platformTaskTemplates.id, id))
      .for("update");
    if (!exists) return false;
    await tx
      .update(platformTaskTemplates)
      .set({
        name: input.name,
        eventType: input.eventType,
        description: input.description,
        active: input.active,
        updatedAt: new Date(),
      })
      .where(eq(platformTaskTemplates.id, id));
    await tx.delete(platformTaskTemplateItems).where(eq(platformTaskTemplateItems.templateId, id));
    if (input.items.length > 0) {
      await tx.insert(platformTaskTemplateItems).values(
        input.items.map((it, i) => ({
          templateId: id,
          title: it.title,
          description: it.description,
          category: it.category,
          offsetDays: it.offsetDays,
          sort: i + 1,
        })),
      );
    }
    return true;
  });
}

/** Copia o modelo da plataforma para o catálogo da organização. null = não existe/inativo. */
export async function copyPlatformTemplate(
  db: Database,
  orgId: number,
  id: number,
): Promise<number | null> {
  const t = await getPlatformTemplate(db, id);
  if (!t) return null;
  return db.transaction(async (tx) => {
    const [res] = await tx.insert(taskTemplates).values({
      organizationId: orgId,
      name: t.name,
      eventType: t.eventType,
      description: t.description,
    });
    if (t.items.length > 0) {
      await tx.insert(taskTemplateItems).values(
        t.items.map((it, i) => ({
          organizationId: orgId,
          templateId: res.insertId,
          title: it.title,
          description: it.description,
          category: it.category,
          offsetDays: it.offsetDays,
          sort: i + 1,
        })),
      );
    }
    return res.insertId;
  });
}

/** Aplica o modelo da plataforma direto no evento. null = não existe/inativo. */
export async function applyPlatformTemplate(
  db: Database,
  ev: EventCtx,
  id: number,
): Promise<number | null> {
  const t = await getPlatformTemplate(db, id);
  if (!t) return null;
  return applyItems(
    db,
    ev,
    t.items.map((i) => ({
      title: i.title,
      description: i.description,
      category: i.category,
      offsetDays: i.offsetDays,
    })),
  );
}
