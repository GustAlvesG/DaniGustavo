import type {
  EventModules,
  EventSides,
  EventType,
  Vocabulary,
  VocabularyOverrides,
} from "@casamento/shared";
import { api } from "./api.ts";
import { useLoad } from "./ui.tsx";

/** GET /config: tipo, módulos, lados dos convites e vocabulário do evento. */
export interface EventConfig {
  type: EventType;
  types: Record<EventType, string>;
  modules: EventModules;
  moduleLabels: Record<keyof EventModules, string>;
  sides: EventSides;
  vocabularyOverrides: VocabularyOverrides;
  vocabulary: Vocabulary;
}

/** Configuração do evento aberto (lados e palavras são usados nos convites e na importação). */
export function useEventConfig() {
  return useLoad(() => api<EventConfig>("/config"), []);
}

/** Rótulo de um lado (chave desconhecida aparece como está). */
export const sideName = (sides: EventSides | undefined, key: string) =>
  sides?.find((s) => s.key === key)?.label ?? key;
