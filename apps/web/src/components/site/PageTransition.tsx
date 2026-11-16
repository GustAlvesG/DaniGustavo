import { ViewTransition, type ReactNode } from "react";

/**
 * View Transition entre páginas (PROMPT §4.6.4). Next 16.4 + React 19.3 têm
 * `<ViewTransition>` estável e sem flag: toda navegação já é uma transição,
 * então basta envolver o conteúdo de cada página (não o layout, que
 * persiste). Crossfade curto (CSS em globals.css); o monograma é o elemento
 * compartilhado. Navegadores sem suporte trocam a página sem animar.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="pagina" exit="pagina" default="none">
      <div className="flex flex-1 flex-col">{children}</div>
    </ViewTransition>
  );
}
