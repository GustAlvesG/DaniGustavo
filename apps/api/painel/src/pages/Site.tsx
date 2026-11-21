import { ReadOnlyScope, useCan } from "../event.tsx";
import {
  HOME_SECTION_LABELS,
  SiteSections,
  type AdminMedia,
  type HomeSectionId,
  type PhotoRef,
} from "@casamento/shared";
import { useMemo, useState, type FormEvent } from "react";
import { api, errorMessage, send } from "../api.ts";
import {
  SECTION_SPECS,
  type FieldSpec,
  type ListSpec,
  type PhotoListSpec,
  type SectionSpec,
} from "../editor/fields.ts";
import { getPath, moveItem, setPath } from "../editor/logic.ts";
import { PhotoField, PhotoPicker, Thumb, type MediaIndex } from "../editor/PhotoField.tsx";
import { ErrorBox, Field, FormError, Loading, PageHeader, useLoad, useToast } from "../ui.tsx";
import "../editor.css";

/* Fase 2, frente A: editor das seções do site (textos e fotos da home e das páginas internas). */

type Sections = Record<string, unknown>;
type Item = Record<string, unknown>;
type Loaded = { sections: Sections; media: AdminMedia[]; isDefault: boolean };

async function load(): Promise<Loaded> {
  const [site, media] = await Promise.all([
    api<{ sections: Sections; isDefault: boolean }>("/site"),
    api<{ media: AdminMedia[] }>("/media"),
  ]);
  return { ...site, media: media.media };
}

export function Site() {
  const canWrite = useCan("content.write");
  return (
    <ReadOnlyScope readOnly={!canWrite}>
      <SitePage />
    </ReadOnlyScope>
  );
}

function SitePage() {
  const { data, error, loading, reload } = useLoad(load, []);
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error ?? "Sem dados."} onRetry={reload} />;
  return <Editor initial={data} />;
}

function Editor({ initial }: { initial: Loaded }) {
  const toast = useToast();
  const [sections, setSections] = useState<Sections>(initial.sections);
  const [dirty, setDirty] = useState(initial.isDefault);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const media = initial.media;
  const index: MediaIndex = useMemo(() => new Map(media.map((m) => [m.id, m])), [media]);

  const change = (path: string, value: unknown) => {
    setSections((s) => setPath(s, path, value));
    setDirty(true);
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const check = SiteSections.safeParse(sections);
    if (!check.success) {
      const issue = check.error.issues[0];
      return setError(`${issue?.message ?? "Confira os campos."} (${issue?.path.join(" › ")})`);
    }
    setBusy(true);
    setError(null);
    try {
      const r = await send<{ sections: Sections }>("PUT", "/site", { sections });
      setSections(r.sections);
      setDirty(false);
      toast("Site salvo. A mudança já aparece para os convidados.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack stack--lg" onSubmit={(e) => void onSubmit(e)} noValidate>
      <PageHeader
        title="Site"
        subtitle="Textos e fotos das seções. Os dados do evento (data, locais, programação) ficam em Configurações."
        actions={
          <button className="button" type="submit" disabled={busy || !dirty}>
            {busy ? "Salvando…" : "Salvar o site"}
          </button>
        }
      />
      {initial.isDefault && (
        <p className="alert alert--info">
          Estes são os textos padrão do tipo de evento. Edite e salve para personalizar.
        </p>
      )}

      <HomeOrder sections={sections} onChange={change} />

      {SECTION_SPECS.map((spec) => (
        <SectionEditor
          key={spec.id}
          spec={spec}
          sections={sections}
          media={media}
          index={index}
          onChange={change}
        />
      ))}

      <FormError message={error} />
      <div className="editor-savebar">
        <button className="button" type="submit" disabled={busy || !dirty}>
          {busy ? "Salvando…" : "Salvar o site"}
        </button>
        {dirty && <span className="muted small">Alterações ainda não salvas.</span>}
      </div>
    </form>
  );
}

function HomeOrder({
  sections,
  onChange,
}: {
  sections: Sections;
  onChange: (path: string, value: unknown) => void;
}) {
  const order = (getPath(sections, "order") ?? []) as { id: HomeSectionId; enabled: boolean }[];
  const set = (list: typeof order) => onChange("order", list);
  return (
    <section className="card stack" aria-labelledby="ed-ordem">
      <div>
        <h2 id="ed-ordem">Ordem da página inicial</h2>
        <p className="muted small">Mude a ordem e esconda seções sem perder o texto delas.</p>
      </div>
      <ul className="rows">
        {order.map((s, i) => (
          <li key={s.id} className={`row${s.enabled ? "" : " row--off"}`}>
            <div className="row__main">
              <span className="row__title">{HOME_SECTION_LABELS[s.id] ?? s.id}</span>
            </div>
            <div className="actions actions--tight">
              <label className="check">
                <input
                  type="checkbox"
                  checked={s.enabled}
                  onChange={(e) =>
                    set(order.map((x, j) => (j === i ? { ...x, enabled: e.target.checked } : x)))
                  }
                />
                Mostrar
              </label>
              <button
                type="button"
                className="icon-button"
                disabled={i === 0}
                onClick={() => set(moveItem(order, i, i - 1))}
                aria-label={`Subir ${HOME_SECTION_LABELS[s.id]}`}
              >
                ↑
              </button>
              <button
                type="button"
                className="icon-button"
                disabled={i === order.length - 1}
                onClick={() => set(moveItem(order, i, i + 1))}
                aria-label={`Descer ${HOME_SECTION_LABELS[s.id]}`}
              >
                ↓
              </button>
            </div>
          </li>
        ))}
      </ul>
      <label className="check">
        <input
          type="checkbox"
          checked={Boolean(getPath(sections, "numberPages"))}
          onChange={(e) => onChange("numberPages", e.target.checked)}
        />
        Numerar os rótulos como páginas de álbum (“Página 1 · …”)
      </label>
    </section>
  );
}

interface Common {
  media: AdminMedia[];
  index: MediaIndex;
}

function SectionEditor({
  spec,
  sections,
  media,
  index,
  onChange,
}: {
  spec: SectionSpec;
  sections: Sections;
  onChange: (path: string, value: unknown) => void;
} & Common) {
  return (
    <details className="card editor-section">
      <summary>
        <h2>{spec.title}</h2>
      </summary>
      <div className="stack">
        {spec.description && <p className="muted small">{spec.description}</p>}
        <div className="form-grid">
          {spec.fields.map((f) => (
            <FieldInput
              key={f.path}
              spec={f}
              value={getPath(sections, f.path)}
              media={media}
              index={index}
              onChange={(v) => onChange(f.path, v)}
            />
          ))}
        </div>
        {spec.photoLists?.map((pl) => (
          <PhotoListEditor
            key={pl.path}
            spec={pl}
            items={(getPath(sections, pl.path) ?? []) as unknown[]}
            media={media}
            index={index}
            onChange={(v) => onChange(pl.path, v)}
          />
        ))}
        {spec.lists?.map((ls) => (
          <ListEditor
            key={ls.path}
            spec={ls}
            items={(getPath(sections, ls.path) ?? []) as Item[]}
            media={media}
            index={index}
            onChange={(v) => onChange(ls.path, v)}
          />
        ))}
      </div>
    </details>
  );
}

function FieldInput({
  spec,
  value,
  media,
  index,
  onChange,
}: {
  spec: FieldSpec;
  value: unknown;
  onChange: (v: unknown) => void;
} & Common) {
  if (spec.kind === "photo") {
    return (
      <div className="span-2">
        <PhotoField
          label={spec.label}
          value={(value ?? null) as PhotoRef | null}
          media={media}
          index={index}
          onChange={onChange}
        />
      </div>
    );
  }
  if (spec.kind === "textarea" || spec.kind === "lines") {
    const lines = spec.kind === "lines";
    return (
      <Field label={spec.label} hint={spec.hint} className="span-2">
        <textarea
          rows={lines ? 5 : 3}
          value={lines ? ((value ?? []) as string[]).join("\n") : String(value ?? "")}
          onChange={(e) => onChange(lines ? e.target.value.split("\n") : e.target.value)}
        />
      </Field>
    );
  }
  if (spec.kind === "number") {
    return (
      <Field label={spec.label} hint={spec.hint}>
        <input
          type="number"
          inputMode="numeric"
          value={value === null || value === undefined ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        />
      </Field>
    );
  }
  return (
    <Field label={spec.label} hint={spec.hint}>
      <input
        value={String(value ?? "")}
        inputMode={spec.kind === "link" ? "url" : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

function ListEditor({
  spec,
  items,
  media,
  index,
  onChange,
}: {
  spec: ListSpec;
  items: Item[];
  onChange: (items: Item[]) => void;
} & Common) {
  const set = (i: number, path: string, value: unknown) =>
    onChange(items.map((it, j) => (j === i ? setPath(it, path, value) : it)));
  return (
    <div className="stack">
      <span className="field__label">{spec.label}</span>
      {items.map((it, i) => {
        const name = String(it[spec.nameField] || `${spec.itemLabel} ${i + 1}`);
        return (
          <fieldset key={i} className="sub-card form-grid">
            <legend className="sr-only">{name}</legend>
            {spec.fields.map((f) => (
              <FieldInput
                key={f.path}
                spec={f}
                value={getPath(it, f.path)}
                media={media}
                index={index}
                onChange={(v) => set(i, f.path, v)}
              />
            ))}
            <div className="actions actions--tight span-2">
              <button
                type="button"
                className="icon-button"
                disabled={i === 0}
                onClick={() => onChange(moveItem(items, i, i - 1))}
                aria-label={`Subir ${name}`}
              >
                ↑
              </button>
              <button
                type="button"
                className="icon-button"
                disabled={i === items.length - 1}
                onClick={() => onChange(moveItem(items, i, i + 1))}
                aria-label={`Descer ${name}`}
              >
                ↓
              </button>
              <button
                type="button"
                className="button button--small button--danger-ghost"
                onClick={() => onChange(items.filter((_, j) => j !== i))}
              >
                Remover
              </button>
            </div>
          </fieldset>
        );
      })}
      <div>
        <button
          type="button"
          className="button button--small button--ghost"
          disabled={items.length >= spec.max}
          onClick={() => onChange([...items, { ...spec.blank }])}
        >
          + Adicionar {spec.itemLabel.toLowerCase()}
        </button>
      </div>
    </div>
  );
}

function PhotoListEditor({
  spec,
  items,
  media,
  index,
  onChange,
}: {
  spec: PhotoListSpec;
  items: unknown[];
  onChange: (items: unknown[]) => void;
} & Common) {
  const [picking, setPicking] = useState(false);
  const refOf = (it: unknown) => (spec.withCaption ? (it as Item).photo : it) as PhotoRef;
  return (
    <div className="stack">
      <span className="field__label">{spec.label}</span>
      <ul className="rows">
        {items.map((it, i) => {
          const ref = refOf(it);
          const found = index.get(ref.mediaId);
          const name = found?.alt || found?.caption || `Foto ${i + 1}`;
          return (
            <li key={i} className="row">
              <Thumb media={found} />
              <div className="row__main stack">
                {spec.withCaption && (
                  <Field label="Legenda">
                    <input
                      value={String((it as Item).caption ?? "")}
                      maxLength={120}
                      onChange={(e) =>
                        onChange(
                          items.map((x, j) =>
                            j === i ? { ...(x as Item), caption: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </Field>
                )}
                {!found && <span className="field__hint">Foto apagada: remova da lista.</span>}
              </div>
              <div className="actions actions--tight">
                <button
                  type="button"
                  className="icon-button"
                  disabled={i === 0}
                  onClick={() => onChange(moveItem(items, i, i - 1))}
                  aria-label={`Subir ${name}`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="icon-button"
                  disabled={i === items.length - 1}
                  onClick={() => onChange(moveItem(items, i, i + 1))}
                  aria-label={`Descer ${name}`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="button button--small button--danger-ghost"
                  onClick={() => onChange(items.filter((_, j) => j !== i))}
                >
                  Remover
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <div>
        <button
          type="button"
          className="button button--small button--ghost"
          disabled={items.length >= spec.max}
          onClick={() => setPicking(true)}
        >
          + Adicionar foto
        </button>
      </div>
      <PhotoPicker
        open={picking}
        media={media}
        onClose={() => setPicking(false)}
        onPick={(m) => {
          const ref: PhotoRef = { mediaId: m.id, alt: "", position: "" };
          onChange([...items, spec.withCaption ? { photo: ref, caption: "" } : ref]);
          setPicking(false);
        }}
      />
    </div>
  );
}
