import { router } from "./trpc";
import { agentsRouter } from "./routers/agents";
import { directoryRouter } from "./routers/directory";
import { healthRouter } from "./routers/health";
import { insightRouter } from "./routers/insight";
import { productsRouter } from "./routers/products";
import { socialRouter } from "./routers/social";
import { tenantRouter } from "./routers/tenant";

// Top-level AppRouter. Web imports this purely for the inferred type.
// Server-side execution lives in apps/api.
export const appRouter = router({
  agents: agentsRouter,
  directory: directoryRouter,
  health: healthRouter,
  insight: insightRouter,
  products: productsRouter,
  social: socialRouter,
  tenant: tenantRouter,
});

export type AppRouter = typeof appRouter;
