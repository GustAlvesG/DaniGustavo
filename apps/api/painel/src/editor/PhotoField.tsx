import type { AdminMedia, PhotoRef } from "@casamento/shared";
import { useState } from "react";
import { eh } from "../nav.ts";
import { Field, Modal } from "../ui.tsx";

/* Escolha de foto da galeria para uma seção (PhotoRef = id + descrição + posição do corte). */

export type MediaIndex = Map<number, AdminMedia>;

export function Thumb({ media }: { media: AdminMedia | undefined }) {
  return (
    <div className="thumb thumb--lg" aria-hidden="true">
      {media ? <img src={media.thumbUrl ?? media.url} alt="" /> : <span>?</span>}
    </div>
  );
}

/** Janela com a galeria para escolher uma foto. */
export function PhotoPicker({
  open,
  media,
  onPick,
  onClose,
}: {
  open: boolean;
  media: AdminMedia[];
  onPick: (m: AdminMedia) => void;
  onClose: () => void;
}) {
  return (
    <Modal title="Escolher foto" open={open} onClose={onClose} wide>
      {media.length === 0 ? (
        <p className="empty">
          A galeria está vazia. <a href={eh("/galeria")}>Envie fotos na Galeria</a> e volte aqui.
        </p>
      ) : (
        <ul className="picker-grid">
          {media.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="picker-grid__item"
                onClick={() => onPick(m)}
                aria-label={m.alt || m.caption || `Foto ${m.id}`}
              >
                <img src={m.thumbUrl ?? m.url} alt="" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/** Campo de uma foto opcional (ou obrigatória, sem “Remover”). */
export function PhotoField({
  label,
  value,
  media,
  index,
  onChange,
}: {
  label: string;
  value: PhotoRef | null;
  media: AdminMedia[];
  index: MediaIndex;
  onChange: (v: PhotoRef | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const found = value ? index.get(value.mediaId) : undefined;
  return (
    <div className="field photo-field">
      <span className="field__label">{label}</span>
      <div className="photo-field__row">
        <Thumb media={found} />
        <div className="stack">
          {value && !found && (
            <span className="field__hint">Esta foto foi apagada da galeria. Escolha outra.</span>
          )}
          <div className="actions actions--tight">
            <button
              type="button"
              className="button button--small button--ghost"
              onClick={() => setOpen(true)}
            >
              {value ? "Trocar foto" : "Escolher foto"}
            </button>
            {value && (
              <button
                type="button"
                className="button button--small button--danger-ghost"
                onClick={() => onChange(null)}
              >
                Tirar foto
              </button>
            )}
          </div>
        </div>
      </div>
      {value && (
        <div className="form-grid">
          <Field label="Descrição desta foto" hint="Vazio: usa a descrição cadastrada na galeria.">
            <input
              value={value.alt}
              maxLength={300}
              onChange={(e) => onChange({ ...value, alt: e.target.value })}
            />
          </Field>
          <Field
            label="Parte visível no corte"
            hint="Ex.: center 30%, left top. Vazio: a da galeria."
          >
            <input
              value={value.position}
              maxLength={40}
              onChange={(e) => onChange({ ...value, position: e.target.value })}
            />
          </Field>
        </div>
      )}
      <PhotoPicker
        open={open}
        media={media}
        onClose={() => setOpen(false)}
        onPick={(m) => {
          onChange({ mediaId: m.id, alt: value?.alt ?? "", position: value?.position ?? "" });
          setOpen(false);
        }}
      />
    </div>
  );
}
