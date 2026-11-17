import { createAuthClient } from "better-auth/react";

// Mesma origem da API: o cookie de sessão do Better Auth funciona sem CORS.
export const authClient = createAuthClient();
