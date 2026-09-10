export function updateEngineTrailParticles(particles, dt, shouldRemove = () => false) {
  for (let index = particles.length - 1; index >= 0; index--) {
    const particle = particles[index];
    if (shouldRemove(particle)) {
      particles.splice(index, 1);
      continue;
    }
    particle.t += dt;
    if (particle.t >= particle.life) {
      particles.splice(index, 1);
      continue;
    }
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.rotation += particle.spin * dt;
    particle.x += Math.cos(particle.rotation + Math.PI / 2) * particle.drift * dt;
    particle.y += Math.sin(particle.rotation + Math.PI / 2) * particle.drift * dt;
    particle.vx *= Math.pow(0.94, dt * 60);
    particle.vy *= Math.pow(0.94, dt * 60);
  }
}

const smokeSprites = [];

function getSmokeSprite(variant = 0) {
  const index = Math.abs(Math.floor(variant)) % 6;
  if (smokeSprites[index]) return smokeSprites[index];
  const smoke = document.createElement("canvas");
  smoke.width = 64;
  smoke.height = 64;
  const smokeContext = smoke.getContext("2d");
  const lobes = [
    [0, 0, 18, 0.22], [-10, 3, 12, 0.16], [9, -4, 14, 0.18],
    [(index % 3 - 1) * 5, 9, 11, 0.12], [7 - (index % 2) * 14, 7, 9, 0.1],
  ];
  for (const [dx, dy, radius, alpha] of lobes) {
    const gradient = smokeContext.createRadialGradient(32 + dx, 32 + dy, 0, 32 + dx, 32 + dy, radius);
    gradient.addColorStop(0, `rgba(205,225,235,${alpha})`);
    gradient.addColorStop(0.38, `rgba(145,170,185,${alpha * 0.72})`);
    gradient.addColorStop(1, "rgba(65,78,88,0)");
    smokeContext.fillStyle = gradient;
    smokeContext.fillRect(0, 0, 64, 64);
  }
  smokeSprites[index] = smoke;
  return smoke;
}

export function drawEngineTrailParticles(context, particles, offsetX, offsetY, width, height) {
  context.save();
  for (const particle of particles) {
    const progress = particle.t / particle.life;
    const x = particle.x + offsetX;
    const y = particle.y + offsetY;
    if (x < -30 || y < -30 || x > width + 30 || y > height + 30) continue;
    const fadeIn = Math.min(1, progress / 0.12);
    const fadeOut = Math.pow(1 - progress, 1.35);
    const size = particle.size * (1.9 + progress * 3.2);
    context.save();
    context.translate(x, y);
    context.rotate(particle.rotation);
    context.globalAlpha = fadeIn * fadeOut * 0.52;
    context.drawImage(getSmokeSprite(particle.smokeVariant), -size * particle.stretch, -size, size * particle.stretch * 2, size * 2);
    if (progress < 0.28) {
      context.globalCompositeOperation = "lighter";
      context.globalAlpha = (1 - progress / 0.28) * 0.2;
      context.fillStyle = "rgb(90,205,255)";
      context.beginPath();
      context.ellipse(0, 0, size * 0.72, size * 0.35, 0, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }
  context.restore();
}
