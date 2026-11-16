import { Hero } from "@/components/hero/Hero";
import { Opening } from "@/components/opening";
import { heroPlaceholder } from "@/content/placeholder";

// Página estática (prerender): o hero sai pronto no HTML e é o LCP; a abertura
// é uma ilha cliente que só anima por cima. TODO(conteudo): Fase 2 lê /api/site.
export default function Home() {
  return (
    <>
      <Opening />
      <main id="conteudo">
        <Hero {...heroPlaceholder} />
      </main>
    </>
  );
}
