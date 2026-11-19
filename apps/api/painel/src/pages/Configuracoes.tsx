import { parseSettings, type SettingsKey } from "@casamento/shared";
import { useState, type FormEvent, type ReactNode } from "react";
import { api, errorMessage, send } from "../api.ts";
import { isoToLocalInput, localInputToIso } from "../format.ts";
import { ErrorBox, Field, FormError, Loading, PageHeader, useLoad, useToast } from "../ui.tsx";
import { eh } from "../nav.ts";

type Values = Record<string, unknown>;
type Item = Record<string, unknown>;

/* ------------------------------------------------------------------------ */
/* Peças                                                                     */
/* ------------------------------------------------------------------------ */

/** Seção com o próprio botão de salvar: envia só as chaves dela. */
function Section({
  id,
  title,
  description,
  keys,
  values,
  onSaved,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  keys: SettingsKey[];
  values: Values;
  onSaved: () => void;
  children: ReactNode;
}) {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const subset = Object.fromEntries(keys.map((k) => [k, values[k]]));
    const check = parseSettings(subset);
    if (!check.ok) return setError(check.message);
    setBusy(true);
    setError(null);
    try {
      await send("PUT", "/settings", { values: subset });
      toast(`${title}: salvo. O site já mostra a mudança.`);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={onSubmit} noValidate aria-labelledby={id}>
      <div>
        <h2 id={id}>{title}</h2>
        {description && <p className="muted small">{description}</p>}
      </div>
      {children}
      <FormError message={error} />
      <div>
        <button className="button" type="submit" disabled={busy}>
          {busy ? "Salvando…" : `Salvar ${title.toLowerCase()}`}
        </button>
      </div>
    </form>
  );
}

type FieldSpec = {
  key: string;
  label: string;
  type?: "text" | "textarea" | "number" | "url" | "color";
  wide?: boolean;
};

/** Lista editável (programação, FAQ, hospedagem…): adicionar, remover e reordenar itens. */
function ListEditor({
  label,
  items,
  fields,
  blank,
  onChange,
  itemName,
}: {
  label: string;
  items: Item[];
  fields: FieldSpec[];
  blank: Item;
  onChange: (items: Item[]) => void;
  itemName: (item: Item, i: number) => string;
}) {
  const set = (i: number, key: string, value: unknown) =>
    onChange(items.map((it, j) => (j === i ? { ...it, [key]: value } : it)));
  const move = (i: number, d: number) => {
    const list = [...items];
    const [x] = list.splice(i, 1);
    list.splice(i + d, 0, x!);
    onChange(list);
  };
  return (
    <div className="stack">
      <span className="field__label">{label}</span>
      {items.map((it, i) => (
        <fieldset key={i} className="sub-card form-grid">
          <legend className="sr-only">{itemName(it, i)}</legend>
          {fields.map((f) => {
            const raw = it[f.key];
            const common = {
              value: raw === null || raw === undefined ? "" : String(raw),
            };
            return (
              <Field key={f.key} label={f.label} className={f.wide ? "span-2" : undefined}>
                {f.type === "textarea" ? (
                  <textarea rows={3} {...common} onChange={(e) => set(i, f.key, e.target.value)} />
                ) : (
                  <input
                    type={f.type === "number" ? "number" : f.type === "color" ? "color" : "text"}
                    inputMode={
                      f.type === "number" ? "decimal" : f.type === "url" ? "url" : undefined
                    }
                    {...common}
                    onChange={(e) => {
                      const v = e.target.value;
                      set(
                        i,
                        f.key,
                        f.type === "number"
                          ? v === ""
                            ? null
                            : Number(v)
                          : f.type === "url"
                            ? v.trim() || null
                            : v,
                      );
                    }}
                  />
                )}
              </Field>
            );
          })}
          <div className="actions actions--tight span-2">
            <button
              type="button"
              className="icon-button"
              disabled={i === 0}
              onClick={() => move(i, -1)}
              aria-label={`Subir ${itemName(it, i)}`}
            >
              ↑
            </button>
            <button
              type="button"
              className="icon-button"
              disabled={i === items.length - 1}
              onClick={() => move(i, 1)}
              aria-label={`Descer ${itemName(it, i)}`}
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
      ))}
      <div>
        <button
          type="button"
          className="button button--small button--ghost"
          onClick={() => onChange([...items, { ...blank }])}
        >
          + Adicionar
        </button>
      </div>
    </div>
  );
}

function DateTimeField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (iso: string) => void;
}) {
  return (
    <Field label={label} hint={hint ?? "Horário de Brasília."}>
      <input
        type="datetime-local"
        step={1}
        value={value ? isoToLocalInput(value) : ""}
        onChange={(e) => e.target.value && onChange(localInputToIso(e.target.value, value))}
      />
    </Field>
  );
}

function VenueFields({ value, onChange }: { value: Item; onChange: (v: Item) => void }) {
  const set = (k: string, v: unknown) => onChange({ ...value, [k]: v });
  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
  return (
    <div className="form-grid">
      <Field label="Nome do local">
        <input value={String(value.name ?? "")} onChange={(e) => set("name", e.target.value)} />
      </Field>
      <Field label="Horário" hint="Texto livre, ex.: 16h.">
        <input value={String(value.time ?? "")} onChange={(e) => set("time", e.target.value)} />
      </Field>
      <Field label="Endereço" className="span-2">
        <input
          value={String(value.address ?? "")}
          onChange={(e) => set("address", e.target.value)}
        />
      </Field>
      <Field
        label="Link do mapa (opcional)"
        hint="Vazio: o site monta o link do Google Maps pelo endereço ou coordenadas."
        className="span-2"
      >
        <input
          type="url"
          inputMode="url"
          value={String(value.mapsUrl ?? "")}
          onChange={(e) => set("mapsUrl", e.target.value.trim() || null)}
        />
      </Field>
      <Field label="Latitude" hint="Ex.: -22.5231">
        <input
          inputMode="decimal"
          value={value.lat === null || value.lat === undefined ? "" : String(value.lat)}
          onChange={(e) => set("lat", num(e.target.value))}
        />
      </Field>
      <Field label="Longitude" hint="Ex.: -44.1040">
        <input
          inputMode="decimal"
          value={value.lng === null || value.lng === undefined ? "" : String(value.lng)}
          onChange={(e) => set("lng", num(e.target.value))}
        />
      </Field>
    </div>
  );
}

/** Edição em JSON para estruturas grandes (manual dos padrinhos). Valida antes de salvar. */
function JsonField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [bad, setBad] = useState(false);
  return (
    <Field
      label={label}
      hint={bad ? "JSON inválido: confira vírgulas e aspas." : "Formato JSON. Edite com cuidado."}
    >
      <textarea
        className="mono"
        rows={14}
        value={text}
        aria-invalid={bad}
        onChange={(e) => {
          setText(e.target.value);
          try {
            onChange(JSON.parse(e.target.value));
            setBad(false);
          } catch {
            setBad(true);
          }
        }}
      />
    </Field>
  );
}

/* ------------------------------------------------------------------------ */
/* Página                                                                    */
/* ------------------------------------------------------------------------ */

const SECTIONS = [
  ["cfg-casal", "Casal e datas"],
  ["cfg-locais", "Locais"],
  ["cfg-contato", "Contato"],
  ["cfg-pagamentos", "Presentes e pagamento"],
  ["cfg-programacao", "Programação"],
  ["cfg-traje", "Traje"],
  ["cfg-hospedagem", "Hospedagem"],
  ["cfg-faq", "Dúvidas"],
  ["cfg-seo", "Compartilhamento"],
  ["cfg-avancado", "Avançado"],
] as const;

export function Configuracoes() {
  const { data, setData, error, loading, reload } = useLoad(
    () => api<{ values: Values; siteUrl: string }>("/settings"),
    [],
  );
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error ?? "Sem dados."} onRetry={reload} />;

  const v = data.values;
  const set = (key: SettingsKey, value: unknown) =>
    setData({ ...data, values: { ...v, [key]: value } });
  const obj = (key: SettingsKey) => (v[key] ?? {}) as Item;
  const list = (key: SettingsKey) => (v[key] ?? []) as Item[];
  const sectionProps = { values: v, onSaved: () => undefined };
  const contact = obj("couple.contact");
  const dress = obj("dresscode");
  const seo = obj("seo");

  return (
    <div className="stack stack--lg">
      <PageHeader
        title="Configurações"
        subtitle={
          <>
            Textos e dados do site. Cada bloco salva sozinho e o site atualiza na hora.{" "}
            <a href={data.siteUrl} target="_blank" rel="noreferrer">
              Abrir o site
            </a>
          </>
        }
      />
      <nav className="toc" aria-label="Blocos das configurações">
        {SECTIONS.map(([id, label]) => (
          <a
            key={id}
            href={eh(`/configuracoes`)}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            {label}
          </a>
        ))}
      </nav>

      <Section
        id="cfg-casal"
        title="Casal e datas"
        keys={["couple.names", "couple.monogram", "wedding.datetime", "rsvp.deadline"]}
        {...sectionProps}
      >
        <div className="form-grid">
          <Field label="Nomes do casal">
            <input
              value={String(v["couple.names"] ?? "")}
              onChange={(e) => set("couple.names", e.target.value)}
            />
          </Field>
          <Field label="Monograma">
            <input
              value={String(v["couple.monogram"] ?? "")}
              maxLength={8}
              onChange={(e) => set("couple.monogram", e.target.value)}
            />
          </Field>
          <DateTimeField
            label="Data e hora do casamento"
            value={String(v["wedding.datetime"] ?? "")}
            onChange={(iso) => set("wedding.datetime", iso)}
          />
          <DateTimeField
            label="Prazo para confirmar presença"
            hint="Depois disso o site não aceita respostas e mostra o contato de vocês."
            value={String(v["rsvp.deadline"] ?? "")}
            onChange={(iso) => set("rsvp.deadline", iso)}
          />
        </div>
      </Section>

      <Section
        id="cfg-locais"
        title="Locais"
        keys={["ceremony.venue", "reception.venue"]}
        {...sectionProps}
      >
        <h3>Cerimônia</h3>
        <VenueFields value={obj("ceremony.venue")} onChange={(x) => set("ceremony.venue", x)} />
        <h3>Recepção</h3>
        <VenueFields value={obj("reception.venue")} onChange={(x) => set("reception.venue", x)} />
      </Section>

      <Section id="cfg-contato" title="Contato" keys={["couple.contact"]} {...sectionProps}>
        <div className="form-grid">
          <Field label="WhatsApp" hint="Só números, com 55 e DDD: 5524999990000.">
            <input
              inputMode="numeric"
              value={String(contact.whatsapp ?? "")}
              onChange={(e) =>
                set("couple.contact", { ...contact, whatsapp: e.target.value.replace(/\D/g, "") })
              }
            />
          </Field>
          <Field label="E-mail">
            <input
              type="email"
              value={String(contact.email ?? "")}
              onChange={(e) => set("couple.contact", { ...contact, email: e.target.value.trim() })}
            />
          </Field>
          <Field label="Frase do contato" className="span-2">
            <input
              value={String(contact.message ?? "")}
              onChange={(e) => set("couple.contact", { ...contact, message: e.target.value })}
            />
          </Field>
        </div>
      </Section>

      <Section
        id="cfg-pagamentos"
        title="Presentes e pagamento"
        keys={["payments.card_fee_percent", "gifts.categories"]}
        {...sectionProps}
      >
        <Field
          label="Taxa do cartão (%)"
          hint="Somada quando o convidado escolhe cobrir a taxa; também desconta no líquido do início."
        >
          <input
            inputMode="decimal"
            value={String(v["payments.card_fee_percent"] ?? "").replace(".", ",")}
            onChange={(e) => {
              const n = Number(e.target.value.replace(",", "."));
              set("payments.card_fee_percent", Number.isNaN(n) ? e.target.value : n);
            }}
          />
        </Field>
        <ListEditor
          label="Categorias da lista (a ordem é a do filtro no site)"
          items={list("gifts.categories")}
          fields={[
            { key: "label", label: "Nome" },
            { key: "slug", label: "Código (sem espaços)" },
          ]}
          blank={{ slug: "", label: "" }}
          itemName={(it, i) => String(it.label || `Categoria ${i + 1}`)}
          onChange={(x) => set("gifts.categories", x)}
        />
      </Section>

      <Section id="cfg-programacao" title="Programação" keys={["schedule.items"]} {...sectionProps}>
        <ListEditor
          label="Momentos do dia"
          items={list("schedule.items")}
          fields={[
            { key: "time", label: "Hora" },
            { key: "title", label: "Título" },
            { key: "text", label: "Texto", type: "textarea", wide: true },
          ]}
          blank={{ time: "", title: "", text: "" }}
          itemName={(it, i) => String(it.title || `Momento ${i + 1}`)}
          onChange={(x) => set("schedule.items", x)}
        />
      </Section>

      <Section id="cfg-traje" title="Traje" keys={["dresscode"]} {...sectionProps}>
        <Field label="Texto do traje">
          <textarea
            rows={4}
            value={String(dress.text ?? "")}
            onChange={(e) => set("dresscode", { ...dress, text: e.target.value })}
          />
        </Field>
        <ListEditor
          label="Paleta de cores"
          items={(dress.palette ?? []) as Item[]}
          fields={[
            { key: "name", label: "Nome da cor" },
            { key: "hex", label: "Cor", type: "color" },
          ]}
          blank={{ name: "", hex: "#92a8d1" }}
          itemName={(it, i) => String(it.name || `Cor ${i + 1}`)}
          onChange={(x) => set("dresscode", { ...dress, palette: x })}
        />
        <Field label="Evitar" hint="Um item por linha.">
          <textarea
            rows={3}
            value={((dress.avoid ?? []) as string[]).join("\n")}
            onChange={(e) =>
              set("dresscode", {
                ...dress,
                avoid: e.target.value.split("\n").filter((l, i, a) => l.trim() || i < a.length - 1),
              })
            }
          />
        </Field>
      </Section>

      <Section
        id="cfg-hospedagem"
        title="Hospedagem"
        keys={["accommodation.items", "accommodation.how_to_get_there"]}
        {...sectionProps}
      >
        <ListEditor
          label="Onde ficar"
          items={list("accommodation.items")}
          fields={[
            { key: "name", label: "Nome" },
            { key: "distance", label: "Distância" },
            { key: "url", label: "Site (opcional)", type: "url" },
            { key: "note", label: "Observação" },
          ]}
          blank={{ name: "", distance: "", url: null, note: "" }}
          itemName={(it, i) => String(it.name || `Hospedagem ${i + 1}`)}
          onChange={(x) => set("accommodation.items", x)}
        />
        <Field label="Como chegar">
          <textarea
            rows={4}
            value={String(v["accommodation.how_to_get_there"] ?? "")}
            onChange={(e) => set("accommodation.how_to_get_there", e.target.value)}
          />
        </Field>
      </Section>

      <Section id="cfg-faq" title="Dúvidas" keys={["faq.items"]} {...sectionProps}>
        <ListEditor
          label="Perguntas frequentes"
          items={list("faq.items")}
          fields={[
            { key: "question", label: "Pergunta", wide: true },
            { key: "answer", label: "Resposta", type: "textarea", wide: true },
          ]}
          blank={{ question: "", answer: "" }}
          itemName={(it, i) => String(it.question || `Pergunta ${i + 1}`)}
          onChange={(x) => set("faq.items", x)}
        />
      </Section>

      <Section
        id="cfg-seo"
        title="Compartilhamento"
        description="Título e descrição que aparecem no Google e ao mandar o link no WhatsApp."
        keys={["seo"]}
        {...sectionProps}
      >
        <div className="form-grid">
          {(
            [
              ["title", "Título da página"],
              ["ogTitle", "Título ao compartilhar"],
              ["description", "Descrição"],
              ["ogDescription", "Descrição ao compartilhar"],
            ] as const
          ).map(([k, label]) => (
            <Field key={k} label={label} className="span-2">
              <input
                value={String(seo[k] ?? "")}
                onChange={(e) => set("seo", { ...seo, [k]: e.target.value })}
              />
            </Field>
          ))}
        </div>
      </Section>

      <Section
        id="cfg-avancado"
        title="Avançado"
        description="Nossa história, galeria e manual dos padrinhos. As fotos ficam na pasta do site (veja docs/PERSONALIZAR.md)."
        keys={["story.items", "gallery.items", "gallery.official_soon", "godparents.manual"]}
        {...sectionProps}
      >
        <ListEditor
          label="Nossa história"
          items={list("story.items")}
          fields={[
            { key: "when", label: "Quando" },
            { key: "title", label: "Título" },
            { key: "text", label: "Texto", type: "textarea", wide: true },
            { key: "image", label: "Imagem (caminho, ex.: /fotos/x.jpg)" },
            { key: "imageAlt", label: "Descrição da imagem" },
            { key: "id", label: "Identificador" },
          ]}
          blank={{ id: "", when: "", title: "", text: "", image: "/", imageAlt: "" }}
          itemName={(it, i) => String(it.title || `Momento ${i + 1}`)}
          onChange={(x) => set("story.items", x)}
        />
        <ListEditor
          label="Galeria"
          items={list("gallery.items")}
          fields={[
            { key: "src", label: "Imagem (caminho)" },
            { key: "alt", label: "Descrição" },
            { key: "width", label: "Largura (px)", type: "number" },
            { key: "height", label: "Altura (px)", type: "number" },
          ]}
          blank={{ src: "/", alt: "", width: 1200, height: 800 }}
          itemName={(it, i) => String(it.alt || `Foto ${i + 1}`)}
          onChange={(x) => set("gallery.items", x)}
        />
        <label className="check">
          <input
            type="checkbox"
            checked={Boolean(v["gallery.official_soon"])}
            onChange={(e) => set("gallery.official_soon", e.target.checked)}
          />
          Mostrar “fotos oficiais em breve” na galeria
        </label>
        <JsonField
          label="Manual dos padrinhos"
          value={v["godparents.manual"]}
          onChange={(x) => set("godparents.manual", x)}
        />
      </Section>
    </div>
  );
}
