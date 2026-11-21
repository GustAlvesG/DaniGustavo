import {
  AdminGiftInput,
  UPLOAD_MAX_BYTES,
  UPLOAD_TYPES,
  type AdminGift,
  type GiftCategory,
} from "@casamento/shared";
import { useState, type FormEvent } from "react";
import { api, errorMessage, send } from "../api.ts";
import { useCan } from "../event.tsx";
import { centsToInput, formatBRL, parseBRL } from "../format.ts";
import {
  Badge,
  Confirm,
  ErrorBox,
  Field,
  FormError,
  Loading,
  Modal,
  PageHeader,
  useLoad,
  useToast,
} from "../ui.tsx";

type GiftsData = { gifts: AdminGift[]; categories: GiftCategory[] };

export function Presentes() {
  const toast = useToast();
  const canWrite = useCan("gifts.write");
  const { data, setData, error, loading, reload } = useLoad(() => api<GiftsData>("/gifts"), []);
  const [editing, setEditing] = useState<AdminGift | "new" | null>(null);
  const [removing, setRemoving] = useState<AdminGift | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error ?? "Sem dados."} onRetry={reload} />;
  const catLabel = (slug: string) => data.categories.find((c) => c.slug === slug)?.label ?? slug;

  async function move(index: number, delta: number) {
    if (!data) return;
    const list = [...data.gifts];
    const [item] = list.splice(index, 1);
    list.splice(index + delta, 0, item!);
    setData({ ...data, gifts: list });
    try {
      const r = await send<{ gifts: AdminGift[] }>("PUT", "/gifts/order", {
        ids: list.map((g) => g.id),
      });
      setData({ ...data, gifts: r.gifts });
    } catch (e) {
      toast(errorMessage(e), "error");
      reload();
    }
  }

  async function toggle(g: AdminGift) {
    try {
      await send("PATCH", `/gifts/${g.id}/active`, { active: !g.active });
      toast(g.active ? `“${g.title}” saiu da lista do site.` : `“${g.title}” voltou para a lista.`);
      reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    try {
      await send("DELETE", `/gifts/${removing.id}`);
      toast("Presente excluído.");
      setRemoving(null);
      reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack stack--lg">
      <PageHeader
        title="Presentes"
        subtitle="A ordem aqui é a ordem da lista no site."
        actions={
          canWrite ? (
            <button className="button" onClick={() => setEditing("new")}>
              Novo presente
            </button>
          ) : undefined
        }
      />
      {data.gifts.length === 0 ? (
        <p className="empty">Nenhum presente cadastrado.</p>
      ) : (
        <ul className="rows">
          {data.gifts.map((g, i) => {
            const free = g.quotaTotal - g.quotaPaid - g.quotaReserved;
            return (
              <li key={g.id} className={`row row--gift${g.active ? "" : " row--off"}`}>
                <div className="thumb" aria-hidden="true">
                  {g.image ? <img src={g.image} alt="" /> : <span>{g.title.slice(0, 1)}</span>}
                </div>
                <div className="row__main">
                  <span className="row__title">{g.title}</span>
                  <span className="row__meta">
                    {catLabel(g.category)} ·{" "}
                    {g.openAmount
                      ? `sugestão de ${formatBRL(g.priceCents)}, o convidado escolhe`
                      : `${formatBRL(g.priceCents)} por cota`}
                  </span>
                  {!g.openAmount && (
                    <span className="row__meta">
                      <strong>{g.quotaPaid}</strong> pagas · <strong>{g.quotaReserved}</strong>{" "}
                      reservadas · {free} {free === 1 ? "livre" : "livres"} de {g.quotaTotal}
                    </span>
                  )}
                </div>
                <div className="row__side">
                  {g.active ? <Badge tone="ok">No site</Badge> : <Badge tone="muted">Oculto</Badge>}
                  {canWrite && (
                    <div className="actions actions--tight">
                      <button
                        className="icon-button"
                        disabled={i === 0}
                        onClick={() => move(i, -1)}
                        aria-label={`Subir ${g.title}`}
                      >
                        ↑
                      </button>
                      <button
                        className="icon-button"
                        disabled={i === data.gifts.length - 1}
                        onClick={() => move(i, 1)}
                        aria-label={`Descer ${g.title}`}
                      >
                        ↓
                      </button>
                      <button
                        className="button button--small button--ghost"
                        onClick={() => setEditing(g)}
                        aria-label={`Editar ${g.title}`}
                      >
                        Editar
                      </button>
                      <button
                        className="button button--small button--ghost"
                        onClick={() => toggle(g)}
                      >
                        {g.active ? "Ocultar" : "Mostrar"}
                      </button>
                      {!g.hasOrders && (
                        <button
                          className="button button--small button--danger-ghost"
                          onClick={() => setRemoving(g)}
                          aria-label={`Excluir ${g.title}`}
                        >
                          Excluir
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        title={editing === "new" ? "Novo presente" : "Editar presente"}
        open={editing !== null}
        onClose={() => setEditing(null)}
        wide
      >
        {editing !== null && (
          <GiftForm
            gift={editing === "new" ? null : editing}
            categories={data.categories}
            onSaved={() => {
              setEditing(null);
              toast("Presente salvo. O site já mostra a mudança.");
              reload();
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
      <Confirm
        open={removing !== null}
        title="Excluir presente?"
        confirmLabel="Excluir"
        danger
        busy={busy}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      >
        <p>“{removing?.title}” sai da lista e do painel. Não dá para desfazer.</p>
      </Confirm>
    </div>
  );
}

function GiftForm({
  gift,
  categories,
  onSaved,
  onCancel,
}: {
  gift: AdminGift | null;
  categories: GiftCategory[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(gift?.title ?? "");
  const [description, setDescription] = useState(gift?.description ?? "");
  const [category, setCategory] = useState(gift?.category ?? categories[0]?.slug ?? "");
  const [price, setPrice] = useState(gift ? centsToInput(gift.priceCents) : "");
  const [quotaTotal, setQuotaTotal] = useState(String(gift?.quotaTotal ?? 1));
  const [openAmount, setOpenAmount] = useState(gift?.openAmount ?? false);
  const [active, setActive] = useState(gift?.active ?? true);
  const [image, setImage] = useState<string | null>(gift?.image ?? null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File | undefined) {
    if (!file) return;
    if (!(UPLOAD_TYPES as readonly string[]).includes(file.type)) {
      setError("Formato não aceito: escolha uma foto JPG, PNG ou WebP.");
      return;
    }
    if (file.size > UPLOAD_MAX_BYTES) {
      setError("A foto passa de 2 MB. Reduza o tamanho e tente de novo.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const r = await api<{ path: string }>("/uploads", { method: "POST", body: form });
      setImage(r.path);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const priceCents = parseBRL(price);
    if (priceCents === null) {
      setError("Preço: use só números, ex.: 150,00.");
      return;
    }
    const payload = {
      title,
      description,
      category,
      priceCents,
      quotaTotal: Number(quotaTotal),
      openAmount,
      active,
      image,
    };
    const check = AdminGiftInput.safeParse(payload);
    if (!check.success) {
      setError(check.error.issues[0]?.message ?? "Confira o formulário.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await send(gift ? "PUT" : "POST", gift ? `/gifts/${gift.id}` : "/gifts", payload);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form-grid" onSubmit={onSubmit} noValidate>
      <Field label="Nome" className="span-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={191} required />
      </Field>
      <Field label="Descrição" className="span-2">
        <textarea
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
        />
      </Field>
      <Field label="Categoria">
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label={openAmount ? "Valor sugerido (R$)" : "Preço da cota (R$)"}>
        <input
          inputMode="decimal"
          value={price}
          placeholder="150,00"
          onChange={(e) => setPrice(e.target.value)}
        />
      </Field>
      <Field
        label="Total de cotas"
        hint={
          gift && !gift.openAmount
            ? `${gift.quotaPaid} pagas e ${gift.quotaReserved} reservadas: o total não pode ser menor.`
            : "1 para presente inteiro; mais para dividir em cotas."
        }
      >
        <input
          type="number"
          inputMode="numeric"
          min={1}
          value={quotaTotal}
          onChange={(e) => setQuotaTotal(e.target.value)}
          disabled={openAmount}
        />
      </Field>
      <div className="stack">
        <label className="check">
          <input
            type="checkbox"
            checked={openAmount}
            onChange={(e) => setOpenAmount(e.target.checked)}
          />
          Valor livre (o convidado escolhe quanto dar)
        </label>
        <label className="check">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Mostrar no site
        </label>
      </div>
      <div className="span-2 image-field">
        <span className="field__label">Foto</span>
        <div className="image-field__row">
          <div className="thumb thumb--lg" aria-hidden="true">
            {image ? <img src={image} alt="" /> : <span>sem foto</span>}
          </div>
          <div className="stack">
            <label className="button button--ghost button--small file-button">
              {uploading ? "Enviando…" : image ? "Trocar foto" : "Escolher foto"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={uploading}
                onChange={(e) => void upload(e.target.files?.[0])}
              />
            </label>
            {image && (
              <button
                type="button"
                className="button button--small button--danger-ghost"
                onClick={() => setImage(null)}
              >
                Remover foto
              </button>
            )}
            <span className="field__hint">JPG, PNG ou WebP, até 2 MB.</span>
          </div>
        </div>
      </div>
      <div className="span-2">
        <FormError message={error} />
      </div>
      <div className="actions actions--end span-2">
        <button type="button" className="button button--ghost" onClick={onCancel}>
          Cancelar
        </button>
        <button className="button" type="submit" disabled={busy || uploading}>
          {busy ? "Salvando…" : "Salvar presente"}
        </button>
      </div>
    </form>
  );
}
