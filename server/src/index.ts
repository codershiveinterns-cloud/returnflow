import { createApp } from "./app.js";
import { env } from "./env.js";

const app = createApp();

// On Vercel the platform invokes the exported app; locally we listen on a port.
if (!process.env.VERCEL) {
  app.listen(env.API_PORT, () => {
    console.log(`ReturnFlow API listening on http://localhost:${env.API_PORT}`);
  });
}

export default app;
