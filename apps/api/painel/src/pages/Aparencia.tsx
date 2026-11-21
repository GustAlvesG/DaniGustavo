import { ReadOnlyScope, useCan } from "../event.tsx";
import {
  FONTS,
  NO_SCRIPT,
  type FontId,
  type FontRole,
  type PaletteColors,
  type ResolvedTheme,
  type ThemeDef,
  type ThemeSelection,
} from "@casamento/shared";
import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { api, errorMessage, send } from "../api.ts";
import { ErrorBox, Field, FormError, Loading, PageHeader, useLoad, useToast } from "../ui.tsx";

type AppearanceData = {
  themes: ThemeDef[];
  selection: ThemeSelection | null;
  resolved: ResolvedTheme;
};

const ROLES: { role: FontRole; label: string; hint: string }[] = [
  { role: "text", label: "Fonte dos títulos", hint: "Títulos e destaques do site." },
  { role: "ui", label: "Fonte do texto e dos botões", hint: "Texto corrido, menu e botões." },
  { role: "script", label: "Fonte dos nomes", hint: "Nome do evento no topo e no rodapé." },
];

const fontLabel = (id: string) =>
  id === NO_SCRIPT ? "Sem fonte cursiva (usa a dos títulos)" : (FONTS[id as FontId]?.family ?? id);

/** Escolha do rascunho → o que o site mostraria (mesma regra de resolveTheme, só para a prévia). */
function preview(def: ThemeDef, sel: ThemeSelection) {
  const palette = def.palettes.find((p) => p.id === sel.palette) ?? def.palettes[0]!;
  const fonts = {
    text: sel.fonts?.text ?? def.fonts.text[0]!,
    ui: sel.fonts?.ui ?? def.fonts.ui[0]!,
    script: sel.fonts?.script ?? def.fonts.script[0]!,
  };
  return { palette, fonts };
}

/** Miniatura do site com as cores da paleta (as fontes só aparecem no site publicado). */
function Mini({ colors, name }: { colors: PaletteColors; name: string }) {
  const box: CSSProperties = {
    background: colors.papel,
    border: "1px solid rgb(0 0 0 / 0.12)",
    borderRadius: 8,
    overflow: "hidden",
    fontSize: 13,
  };
  return (
    <div style={box} aria-hidden="true" data-testid="aparencia-mini">
      <div style={{ background: colors.marinho, color: colors.branco, padding: "8px 12px" }}>
        {name}
        <span style={{ color: colors.nevoa, marginLeft: 8 }}>· data</span>
      </div>
      <div style={{ padding: "12px 12px 14px", color: colors.tinta }}>
        <div style={{ fontSize: 18, fontWeight: 600 }}>
          Seu <span style={{ color: colors.enfase, fontStyle: "italic" }}>evento</span>
        </div>
        <div style={{ color: colors.suave, margin: "2px 0 8px" }}>Texto secundário</div>
        <span
          style={{
            display: "inline-block",
            background: colors.tinta,
            color: colors.branco,
            borderRadius: 999,
            padding: "4px 12px",
          }}
        >
          Confirmar
        </span>
        <span
          style={{
            display: "inline-block",
            width: 28,
            height: 8,
            borderRadius: 4,
            background: colors.serenity,
            marginLeft: 10,
          }}
        />
      </div>
      <div style={{ background: colors.areia, height: 10 }} />
    </div>
  );
}

/** Aparência do site: tema, paleta e fontes entre as opções prontas (contraste já conferido). */
export function Aparencia() {
  const canWrite = useCan("content.write");
  return (
    <ReadOnlyScope readOnly={!canWrite}>
      <AparenciaPage />
    </ReadOnlyScope>
  );
}

function AparenciaPage() {
  const toast = useToast();
  const { data, setData, error, loading, reload } = useLoad(
    () => api<AppearanceData>("/appearance"),
    [],
  );
  const [draft, setDraft] = useState<ThemeSelection | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    const r = data.resolved;
    setDraft({ theme: r.theme, palette: r.palette, fonts: { ...r.fonts } });
  }, [data]);

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox message={error} onRetry={reload} />;
  if (!data || !draft) return null;

  const def = data.themes.find((t) => t.id === draft.theme)!;
  const { palette, fonts } = preview(def, draft);
  const dirty =
    draft.theme !== data.resolved.theme ||
    palette.id !== data.resolved.palette ||
    ROLES.some(({ role }) => fonts[role] !== data.resolved.fonts[role]);

  function chooseTheme(t: ThemeDef) {
    // Trocar de tema volta para a paleta e as fontes padrão dele.
    setDraft({ theme: t.id });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const body: ThemeSelection = { theme: def.id, palette: palette.id, fonts };
      await send("PUT", "/appearance", body);
      setData(await api<AppearanceData>("/appearance"));
      toast("Aparência salva. O site já mostra o novo visual.");
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack stack--lg">
      <PageHeader title="Aparência" subtitle="Tema, cores e fontes do site." />
      <form className="stack stack--lg" onSubmit={save} noValidate>
        <section className="card stack" aria-labelledby="ap-tema">
          <div>
            <h2 id="ap-tema">Tema</h2>
            <p className="muted small">Define o desenho do site: formas, fotos e tipografia.</p>
          </div>
          <div role="radiogroup" aria-labelledby="ap-tema" className="stack">
            {data.themes.map((t) => (
              <label key={t.id} className="check" style={{ alignItems: "flex-start" }}>
                <input
                  type="radio"
                  name="tema"
                  checked={draft.theme === t.id}
                  onChange={() => chooseTheme(t)}
                />
                <span>
                  <strong>{t.name}</strong>
                  <br />
                  <span className="muted small">{t.description}</span>
                </span>
              </label>
            ))}
          </div>
        </section>

        <section className="card stack" aria-labelledby="ap-paleta">
          <div>
            <h2 id="ap-paleta">Cores</h2>
            <p className="muted small">
              Paletas prontas, com contraste conferido para o texto ficar legível.
            </p>
          </div>
          <div role="radiogroup" aria-labelledby="ap-paleta" className="stack">
            {def.palettes.map((p) => (
              <label key={p.id} className="check" style={{ alignItems: "center" }}>
                <input
                  type="radio"
                  name="paleta"
                  checked={palette.id === p.id}
                  onChange={() => setDraft({ ...draft, palette: p.id, fonts })}
                />
                <span style={{ display: "inline-flex", gap: 3 }} aria-hidden="true">
                  {(["marinho", "enfase", "serenity", "papel"] as const).map((k) => (
                    <i
                      key={k}
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 4,
                        background: p.colors[k],
                        border: "1px solid rgb(0 0 0 / 0.15)",
                      }}
                    />
                  ))}
                </span>
                {p.name}
              </label>
            ))}
          </div>
        </section>

        <section className="card stack" aria-labelledby="ap-fontes">
          <div>
            <h2 id="ap-fontes">Fontes</h2>
            <p className="muted small">Letras do site, dentro das opções deste tema.</p>
          </div>
          {ROLES.map(({ role, label, hint }) => (
            <Field key={role} label={label} hint={hint}>
              <select
                value={fonts[role]}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    palette: palette.id,
                    fonts: { ...fonts, [role]: e.target.value },
                  })
                }
              >
                {def.fonts[role].map((id) => (
                  <option key={id} value={id}>
                    {fontLabel(id)}
                  </option>
                ))}
              </select>
            </Field>
          ))}
        </section>

        <section className="card stack" aria-labelledby="ap-previa">
          <div>
            <h2 id="ap-previa">Prévia</h2>
            <p className="muted small">
              Mostra as cores escolhidas. As fontes e o desenho aparecem no site publicado.
            </p>
          </div>
          <Mini colors={palette.colors} name="Nome do evento" />
        </section>

        <FormError message={formError} />
        <div>
          <button className="button" type="submit" disabled={saving || !dirty}>
            {saving ? "Salvando…" : "Salvar aparência"}
          </button>
        </div>
      </form>
    </div>
  );
}
