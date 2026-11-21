import { and, asc, eq, inArray, vendorCategories, type Database } from "@casamento/db";
import {
  VENDOR_CATEGORIES,
  VENDOR_CATEGORY_LABELS,
  type CategoryOption,
  type VendorCategory,
} from "@casamento/shared";

/* Categorias de fornecedor: as 18 fixas + as próprias da organização (Fase 6, frente E). */

const isFixed = (key: string): key is VendorCategory =>
  (VENDOR_CATEGORIES as readonly string[]).includes(key);

/** Mensagem de erro quando a categoria não vale para a organização; `null` quando vale. */
export async function categoryProblem(
  db: Database,
  orgId: number,
  key: string | undefined | null,
  opts: { allowArchived?: boolean } = {},
): Promise<string | null> {
  if (key === undefined || key === null || isFixed(key)) return null;
  const [row] = await db
    .select({ archivedAt: vendorCategories.archivedAt })
    .from(vendorCategories)
    .where(and(eq(vendorCategories.organizationId, orgId), eq(vendorCategories.key, key)));
  if (!row) return "Categoria inválida.";
  if (row.archivedAt && !opts.allowArchived) return "Esta categoria está arquivada.";
  return null;
}

/** Primeira categoria inválida de uma lista (ou `null`). */
export async function categoriesProblem(
  db: Database,
  orgId: number,
  keys: readonly string[],
  opts: { allowArchived?: boolean } = {},
): Promise<string | null> {
  const custom = [...new Set(keys.filter((k) => !isFixed(k)))];
  if (!custom.length) return null;
  const rows = await db
    .select({ key: vendorCategories.key, archivedAt: vendorCategories.archivedAt })
    .from(vendorCategories)
    .where(and(eq(vendorCategories.organizationId, orgId), inArray(vendorCategories.key, custom)));
  const found = new Map(rows.map((r) => [r.key, r]));
  for (const k of custom) {
    const r = found.get(k);
    if (!r) return "Categoria inválida.";
    if (r.archivedAt && !opts.allowArchived) return "Esta categoria está arquivada.";
  }
  return null;
}

/** Opções de escolha: fixas + próprias não arquivadas (ordem: fixas, depois `sort`/rótulo). */
export async function categoryOptions(db: Database, orgId: number): Promise<CategoryOption[]> {
  const rows = await db
    .select()
    .from(vendorCategories)
    .where(eq(vendorCategories.organizationId, orgId))
    .orderBy(asc(vendorCategories.sort), asc(vendorCategories.label), asc(vendorCategories.id));
  return [
    ...VENDOR_CATEGORIES.map((key) => ({ key, label: VENDOR_CATEGORY_LABELS[key], custom: false })),
    ...rows.filter((r) => !r.archivedAt).map((r) => ({ key: r.key, label: r.label, custom: true })),
  ];
}

/** Rótulos de todas as próprias da organização (inclusive arquivadas), para exibir o que já usa. */
export async function customLabels(db: Database, orgId: number): Promise<Record<string, string>> {
  const rows = await db
    .select({ key: vendorCategories.key, label: vendorCategories.label })
    .from(vendorCategories)
    .where(eq(vendorCategories.organizationId, orgId));
  return Object.fromEntries(rows.map((r) => [r.key, r.label]));
}

/** `c-<slug>` do rótulo: minúsculas, sem acento, hífens, até 32 caracteres. */
export function categoryKeyFromLabel(label: string): string {
  const slug = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 29)
    .replace(/-+$/g, "");
  return slug ? `c-${slug}` : "";
}
