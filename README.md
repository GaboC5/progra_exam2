# Portfolio Personal - Diego Gabriel Cortez Loayza

CV/portfolio web personal desarrollado para la tarea **Desarrollo Web Personal con Vibe Coding**.

Sitio publicado: https://6a24f64e8ea7c34e3c1237df--comforting-cupcake-5eff10.netlify.app/

Repositorio: https://github.com/GaboC5/progra_exam2

## Descripcion

El proyecto presenta el perfil profesional de Diego Gabriel Cortez Loayza, estudiante de **Negocios Digitales**, con enfoque en inteligencia artificial aplicada, infraestructura personal, automatizacion para pymes, Linux, redes, IoT y cultura maker.

La pagina busca cumplir la rubrica de la tarea y elevar la presentacion con una identidad visual propia, fotografia personal, imagenes generadas con IA, animacion interactiva y estructura responsive.

## Contenido incluido

- Nombre completo, carrera, descripcion personal, habilidades, intereses, contacto y red social.
- Secciones de proyectos: homeserver, fine tuning con modelos open weights y prototipos SaaS para negocios locales.
- Imagenes de apoyo generadas con IA para reforzar cada bloque de contenido.
- Diseno responsive para desktop y movil.
- Animacion canvas, navegacion activa y efectos visuales sutiles.
- Evidencias en `evidencias/` y prompts documentados en `PROMPTS.md`.

## Tecnologias

- HTML semantico
- CSS personalizado
- JavaScript
- OpenAI Codex y generacion de imagenes con IA
- Netlify para publicacion

## Estructura

```text
.
├── assets/
│   ├── profile-photo.jpg
│   ├── ai-lab.png
│   ├── local-infra.png
│   ├── digital-business.png
│   └── maker-rural.png
├── evidencias/
├── entregables/entrega-diego-cortez.pdf
├── tools/build-deliverable.mjs
├── index.html
├── styles.css
├── script.js
├── PROMPTS.md
├── netlify.toml
└── tests/checks.mjs
```

## Verificacion local

```bash
node tests/checks.mjs
node --check script.js
```

## Publicacion

El sitio esta publicado en Netlify. Cada push a la rama `main` actualiza la version publicada automaticamente.
