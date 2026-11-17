/** Navega pelo hash (#/convites/12): o painel não tem roteador, o servidor só entrega o index. */
export const go = (path: string) => {
  window.location.hash = path;
};
