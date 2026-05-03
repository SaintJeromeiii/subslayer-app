import express from "express";
import { authRouter } from "./routes/auth.js";
import { bountiesRouter } from "./routes/bounties.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { emailRouter } from "./routes/email.js";
import { healthRouter } from "./routes/health.js";
import { mercenaryRouter } from "./routes/mercenary.js";
import { plaidRouter } from "./routes/plaid.js";
import { subscriptionsRouter } from "./routes/subscriptions.js";
import { usersRouter } from "./routes/users.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { env } from "./config/env.js";

export const app = express();

app.use("/webhooks", express.raw({ type: "application/json" }), webhooksRouter);
app.use(express.json());
app.use(
  express.static("public", {
    etag: false,
    lastModified: false,
    maxAge: env.NODE_ENV === "production" ? "1h" : 0,
    setHeaders: (res) => {
      if (env.NODE_ENV !== "production") {
        res.setHeader("Cache-Control", "no-store");
      }
    }
  })
);
app.use("/auth", authRouter);
app.use("/health", healthRouter);
app.use("/dashboard", dashboardRouter);
app.use("/users", usersRouter);
app.use("/plaid", plaidRouter);
app.use("/email", emailRouter);
app.use("/mercenary", mercenaryRouter);
app.use("/subscriptions", subscriptionsRouter);
app.use("/bounties", bountiesRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : "Unexpected server error";
  res.status(500).json({ error: message });
});
