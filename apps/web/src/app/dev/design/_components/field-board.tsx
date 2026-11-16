import type { ReactNode } from "react";
import { Checkbox, Radio, RadioGroup, Select, TextArea, TextField } from "@/components/ui";
import { cx } from "@/lib/cx";
import styles from "./board.module.css";
import { BoardSubheading } from "./section";

type State = "normal" | "foco" | "erro" | "desativado";

const STATES: { state: State; label: string }[] = [
  { state: "normal", label: "Normal" },
  { state: "foco", label: "Foco" },
  { state: "erro", label: "Erro" },
  { state: "desativado", label: "Desativado" },
];

function Row({
  title,
  note,
  render,
}: {
  title: string;
  note?: string;
  render: (state: State, key: string, focus: string | undefined) => ReactNode;
}) {
  return (
    <div>
      <BoardSubheading note={note}>{title}</BoardSubheading>
      <div className="grid grid-cols-1 gap-x-8 gap-y-10 md:grid-cols-2 xl:grid-cols-4">
        {STATES.map(({ state, label }) => (
          <div
            key={state}
            className={cx(
              "flex flex-col gap-4 border-t border-nevoa pt-4",
              state === "foco" && styles.forceFocus,
            )}
          >
            <p className="text-sm text-tinta/70">{label}</p>
            {render(state, `${title}-${state}`, state === "foco" ? "" : undefined)}
          </div>
        ))}
      </div>
    </div>
  );
}

export function FieldBoard() {
  return (
    <div className="flex flex-col gap-20 lg:gap-28">
      <Row
        title="Campo de texto"
        note="Rótulo sempre acima, dica curta abaixo dele, erro que diz o que fazer. Borda anil (3:1 ou mais), cobalto no foco."
        render={(state, _key, focus) => (
          <TextField
            label="Nome completo"
            data-force-focus={focus}
            hint="Como está no convite"
            defaultValue={state === "normal" ? "" : "Daniela Souza"}
            placeholder="Seu nome"
            error={state === "erro" ? "Escreva nome e sobrenome, como no convite." : undefined}
            disabled={state === "desativado"}
          />
        )}
      />
      <Row
        title="Seleção"
        render={(state, _key, focus) => (
          <Select
            label="Restrição alimentar"
            data-force-focus={focus}
            optional
            defaultValue={state === "normal" ? "" : "vegetariana"}
            error={state === "erro" ? "Escolha uma opção da lista." : undefined}
            disabled={state === "desativado"}
          >
            <option value="">Nenhuma</option>
            <option value="vegetariana">Vegetariana</option>
            <option value="vegana">Vegana</option>
            <option value="sem-gluten">Sem glúten</option>
          </Select>
        )}
      />
      <Row
        title="Área de texto"
        render={(state, _key, focus) => (
          <TextArea
            label="Recado para os noivos"
            data-force-focus={focus}
            optional
            rows={3}
            placeholder="Escreva com carinho"
            defaultValue={state === "normal" ? "" : "Que dia lindo vai ser."}
            error={state === "erro" ? "O recado pode ter até 500 caracteres." : undefined}
            disabled={state === "desativado"}
          />
        )}
      />
      <Row
        title="Caixa de seleção"
        note="Um mini azulejo: marcada, ganha esmalte cobalto e o visto se desenha."
        render={(state, _key, focus) => (
          <div className="flex flex-col">
            <Checkbox
              label="Vou levar acompanhante"
              data-force-focus={focus}
              defaultChecked={state === "foco" || state === "desativado"}
              disabled={state === "desativado"}
              error={state === "erro" ? "Confirme para continuar." : undefined}
            />
            <Checkbox
              label="Quero receber lembretes"
              hint="Por e-mail, perto da data"
              disabled={state === "desativado"}
            />
          </div>
        )}
      />
      <Row
        title="Grupo de rádios"
        render={(state, key, focus) => (
          <RadioGroup
            legend="Você vai?"
            error={state === "erro" ? "Escolha uma das respostas." : undefined}
          >
            <Radio
              name={key}
              value="sim"
              label="Sim, vou com alegria"
              data-force-focus={focus}
              defaultChecked={state === "foco" || state === "desativado"}
              disabled={state === "desativado"}
            />
            <Radio
              name={key}
              value="nao"
              label="Não vou conseguir ir"
              disabled={state === "desativado"}
            />
          </RadioGroup>
        )}
      />
    </div>
  );
}
