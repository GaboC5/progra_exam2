import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const outPdf = join(root, "entregables", "entrega-diego-cortez.pdf");
const evidenceDir = join(root, "evidencias");
const tempDir = join(root, ".tmp-deliverable");
const reportPath = join(tempDir, "reporte-entrega.html");

const netlifyUrl =
  process.env.NETLIFY_URL ||
  "https://comforting-cupcake-5eff10.netlify.app/";
const repoUrl = "https://github.com/GaboC5/progra_exam2";

rmSync(tempDir, { recursive: true, force: true });
mkdirSync(dirname(outPdf), { recursive: true });
mkdirSync(evidenceDir, { recursive: true });
mkdirSync(tempDir, { recursive: true });

function normalize(text) {
  return text
    .normalize("NFC")
    .replace(/\r\n/g, "\n")
    .replace(/\uFFFD/g, "")
    .trim();
}

function escapeHtml(text) {
  return normalize(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function read(file) {
  return normalize(readFileSync(join(root, file), "utf8"));
}

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.BROWSER_PATH,
    `${process.env.LOCALAPPDATA}/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-win64/chrome-headless-shell.exe`,
    `${process.env.LOCALAPPDATA}/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-win64/chrome-headless-shell.exe`,
    `${process.env.LOCALAPPDATA}/ms-playwright/chromium-1217/chrome-win64/chrome.exe`,
    `${process.env.LOCALAPPDATA}/ms-playwright/chromium-1208/chrome-win64/chrome.exe`,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].filter(Boolean);

  const browser = candidates.find((candidate) => existsSync(candidate));
  if (!browser) {
    throw new Error("No Chromium/Chrome/Edge executable found for headless captures.");
  }
  return browser;
}

function contentType(pathname) {
  if (pathname.endsWith(".html")) return "text/html; charset=utf-8";
  if (pathname.endsWith(".css")) return "text/css; charset=utf-8";
  if (pathname.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
  if (pathname.endsWith(".svg")) return "image/svg+xml";
  if (pathname.endsWith(".md")) return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

function startServer() {
  const server = createHttpServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/") pathname = "/index.html";

    const requested = resolve(root, pathname.slice(1));
    if (!requested.startsWith(root) || !existsSync(requested)) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    res.writeHead(200, { "Content-Type": contentType(requested) });
    res.end(readFileSync(requested));
  });

  return new Promise((resolveServer) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolveServer({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function getFreePort() {
  return new Promise((resolvePort) => {
    const server = createNetServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
  });
}

function runBrowser(browser, args, label) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(browser, args, {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      rejectRun(new Error(`${label} timed out\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
    }, 90000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      rejectRun(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolveRun();
        return;
      }
      rejectRun(new Error(`${label} failed\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
    });
  });
}

async function waitForJson(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch {
      // Retry until Chrome exposes the debugging endpoint.
    }
    await delay(200);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function createCdpClient(wsUrl) {
  return new Promise((resolveClient, rejectClient) => {
    const ws = new WebSocket(wsUrl);
    let nextId = 1;
    const pending = new Map();
    const listeners = new Map();

    ws.addEventListener("open", () => {
      resolveClient({
        send(method, params = {}) {
          const id = nextId;
          nextId += 1;
          ws.send(JSON.stringify({ id, method, params }));
          return new Promise((resolveSend, rejectSend) => {
            pending.set(id, { resolve: resolveSend, reject: rejectSend });
          });
        },
        waitFor(method, timeoutMs = 15000) {
          return new Promise((resolveWait, rejectWait) => {
            const timeout = setTimeout(() => {
              rejectWait(new Error(`Timed out waiting for CDP event ${method}`));
            }, timeoutMs);
            const handlers = listeners.get(method) || [];
            handlers.push((params) => {
              clearTimeout(timeout);
              resolveWait(params);
            });
            listeners.set(method, handlers);
          });
        },
        close() {
          ws.close();
        },
      });
    });

    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        const { resolve, reject } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
        return;
      }
      if (message.method && listeners.has(message.method)) {
        const handlers = listeners.get(message.method);
        listeners.delete(message.method);
        handlers.forEach((handler) => handler(message.params));
      }
    });

    ws.addEventListener("error", rejectClient);
  });
}

async function captureScrolledScreenshot(browser, url, output, width, height, selector) {
  const port = await getFreePort();
  const profile = join(tempDir, `profile-cdp-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const child = spawn(browser, [
    "--headless",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-extensions",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${port}`,
    "about:blank",
  ], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    const targets = await waitForJson(`http://127.0.0.1:${port}/json/list`);
    const page = targets.find((target) => target.type === "page") || targets[0];
    const cdp = await createCdpClient(page.webSocketDebuggerUrl);
    try {
      await cdp.send("Page.enable");
      await cdp.send("Runtime.enable");
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: width < 700,
      });

      const loaded = cdp.waitFor("Page.loadEventFired", 30000);
      await cdp.send("Page.navigate", { url });
      await loaded;
      await delay(800);
      const scrollResult = await cdp.send("Runtime.evaluate", {
        expression: `
          (() => {
            document.documentElement.style.scrollBehavior = "auto";
            document.body.style.scrollBehavior = "auto";
            const el = document.querySelector(${JSON.stringify(selector)});
            if (el) {
              const top = el.getBoundingClientRect().top + window.scrollY - 96;
              window.scrollTo(0, Math.max(0, top));
            }
            return { found: Boolean(el), scrollY: window.scrollY };
          })();
        `,
        returnByValue: true,
      });
      await delay(1000);
      const scrolled = scrollResult.result?.value;
      if (!scrolled?.found || scrolled.scrollY < 100) {
        const retry = await cdp.send("Runtime.evaluate", {
          expression: `
            (() => {
              const el = document.querySelector(${JSON.stringify(selector)});
              const top = el ? el.offsetTop - 96 : 0;
              window.scrollTo(0, Math.max(0, top));
              return { found: Boolean(el), scrollY: window.scrollY, top };
            })();
          `,
          returnByValue: true,
        });
        const retryValue = retry.result?.value;
        if (!retryValue?.found || retryValue.scrollY < 100) {
          throw new Error(`Could not scroll to ${selector}: ${JSON.stringify(retryValue)}`);
        }
      }
      const capture = await cdp.send("Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
      });
      writeFileSync(output, Buffer.from(capture.data, "base64"));
    } finally {
      cdp.close();
    }
  } finally {
    child.kill("SIGKILL");
  }
}

async function screenshot(browser, url, output, width, height) {
  const profile = join(tempDir, `profile-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await runBrowser(
    browser,
    [
      "--headless",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-extensions",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${profile}`,
      `--window-size=${width},${height}`,
      "--force-device-scale-factor=1",
      "--virtual-time-budget=2200",
      `--screenshot=${output}`,
      url,
    ],
    `Screenshot ${output}`
  );
}

async function printPdf(browser, url, output) {
  if (existsSync(output)) rmSync(output);
  const profile = join(tempDir, `profile-pdf-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await runBrowser(
    browser,
    [
      "--headless",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-extensions",
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${profile}`,
      "--print-to-pdf-no-header",
      `--print-to-pdf=${output}`,
      url,
    ],
    "PDF generation"
  );
}

function writeEvidencePage(file, { title, eyebrow, body, blocks }) {
  const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: light;
        --ink: #111827;
        --muted: #4b5563;
        --line: #d1d5db;
        --panel: #f9fafb;
        --accent: #0f766e;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: #ffffff;
        color: var(--ink);
        font-family: Inter, Arial, sans-serif;
        line-height: 1.55;
      }
      main {
        width: min(1120px, calc(100% - 48px));
        margin: 32px auto;
      }
      .eyebrow {
        margin: 0 0 8px;
        color: var(--accent);
        font-size: 13px;
        font-weight: 800;
        text-transform: uppercase;
      }
      h1 {
        max-width: 900px;
        margin: 0 0 12px;
        font-size: 42px;
        line-height: 1.05;
      }
      p {
        max-width: 920px;
        margin: 0 0 18px;
        color: var(--muted);
        font-size: 18px;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 18px;
      }
      article {
        overflow: hidden;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel);
      }
      h2 {
        margin: 0;
        padding: 14px 16px;
        border-bottom: 1px solid var(--line);
        font-size: 16px;
      }
      pre {
        max-height: 520px;
        margin: 0;
        padding: 16px;
        overflow: hidden;
        white-space: pre-wrap;
        color: #1f2937;
        font: 13px/1.45 Consolas, "Courier New", monospace;
      }
    </style>
  </head>
  <body>
    <main>
      <p class="eyebrow">${escapeHtml(eyebrow)}</p>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(body)}</p>
      <section class="grid">
        ${blocks
          .map(
            (block) => `<article><h2>${escapeHtml(block.title)}</h2><pre>${escapeHtml(block.text)}</pre></article>`
          )
          .join("")}
      </section>
    </main>
  </body>
</html>`;
  writeFileSync(join(tempDir, file), html, "utf8");
}

function css() {
  return `
@page { size: A4; margin: 14mm; }
* { box-sizing: border-box; }
body {
  margin: 0;
  color: #18202a;
  background: #f4f7fb;
  font-family: Inter, Arial, sans-serif;
  line-height: 1.45;
}
.page {
  min-height: 268mm;
  break-after: page;
  padding: 8mm 0 0;
}
.cover {
  display: grid;
  align-content: center;
  min-height: 268mm;
  color: #f8fafc;
  background: linear-gradient(135deg, #0f172a, #12303a);
  margin: -14mm;
  padding: 22mm;
}
.cover h1 {
  max-width: 760px;
  margin: 0;
  font-size: 44px;
  line-height: 1.03;
}
.cover .student {
  margin-top: 12px;
  color: #fde047;
  font-size: 24px;
  font-weight: 800;
}
.cover p {
  max-width: 720px;
  color: #cbd5e1;
  font-size: 16px;
}
h1, h2, h3, p { overflow-wrap: anywhere; }
h2 {
  margin: 0 0 12px;
  color: #0f172a;
  font-size: 26px;
  line-height: 1.08;
}
h3 {
  margin: 0 0 6px;
  color: #0f172a;
  font-size: 15px;
}
p, li {
  color: #334155;
  font-size: 11.5px;
}
.eyebrow {
  margin: 0 0 6px;
  color: #0f766e;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.panel {
  padding: 14px;
  border: 1px solid #d8e0ea;
  border-radius: 8px;
  background: #ffffff;
}
.grid-2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.grid-3 {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.checklist {
  display: grid;
  gap: 8px;
  padding: 0;
  list-style: none;
}
.checklist li {
  padding: 8px 10px;
  border-left: 4px solid #0f766e;
  border-radius: 6px;
  background: #ffffff;
}
.shot {
  width: 100%;
  max-height: 172mm;
  object-fit: contain;
  border: 1px solid #d8e0ea;
  border-radius: 8px;
  background: #0f172a;
}
.shot.short { max-height: 116mm; }
.shot.mobile {
  display: block;
  width: auto;
  max-width: 62mm;
  max-height: 160mm;
  margin: 0 auto;
}
.caption {
  margin-top: 7px;
  color: #64748b;
  font-size: 10px;
}
.meta {
  display: grid;
  gap: 8px;
  margin-top: 18px;
}
.meta div {
  padding: 10px;
  border-radius: 6px;
  background: rgba(255,255,255,0.08);
}
.meta strong {
  display: block;
  color: #67e8f9;
  font-size: 11px;
  text-transform: uppercase;
}
.meta span {
  color: #f8fafc;
  font-size: 12px;
}
code {
  color: #0f172a;
  font-family: Consolas, "Courier New", monospace;
  font-size: 10px;
}
pre {
  max-height: 90mm;
  margin: 0;
  overflow: hidden;
  white-space: pre-wrap;
  color: #1f2937;
  font: 9.6px/1.35 Consolas, "Courier New", monospace;
}
`;
}

function reportHtml() {
  const prompts = read("PROMPTS.md");
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>Entregable Diego Cortez</title>
    <style>${css()}</style>
  </head>
  <body>
    <section class="cover page">
      <p class="eyebrow">Introduccion a la Programacion</p>
      <h1>Entrega final: Portfolio web personal con Vibe Coding</h1>
      <div class="student">Diego Gabriel Cortez Loayza</div>
      <p>Documento tecnico de entrega con enlace publico de Netlify, codigo fuente, capturas responsive, evidencias de prompts/IA y verificacion de publicacion.</p>
      <div class="meta">
        <div><strong>Netlify</strong><span>${netlifyUrl}</span></div>
        <div><strong>GitHub</strong><span>${repoUrl}</span></div>
        <div><strong>Tecnologias</strong><span>HTML semantico, CSS responsive, JavaScript, Canvas, GitHub, Netlify y OpenAI Codex.</span></div>
      </div>
    </section>

    <section class="page">
      <p class="eyebrow">Resumen de cumplimiento</p>
      <h2>Checklist solicitado por la consigna</h2>
      <ul class="checklist">
        <li><strong>Enlace publico de Netlify:</strong> incluido, verificado y capturado en navegador headless.</li>
        <li><strong>Codigo fuente del proyecto:</strong> repositorio publico y captura tecnica de archivos clave.</li>
        <li><strong>Capturas de pantalla de la pagina:</strong> desktop, mobile y seccion de proyectos.</li>
        <li><strong>Capturas mostrando uso de IA/prompts:</strong> PROMPTS.md renderizado y documentado.</li>
        <li><strong>Evidencias de publicacion en Netlify:</strong> captura del sitio publico funcionando en dominio Netlify.</li>
      </ul>
      <div class="grid-2">
        <div class="panel">
          <h3>Descripcion tecnica</h3>
          <p>El sitio es una pagina estatica construida con HTML, CSS y JavaScript. La estructura separa contenido semantico, estilos responsive y comportamiento interactivo. El canvas de fondo, el estado activo de navegacion y los reveal animations se controlan desde JavaScript.</p>
        </div>
        <div class="panel">
          <h3>Mejoras visuales auditadas</h3>
          <p>Se corrigio la jerarquia responsive del hero, la posicion del retrato, el header movil, los saltos por ancla y la distribucion de tarjetas de proyectos. Las capturas incluidas son posteriores a esos ajustes.</p>
        </div>
      </div>
    </section>

    <section class="page">
      <p class="eyebrow">Captura obligatoria</p>
      <h2>Pagina principal en desktop</h2>
      <img class="shot" src="/evidencias/desktop-home.png" alt="Captura desktop de la pagina principal" />
      <p class="caption">Captura tomada con Chromium headless a 1440 x 900 px.</p>
    </section>

    <section class="page">
      <p class="eyebrow">Captura obligatoria</p>
      <h2>Diseno responsive en telefono</h2>
      <div class="grid-2">
        <div>
          <img class="shot mobile" src="/evidencias/mobile-home.png" alt="Captura mobile de la pagina principal" />
        </div>
        <div class="panel">
          <h3>Validacion responsive</h3>
          <p>La version movil muestra navegacion compacta, hero legible, botones principales visibles y retrato ubicado sin texto superpuesto en la cara.</p>
          <p>El flujo del contenido mantiene el orden: presentacion, retrato, areas de enfoque, perfil, habilidades, proyectos, intereses y contacto.</p>
        </div>
      </div>
    </section>

    <section class="page">
      <p class="eyebrow">Captura obligatoria</p>
      <h2>Seccion de proyectos</h2>
      <img class="shot" src="/evidencias/desktop-projects.png" alt="Captura desktop de proyectos" />
      <p class="caption">Documenta contenido tecnico, tarjetas de proyecto, imagenes y estructura de informacion.</p>
    </section>

    <section class="page">
      <p class="eyebrow">Captura obligatoria</p>
      <h2>Sitio funcionando en Netlify</h2>
      <img class="shot" src="/evidencias/netlify-site.png" alt="Captura del sitio publicado en Netlify" />
      <p class="caption">Captura tomada desde el dominio publico de Netlify: ${netlifyUrl}</p>
      <div class="panel">
        <h3>Evidencia de publicacion</h3>
        <p>El sitio se abre desde un dominio Netlify publico. Esta evidencia cubre la disponibilidad externa del proyecto y complementa el enlace incluido en README.md.</p>
      </div>
    </section>

    <section class="page">
      <p class="eyebrow">Captura obligatoria</p>
      <h2>Codigo fuente del proyecto</h2>
      <img class="shot" src="/evidencias/code-overview.png" alt="Captura de codigo fuente del proyecto" />
      <p class="caption">Captura generada desde una vista tecnica de archivos clave: index.html, styles.css, script.js y configuracion de Netlify.</p>
    </section>

    <section class="page">
      <p class="eyebrow">Captura obligatoria</p>
      <h2>Uso de IA, prompts y herramientas</h2>
      <img class="shot" src="/evidencias/prompts-evidence.png" alt="Captura de prompts y uso de IA" />
      <p class="caption">PROMPTS.md documenta planificacion, personalizacion, calidad visual, generacion de imagenes y uso de OpenAI Codex.</p>
    </section>

    <section class="page">
      <p class="eyebrow">Detalle tecnico</p>
      <h2>Arquitectura y decisiones de implementacion</h2>
      <div class="grid-3">
        <div class="panel">
          <h3>HTML</h3>
          <p>Estructura semantica con secciones identificables, navegacion interna, textos de perfil, proyectos, intereses y contacto.</p>
        </div>
        <div class="panel">
          <h3>CSS</h3>
          <p>Variables visuales, layout grid, tarjetas, media queries, scroll padding para anclas y reglas para evitar solapamientos responsive.</p>
        </div>
        <div class="panel">
          <h3>JavaScript</h3>
          <p>Canvas interactivo, particulas, observadores de interseccion, revelado de secciones y estado activo de navegacion.</p>
        </div>
      </div>
      <div class="panel">
        <h3>Prompts usados</h3>
        <pre>${escapeHtml(prompts.slice(0, 2400))}</pre>
      </div>
    </section>
  </body>
</html>`;
}

function snippets() {
  return {
    html: read("index.html").split("\n").slice(0, 80).join("\n"),
    css: read("styles.css").split("\n").slice(0, 105).join("\n"),
    js: read("script.js").split("\n").slice(0, 95).join("\n"),
    netlify: read("netlify.toml"),
  };
}

async function main() {
  const browser = findBrowser();
  const { server, baseUrl } = await startServer();
  try {
    const code = snippets();
    writeEvidencePage("codigo.html", {
      eyebrow: "Codigo fuente del proyecto",
      title: "Archivos clave del portfolio",
      body: "Vista tecnica generada para evidenciar que el proyecto incluye HTML, CSS, JavaScript y configuracion de publicacion.",
      blocks: [
        { title: "index.html", text: code.html },
        { title: "styles.css", text: code.css },
        { title: "script.js", text: code.js },
        { title: "netlify.toml", text: code.netlify },
      ],
    });

    writeEvidencePage("prompts.html", {
      eyebrow: "Uso de IA y Vibe Coding",
      title: "Prompts y herramientas documentadas",
      body: "Captura del archivo PROMPTS.md usado como evidencia del proceso con OpenAI Codex y generacion de imagenes.",
      blocks: [{ title: "PROMPTS.md", text: read("PROMPTS.md") }],
    });

    await screenshot(browser, `${baseUrl}/index.html?capture=desktop`, join(evidenceDir, "desktop-home.png"), 1440, 900);
    await screenshot(browser, `${baseUrl}/index.html?capture=mobile`, join(evidenceDir, "mobile-home.png"), 390, 844);
    await captureScrolledScreenshot(browser, `${baseUrl}/index.html?capture=projects`, join(evidenceDir, "desktop-projects.png"), 1440, 900, "#proyectos");
    await screenshot(browser, `${baseUrl}/.tmp-deliverable/codigo.html`, join(evidenceDir, "code-overview.png"), 1280, 900);
    await screenshot(browser, `${baseUrl}/.tmp-deliverable/prompts.html`, join(evidenceDir, "prompts-evidence.png"), 1280, 900);
    await screenshot(browser, netlifyUrl, join(evidenceDir, "netlify-site.png"), 1440, 900);

    writeFileSync(reportPath, reportHtml(), "utf8");
    await printPdf(browser, `${baseUrl}/.tmp-deliverable/reporte-entrega.html`, outPdf);

    console.log(`PDF generated: ${outPdf}`);
    console.log(`Evidence screenshots generated in: ${evidenceDir}`);
  } finally {
    server.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
