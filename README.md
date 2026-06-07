# Portfolio personal - Diego Gabriel Cortez Loayza

CV/portfolio web desarrollado con HTML, CSS y JavaScript como entrega de la tarea "Desarrollo Web Personal con Vibe Coding".

## Contenido

- Nombre completo, carrera, descripcion personal, habilidades, intereses, contacto y redes.
- Seccion de proyectos con enfoque en IA, homeservers, SaaS y digitalizacion para pymes.
- Diseño responsive para escritorio, tablet y movil.
- Animacion canvas, navegacion activa, modo claro/oscuro y carga automatica de foto personal.

## Como usar la foto real

La pagina incluye un avatar SVG de respaldo. Para usar la foto personal, guarda la imagen como:

```text
assets/profile-photo.jpg
```

Al publicarse en Netlify, `script.js` la detecta y reemplaza automaticamente el SVG.

## Publicacion en Netlify

1. Entrar a Netlify.
2. Crear un nuevo sitio con "Deploy manually" o subir esta carpeta.
3. Verificar que el sitio cargue `index.html`.
4. Abrir el enlace publico y revisar la version movil.

## Verificacion local

```bash
node tests/checks.mjs
```

El test valida que existan los archivos principales y que la pagina incluya el contenido exigido por la rubrica.
