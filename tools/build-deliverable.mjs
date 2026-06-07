import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const outPath = join(process.cwd(), "entregables", "entrega-diego-cortez.pdf");
mkdirSync(dirname(outPath), { recursive: true });

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 44;
const dark = "0.035 0.043 0.063";
const panel = "0.075 0.090 0.128";
const ink = "0.965 0.965 0.925";
const muted = "0.690 0.710 0.760";
const cyan = "0.190 0.843 1.000";
const yellow = "1.000 0.882 0.000";
const violet = "0.478 0.424 1.000";
const green = "0.514 0.831 0.353";

function normalizeText(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/–|—/g, "-")
    .replace(/→/g, "->");
}

function esc(text) {
  return normalizeText(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapText(text, maxChars) {
  const words = normalizeText(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function readPng(file) {
  const data = readFileSync(file);
  if (data.toString("ascii", 1, 4) !== "PNG") {
    throw new Error(`${file} is not a PNG`);
  }

  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  const bitDepth = data[24];
  const colorType = data[25];
  if (bitDepth !== 8 || colorType !== 2) {
    throw new Error(`${file} must be 8-bit RGB PNG`);
  }

  let offset = 8;
  const idat = [];
  while (offset < data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString("ascii", offset + 4, offset + 8);
    const chunk = data.subarray(offset + 8, offset + 8 + length);
    if (type === "IDAT") idat.push(chunk);
    if (type === "IEND") break;
    offset += 12 + length;
  }

  return { width, height, stream: Buffer.concat(idat) };
}

class Pdf {
  constructor() {
    this.objects = [];
    this.pages = [];
    this.images = [];
    this.fontRegular = this.addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    this.fontBold = this.addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  }

  addObject(content) {
    const number = this.objects.length + 1;
    this.objects.push(Buffer.isBuffer(content) ? content : Buffer.from(content, "binary"));
    return number;
  }

  addPng(name, path) {
    const image = readPng(path);
    const dict =
      `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode ` +
      `/DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns ${image.width} >> ` +
      `/Length ${image.stream.length} >>\nstream\n`;
    const object = this.addObject(Buffer.concat([
      Buffer.from(dict, "binary"),
      image.stream,
      Buffer.from("\nendstream", "binary"),
    ]));
    this.images.push({ name, object, width: image.width, height: image.height });
    return this.images.at(-1);
  }

  addPage(commands) {
    const stream = Buffer.from(commands.join("\n"), "binary");
    const contentObj = this.addObject(Buffer.concat([
      Buffer.from(`<< /Length ${stream.length} >>\nstream\n`, "binary"),
      stream,
      Buffer.from("\nendstream", "binary"),
    ]));
    const xObjects = this.images.map((img) => `/${img.name} ${img.object} 0 R`).join(" ");
    const pageObj = this.addObject(
      `<< /Type /Page /Parent __PAGES__ 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources << /ProcSet [/PDF /Text /ImageC] /Font << /F1 ${this.fontRegular} 0 R /F2 ${this.fontBold} 0 R >> ` +
        `/XObject << ${xObjects} >> >> /Contents ${contentObj} 0 R >>`
    );
    this.pages.push(pageObj);
  }

  save(path) {
    const pagesObj = this.objects.length + 1;
    for (let i = 0; i < this.objects.length; i += 1) {
      this.objects[i] = Buffer.from(this.objects[i].toString("binary").replaceAll("__PAGES__", String(pagesObj)), "binary");
    }
    const kids = this.pages.map((page) => `${page} 0 R`).join(" ");
    this.addObject(`<< /Type /Pages /Kids [${kids}] /Count ${this.pages.length} >>`);
    const catalogObj = this.addObject(`<< /Type /Catalog /Pages ${pagesObj} 0 R >>`);

    const parts = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "binary")];
    const offsets = [0];
    let length = parts[0].length;
    this.objects.forEach((obj, index) => {
      offsets.push(length);
      const head = Buffer.from(`${index + 1} 0 obj\n`, "binary");
      const tail = Buffer.from("\nendobj\n", "binary");
      parts.push(head, obj, tail);
      length += head.length + obj.length + tail.length;
    });
    const xrefStart = length;
    const xref = [
      `xref\n0 ${this.objects.length + 1}\n`,
      "0000000000 65535 f \n",
      ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`),
      `trailer\n<< /Size ${this.objects.length + 1} /Root ${catalogObj} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`,
    ].join("");
    parts.push(Buffer.from(xref, "binary"));
    writeFileSync(path, Buffer.concat(parts));
  }
}

function bg(cmd) {
  cmd.push(`${dark} rg 0 0 ${PAGE_W} ${PAGE_H} re f`);
}

function rect(cmd, x, y, w, h, color = panel) {
  cmd.push(`${color} rg ${x} ${y} ${w} ${h} re f`);
}

function text(cmd, value, x, y, size = 11, font = "F1", color = ink) {
  cmd.push(`${color} rg BT /${font} ${size} Tf ${x} ${y} Td (${esc(value)}) Tj ET`);
}

function paragraph(cmd, value, x, y, size = 10.5, maxChars = 78, leading = 15, color = muted) {
  const lines = wrapText(value, maxChars);
  lines.forEach((line, index) => text(cmd, line, x, y - index * leading, size, "F1", color));
  return y - lines.length * leading;
}

function image(cmd, imageObj, x, y, w, h) {
  const scale = Math.min(w / imageObj.width, h / imageObj.height);
  const iw = imageObj.width * scale;
  const ih = imageObj.height * scale;
  const ix = x + (w - iw) / 2;
  const iy = y + (h - ih) / 2;
  cmd.push(`q ${iw} 0 0 ${ih} ${ix} ${iy} cm /${imageObj.name} Do Q`);
}

function bullet(cmd, value, x, y) {
  text(cmd, "■", x, y, 9, "F2", green);
  return paragraph(cmd, value, x + 16, y, 10.5, 72, 14, ink);
}

const pdf = new Pdf();
const desktop = pdf.addPng("Desktop", "evidencias/desktop-home.png");
const mobile = pdf.addPng("Mobile", "evidencias/mobile-home.png");
const aiLab = pdf.addPng("AiLab", "assets/ai-lab.png");
const infra = pdf.addPng("Infra", "assets/local-infra.png");
const business = pdf.addPng("Business", "assets/digital-business.png");
const maker = pdf.addPng("Maker", "assets/maker-rural.png");

{
  const c = [];
  bg(c);
  text(c, "DESARROLLO WEB PERSONAL", M, 760, 14, "F2", cyan);
  text(c, "Portfolio CV con Vibe Coding", M, 716, 34, "F2", ink);
  text(c, "Diego Gabriel Cortez Loayza", M, 674, 24, "F2", yellow);
  text(c, "Negocios Digitales | IA Aplicada | Sistemas | Maker", M, 646, 13, "F1", muted);
  rect(c, M, 446, 508, 144);
  paragraph(
    c,
    "Este documento resume el entregable final: pagina web personal publicada en Netlify, codigo fuente publico, capturas, prompts utilizados y evidencia del uso de herramientas de IA.",
    M + 22,
    558,
    13,
    62,
    18,
    ink
  );
  text(c, "Netlify:", M + 22, 492, 12, "F2", cyan);
  text(c, "https://6a24f64e8ea7c34e3c1237df--comforting-cupcake-5eff10.netlify.app/", M + 88, 492, 8.7, "F1", ink);
  text(c, "GitHub:", M + 22, 468, 12, "F2", cyan);
  text(c, "https://github.com/GaboC5/progra_exam2", M + 88, 468, 10.5, "F1", ink);
  image(c, aiLab, M, 138, 508, 250);
  text(c, "Generado con apoyo de OpenAI Codex y metodologia Vibe Coding.", M, 84, 11, "F1", muted);
  pdf.addPage(c);
}

{
  const c = [];
  bg(c);
  text(c, "Checklist de entrega", M, 774, 24, "F2", yellow);
  let y = 728;
  y = bullet(c, "Enlace publico de Netlify incluido y verificable.", M, y);
  y = bullet(c, "Codigo fuente publico en GitHub.", M, y - 8);
  y = bullet(c, "Capturas de pantalla de la pagina principal y diseno responsive.", M, y - 8);
  y = bullet(c, "Prompts y uso de herramientas IA documentados.", M, y - 8);
  y = bullet(c, "Evidencia de publicacion en Netlify: link publico, deploy publicado y captura proporcionada por el estudiante.", M, y - 8);
  rect(c, M, 430, 508, 140);
  text(c, "Publicacion en Netlify", M + 20, 532, 18, "F2", cyan);
  paragraph(
    c,
    "El sitio fue publicado como comforting-cupcake-5eff10. El enlace publico funciona como evidencia directa de que la pagina esta disponible en internet. La captura del dashboard de Netlify enviada por el estudiante muestra deploy publicado, resumen de archivos y proceso de build/deploy completo.",
    M + 20,
    504,
    11,
    72,
    15,
    ink
  );
  rect(c, M, 230, 508, 150);
  text(c, "Codigo fuente", M + 20, 342, 18, "F2", cyan);
  paragraph(
    c,
    "Repositorio publico: https://github.com/GaboC5/progra_exam2. El proyecto usa HTML, CSS y JavaScript sin framework, lo que facilita revisar la estructura, estilos, interacciones y assets entregados.",
    M + 20,
    314,
    11,
    72,
    15,
    ink
  );
  pdf.addPage(c);
}

{
  const c = [];
  bg(c);
  text(c, "Captura: pagina principal", M, 776, 22, "F2", yellow);
  image(c, desktop, M, 172, 508, 560);
  text(c, "Evidencia de hero, navegacion, perfil personal y diseno desktop.", M, 126, 11, "F1", muted);
  pdf.addPage(c);
}

{
  const c = [];
  bg(c);
  text(c, "Captura: responsive movil", M, 776, 22, "F2", yellow);
  image(c, mobile, M, 120, 250, 620);
  rect(c, 330, 420, 220, 190);
  text(c, "Criterios visibles", 350, 568, 16, "F2", cyan);
  paragraph(c, "La captura movil documenta adaptacion responsive, lectura del hero, botones principales y tarjetas iniciales.", 350, 538, 10.5, 31, 15, ink);
  paragraph(c, "El codigo fuente publico complementa la evidencia de estructura HTML, CSS y JavaScript.", 350, 474, 10.5, 31, 15, ink);
  pdf.addPage(c);
}

{
  const c = [];
  bg(c);
  text(c, "Uso de IA y prompts", M, 776, 22, "F2", yellow);
  let y = 730;
  y = paragraph(c, "Herramienta principal: OpenAI Codex. Se uso para planificar, implementar, revisar responsive design, generar prompts, producir imagenes y preparar evidencias.", M, y, 12, 72, 17, ink);
  text(c, "Prompts representativos", M, y - 28, 15, "F2", cyan);
  y -= 60;
  y = bullet(c, "Planificar una pagina web personal tipo CV/Portfolio con HTML, CSS y JavaScript, cumpliendo la rubrica de Vibe Coding.", M, y);
  y = bullet(c, "Personalizar el portfolio para Negocios Digitales, IA aplicada, fine tuning, Hugging Face, modelos locales, Linux, redes, IoT y home servers.", M, y - 8);
  y = bullet(c, "Mejorar calidad visual con identidad amarillo/violeta, animaciones, imagenes coherentes y estructura responsive.", M, y - 8);
  y = bullet(c, "Generar imagenes de apoyo para IA, homeserver, SaaS para pymes y maker/agricultura.", M, y - 8);
  rect(c, M, 156, 508, 132);
  text(c, "Herramientas usadas", M + 20, 252, 16, "F2", cyan);
  paragraph(c, "HTML, CSS, JavaScript, OpenAI Codex, generacion de imagenes con IA, GitHub y Netlify. Los prompts completos estan documentados en PROMPTS.md dentro del repositorio.", M + 20, 224, 11, 72, 15, ink);
  pdf.addPage(c);
}

{
  const c = [];
  bg(c);
  text(c, "Imagenes generadas para complementar la pagina", M, 776, 19, "F2", yellow);
  image(c, aiLab, M, 470, 240, 180);
  image(c, infra, 310, 470, 240, 180);
  image(c, business, M, 230, 240, 180);
  image(c, maker, 310, 230, 240, 180);
  text(c, "Estas imagenes refuerzan visualmente las secciones de IA, infraestructura local, negocios digitales e intereses maker/rurales.", M, 172, 11, "F1", muted);
  pdf.addPage(c);
}

pdf.save(outPath);
console.log(outPath);
