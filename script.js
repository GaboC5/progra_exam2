const root = document.documentElement;
const canvas = document.querySelector("#neural-field");
const ctx = canvas.getContext("2d");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const navLinks = [...document.querySelectorAll(".site-nav a")];
const sections = [...document.querySelectorAll("[data-section]")];
const revealItems = [...document.querySelectorAll("[data-reveal]")];
const profilePhoto = document.querySelector("#profile-photo");
const themeToggle = document.querySelector(".theme-toggle");

const storedTheme = localStorage.getItem("portfolio-theme");
if (storedTheme) {
  root.dataset.theme = storedTheme;
}

themeToggle.addEventListener("click", () => {
  const next = root.dataset.theme === "light" ? "dark" : "light";
  root.dataset.theme = next;
  localStorage.setItem("portfolio-theme", next);
});

fetch("assets/profile-photo.jpg", { method: "HEAD" })
  .then((response) => {
    if (response.ok) {
      profilePhoto.src = "assets/profile-photo.jpg";
    }
  })
  .catch(() => {});

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
      }
    });
  },
  { threshold: 0.18 }
);

revealItems.forEach((item) => revealObserver.observe(item));

const sectionObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const active = `#${entry.target.id}`;
      navLinks.forEach((link) => {
        link.classList.toggle("is-active", link.getAttribute("href") === active);
      });
    });
  },
  { rootMargin: "-42% 0px -50% 0px" }
);

sections.forEach((section) => sectionObserver.observe(section));

let width = 0;
let height = 0;
let particles = [];
let pointer = { x: -9999, y: -9999 };
const palette = ["#ffe100", "#7a6cff", "#31d7ff", "#83d45a", "#ff6f61"];

function resizeCanvas() {
  width = window.innerWidth;
  height = window.innerHeight;
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.floor(width * scale);
  canvas.height = Math.floor(height * scale);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  createParticles();
}

function createParticles() {
  const count = Math.min(95, Math.max(38, Math.floor(width / 18)));
  particles = Array.from({ length: count }, (_, index) => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.34,
    vy: (Math.random() - 0.5) * 0.34,
    radius: Math.random() * 1.9 + 0.7,
    color: palette[index % palette.length],
  }));
}

function drawParticleField() {
  ctx.clearRect(0, 0, width, height);

  for (const particle of particles) {
    particle.x += particle.vx;
    particle.y += particle.vy;

    if (particle.x < -20) particle.x = width + 20;
    if (particle.x > width + 20) particle.x = -20;
    if (particle.y < -20) particle.y = height + 20;
    if (particle.y > height + 20) particle.y = -20;

    const dx = pointer.x - particle.x;
    const dy = pointer.y - particle.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 150) {
      particle.x -= dx * 0.0028;
      particle.y -= dy * 0.0028;
    }
  }

  for (let i = 0; i < particles.length; i += 1) {
    for (let j = i + 1; j < particles.length; j += 1) {
      const a = particles[i];
      const b = particles[j];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (distance < 132) {
        ctx.globalAlpha = (1 - distance / 132) * 0.26;
        ctx.strokeStyle = a.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  }

  ctx.globalAlpha = 1;
  for (const particle of particles) {
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  requestAnimationFrame(drawParticleField);
}

function updatePointer(event) {
  pointer = { x: event.clientX, y: event.clientY };
}

if (!reduceMotion.matches) {
  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("pointermove", updatePointer);
  window.addEventListener("pointerleave", () => {
    pointer = { x: -9999, y: -9999 };
  });
  resizeCanvas();
  drawParticleField();
}
