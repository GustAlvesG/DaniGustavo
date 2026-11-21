import { z } from "zod";

/*
 * CSP do painel (`script-src 'self'`, sem 'unsafe-eval'): o zod 4 testa `new Function("")` na
 * primeira validação de objeto para decidir se gera validadores com código (JIT). O teste é
 * pego num try/catch, mas o navegador registra a violação da CSP a cada carga. `jitless` pula o
 * teste e usa o validador interpretado (a diferença de velocidade não aparece nos formulários).
 * Importado antes de tudo no main.tsx.
 */
z.config({ jitless: true });
