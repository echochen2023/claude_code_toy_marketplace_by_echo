#!/usr/bin/env node
// Headless Playwright driver for the toy marketplace.
// Reads one command per line from stdin (pipe a heredoc), runs them in order
// against a single page, and exits non-zero on the first failing command.
//
// Usage: node .claude/skills/run-claude-code-toy-marketplace/driver.mjs < script.txt
// See SKILL.md in this directory for the command list.
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import readline from "node:readline";

const APP = process.env.APP_URL ?? "http://localhost:8080/claude_code_toy_marketplace_by_echo";
const SUPABASE = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SHOTS = process.env.SHOTS_DIR ?? "/tmp/toy-marketplace-shots";
const TIMEOUT = 15000;

mkdirSync(SHOTS, { recursive: true });

// Local-only login: mint a magic link with the service-role key, follow the
// verify redirect ourselves, and re-point its #access_token fragment at the app.
// The redirect lands on site_url (127.0.0.1:3000 by default, nothing listens
// there), so the fragment has to be moved onto the app URL by hand.
async function loginUrl(email, path) {
  const status = JSON.parse(
    execSync("npx supabase status -o json", { stdio: ["ignore", "pipe", "ignore"] }).toString(),
  );
  const key = status.SERVICE_ROLE_KEY;
  const auth = { apikey: key, Authorization: `Bearer ${key}` };
  // generate_link(magiclink) silently SIGNS UP unknown emails, so refuse them up front.
  const known = await fetch(
    `${SUPABASE}/rest/v1/profiles?select=user_id&email=eq.${encodeURIComponent(email)}`,
    { headers: auth },
  ).then((r) => r.json());
  if (!known.length) throw new Error(`no existing account for ${email}; refusing to create one`);
  const res = await fetch(`${SUPABASE}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email }),
  });
  if (!res.ok) throw new Error(`generate_link ${res.status}: ${await res.text()}`);
  const { action_link } = await res.json();
  const verify = await fetch(action_link, { redirect: "manual" });
  const location = verify.headers.get("location") ?? "";
  const hash = location.slice(location.indexOf("#"));
  if (!hash.includes("access_token")) throw new Error(`no access_token in redirect: ${location}`);
  return `${APP}${path}${hash}`;
}

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1200, height: 900 } })).newPage();
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

// "role:button:Edit" -> getByRole('button', {name:'Edit'}); "text:Foo" -> getByText;
// anything else is a CSS / Playwright selector.
function locate(sel) {
  if (sel.startsWith("role:")) {
    const [, role, ...name] = sel.split(":");
    return page.getByRole(role, name.length ? { name: name.join(":"), exact: true } : {}).first();
  }
  if (sel.startsWith("text:")) return page.getByText(sel.slice(5), { exact: true }).first();
  return page.locator(sel).first();
}

// Splits `cmd <selector> <rest of line>`; selectors can't contain spaces unless quoted.
function args(line) {
  const m = line.match(/^(\S+)\s*(?:"([^"]*)"|(\S+))?\s*(.*)$/);
  return [m[1], m[2] ?? m[3] ?? "", m[4]];
}

const commands = {
  async login(email, path = "/") { await page.goto(await loginUrl(email, path)); },
  async nav(path) { await page.goto(path.startsWith("http") ? path : `${APP}${path}`); },
  async "wait-for"(text) { await page.getByText(text).first().waitFor({ timeout: TIMEOUT }); },
  // Text appears before images: product photos come from Supabase Storage after the RPC returns.
  async idle() {
    await page.waitForLoadState("networkidle", { timeout: TIMEOUT });
    await page.waitForFunction(
      () => [...document.images].every((img) => img.complete),
      null,
      { timeout: TIMEOUT },
    );
  },
  async click(sel) { await locate(sel).click({ timeout: TIMEOUT }); },
  async fill(sel, text) { await locate(sel).fill(text, { timeout: TIMEOUT }); },
  async press(key) { await page.keyboard.press(key); },
  async text(sel) { console.log((await locate(sel).innerText({ timeout: TIMEOUT })).trim()); },
  async ss(name = `shot-${Date.now()}`) {
    const file = `${SHOTS}/${name}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log(`screenshot -> ${file}`);
  },
  async console() {
    console.log(consoleErrors.length ? consoleErrors.join("\n") : "(no console errors)");
  },
};

let code = 0;
for await (const raw of readline.createInterface({ input: process.stdin })) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const [cmd, a, b] = args(line);
  console.log(`> ${line}`);
  try {
    if (!commands[cmd]) throw new Error(`unknown command: ${cmd}`);
    await commands[cmd](a, b);
  } catch (e) {
    console.error(`FAILED: ${e.message.split("\n")[0]}`);
    await commands.ss("failure").catch(() => {});
    code = 1;
    break;
  }
}
await browser.close();
process.exit(code);
