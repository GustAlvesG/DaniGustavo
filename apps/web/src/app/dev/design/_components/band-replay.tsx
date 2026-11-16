"use client";

import { useState } from "react";
import { TileBand } from "@/components/tiles";
import { Button } from "@/components/ui";

/**
 * Virada da faixa: mudar `replayKey` faz a faixa voltar ao verso e virar de
 * novo assim que estiver na tela (ela já está, então vira na hora).
 */
export function BandReplay() {
  const [key, setKey] = useState(0);
  return (
    <div className="flex flex-col gap-6">
      <TileBand design="estrela" replayKey={key} />
      <div>
        <Button variant="secondary" onClick={() => setKey((k) => k + 1)}>
          Repetir virada
        </Button>
      </div>
    </div>
  );
}
