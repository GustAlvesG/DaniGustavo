import {
  and,
  asc,
  eq,
  isNull,
  or,
  sql,
  taskTemplateItems,
  taskTemplates,
  type Database,
} from "@casamento/db";
import type { TaskTemplateInput, TaskTemplateSummary, TaskTemplateView } from "@casamento/shared";

/** Modelos da organização (com contagem de itens). `forEventType`: tipo do evento + os de qualquer tipo. */
export async function listTemplates(
  db: Database,
  orgId: number,
  forEventType?: string,
): Promise<TaskTemplateSummary[]> {
  const where = and(
    eq(taskTemplates.organizationId, orgId),
    forEventType
      ? or(isNull(taskTemplates.eventType), eq(taskTemplates.eventType, forEventType))
      : undefined,
  );
  const rows = await db
    .select()
    .from(taskTemplates)
    .where(where)
    .orderBy(asc(taskTemplates.name), asc(taskTemplates.id));
  if (rows.length === 0) return [];
  const counts = await db
    .select({ templateId: taskTemplateItems.templateId, n: sql<number>`count(*)` })
    .from(taskTemplateItems)
    .where(eq(taskTemplateItems.organizationId, orgId))
    .groupBy(taskTemplateItems.templateId);
  const byTemplate = new Map(counts.map((c) => [c.templateId, Number(c.n)]));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    eventType: r.eventType,
    description: r.description,
    itemCount: byTemplate.get(r.id) ?? 0,
  }));
}

export async function getTemplate(
  db: Database,
  orgId: number,
  id: number,
): Promise<TaskTemplateView | null> {
  const [t] = await db
    .select()
    .from(taskTemplates)
    .where(and(eq(taskTemplates.organizationId, orgId), eq(taskTemplates.id, id)));
  if (!t) return null;
  const items = await db
    .select()
    .from(taskTemplateItems)
    .where(and(eq(taskTemplateItems.organizationId, orgId), eq(taskTemplateItems.templateId, id)))
    .orderBy(asc(taskTemplateItems.sort), asc(taskTemplateItems.id));
  return {
    id: t.id,
    name: t.name,
    eventType: t.eventType,
    description: t.description,
    itemCount: items.length,
    items: items.map((i) => ({
      id: i.id,
      title: i.title,
      description: i.description,
      category: i.category as TaskTemplateView["items"][number]["category"],
      offsetDays: i.offsetDays,
      sort: i.sort,
    })),
  };
}

const itemRows = (orgId: number, templateId: number, input: TaskTemplateInput) =>
  input.items.map((it, i) => ({
    organizationId: orgId,
    templateId,
    title: it.title,
    description: it.description,
    category: it.category,
    offsetDays: it.offsetDays,
    sort: i + 1,
  }));

export async function createTemplate(
  db: Database,
  orgId: number,
  input: TaskTemplateInput,
): Promise<number> {
  return db.transaction(async (tx) => {
    const [res] = await tx.insert(taskTemplates).values({
      organizationId: orgId,
      name: input.name,
      eventType: input.eventType,
      description: input.description,
    });
    if (input.items.length > 0) {
      await tx.insert(taskTemplateItems).values(itemRows(orgId, res.insertId, input));
    }
    return res.insertId;
  });
}

/** Troca nome, tipo, descrição e todos os itens. false = modelo não é da organização. */
export async function replaceTemplate(
  db: Database,
  orgId: number,
  id: number,
  input: TaskTemplateInput,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [res] = await tx
      .update(taskTemplates)
      .set({ name: input.name, eventType: input.eventType, description: input.description })
      .where(and(eq(taskTemplates.organizationId, orgId), eq(taskTemplates.id, id)));
    if (res.affectedRows === 0) {
      const [exists] = await tx
        .select({ id: taskTemplates.id })
        .from(taskTemplates)
        .where(and(eq(taskTemplates.organizationId, orgId), eq(taskTemplates.id, id)));
      if (!exists) return false;
    }
    await tx
      .delete(taskTemplateItems)
      .where(
        and(eq(taskTemplateItems.organizationId, orgId), eq(taskTemplateItems.templateId, id)),
      );
    if (input.items.length > 0) {
      await tx.insert(taskTemplateItems).values(itemRows(orgId, id, input));
    }
    return true;
  });
}

export async function deleteTemplate(db: Database, orgId: number, id: number): Promise<boolean> {
  const [res] = await db
    .delete(taskTemplates)
    .where(and(eq(taskTemplates.organizationId, orgId), eq(taskTemplates.id, id)));
  return res.affectedRows > 0;
}
