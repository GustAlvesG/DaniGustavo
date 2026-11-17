/*
 * Service worker mínimo e seguro do site de casamento.
 *
 * O que faz:
 *  - guarda /offline.html (página simples no visual do site) e os ícones na instalação;
 *  - navegando sem internet, mostra /offline.html no lugar do erro do navegador;
 *  - guarda só arquivos estáticos que nunca mudam de conteúdo (fontes e ícones).
 *
 * O que NUNCA faz: guardar páginas, respostas da API, pagamento, /c/* (convites),
 * /confirmar, /presentes, /uploads. Esses pedidos nem passam por aqui (o worker não
 * chama respondWith), então sempre vão direto à rede. Mudou algo? Aumente VERSION.
 */
const VERSION = "v1";
const CACHE = `casamento-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/192", "/icons/512"];

// Só estes caminhos podem ser guardados (arquivos com hash no nome ou ícones).
const STATIC = [/^\/_next\/static\/media\//, /^\/icons\//];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navegação: sempre a rede; sem internet, a página offline. Nada é guardado.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match(OFFLINE_URL).then((r) => r || Response.error())),
    );
    return;
  }

  // Estáticos permitidos: cache primeiro.
  if (STATIC.some((re) => re.test(url.pathname))) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
  // Qualquer outra coisa: segue direto para a rede (sem respondWith).
});
