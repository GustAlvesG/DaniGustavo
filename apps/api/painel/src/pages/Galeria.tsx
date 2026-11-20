import { MEDIA_MAX_PER_EVENT, MediaUpdate, type AdminMedia } from "@casamento/shared";
import { useState, type ChangeEvent } from "react";
import { api, errorMessage, send } from "../api.ts";
import { prepareImage } from "../editor/image.ts";
import { albumSlug, albumsOf, chunk, reorderIds } from "../editor/logic.ts";
import {
  Confirm,
  ErrorBox,
  Field,
  FormError,
  Loading,
  PageHeader,
  useLoad,
  useToast,
} from "../ui.tsx";
import "../editor.css";

/* Fase 2, frente A: galeria do evento (upload múltiplo com miniatura, ordem, legendas e álbuns). */

type MediaList = { media: AdminMedia[] };

export function Galeria() {
  const toast = useToast();
  const { data, setData, error, loading, reload } = useLoad(() => api<MediaList>("/media"), []);
  const [progress, setProgress] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [album, setAlbum] = useState("");
  const [removing, setRemoving] = useState<AdminMedia | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error ?? "Sem dados."} onRetry={reload} />;

  const all = data.media;
  const albums = albumsOf(all);
  const shown =
    album === "" ? all : all.filter((m) => (album === "-" ? !m.album : m.album === album));
  const galleryIds = all.filter((m) => m.inGallery).map((m) => m.id);
  const replace = (m: AdminMedia) =>
    setData({
      media: all.map((x) => (x.id === m.id ? m : x)),
    });

  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    if (!files.length) return;
    if (all.length + files.length > MEDIA_MAX_PER_EVENT) {
      setProblem(`O evento comporta até ${MEDIA_MAX_PER_EVENT} fotos.`);
      return;
    }
    setProblem(null);
    let sent = 0;
    try {
      for (const batch of chunk(files)) {
        setProgress(`Preparando ${sent + 1}–${sent + batch.length} de ${files.length}…`);
        const prepared = [];
        for (const f of batch) prepared.push(await prepareImage(f));
        const form = new FormData();
        for (const p of prepared) {
          form.append("file", p.file, p.name);
          form.append("thumb", p.thumb, `t-${p.name}`);
        }
        setProgress(`Enviando ${sent + 1}–${sent + batch.length} de ${files.length}…`);
        await api<MediaList>("/media", { method: "POST", body: form });
        sent += batch.length;
      }
      toast(sent === 1 ? "Foto enviada." : `${sent} fotos enviadas.`);
    } catch (err) {
      setProblem(errorMessage(err));
    } finally {
      setProgress(null);
      if (sent) reload();
    }
  }

  async function move(id: number, delta: -1 | 1) {
    try {
      setData(
        await send<MediaList>("PUT", "/media/order", { ids: reorderIds(galleryIds, id, delta) }),
      );
    } catch (err) {
      setProblem(errorMessage(err));
    }
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    try {
      await send("DELETE", `/media/${removing.id}`);
      setData({ media: all.filter((m) => m.id !== removing.id) });
      setRemoving(null);
      toast("Foto apagada.");
    } catch (err) {
      setProblem(errorMessage(err));
      setRemoving(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack stack--lg">
      <PageHeader
        title="Galeria"
        subtitle="Fotos do evento: envio, ordem, legendas e álbuns. Elas também ficam disponíveis para as seções do site."
        actions={
          <label className="button file-button">
            Enviar fotos
            <input
              type="file"
              className="sr-only"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={progress !== null}
              onChange={(e) => void onFiles(e)}
            />
          </label>
        }
      />
      {progress && (
        <p className="alert alert--info" role="status">
          {progress}
        </p>
      )}
      <FormError message={problem} />

      <div className="gallery-toolbar">
        <span className="muted small">
          {all.length} de {MEDIA_MAX_PER_EVENT} fotos
        </span>
        <label className="field gallery-toolbar__filter">
          <span className="field__label">Álbum</span>
          <select value={album} onChange={(e) => setAlbum(e.target.value)}>
            <option value="">Todos</option>
            <option value="-">Sem álbum</option>
            {albums.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="empty">Nenhuma foto ainda. Use “Enviar fotos” (JPG, PNG ou WebP).</p>
      ) : (
        <ul className="media-grid">
          {shown.map((m) => (
            <li key={m.id}>
              <MediaCard
                media={m}
                albums={albums}
                canMove={m.inGallery && album === ""}
                first={galleryIds[0] === m.id}
                last={galleryIds[galleryIds.length - 1] === m.id}
                onMove={(d) => void move(m.id, d)}
                onSaved={replace}
                onRemove={() => setRemoving(m)}
              />
            </li>
          ))}
        </ul>
      )}

      <Confirm
        open={removing !== null}
        title="Apagar foto"
        confirmLabel="Apagar"
        danger
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(null)}
      >
        <p>Esta foto será apagada de vez. Ela não está em uso nas seções do site.</p>
      </Confirm>
    </div>
  );
}

function MediaCard({
  media,
  albums,
  canMove,
  first,
  last,
  onMove,
  onSaved,
  onRemove,
}: {
  media: AdminMedia;
  albums: string[];
  canMove: boolean;
  first: boolean;
  last: boolean;
  onMove: (delta: -1 | 1) => void;
  onSaved: (m: AdminMedia) => void;
  onRemove: () => void;
}) {
  const toast = useToast();
  const [alt, setAlt] = useState(media.alt);
  const [caption, setCaption] = useState(media.caption);
  const [albumText, setAlbumText] = useState(media.album ?? "");
  const [inGallery, setInGallery] = useState(media.inGallery);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty =
    alt !== media.alt ||
    caption !== media.caption ||
    albumSlug(albumText) !== (media.album ?? "") ||
    inGallery !== media.inGallery;

  async function save() {
    const payload = { alt, caption, album: albumSlug(albumText), inGallery };
    const check = MediaUpdate.safeParse(payload);
    if (!check.success) return setError(check.error.issues[0]?.message ?? "Confira os campos.");
    setBusy(true);
    setError(null);
    try {
      const r = await send<{ media: AdminMedia }>("PATCH", `/media/${media.id}`, payload);
      setAlbumText(r.media.album ?? "");
      onSaved(r.media);
      toast("Foto salva.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={`media-card${inGallery ? "" : " media-card--off"}`}>
      <div className="media-card__img">
        <img
          src={media.thumbUrl ?? media.url}
          alt={media.alt || "Foto sem descrição"}
          width={media.width}
          height={media.height}
          loading="lazy"
        />
      </div>
      <div className="media-card__body stack">
        <Field label="Descrição (para leitores de tela)">
          <input value={alt} maxLength={300} onChange={(e) => setAlt(e.target.value)} />
        </Field>
        <Field label="Legenda">
          <input value={caption} maxLength={300} onChange={(e) => setCaption(e.target.value)} />
        </Field>
        <Field label="Álbum" hint="Vazio = sem álbum. Acentos e espaços viram hífen.">
          <input
            value={albumText}
            list={`albuns-${media.id}`}
            onChange={(e) => setAlbumText(e.target.value)}
          />
          <datalist id={`albuns-${media.id}`}>
            {albums.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </Field>
        <label className="check">
          <input
            type="checkbox"
            checked={inGallery}
            onChange={(e) => setInGallery(e.target.checked)}
          />
          Mostrar na página Galeria
        </label>
        {media.usedInSections > 0 && (
          <p className="muted small">Em uso em {media.usedInSections} lugar(es) das seções.</p>
        )}
        <FormError message={error} />
        <div className="actions actions--tight">
          <button
            type="button"
            className="icon-button"
            disabled={!canMove || first}
            onClick={() => onMove(-1)}
            aria-label="Mover para antes"
          >
            ←
          </button>
          <button
            type="button"
            className="icon-button"
            disabled={!canMove || last}
            onClick={() => onMove(1)}
            aria-label="Mover para depois"
          >
            →
          </button>
          <button
            type="button"
            className="button button--small"
            disabled={!dirty || busy}
            onClick={() => void save()}
          >
            {busy ? "Salvando…" : "Salvar"}
          </button>
          <button
            type="button"
            className="button button--small button--danger-ghost"
            disabled={media.usedInSections > 0}
            title={media.usedInSections > 0 ? "Em uso nas seções do site" : undefined}
            onClick={onRemove}
          >
            Apagar
          </button>
        </div>
      </div>
    </article>
  );
}
