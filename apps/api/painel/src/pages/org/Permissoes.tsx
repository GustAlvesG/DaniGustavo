import {
  ACTION_REQUIRES,
  EVENT_ACTION_LABELS,
  withDependents,
  type HostConfigurableAction,
  type HostPermissionsView,
} from "@casamento/shared";
import { useEffect, useState, type FormEvent } from "react";
import { errorMessage, orgApi, orgSend } from "../../api.ts";
import { ErrorBox, FormError, Loading, PageHeader, useLoad, useToast } from "../../ui.tsx";

/**
 * Permissões do anfitrião num evento (Fase 3): a organização marca o que os anfitriões podem
 * fazer. A API guarda a lista do que fica de fora; tirar "ver" de uma área tira também as
 * ações de mexer nela. Dono e membro da organização não são afetados.
 */
export function PermissoesAnfitriao({ eventId }: { eventId: number }) {
  const toast = useToast();
  const path = `/events/${eventId}/host-permissions`;
  const { data, setData, error, loading, reload } = useLoad(
    () => orgApi<HostPermissionsView>(path),
    [eventId],
  );
  const [deny, setDeny] = useState<HostConfigurableAction[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (data) setDeny(data.deny);
  }, [data?.deny.join(",")]);

  const effective = new Set(withDependents(deny));
  const blockedBy = (a: HostConfigurableAction) => {
    const needs = ACTION_REQUIRES[a];
    return needs && effective.has(needs) ? needs : null;
  };

  function toggle(a: HostConfigurableAction, allowed: boolean) {
    setDeny((list) => (allowed ? list.filter((x) => x !== a) : [...list, a]));
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      setData(await orgSend<HostPermissionsView>("PUT", path, { deny: withDependents(deny) }));
      toast("Permissões do anfitrião salvas.");
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack stack--lg">
      <PageHeader
        title="Permissões do anfitrião"
        subtitle="O que os anfitriões deste evento podem fazer no painel. Quem é da organização continua podendo tudo."
      />
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {data ? (
        <form className="card stack" onSubmit={save} noValidate aria-labelledby="perm-lista">
          <div>
            <h2 id="perm-lista">Os anfitriões podem</h2>
            <p className="muted small">
              Ver o início do painel fica sempre liberado. Sem permissão para ver uma área, também
              não dá para mexer nela.
            </p>
          </div>
          {data.actions.map((a) => {
            const needs = blockedBy(a);
            return (
              <label key={a} className="check">
                <input
                  type="checkbox"
                  checked={!effective.has(a)}
                  disabled={needs !== null}
                  onChange={(e) => toggle(a, e.target.checked)}
                />
                <span>
                  {EVENT_ACTION_LABELS[a]}
                  {needs ? (
                    <span className="muted small">
                      {" "}
                      (precisa de “{EVENT_ACTION_LABELS[needs].toLowerCase()}”)
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
          <FormError message={formError} />
          <div className="actions">
            <button className="button" type="submit" disabled={saving}>
              {saving ? "Salvando…" : "Salvar permissões"}
            </button>
            <button
              className="button button--ghost"
              type="button"
              disabled={saving || deny.length === 0}
              onClick={() => setDeny([])}
            >
              Liberar tudo
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
