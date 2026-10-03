// Les chiffres restent lisibles en qualité basse, sans flou ni secousse.
export function drawCombatFloatTexts(ctx, items, { ox, oy, width, height, simple = false, isBeyondSensorRadius = () => false }) {
  for (const ft of items) {
    if (isBeyondSensorRadius(ft.x, ft.y)) continue;
    const p = Math.max(0, Math.min(1, ft.t / ft.life));
    const sx = ft.x + ox, sy = ft.y + oy;
    if (sx < -120 || sy < -80 || sx > width + 120 || sy > height + 80) continue;
    ctx.save();
    if (simple) {
      ctx.translate(sx, sy);
      ctx.shadowBlur = 0;
      ctx.lineWidth = 2;
    } else {
      const sc = 1 + (ft.pop || 0) * Math.exp(-p * 10);
      const shake = (ft.shake || 0) * (1 - p);
      ctx.translate(sx + (Math.random() * 2 - 1) * shake, sy + (Math.random() * 2 - 1) * shake);
      ctx.scale(sc, sc);
      ctx.shadowBlur = (ft.glow || 0) * 26 * (1 - p);
      ctx.shadowColor = ft.color;
      ctx.lineWidth = Math.max(4, Math.min(12, (ft.size || 18) * 0.22));
    }
    ctx.globalAlpha = 1 - p;
    ctx.font = `${ft.weight || 900} ${Math.round(ft.size || 18)}px ui-sans-serif, system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = "rgba(5,8,20,0.92)";
    ctx.strokeText(ft.text, 0, 0);
    ctx.fillStyle = ft.color;
    ctx.fillText(ft.text, 0, 0);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}
