import {
  VENDOR_CATEGORIES,
  VENDOR_CATEGORY_LABELS,
  type VendorCategory,
  type VendorInput,
  type VendorRow,
} from "@casamento/shared";
import { useState, type FormEvent } from "react";
import { errorMessage } from "../../api.ts";
import { Field, FormError } from "../../ui.tsx";

/* Fase 4, frente B: campos do fornecedor, usados no catálogo da organização e ao ligar ao evento. */

export interface VendorDraft {
  name: string;
  category: VendorCategory;
  contactName: string;
  email: string;
  phone: string;
  website: string;
  document: string;
  notes: string;
  rating: string;
}

export const emptyDraft = (): VendorDraft => ({
  name: "",
  category: "outros",
  contactName: "",
  email: "",
  phone: "",
  website: "",
  document: "",
  notes: "",
  rating: "",
});

export const draftOf = (v: VendorRow): VendorDraft => ({
  name: v.name,
  category: v.category,
  contactName: v.contactName ?? "",
  email: v.email ?? "",
  phone: v.phone ?? "",
  website: v.website ?? "",
  document: v.document ?? "",
  notes: v.notes ?? "",
  rating: v.rating ? String(v.rating) : "",
});

/** Corpo para a API (texto vazio vira null; a nota 1 a 5 vira número). */
export const draftBody = (d: VendorDraft): VendorInput => ({
  name: d.name,
  category: d.category,
  contactName: d.contactName || null,
  email: d.email || null,
  phone: d.phone || null,
  website: d.website || null,
  document: d.document || null,
  notes: d.notes || null,
  rating: d.rating ? Number(d.rating) : null,
});

export function RatingStars({ rating }: { rating: number | null }) {
  if (!rating) return <span className="muted small">Sem avaliação</span>;
  return (
    <span aria-label={`Avaliação ${rating} de 5`}>
      {"★".repeat(rating)}
      <span className="muted">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

export function VendorForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: VendorDraft;
  submitLabel: string;
  onSubmit: (draft: VendorDraft) => Promise<void>;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof VendorDraft>(key: K, value: VendorDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit(draft);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <div className="form-grid">
        <Field label="Nome" className="span-2">
          <input
            value={draft.name}
            maxLength={191}
            required
            onChange={(e) => set("name", e.target.value)}
          />
        </Field>
        <Field label="Categoria">
          <select
            value={draft.category}
            onChange={(e) => set("category", e.target.value as VendorCategory)}
          >
            {VENDOR_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {VENDOR_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Avaliação">
          <select value={draft.rating} onChange={(e) => set("rating", e.target.value)}>
            <option value="">Sem avaliação</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {"★".repeat(n)} ({n})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Pessoa de contato">
          <input
            value={draft.contactName}
            maxLength={191}
            onChange={(e) => set("contactName", e.target.value)}
          />
        </Field>
        <Field label="Telefone ou WhatsApp">
          <input
            value={draft.phone}
            maxLength={32}
            inputMode="tel"
            onChange={(e) => set("phone", e.target.value)}
          />
        </Field>
        <Field label="E-mail">
          <input type="email" value={draft.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Site ou Instagram">
          <input
            value={draft.website}
            maxLength={300}
            onChange={(e) => set("website", e.target.value)}
          />
        </Field>
        <Field label="CPF ou CNPJ" hint="Opcional. Guardamos só os números.">
          <input
            value={draft.document}
            maxLength={20}
            inputMode="numeric"
            onChange={(e) => set("document", e.target.value)}
          />
        </Field>
        <Field label="Observações" className="span-2">
          <textarea
            rows={3}
            value={draft.notes}
            maxLength={5000}
            onChange={(e) => set("notes", e.target.value)}
          />
        </Field>
      </div>
      <FormError message={error} />
      <div className="actions actions--end">
        {onCancel ? (
          <button type="button" className="button button--ghost" onClick={onCancel}>
            Cancelar
          </button>
        ) : null}
        <button className="button" disabled={saving || !draft.name.trim()}>
          {saving ? "Salvando…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
