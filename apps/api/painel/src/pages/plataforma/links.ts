/** Hash de uma página da plataforma: ph("/planos") → "#/plataforma/planos". */
export const ph = (path: string) => `#/plataforma${path === "/" ? "" : path}`;
