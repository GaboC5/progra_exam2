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
  "assets/profile-card.svg",
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

["<canvas", "profile-card.svg", "aria-label", "data-section"].forEach((text) => {
  assert(html.includes(text), `index.html should include ${text}`);
});

[
  "@media",
  "--electric",
  "prefers-reduced-motion",
  "scroll-timeline",
  "mix-blend-mode",
].forEach((text) => {
  assert(css.includes(text), `styles.css should include ${text}`);
});

[
  "const canvas",
  "IntersectionObserver",
  "matchMedia",
  "profile-photo.jpg",
  "localStorage",
].forEach((text) => {
  assert(js.includes(text), `script.js should include ${text}`);
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
