import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { errorMessage } from "./api.ts";

/* ------------------------------------------------------------------------ */
/* Carregamento                                                              */
/* ------------------------------------------------------------------------ */

/** Carrega dados de uma função assíncrona; `reload` refaz a busca. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    load()
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => alive && setError(errorMessage(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, setData, error, loading, reload };
}

export function Loading({ label = "Carregando…" }: { label?: string }) {
  return (
    <p className="loading" role="status">
      <span className="spinner" aria-hidden="true" />
      {label}
    </p>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="alert alert--error" role="alert">
      <p>{message}</p>
      {onRetry && (
        <button className="button button--small button--ghost" onClick={onRetry}>
          Tentar de novo
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Avisos (toast)                                                            */
/* ------------------------------------------------------------------------ */

type ToastKind = "ok" | "error";
const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; message: string; kind: ToastKind }[]>([]);
  const next = useRef(0);
  const show = useCallback((message: string, kind: ToastKind = "ok") => {
    const id = ++next.current;
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(
      () => setToasts((t) => t.filter((x) => x.id !== id)),
      kind === "error" ? 8000 : 4000,
    );
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <p key={t.id} className={`toast toast--${t.kind}`}>
            {t.message}
          </p>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ------------------------------------------------------------------------ */
/* Janela modal (<dialog> nativo: foco preso e Esc fecham sozinhos)          */
/* ------------------------------------------------------------------------ */

export function Modal({
  title,
  open,
  onClose,
  children,
  wide,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`modal${wide ? " modal--wide" : ""}`}
      aria-labelledby={titleId}
      // "close"/"cancel" sobem pela árvore do React: um diálogo dentro de outro (confirmar
      // reembolso dentro do pedido) fecharia os dois sem o teste do alvo.
      onClose={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onCancel={(e) => {
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        onClose();
      }}
    >
      {open && (
        <div className="modal__body">
          <header className="modal__header">
            <h2 id={titleId}>{title}</h2>
            <button className="icon-button" onClick={onClose} aria-label="Fechar">
              ×
            </button>
          </header>
          {children}
        </div>
      )}
    </dialog>
  );
}

/** Confirmação para ações destrutivas (excluir, reembolsar, novo link). */
export function Confirm({
  open,
  title,
  children,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} open={open} onClose={onCancel}>
      <div className="stack">{children}</div>
      <div className="actions actions--end">
        <button className="button button--ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
        <button
          className={`button${danger ? " button--danger" : ""}`}
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? "Aguarde…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------------ */
/* Pedaços de layout                                                         */
/* ------------------------------------------------------------------------ */

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}

const BADGE_TONE: Record<string, string> = {
  confirmed: "ok",
  paid: "ok",
  approved: "ok",
  pending: "warn",
  declined: "muted",
  expired: "muted",
  failed: "error",
  refunded: "info",
  hidden: "muted",
};

export function Badge({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`badge badge--${BADGE_TONE[tone] ?? tone}`}>{children}</span>;
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`field${className ? ` ${className}` : ""}`}>
      <span className="field__label">{label}</span>
      {children}
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="alert alert--error" role="alert">
      {message}
    </p>
  );
}
