import { useCan } from "../event.tsx";
import type { ReminderSendResult, ReminderStatus } from "@casamento/shared";
import { useEffect, useState, type FormEvent } from "react";
import { api, errorMessage, send } from "../api.ts";
import { formatDateTime } from "../format.ts";
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

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Lembretes de RSVP por e-mail: agenda automática, liga/desliga e envio na hora. */
export function Lembretes() {
  const toast = useToast();
  const canWrite = useCan("reminders.write");
  const { data, setData, error, loading, reload } = useLoad(
    () => api<ReminderStatus>("/reminders"),
    [],
  );
  const [enabled, setEnabled] = useState(true);
  const [days, setDays] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!data) return;
    setEnabled(data.enabled);
    setDays(data.daysBefore.join(", "));
  }, [data?.enabled, data?.daysBefore.join(",")]);

  async function save(e: FormEvent) {
    e.preventDefault();
    const parts = days.split(/[,\s;]+/).filter(Boolean);
    const daysBefore = parts.map(Number);
    if (daysBefore.some((n) => !Number.isInteger(n))) {
      return setFormError("Dias: use só números inteiros separados por vírgula, como 14, 3.");
    }
    setSaving(true);
    setFormError(null);
    try {
      setData(await send<ReminderStatus>("PUT", "/reminders", { enabled, daysBefore }));
      toast(enabled ? "Lembretes automáticos salvos." : "Lembretes automáticos desligados.");
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function sendNow() {
    setSending(true);
    try {
      const r = await send<ReminderSendResult & { status: ReminderStatus }>(
        "POST",
        "/reminders/send",
      );
      setData(r.status);
      toast(
        r.failed
          ? `${plural(r.sent, "lembrete enviado", "lembretes enviados")}; ${plural(r.failed, "falhou", "falharam")}. Tente de novo mais tarde.`
          : `${plural(r.sent, "lembrete enviado", "lembretes enviados")}.`,
        r.failed ? "error" : undefined,
      );
      setConfirming(false);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="stack stack--lg">
      <PageHeader
        title="Lembretes"
        subtitle="E-mail para quem ainda não respondeu ao convite, antes do prazo."
      />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data ? (
        <Loading />
      ) : data ? (
        <>
          <section className="card stack" aria-labelledby="lembretes-agora">
            <div>
              <h2 id="lembretes-agora">Enviar agora</h2>
              <p className="muted small">
                Vai para convites sem nenhuma resposta e com e-mail, e só se o prazo (
                {formatDateTime(data.deadline)}) não passou. Quem recebeu um lembrete nas últimas 24
                horas fica de fora.
              </p>
            </div>
            <p data-testid="lembretes-contagem">
              <strong>
                {plural(data.sendableNow, "convite receberia", "convites receberiam")}
              </strong>{" "}
              um lembrete agora.
              {data.withoutEmail > 0 &&
                ` ${plural(data.withoutEmail, "convite pendente está", "convites pendentes estão")} sem e-mail e não entra${data.withoutEmail === 1 ? "" : "m"}.`}
            </p>
            {canWrite && (
              <div>
                <button
                  className="button"
                  disabled={data.sendableNow === 0}
                  onClick={() => setConfirming(true)}
                >
                  Enviar lembretes agora
                </button>
              </div>
            )}
          </section>

          <form className="card stack" onSubmit={save} noValidate aria-labelledby="lembretes-auto">
            <div>
              <h2 id="lembretes-auto">Lembretes automáticos</h2>
              <p className="muted small">
                A API confere de hora em hora e manda o lembrete na data certa. Cada convite recebe
                cada lembrete uma vez só.
              </p>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              Enviar lembretes automáticos
            </label>
            <Field
              label="Quantos dias antes do prazo"
              hint="Separe por vírgula. Padrão: 14, 3 (duas semanas e três dias antes)."
            >
              <input
                value={days}
                onChange={(e) => setDays(e.target.value)}
                inputMode="numeric"
                disabled={!enabled}
              />
            </Field>
            {enabled && data.upcoming.length > 0 && (
              <p className="muted small">
                Próximos:{" "}
                {data.upcoming
                  .map((u) => `${formatDateTime(u.at).slice(0, 10)} (${u.daysBefore} dias antes)`)
                  .join(" · ")}
                .
              </p>
            )}
            <FormError message={formError} />
            {canWrite && (
              <div>
                <button className="button" type="submit" disabled={saving}>
                  {saving ? "Salvando…" : "Salvar lembretes"}
                </button>
              </div>
            )}
            <p className="muted small">
              {plural(data.sentTotal, "lembrete já enviado", "lembretes já enviados")} até hoje.
            </p>
          </form>
        </>
      ) : null}

      <Confirm
        open={confirming}
        title="Enviar lembretes agora?"
        confirmLabel={
          data ? `Enviar para ${plural(data.sendableNow, "convite", "convites")}` : "Enviar"
        }
        busy={sending}
        onConfirm={() => void sendNow()}
        onCancel={() => setConfirming(false)}
      >
        <p>
          {data && plural(data.sendableNow, "convite vai receber", "convites vão receber")} um
          e-mail com o link do convite e o prazo de resposta. Não dá para desfazer.
        </p>
      </Confirm>
    </div>
  );
}
