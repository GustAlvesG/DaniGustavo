import { z } from "zod";
import { Photo } from "./content.ts";

/*
 * Fotos do evento (`event_media`): galeria e fotos das seções do site. Upload pelo painel em
 * `/api/admin/events/:eventId/media`; o navegador reduz a foto (MEDIA_MAX_DIMENSION) e gera a
 * miniatura (MEDIA_THUMB_WIDTH) com canvas antes de enviar — sem dependência.
 */

/** Tipos aceitos (conferidos pelos bytes na API, como nas fotos dos presentes). */
export const MEDIA_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
/** Tamanho máximo da foto já reduzida no navegador. */
export const MEDIA_MAX_BYTES = 4 * 1024 * 1024;
/** Tamanho máximo da miniatura. */
export const MEDIA_THUMB_MAX_BYTES = 400 * 1024;
/** Maior lado da foto depois da redução no navegador. */
export const MEDIA_MAX_DIMENSION = 2560;
/** Largura da miniatura. */
export const MEDIA_THUMB_WIDTH = 640;
/** Fotos por envio (upload múltiplo). */
export const MEDIA_MAX_FILES_PER_UPLOAD = 20;
/** Fotos por evento. */
export const MEDIA_MAX_PER_EVENT = 500;

const album = z
  .string()
  .trim()
  .max(64)
  .regex(/^[a-z0-9-]*$/, { error: "Álbum: minúsculas, números e -." });

/** Foto como o painel lista (GET /media). */
export interface AdminMedia {
  id: number;
  /** "/uploads/<eventId>/<arquivo>" */
  url: string;
  thumbUrl: string | null;
  width: number;
  height: number;
  bytes: number;
  alt: string;
  caption: string;
  album: string | null;
  position: string | null;
  inGallery: boolean;
  sort: number;
  /** Quantas vezes aparece no conteúdo das seções (`site.sections`). */
  usedInSections: number;
  createdAt: string;
}

/** PATCH /media/:id — o que o painel edita numa foto. */
export const MediaUpdate = z.object({
  alt: z.string().trim().max(300).optional(),
  caption: z.string().trim().max(300).optional(),
  album: z.preprocess((v) => (v === "" ? null : v), album.nullable()).optional(),
  position: z
    .preprocess((v) => (v === "" ? null : v), z.string().trim().max(40).nullable())
    .optional(),
  inGallery: z.boolean().optional(),
});
export type MediaUpdate = z.infer<typeof MediaUpdate>;

/** PUT /media/order — ids na nova ordem (todos os da galeria). */
export const MediaReorder = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(MEDIA_MAX_PER_EVENT),
});
export type MediaReorder = z.infer<typeof MediaReorder>;

/** Foto da página /galeria, como o site recebe. */
export const PublicGalleryPhoto = Photo.extend({
  caption: z.string(),
  album: z.string().nullable(),
});
export type PublicGalleryPhoto = z.infer<typeof PublicGalleryPhoto>;
