import express from "express";
import { bountiesRouter } from "./routes/bounties.js";
import { healthRouter } from "./routes/health.js";
import { subscriptionsRouter } from "./routes/subscriptions.js";

export const app = express();

app.use(express.json());
app.use("/health", healthRouter);
app.use("/subscriptions", subscriptionsRouter);
app.use("/bounties", bountiesRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : "Unexpected server error";
  res.status(500).json({ error: message });
});
