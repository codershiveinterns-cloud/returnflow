import { createApp } from "./app.js";
import { env } from "./env.js";

createApp().listen(env.API_PORT, () => {
  console.log(`ReturnFlow API listening on http://localhost:${env.API_PORT}`);
});
