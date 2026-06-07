import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");

const requiredFiles = [
  "index.html",
  "styles.css",
  "script.js",
  "README.md",
  "PROMPTS.md",
  "netlify.toml",
  "tools/build-deliverable.mjs",
  "entregables/entrega-diego-cortez.pdf",
  "assets/profile-photo.jpg",
  "assets/profile-card.svg",
  "assets/ai-lab.png",
  "assets/local-infra.png",
  "assets/digital-business.png",
  "assets/maker-rural.png",
];

for (const file of requiredFiles) {
  assert.equal(existsSync(join(root, file)), true, `${file} should exist`);
}

const html = read("index.html");
const css = read("styles.css");
const js = read("script.js");
const prompts = read("PROMPTS.md");

[
  "Diego Gabriel Cortez Loayza",
  "Negocios Digitales",
  "Sobre mi",
  "Habilidades",
  "Proyectos",
  "Intereses",
  "Contacto",
  "gabodcortez@gmail.com",
  "gabo.cortez.l",
].forEach((text) => {
  assert(html.includes(text), `index.html should include ${text}`);
});

["<canvas", "profile-photo.jpg", "aria-label", "data-section"].forEach((text) => {
  assert(html.includes(text), `index.html should include ${text}`);
});

[
  "assets/ai-lab.png",
  "assets/local-infra.png",
  "assets/digital-business.png",
  "assets/maker-rural.png",
].forEach((text) => {
  assert(html.includes(text), `index.html should reference ${text}`);
});

[
  "@media",
  "--electric",
  "prefers-reduced-motion",
  "scroll-timeline",
  "mix-blend-mode",
  "project-card__image",
].forEach((text) => {
  assert(css.includes(text), `styles.css should include ${text}`);
});

[
  "const canvas",
  "IntersectionObserver",
  "matchMedia",
].forEach((text) => {
  assert(js.includes(text), `script.js should include ${text}`);
});

[
  "theme-toggle",
  "data-theme",
  "localStorage",
  "creible",
  "creibles",
  "inventado",
  "inventada",
  "inventados",
  "inventadas",
].forEach((text) => {
  assert.equal(
    `${html}\n${css}\n${js}\n${prompts}`.toLowerCase().includes(text),
    false,
    `project text should not include ${text}`
  );
});

[
  "OpenAI Codex",
  "HTML",
  "CSS",
  "JavaScript",
  "Netlify",
].forEach((text) => {
  assert(prompts.includes(text), `PROMPTS.md should include ${text}`);
});

console.log("Static portfolio checks passed.");
