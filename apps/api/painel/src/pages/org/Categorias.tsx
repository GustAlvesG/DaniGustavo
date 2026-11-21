import type { CategoryOption, VendorCategoryView } from "@casamento/shared";
import { useState, type FormEvent } from "react";
import { errorMessage, orgApi, orgSend } from "../../api.ts";
import {
  Badge,
  ErrorBox,
  Field,
  FormError,
  Loading,
  PageHeader,
  useLoad,
  useToast,
} from "../../ui.tsx";

/* Fase 6, frente E: categorias de fornecedor próprias da organização (#/o/:orgId/categorias). */

interface CategoriesData {
  categories: VendorCategoryView[];
  options: CategoryOption[];
}

export function OrgCategorias() {
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(
    () => orgApi<CategoriesData>("/vendor-categories"),
    [],
  );
  const [label, setLabel] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function create(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await orgSend("POST", "/vendor-categories", { label });
      toast("Categoria criada.");
      setLabel("");
      reload();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function patch(c: VendorCategoryView, body: { label?: string; archived?: boolean }) {
    try {
      await orgSend("PATCH", `/vendor-categories/${c.id}`, body);
      toast(
        body.archived === undefined
          ? "Categoria renomeada."
          : body.archived
            ? "Categoria arquivada."
            : "Categoria reativada.",
      );
      reload();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <div className="stack stack--lg">
      <PageHeader
        title="Categorias de fornecedor"
        subtitle="Além das categorias de sempre (Local, Buffet, Fotografia…), a organização pode criar as suas. Elas valem no catálogo, nos fornecedores dos eventos e no financeiro."
      />
      <form
        className="card stack"
        onSubmit={(e) => void create(e)}
        noValidate
        aria-labelledby="cat-nova"
      >
        <h2 id="cat-nova">Nova categoria</h2>
        <Field label="Nome" hint="Ex.: Brinquedoteca, Segurança, Barman.">
          <input value={label} maxLength={64} onChange={(e) => setLabel(e.target.value)} required />
        </Field>
        <FormError message={formError} />
        <div>
          <button className="button" type="submit" disabled={saving || !label.trim()}>
            {saving ? "Criando…" : "Criar categoria"}
          </button>
        </div>
      </form>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data ? <Loading /> : null}
      {data && data.categories.length === 0 && (
        <p className="empty">Nenhuma categoria própria ainda.</p>
      )}
      {data && data.categories.length > 0 && (
        <ul className="rows">
          {data.categories.map((c) => (
            <li
              key={c.id}
              className={`row${c.archived ? " row--off" : ""}`}
              data-testid="categoria"
            >
              <div className="row__main">
                <span className="row__title">{c.label}</span>
                <span className="row__meta">
                  {c.usage === 0
                    ? "Sem uso ainda"
                    : `Em uso: ${c.usage} ${c.usage === 1 ? "registro" : "registros"}`}
                </span>
              </div>
              <div className="row__side">
                {c.archived ? <Badge tone="muted">Arquivada</Badge> : null}
                <button
                  className="button button--small button--ghost"
                  onClick={() => {
                    const next = window.prompt("Novo nome da categoria", c.label);
                    if (next && next.trim() && next.trim() !== c.label) {
                      void patch(c, { label: next.trim() });
                    }
                  }}
                >
                  Renomear
                </button>
                <button
                  className="button button--small button--ghost"
                  onClick={() => void patch(c, { archived: !c.archived })}
                >
                  {c.archived ? "Reativar" : "Arquivar"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
