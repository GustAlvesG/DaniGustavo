import { ReadOnlyScope, useCan } from "../event.tsx";
import {
  AdminEventConfigInput,
  EVENT_TYPES,
  MODULES,
  VOCABULARY,
  VOCABULARY_KEYS,
  type EventModules,
  type EventSides,
  type EventType,
  type VocabularyKey,
} from "@casamento/shared";
import { useEffect, useState, type FormEvent } from "react";
import { errorMessage, send } from "../api.ts";
import { useEventConfig, type EventConfig } from "../config.ts";
import { ErrorBox, Field, FormError, Loading, PageHeader, useToast } from "../ui.tsx";
import "../tools.css";

/** Nome de cada palavra do vocabulário no formulário. */
const WORD_LABEL: Record<VocabularyKey, string> = {
  eventLabel: "Nome do evento no menu (com artigo)",
  eventNoun: "Como chamar o evento no meio da frase",
  hosts: "Quem recebe",
  heroKicker: "Frase acima dos nomes",
  countdownTitle: "Título da contagem regressiva",
  countdownToday: "Mensagem no dia",
  countdownAfter: "Mensagem depois do evento ({data})",
  godparents: "Grupo de honra (plural)",
  godparentsPage: "Título da página do grupo de honra",
  sideLabel: "Como chamar a divisão dos convidados",
};

/** Código de um lado a partir do nome ("Amigos da Lia" → "amigos-da-lia"). */
const keyOf = (label: string) =>
  label
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);

/** Página Evento (Fase 2): tipo, módulos, lados dos convites e palavras do site. */
export function Evento() {
  const canWrite = useCan("event.configure");
  return (
    <ReadOnlyScope readOnly={!canWrite}>
      <EventoPage />
    </ReadOnlyScope>
  );
}

function EventoPage() {
  const { data, error, loading, reload } = useEventConfig();
  return (
    <div className="stack stack--lg">
      <PageHeader
        title="Evento"
        subtitle="Tipo do evento, módulos, lados dos convites e palavras do site."
      />
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {data ? <ConfigForm config={data} onSaved={reload} /> : null}
    </div>
  );
}

function ConfigForm({ config, onSaved }: { config: EventConfig; onSaved: () => void }) {
  const toast = useToast();
  const [type, setType] = useState<EventType>(config.type);
  const [modules, setModules] = useState<EventModules>(config.modules);
  const [sides, setSides] = useState<EventSides>(config.sides);
  const [words, setWords] = useState<Partial<Record<VocabularyKey, string>>>(
    config.vocabularyOverrides,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setType(config.type);
    setModules(config.modules);
    setSides(config.sides);
    setWords(config.vocabularyOverrides);
  }, [config]);

  const saved = (key: string) => config.sides.some((c) => c.key === key);
  const setSide = (i: number, patch: Partial<EventSides[number]>) =>
    setSides((list) => list.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    // Palavra em branco = a do tipo: não fica gravada.
    const vocabulary = Object.fromEntries(
      VOCABULARY_KEYS.flatMap((k) => (words[k] ? [[k, words[k]]] : [])),
    );
    const payload = { type, modules, sides, vocabulary };
    const check = AdminEventConfigInput.safeParse(payload);
    if (!check.success) return setError(check.error.issues[0]?.message ?? "Confira o formulário.");
    setBusy(true);
    setError(null);
    try {
      await send("PUT", "/config", payload);
      toast("Evento: salvo. O site já mostra a mudança.");
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack stack--lg" onSubmit={onSubmit} noValidate>
      <section className="card stack" aria-labelledby="ev-tipo">
        <div>
          <h2 id="ev-tipo">Tipo do evento</h2>
          <p className="muted small">
            O tipo define as palavras e os módulos padrão. Trocar o tipo não apaga nada que você já
            escreveu.
          </p>
        </div>
        <Field label="Tipo">
          <select value={type} onChange={(e) => setType(e.target.value as EventType)}>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {config.types[t]}
              </option>
            ))}
          </select>
        </Field>
      </section>

      <section className="card stack" aria-labelledby="ev-modulos">
        <div>
          <h2 id="ev-modulos">Módulos</h2>
          <p className="muted small">
            Módulo desligado some do menu e da página inicial, e a página dá “não encontrada”. Os
            dados continuam aqui no painel.
          </p>
        </div>
        {MODULES.map((m) => (
          <label key={m} className="check">
            <input
              type="checkbox"
              checked={modules[m]}
              onChange={(e) => setModules({ ...modules, [m]: e.target.checked })}
            />
            <span>{config.moduleLabels[m]}</span>
          </label>
        ))}
      </section>

      <section className="card stack" aria-labelledby="ev-lados">
        <div>
          <h2 id="ev-lados">Lados dos convites</h2>
          <p className="muted small">
            Como os convites se dividem (por exemplo, noiva e noivo, ou família e amigos). Um lado
            que já tem convites não pode ser tirado, só renomeado.
          </p>
        </div>
        {sides.map((s, i) => (
          <fieldset key={i} className="sub-card form-grid">
            <legend className="sr-only">Lado {i + 1}</legend>
            <Field label="Nome">
              <input
                value={s.label}
                maxLength={40}
                onChange={(e) =>
                  setSide(i, {
                    label: e.target.value,
                    // Lado novo acompanha o nome; lado já salvo mantém o código (convites o usam).
                    ...(saved(s.key) ? {} : { key: keyOf(e.target.value) }),
                  })
                }
              />
            </Field>
            <Field label="Código" hint="Minúsculas, números e hífen. Não muda depois de salvo.">
              <input
                value={s.key}
                maxLength={32}
                disabled={saved(s.key)}
                onChange={(e) => setSide(i, { key: e.target.value })}
              />
            </Field>
            <div className="actions">
              <button
                className="button button--ghost"
                type="button"
                disabled={sides.length <= 1}
                onClick={() => setSides(sides.filter((_, j) => j !== i))}
              >
                Remover
              </button>
            </div>
          </fieldset>
        ))}
        <div>
          <button
            className="button button--ghost"
            type="button"
            disabled={sides.length >= 6}
            onClick={() => setSides([...sides, { key: "", label: "" }])}
          >
            Adicionar lado
          </button>
        </div>
      </section>

      <section className="card stack" aria-labelledby="ev-palavras">
        <div>
          <h2 id="ev-palavras">Palavras</h2>
          <p className="muted small">
            Deixe em branco para usar o texto padrão do tipo (aparece como dica em cada campo).
          </p>
        </div>
        <div className="form-grid">
          {VOCABULARY_KEYS.map((k) => (
            <Field key={k} label={WORD_LABEL[k]} className="span-2">
              <input
                value={words[k] ?? ""}
                placeholder={VOCABULARY[type][k]}
                maxLength={120}
                onChange={(e) => setWords({ ...words, [k]: e.target.value })}
              />
            </Field>
          ))}
        </div>
      </section>

      <FormError message={error} />
      <div>
        <button className="button" type="submit" disabled={busy}>
          {busy ? "Salvando…" : "Salvar evento"}
        </button>
      </div>
    </form>
  );
}
