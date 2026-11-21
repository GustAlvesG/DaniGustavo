import { useEffect, useRef, useState } from "react";

/*
 * Fase 7, frente A: leitor de QR pela câmera com a API nativa `BarcodeDetector` (Chrome/Android,
 * Safari recente). Sem ela (ou sem câmera), o componente não aparece e a tela segue com a
 * digitação do código e a busca por nome. Sem biblioteca: decisão do usuário.
 */

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
interface BarcodeDetectorCtor {
  new (options?: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

const detectorCtor = (): BarcodeDetectorCtor | null =>
  (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector ?? null;

/** O navegador lê QR pela câmera? (resolve false sem BarcodeDetector, sem qr_code ou sem câmera) */
export async function canScanQr(): Promise<boolean> {
  const Ctor = detectorCtor();
  if (!Ctor || !navigator.mediaDevices?.getUserMedia) return false;
  try {
    const formats = (await Ctor.getSupportedFormats?.()) ?? ["qr_code"];
    return formats.includes("qr_code");
  } catch {
    return false;
  }
}

const SCAN_INTERVAL_MS = 250;

/** Vídeo da câmera traseira; chama `onCode` com o texto do primeiro QR lido e para. */
export function Scanner({
  onCode,
  onClose,
}: {
  onCode: (code: string) => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const done = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let alive = true;
    const Ctor = detectorCtor();
    if (!Ctor) return;
    const detector = new Ctor({ formats: ["qr_code"] });

    const tick = async () => {
      if (!alive || done.current) return;
      const v = video.current;
      if (v && v.readyState >= 2) {
        try {
          const [hit] = await detector.detect(v);
          if (hit?.rawValue && alive && !done.current) {
            done.current = true;
            navigator.vibrate?.(80);
            onCode(hit.rawValue);
            return;
          }
        } catch {
          // Quadro ruim: tenta no próximo.
        }
      }
      timer = setTimeout(() => void tick(), SCAN_INTERVAL_MS);
    };

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then(async (s) => {
        if (!alive) {
          s.getTracks().forEach((tr) => tr.stop());
          return;
        }
        stream = s;
        const v = video.current;
        if (!v) return;
        v.srcObject = s;
        await v.play().catch(() => undefined);
        void tick();
      })
      .catch(() =>
        setError(
          "Não conseguimos abrir a câmera. Libere o acesso nas configurações do navegador ou busque pelo nome.",
        ),
      );

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [onCode]);

  return (
    <div className="scanner stack">
      {error ? (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      ) : (
        <div className="scanner__frame">
          <video ref={video} muted playsInline aria-label="Câmera para ler o QR do convite" />
          <span className="scanner__target" aria-hidden="true" />
        </div>
      )}
      <p className="muted small">Aponte a câmera para o QR impresso no convite.</p>
      <button type="button" className="button button--ghost" onClick={onClose}>
        Fechar câmera
      </button>
    </div>
  );
}
