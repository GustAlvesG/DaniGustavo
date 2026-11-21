import {
  WHATSAPP_QUEUE_FILTERS,
  WHATSAPP_TEMPLATE_KINDS,
  WHATSAPP_TEMPLATE_LABELS,
  type WhatsappQueueFilter,
  type WhatsappQueueItem,
  type WhatsappQueueResponse,
  type WhatsappTemplateKind,
  type WhatsappTemplatesResponse,
  type WhatsappTemplateView,
} from "@casamento/shared";
import { useEffect, useState } from "react";
import { api, errorMessage, send } from "../../api.ts";
import { formatDateTime, plural } from "../../format.ts";
import { ErrorBox, Field, Loading, PageHeader, useLoad, useToast } from "../../ui.tsx";
import "./whatsapp.css";

/*
 * WhatsApp por links prontos (Fase 7, frente D, #/e/:id/whatsapp). A plataforma monta a mensagem e
 * o link wa.me; quem envia é o organizador, pelo próprio WhatsApp, e ele marca "enviado". Não
 * há como saber se a mensagem saiu: a marca é só um lembrete de quem já foi.
 */

const FILTER_LABEL: Record<WhatsappQueueFilter, string> = {
  not_sent: "Ainda não enviados",
  pending_rsvp: "Sem resposta no RSVP",
  confirmed: "Confirmados",
  all: "Todos",
};

/* ------------------------------------------------------------------------ */
/* Modelo da mensagem                                                        */
/* ------------------------------------------------------------------------ */

function TemplateEditor({
  template,
  variables,
  onSaved,
}: {
  template: WhatsappTemplateView;
  variables: readonly string[];
  onSaved: () => void;
}) {
  const toast = useToast();
  const [text, setText] = useState(template.body);
  const [saving, setSaving] = useState(false);
  useEffect(() => setText(template.body), [template.body, template.kind]);

  async function save(body: string) {
    setSaving(true);
    try {
      await send<{ template: WhatsappTemplateView }>(
        "PUT",
        `/whatsapp/templates/${template.kind}`,
        { body },
      );
      onSaved();
      toast(body.trim() ? "Texto salvo." : "Voltamos ao texto padrão.");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setSaving(false);
    }
  }

  const changed = text.trim() !== template.body.trim();
  return (
    <section className="card stack" aria-labelledby="wa-modelo">
      <div>
        <h2 id="wa-modelo">Texto da mensagem</h2>
        <p className="muted small">
          {template.isDefault ? "Texto padrão. " : "Texto do evento. "}
          As palavras entre chaves são trocadas pelos dados de cada convite.
        </p>
      </div>
      <Field label={WHATSAPP_TEMPLATE_LABELS[template.kind]}>
        <textarea
          rows={4}
          value={text}
          maxLength={1000}
          onChange={(e) => setText(e.target.value)}
          data-testid="wa-texto"
        />
      </Field>
      <div className="wa-vars" aria-label="Variáveis disponíveis">
        {variables.map((v) => (
          <button
            key={v}
            type="button"
            className="button button--small button--ghost"
            onClick={() => setText((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}${v}`)}
          >
            {v}
          </button>
        ))}
      </div>
      <div className="actions">
        <button
          className="button"
          disabled={saving || !changed}
          onClick={() => void save(text)}
          data-testid="wa-salvar"
        >
          {saving ? "Salvando…" : "Salvar texto"}
        </button>
        {!template.isDefault && (
          <button className="button button--ghost" disabled={saving} onClick={() => void save("")}>
            Voltar ao texto padrão
          </button>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* Envio assistido: um convite por vez                                       */
/* ------------------------------------------------------------------------ */

function Assisted({
  kind,
  items,
  onMarked,
  onClose,
}: {
  kind: WhatsappTemplateKind;
  items: WhatsappQueueItem[];
  onMarked: () => void;
  onClose: () => void;
}) {
  const toast = useToast();
  // Fotografia da fila no começo: marcar não faz a lista andar sozinha por baixo do usuário.
  // Convite sem telefone válido já fica de fora (pula sozinho).
  const [list] = useState(() => items.filter((i) => i.waUrl));
  const [index, setIndex] = useState(0);
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const current = list[index];

  function next() {
    setOpened(false);
    setIndex((i) => i + 1);
  }

  async function markAndNext() {
    if (!current) return;
    setBusy(true);
    try {
      await send("POST", "/whatsapp/sends", { kind, invitationIds: [current.invitationId] });
      setDone((n) => n + 1);
      onMarked();
      next();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  if (!current) {
    return (
      <section className="card stack wa-assist" data-testid="wa-assistido">
        <h2>Fila concluída</h2>
        <p>
          {done === 0
            ? "Nenhum convite foi marcado como enviado."
            : `${plural(done, "convite marcado", "convites marcados")} como enviado.`}
        </p>
        <div>
          <button className="button" onClick={onClose}>
            Fechar
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="card stack wa-assist" aria-live="polite" data-testid="wa-assistido">
      <p className="muted small">
        Convite {index + 1} de {list.length}
      </p>
      <h2>{current.label}</h2>
      <p className="wa-message">{current.message}</p>
      {!opened ? (
        <div className="actions">
          <a
            className="button button--whatsapp"
            href={current.waUrl ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpened(true)}
            data-testid="wa-abrir"
          >
            Abrir no WhatsApp
          </a>
          <button className="button button--ghost" onClick={next}>
            Pular
          </button>
        </div>
      ) : (
        <div className="stack">
          <p>Enviou a mensagem para {current.label}?</p>
          <div className="actions">
            <button
              className="button"
              onClick={() => void markAndNext()}
              disabled={busy}
              data-testid="wa-marcar-proximo"
            >
              Enviei, ir para o próximo
            </button>
            <button className="button button--ghost" onClick={next} disabled={busy}>
              Não enviei, pular
            </button>
          </div>
        </div>
      )}
      <div>
        <button className="button button--small button--ghost" onClick={onClose}>
          Encerrar
        </button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* Fila                                                                      */
/* ------------------------------------------------------------------------ */

function QueueRow({
  item,
  kind,
  onChanged,
}: {
  item: WhatsappQueueItem;
  kind: WhatsappTemplateKind;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      onChanged();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="row wa-row" data-testid="wa-item">
      <div className="row__main">
        <span className="row__title">{item.label}</span>
        <span className="row__meta">
          {item.phone ? `+${item.phone}` : "Sem telefone válido"}
          {item.sends > 0 &&
            ` · enviado ${item.sends > 1 ? `${item.sends} vezes, ` : ""}por último em ${formatDateTime(item.lastSentAt)}`}
        </span>
      </div>
      <div className="row__side wa-row__side">
        {item.waUrl ? (
          <a
            className="button button--small button--whatsapp"
            href={item.waUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Abrir WhatsApp para ${item.label}`}
          >
            WhatsApp
          </a>
        ) : null}
        {item.sends > 0 ? (
          <button
            className="button button--small button--ghost"
            disabled={busy}
            onClick={() =>
              void run(() => send("DELETE", `/whatsapp/sends/${item.lastSendId ?? 0}`))
            }
          >
            Desmarcar
          </button>
        ) : (
          <button
            className="button button--small button--ghost"
            disabled={busy}
            onClick={() =>
              void run(() =>
                send("POST", "/whatsapp/sends", { kind, invitationIds: [item.invitationId] }),
              )
            }
            aria-label={`Marcar ${item.label} como enviado`}
          >
            Marcar enviado
          </button>
        )}
      </div>
    </li>
  );
}

export function WhatsApp() {
  const [kind, setKind] = useState<WhatsappTemplateKind>("invite");
  const [filter, setFilter] = useState<WhatsappQueueFilter>("not_sent");
  const [assisting, setAssisting] = useState(false);

  const templates = useLoad(() => api<WhatsappTemplatesResponse>("/whatsapp/templates"), []);
  const queue = useLoad(
    () =>
      api<WhatsappQueueResponse>(
        `/whatsapp/queue?kind=${kind}&filter=${encodeURIComponent(filter)}`,
      ),
    [kind, filter],
  );

  const template = templates.data?.templates.find((t) => t.kind === kind);
  const ready = queue.data?.items.filter((i) => i.waUrl).length ?? 0;

  return (
    <div className="stack stack--lg">
      <PageHeader
        title="WhatsApp"
        subtitle="Mensagens prontas para enviar pelo seu próprio WhatsApp, uma conversa por vez. Nada é enviado sozinho: você abre, confere e envia."
      />

      <div className="tabs" role="tablist" aria-label="Tipo de mensagem">
        {WHATSAPP_TEMPLATE_KINDS.map((k) => (
          <button
            key={k}
            role="tab"
            className="tab"
            aria-selected={k === kind}
            onClick={() => {
              setKind(k);
              setAssisting(false);
            }}
          >
            {WHATSAPP_TEMPLATE_LABELS[k]}
          </button>
        ))}
      </div>

      {templates.error && <ErrorBox message={templates.error} onRetry={templates.reload} />}
      {template && templates.data && (
        <TemplateEditor
          template={template}
          variables={templates.data.variables}
          onSaved={() => {
            templates.reload();
            queue.reload();
          }}
        />
      )}

      <section className="card stack" aria-labelledby="wa-fila">
        <div className="card__head">
          <h2 id="wa-fila">Quem vai receber</h2>
          <Field label="Mostrar" className="wa-filter">
            <select
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value as WhatsappQueueFilter);
                setAssisting(false);
              }}
            >
              {WHATSAPP_QUEUE_FILTERS.map((f) => (
                <option key={f} value={f}>
                  {FILTER_LABEL[f]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {queue.error && <ErrorBox message={queue.error} onRetry={queue.reload} />}
        {queue.loading && !queue.data ? <Loading /> : null}
        {queue.data && (
          <>
            <p className="muted small">
              {plural(queue.data.items.length, "convite", "convites")}
              {queue.data.withoutPhone > 0 &&
                ` · ${queue.data.withoutPhone} sem telefone válido (ficam de fora do envio em sequência)`}
            </p>
            {assisting ? (
              <Assisted
                kind={kind}
                items={queue.data.items}
                onMarked={queue.reload}
                onClose={() => {
                  setAssisting(false);
                  queue.reload();
                }}
              />
            ) : (
              <div className="actions">
                <button
                  className="button"
                  disabled={ready === 0}
                  onClick={() => setAssisting(true)}
                  data-testid="wa-iniciar"
                >
                  Enviar em sequência ({ready})
                </button>
              </div>
            )}
            {queue.data.items.length === 0 ? (
              <p className="empty">Ninguém neste filtro.</p>
            ) : (
              <ul className="rows">
                {queue.data.items.map((i) => (
                  <QueueRow key={i.invitationId} item={i} kind={kind} onChanged={queue.reload} />
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}
