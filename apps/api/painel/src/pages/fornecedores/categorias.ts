import {
  VENDOR_CATEGORIES,
  VENDOR_CATEGORY_LABELS,
  vendorCategoryLabel,
  type CategoryOption,
  type VendorCategoryView,
} from "@casamento/shared";
import { useCallback } from "react";
import { api, orgApi } from "../../api.ts";
import { useLoad } from "../../ui.tsx";

/* Fase 6, frente E: categorias de fornecedor (as 18 fixas + as próprias da organização). */

const FIXED: CategoryOption[] = VENDOR_CATEGORIES.map((key) => ({
  key,
  label: VENDOR_CATEGORY_LABELS[key],
  custom: false,
}));

export interface Categories {
  /** Para escolher (fixas + próprias não arquivadas). */
  options: CategoryOption[];
  /** Rótulo de qualquer chave, inclusive de categoria própria arquivada. */
  label: (key: string) => string;
}

/**
 * Categorias da organização do evento aberto (`scope: "event"`) ou da organização aberta
 * (`"org"`). Enquanto carrega (ou se falhar) valem as fixas.
 */
export function useCategories(scope: "event" | "org"): Categories {
  const { data } = useLoad(async () => {
    if (scope === "event") {
      return await api<{ options: CategoryOption[]; labels: Record<string, string> }>(
        "/vendor-catalog/categories",
      ).catch(() => null);
    }
    const r = await orgApi<{ categories: VendorCategoryView[]; options: CategoryOption[] }>(
      "/vendor-categories",
    ).catch(() => null);
    if (!r) return null;
    return {
      options: r.options,
      labels: Object.fromEntries(r.categories.map((c) => [c.key, c.label])),
    };
  }, [scope]);
  const labels = data?.labels;
  const label = useCallback((key: string) => vendorCategoryLabel(key, labels ?? {}), [labels]);
  return { options: data?.options ?? FIXED, label };
}
