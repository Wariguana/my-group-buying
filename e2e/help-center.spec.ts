import { test } from "@playwright/test";
import { verifyHelpCenter } from "./helpers/help-center";

test("help center: real links, responsive Footer, anchors, FAQ and unpublished policies", async ({ browser }, info) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width: 1440, height: 900 }, hasTouch: true, reducedMotion: "reduce" });
  try { await verifyHelpCenter(await context.newPage(), info.outputPath("evidence"), false); }
  finally { await context.close(); }
});
