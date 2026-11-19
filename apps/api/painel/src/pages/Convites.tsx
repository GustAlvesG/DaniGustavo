import {
  AdminInvitationInput,
  qrSvg,
  type AdminInvitation,
  type AdminRsvpLog,
  type AgeRange,
  type InvitationStatus,
  type RsvpStatus,
} from "@casamento/shared";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api, errorMessage, send } from "../api.ts";
import { useEvent } from "../event.tsx";
import { ea, eh, go } from "../nav.ts";
import { formatDateTime, plural } from "../format.ts";
import {
  Badge,
  Confirm,
  ErrorBox,
  Field,
  FormError,
  Loading,
  PageHeader,
  useLoad,
  useToast,
} from "../ui.tsx";
import "../tools.css";

export const INVITATION_STATUS_LABEL: Record<InvitationStatus, string> = {
  confirmed: "Confirmado",
  pending: "Pendente",
  declined: "Não vão",
};
const GUEST_STATUS_LABEL: Record<RsvpStatus, string> = {
  confirmed: "Vai",
  pending: "Pendente",
  declined: "Não vai",
};
const SIDE_LABEL = { dani: "Dani", gustavo: "Gustavo" } as const;
const AGE_OPTIONS: { value: AgeRange; label: string }[] = [
  { value: "0-2", label: "0 a 2 anos" },
  { value: "3-7", label: "3 a 7 anos" },
  { value: "8-12", label: "8 a 12 anos" },
];

/* ------------------------------------------------------------------------ */
/* Lista                                                                     */
/* ------------------------------------------------------------------------ */

export function Convites() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | InvitationStatus>("");
  const { data, error, loading, reload } = useLoad(
    () =>
      api<{ invitations: AdminInvitation[]; total: number }>(
        `/invitations?${new URLSearchParams({ q, status })}`,
      ),
    [q, status],
  );

  return (
    <div className="stack stack--lg">
      <PageHeader
        title="Convites"
        subtitle={data ? `${plural(data.total, "convite", "convites")} no total.` : undefined}
        actions={
          <>
            <a className="button button--ghost" href={ea("/invitations/export.csv")} download>
              Exportar confirmados (CSV)
            </a>
            <a className="button" href={eh("/convites/novo")}>
              Novo convite
            </a>
          </>
        }
      />
      <nav className="actions actions--tight" aria-label="Ferramentas dos convites">
        <a className="button button--ghost button--small" href={eh("/convites/importar")}>
          Importar planilha
        </a>
        <a className="button button--ghost button--small" href={eh("/convites/qr")}>
          Imprimir QR dos convites
        </a>
        <a className="button button--ghost button--small" href={eh("/convites/listas/buffet")}>
          Listas: buffet, cerimonial e portaria
        </a>
      </nav>
      <div className="filters" role="search">
        <Field label="Buscar">
          <input
            type="search"
            placeholder="Nome do convite ou do convidado"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </Field>
        <Field label="Situação">
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="">Todas</option>
            <option value="confirmed">Confirmados</option>
            <option value="pending">Pendentes</option>
            <option value="declined">Não vão</option>
          </select>
        </Field>
      </div>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data ? (
        <Loading />
      ) : data && data.invitations.length === 0 ? (
        <p className="empty">
          {q || status ? "Nenhum convite com esse filtro." : "Nenhum convite ainda."}{" "}
          <a href={eh("/convites/novo")}>Criar convite</a>
        </p>
      ) : (
        <ul className="rows" aria-busy={loading}>
          {data?.invitations.map((inv) => {
            const going = inv.guests.filter((g) => g.rsvpStatus === "confirmed").length;
            return (
              <li key={inv.id} className="row">
                <a className="row__main" href={eh(`/convites/${inv.id}`)}>
                  <span className="row__title">{inv.label}</span>
                  <span className="row__meta">
                    {SIDE_LABEL[inv.side]} · {plural(inv.guests.length, "pessoa", "pessoas")}
                    {inv.status === "confirmed" && ` · ${going} vão`}
                    {inv.sentAt ? " · enviado" : " · não enviado"}
                  </span>
                </a>
                <Badge tone={inv.status}>{INVITATION_STATUS_LABEL[inv.status]}</Badge>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Detalhe                                                                   */
/* ------------------------------------------------------------------------ */

/** Link do WhatsApp com a mensagem pronta (para o telefone do convite, se houver). */
export function whatsappLink(
  inv: Pick<AdminInvitation, "label" | "link" | "contactPhone">,
  from: string,
) {
  const text =
    `Olá, ${inv.label}! Com muita alegria convidamos vocês para o nosso casamento. ` +
    `Confirme a presença pelo link: ${inv.link}\n\nCom carinho, ${from}`;
  let phone = (inv.contactPhone ?? "").replace(/\D/g, "");
  if (phone.length === 10 || phone.length === 11) phone = `55${phone}`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

export function ConviteDetalhe({ id }: { id: number }) {
  const toast = useToast();
  const event = useEvent();
  const { data, setData, error, loading, reload } = useLoad(
    () => api<{ invitation: AdminInvitation; responses: AdminRsvpLog[] }>(`/invitations/${id}`),
    [id],
  );
  const [confirm, setConfirm] = useState<null | "token" | "delete">(null);
  const [busy, setBusy] = useState(false);

  if (loading && !data) return <Loading />;
  if (error || !data)
    return <ErrorBox message={error ?? "Convite não encontrado."} onRetry={reload} />;
  const { invitation: inv, responses } = data;

  const markSent = () => {
    void send("POST", `/invitations/${inv.id}/sent`).then(() =>
      setData(
        (d) => d && { ...d, invitation: { ...d.invitation, sentAt: new Date().toISOString() } },
      ),
    );
  };

  async function copy() {
    try {
      await navigator.clipboard.writeText(inv.link);
      toast("Link copiado.");
      markSent();
    } catch {
      toast("Não deu para copiar: selecione o link e copie manualmente.", "error");
    }
  }

  async function act() {
    setBusy(true);
    try {
      if (confirm === "token") {
        const r = await send<{ invitation: AdminInvitation }>(
          "POST",
          `/invitations/${inv.id}/token`,
        );
        setData((d) => d && { ...d, invitation: r.invitation });
        toast("Link novo gerado. O antigo não funciona mais.");
      } else if (confirm === "delete") {
        await send("DELETE", `/invitations/${inv.id}`);
        toast("Convite excluído.");
        go("/convites");
      }
      setConfirm(null);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack stack--lg">
      <a className="back" href={eh("/convites")}>
        ← Convites
      </a>
      <PageHeader
        title={inv.label}
        subtitle={
          <>
            Lado {SIDE_LABEL[inv.side]} · até {plural(inv.maxGuests, "pessoa", "pessoas")}
            {inv.allowPlusOne && " · aceita acompanhante"}
          </>
        }
        actions={
          <>
            <Badge tone={inv.status}>{INVITATION_STATUS_LABEL[inv.status]}</Badge>
            <a className="button button--ghost" href={eh(`/convites/${inv.id}/editar`)}>
              Editar
            </a>
          </>
        }
      />

      <section className="card stack" aria-labelledby="c-link">
        <h2 id="c-link">Link do convite</h2>
        <div className="copy-box">
          <input
            readOnly
            value={inv.link}
            aria-label="Link do convite"
            onFocus={(e) => e.currentTarget.select()}
          />
          <button className="button" onClick={copy}>
            Copiar
          </button>
        </div>
        <div className="actions">
          <a
            className="button button--whatsapp"
            href={whatsappLink(inv, event.name)}
            target="_blank"
            rel="noreferrer"
            onClick={markSent}
          >
            Enviar no WhatsApp
          </a>
          <button className="button button--ghost" onClick={() => setConfirm("token")}>
            Gerar link novo
          </button>
        </div>
        <div className="qr-inline">
          <div
            className="qr-inline__img"
            dangerouslySetInnerHTML={{
              __html: qrSvg(inv.link, { dark: "#14213d", title: `QR do convite ${inv.label}` }),
            }}
          />
          <div className="stack">
            <p className="muted small">QR com o link do convite, para imprimir junto do convite.</p>
            <div className="actions actions--tight">
              <a
                className="button button--ghost button--small"
                href={eh(`/convites/qr?ids=${inv.id}`)}
              >
                Imprimir QR
              </a>
              <a
                className="button button--ghost button--small"
                download={`qr-${inv.label}.svg`}
                href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg(inv.link, { dark: "#14213d" }))}`}
              >
                Baixar QR (SVG)
              </a>
            </div>
          </div>
        </div>
        <p className="muted small">
          {inv.sentAt ? `Enviado em ${formatDateTime(inv.sentAt)}.` : "Ainda não enviado."}
          {inv.contactPhone
            ? ` WhatsApp vai para ${inv.contactPhone}.`
            : " Sem telefone: o WhatsApp pede o contato."}
        </p>
      </section>

      <section className="card" aria-labelledby="c-conv">
        <h2 id="c-conv">Convidados</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Nome</th>
                <th scope="col">Resposta</th>
                <th scope="col">Idade</th>
                <th scope="col">Restrição alimentar</th>
              </tr>
            </thead>
            <tbody>
              {inv.guests.map((g) => (
                <tr key={g.id}>
                  <td>
                    {g.name}
                    {g.isPlusOne && <span className="muted small"> (acompanhante)</span>}
                  </td>
                  <td>
                    <Badge tone={g.rsvpStatus}>{GUEST_STATUS_LABEL[g.rsvpStatus]}</Badge>
                  </td>
                  <td>
                    {g.isChild
                      ? `Criança${g.ageRange ? `, ${AGE_OPTIONS.find((a) => a.value === g.ageRange)?.label}` : ""}`
                      : "Adulto"}
                  </td>
                  <td>{g.dietaryNotes ? `Restrição: ${g.dietaryNotes}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(inv.contactEmail || inv.contactPhone) && (
          <p className="muted small">
            Contato: {[inv.contactEmail, inv.contactPhone].filter(Boolean).join(" · ")}
          </p>
        )}
      </section>

      <section className="card" aria-labelledby="c-resp">
        <h2 id="c-resp">Respostas recebidas</h2>
        {responses.length === 0 ? (
          <p className="muted">O convite ainda não respondeu pelo site.</p>
        ) : (
          <ol className="feed">
            {responses.map((r) => (
              <li key={r.id}>
                <p className="muted small">{formatDateTime(r.createdAt)}</p>
                <ul className="plain">
                  {r.lines.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </section>

      <div>
        <button className="button button--danger-ghost" onClick={() => setConfirm("delete")}>
          Excluir convite
        </button>
      </div>

      <Confirm
        open={confirm === "token"}
        title="Gerar link novo?"
        confirmLabel="Gerar link novo"
        busy={busy}
        onConfirm={act}
        onCancel={() => setConfirm(null)}
      >
        <p>O link atual deixa de funcionar. Use quando o link foi parar com a pessoa errada.</p>
      </Confirm>
      <Confirm
        open={confirm === "delete"}
        title="Excluir convite?"
        confirmLabel="Excluir"
        danger
        busy={busy}
        onConfirm={act}
        onCancel={() => setConfirm(null)}
      >
        <p>
          “{inv.label}” e as respostas de {plural(inv.guests.length, "convidado", "convidados")}{" "}
          serão apagados. Não dá para desfazer.
        </p>
      </Confirm>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Formulário (novo / editar)                                                */
/* ------------------------------------------------------------------------ */

interface GuestDraft {
  key: string;
  id?: number;
  name: string;
  isChild: boolean;
  ageRange: AgeRange | "";
  rsvpStatus: RsvpStatus;
  dietaryNotes: string;
  phone: string;
  email: string;
  isPlusOne?: boolean;
}

let draftKey = 0;
const emptyGuest = (): GuestDraft => ({
  key: `n${++draftKey}`,
  name: "",
  isChild: false,
  ageRange: "",
  rsvpStatus: "pending",
  dietaryNotes: "",
  phone: "",
  email: "",
});

export function ConviteForm({ id }: { id?: number }) {
  const toast = useToast();
  const editing = id !== undefined;
  const existing = useLoad(
    () =>
      editing ? api<{ invitation: AdminInvitation }>(`/invitations/${id}`) : Promise.resolve(null),
    [id],
  );
  const [label, setLabel] = useState("");
  const [side, setSide] = useState<"dani" | "gustavo">("dani");
  const [maxGuests, setMaxGuests] = useState("2");
  const [allowPlusOne, setAllowPlusOne] = useState(false);
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [guests, setGuests] = useState<GuestDraft[]>(() => [emptyGuest()]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const inv = existing.data?.invitation;
  useEffect(() => {
    if (!inv) return;
    setLabel(inv.label);
    setSide(inv.side);
    setMaxGuests(String(inv.maxGuests));
    setAllowPlusOne(inv.allowPlusOne);
    setContactEmail(inv.contactEmail ?? "");
    setContactPhone(inv.contactPhone ?? "");
    setGuests(
      inv.guests.map((g) => ({
        key: `g${g.id}`,
        id: g.id,
        name: g.name,
        isChild: g.isChild,
        ageRange: g.ageRange ?? "",
        rsvpStatus: g.rsvpStatus,
        dietaryNotes: g.dietaryNotes ?? "",
        phone: g.phone ?? "",
        email: g.email ?? "",
        isPlusOne: g.isPlusOne,
      })),
    );
  }, [inv]);

  const update = (key: string, patch: Partial<GuestDraft>) =>
    setGuests((list) => list.map((g) => (g.key === key ? { ...g, ...patch } : g)));

  const payload = useMemo(
    () => ({
      label,
      side,
      maxGuests: Number(maxGuests),
      allowPlusOne,
      contactEmail,
      contactPhone,
      guests: guests.map((g) => ({
        ...(g.id ? { id: g.id } : {}),
        name: g.name,
        isChild: g.isChild,
        ageRange: g.isChild && g.ageRange ? g.ageRange : null,
        rsvpStatus: g.rsvpStatus,
        dietaryNotes: g.dietaryNotes,
        phone: g.phone,
        email: g.email,
      })),
    }),
    [label, side, maxGuests, allowPlusOne, contactEmail, contactPhone, guests],
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const check = AdminInvitationInput.safeParse(payload);
    if (!check.success) {
      setError(check.error.issues[0]?.message ?? "Confira o formulário.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await send<{ invitation: AdminInvitation }>(
        editing ? "PUT" : "POST",
        editing ? `/invitations/${id}` : "/invitations",
        payload,
      );
      toast(editing ? "Convite salvo." : "Convite criado. Agora é só enviar o link.");
      go(`/convites/${r.invitation.id}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (editing && existing.loading && !inv) return <Loading />;
  if (existing.error) return <ErrorBox message={existing.error} onRetry={existing.reload} />;

  return (
    <form className="stack stack--lg" onSubmit={onSubmit} noValidate>
      <a className="back" href={editing ? eh(`/convites/${id}`) : eh("/convites")}>
        ← {editing ? "Voltar ao convite" : "Convites"}
      </a>
      <PageHeader title={editing ? "Editar convite" : "Novo convite"} />

      <section className="card form-grid" aria-label="Dados do convite">
        <Field
          label="Nome do convite"
          hint="Como aparece no convite, ex.: Família Silva."
          className="span-2"
        >
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
            maxLength={191}
          />
        </Field>
        <Field label="Lado">
          <select value={side} onChange={(e) => setSide(e.target.value as "dani" | "gustavo")}>
            <option value="dani">Dani</option>
            <option value="gustavo">Gustavo</option>
          </select>
        </Field>
        <Field label="Máximo de pessoas">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={30}
            value={maxGuests}
            onChange={(e) => setMaxGuests(e.target.value)}
          />
        </Field>
        <Field label="Telefone (WhatsApp)" hint="Com DDD. Usado no botão do WhatsApp.">
          <input
            type="tel"
            inputMode="tel"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            maxLength={32}
          />
        </Field>
        <Field label="E-mail de contato">
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            maxLength={191}
          />
        </Field>
        <label className="check span-2">
          <input
            type="checkbox"
            checked={allowPlusOne}
            onChange={(e) => setAllowPlusOne(e.target.checked)}
          />
          Pode levar acompanhante (o convidado informa o nome ao confirmar)
        </label>
      </section>

      <section className="stack" aria-labelledby="f-conv">
        <h2 id="f-conv">Convidados</h2>
        {guests.map((g, i) => (
          <fieldset key={g.key} className="card form-grid guest">
            <legend className="span-2">Convidado {i + 1}</legend>
            <Field
              label={g.isPlusOne ? "Nome do acompanhante" : "Nome do convidado"}
              className="span-2"
            >
              <input value={g.name} onChange={(e) => update(g.key, { name: e.target.value })} />
            </Field>
            <Field label="Resposta">
              <select
                value={g.rsvpStatus}
                onChange={(e) => update(g.key, { rsvpStatus: e.target.value as RsvpStatus })}
              >
                <option value="pending">Pendente</option>
                <option value="confirmed">Vai</option>
                <option value="declined">Não vai</option>
              </select>
            </Field>
            <div className="inline-fields">
              <label className="check">
                <input
                  type="checkbox"
                  checked={g.isChild}
                  onChange={(e) => update(g.key, { isChild: e.target.checked })}
                />
                Criança
              </label>
              {g.isChild && (
                <Field label="Faixa etária">
                  <select
                    value={g.ageRange}
                    onChange={(e) => update(g.key, { ageRange: e.target.value as AgeRange })}
                  >
                    <option value="">Não informada</option>
                    {AGE_OPTIONS.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
            <Field
              label="Restrição alimentar"
              hint="Só o buffet usa esta informação."
              className="span-2"
            >
              <input
                value={g.dietaryNotes}
                onChange={(e) => update(g.key, { dietaryNotes: e.target.value })}
                maxLength={500}
              />
            </Field>
            <Field label="Telefone">
              <input
                type="tel"
                value={g.phone}
                onChange={(e) => update(g.key, { phone: e.target.value })}
                maxLength={32}
              />
            </Field>
            <Field label="E-mail">
              <input
                type="email"
                value={g.email}
                onChange={(e) => update(g.key, { email: e.target.value })}
                maxLength={191}
              />
            </Field>
            {guests.length > 1 && (
              <div className="span-2">
                <button
                  type="button"
                  className="button button--small button--danger-ghost"
                  onClick={() => setGuests((list) => list.filter((x) => x.key !== g.key))}
                >
                  Remover {g.name || `convidado ${i + 1}`}
                </button>
              </div>
            )}
          </fieldset>
        ))}
        <div>
          <button
            type="button"
            className="button button--ghost"
            onClick={() => setGuests((list) => [...list, emptyGuest()])}
          >
            + Adicionar convidado
          </button>
        </div>
      </section>

      <FormError message={error} />
      <div className="actions sticky-actions">
        <a
          className="button button--ghost"
          href={editing ? eh(`/convites/${id}`) : eh("/convites")}
        >
          Cancelar
        </a>
        <button className="button" type="submit" disabled={busy}>
          {busy ? "Salvando…" : editing ? "Salvar convite" : "Criar convite"}
        </button>
      </div>
    </form>
  );
}
