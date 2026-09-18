/**
 * OpenNext custom Worker: keep generated `fetch`, add WeatherNext wind cache cron.
 *
 * `.open-next/worker.js` is emitted by `opennextjs-cloudflare build`.
 * See https://opennext.js.org/cloudflare/howtos/custom-worker
 */
// @ts-nocheck
import { default as handler } from "./.open-next/worker.js";
import {
  ingestEnvFromWorker,
  refreshPickerRegionWindCache,
} from "./src/lib/ingest/wind";

export default {
  fetch: handler.fetch,

  /**
   * Background refresh for El Salvador / WUI + Cascade only.
   * Local: wrangler dev --test-scheduled then GET /__scheduled?cron=* * * * *
   */
  async scheduled(controller, env, ctx) {
    if (!env?.WIND_CACHE) {
      console.warn("[weathernext] WIND_CACHE unbound; skip refresh");
      return;
    }
    const results = await refreshPickerRegionWindCache({
      kv: env.WIND_CACHE,
      env: ingestEnvFromWorker(env),
    });
    console.log(
      JSON.stringify({
        msg: "weathernext_cache_refresh",
        cron: controller.cron,
        scheduledTime: controller.scheduledTime,
        results,
      }),
    );
    void ctx;
  },
};
