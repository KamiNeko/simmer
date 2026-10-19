// Illustrated, top-down "photos" of the demo dishes, drawn as SVG so the repo needs no
// stock images. Each dish is a bowl or plate with a base and scattered toppings.

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const TABLES = {
  wood: ["#6b4a33", "#8a6446"],
  slate: ["#2f3437", "#454b4f"],
  linen: ["#d9cfc0", "#ece4d6"],
};

function scatter(random, count, radius, draw) {
  let out = "";
  for (let i = 0; i < count; i++) {
    const a = random() * Math.PI * 2;
    const r = Math.sqrt(random()) * radius;
    out += draw(Math.cos(a) * r, Math.sin(a) * r, random() * 360, random);
  }
  return out;
}

const shapes = {
  grain: (color) => (x, y, rot) => `<ellipse cx="${x}" cy="${y}" rx="7" ry="3.2" fill="${color}" transform="rotate(${rot} ${x} ${y})"/>`,
  chunk: (color, size = 18) => (x, y, rot, random) => {
    const s = size * (0.7 + random() * 0.6);
    return `<rect x="${x - s / 2}" y="${y - s / 2}" width="${s}" height="${s * 0.8}" rx="${s / 3}" fill="${color}" transform="rotate(${rot} ${x} ${y})"/>`;
  },
  dot: (color, size = 6) => (x, y, _rot, random) => `<circle cx="${x}" cy="${y}" r="${size * (0.6 + random() * 0.8)}" fill="${color}"/>`,
  leaf: (color, size = 14) => (x, y, rot) =>
    `<path d="M${x - size} ${y} Q${x} ${y - size * 0.7} ${x + size} ${y} Q${x} ${y + size * 0.7} ${x - size} ${y}Z" fill="${color}" transform="rotate(${rot} ${x} ${y})"/>`,
  ring: (color, size = 16) => (x, y, rot) =>
    `<ellipse cx="${x}" cy="${y}" rx="${size}" ry="${size * 0.8}" fill="none" stroke="${color}" stroke-width="4" transform="rotate(${rot} ${x} ${y})"/>`,
  slice: (color, size = 22) => (x, y, rot) =>
    `<path d="M${x} ${y} l${size} 0 a${size} ${size} 0 0 0 ${-size} ${-size}z" fill="${color}" transform="rotate(${rot} ${x} ${y})"/>`,
};

export const DISHES = {
  "kimchi-fried-rice": {
    table: "slate", vessel: "bowl", rim: "#e9e4dc", base: "#d9893f",
    layers: [[shapes.grain("#f0b46a"), 900, 0.92], [shapes.grain("#c8662c"), 250, 0.9], [shapes.chunk("#b8321f", 20), 30, 0.75], [shapes.leaf("#4f8a3a", 9), 40, 0.8]],
    center: `<circle r="62" fill="#fbf7ee"/><circle r="26" cx="6" cy="-4" fill="#f6b21b"/>`,
  },
  "gochujang-chicken-meal-prep": {
    table: "wood", vessel: "plate", rim: "#f4f1ea", base: "#f3eee3", bed: ["#fbf8f1", 0.78],
    layers: [[shapes.grain("#e9e1d0"), 1400, 0.76], [shapes.chunk("#9e2a17", 40), 34, 0.95, 170], [shapes.chunk("#c4421f", 30), 26, 0.95, 160], [shapes.dot("#f5ead0", 3), 160, 0.95, 170], [shapes.ring("#5c9a3c", 10), 50, 0.8]],
  },
  shakshuka: {
    table: "linen", vessel: "pan", rim: "#24272a", base: "#b92d1c",
    layers: [[shapes.dot("#d4472c", 10), 180, 0.92], [shapes.dot("#8e1f12", 5), 120, 0.92], [shapes.leaf("#3f7d34", 8), 60, 0.85]],
    eggs: [[-80, -60], [70, -70], [-40, 80], [90, 60]],
  },
  "mushroom-risotto": {
    table: "slate", vessel: "plate", rim: "#efebe3", base: "#efebe3", bed: ["#e3cd9c", 0.8],
    layers: [[shapes.grain("#f2e2bd"), 1800, 0.78], [shapes.chunk("#6e4e32", 42), 40, 0.7], [shapes.chunk("#a07a52", 30), 30, 0.7], [shapes.dot("#3e6b2c", 3.5), 90, 0.75], [shapes.dot("#fff8e0", 5), 60, 0.7]],
  },
  "lemon-herb-salmon": {
    table: "linen", vessel: "plate", rim: "#ffffff", base: "#f7f5f0",
    layers: [[shapes.chunk("#d9b26a", 54), 22, 0.75], [shapes.chunk("#c99a4e", 44), 12, 0.75], [shapes.leaf("#4c8a3c", 14), 70, 0.85]],
    fillet: true,
  },
  "thai-green-curry": {
    table: "wood", vessel: "bowl", rim: "#2c3a33", base: "#a7b85a",
    layers: [[shapes.dot("#c4cf7a", 12), 120, 0.9], [shapes.chunk("#f1e3c4", 26), 22, 0.8], [shapes.slice("#c0392b", 14), 14, 0.8], [shapes.leaf("#2f6b2a", 14), 30, 0.85]],
  },
  "banana-bread": {
    table: "wood", vessel: "board", rim: "#c79a62", base: "#9a5a2c",
    layers: [],
    loaf: true,
  },
  "greek-salad": {
    table: "linen", vessel: "bowl", rim: "#ffffff", base: "#6f9e45",
    layers: [[shapes.leaf("#86b552", 26), 40, 0.92], [shapes.chunk("#d63a2f", 30), 18, 0.85], [shapes.chunk("#f5f5ef", 30), 12, 0.7], [shapes.dot("#2a1f2c", 8), 16, 0.8], [shapes.ring("#7b3f8c", 18), 10, 0.8], [shapes.slice("#7fae4b", 24), 12, 0.8]],
  },
};

export function dishSvg(slug, size = 1200) {
  const d = DISHES[slug];
  const random = rng([...slug].reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  const [t1, t2] = TABLES[d.table];
  const R = 330;
  let food = "";
  if (d.bed) food += `<circle r="${R * d.bed[1]}" fill="${d.bed[0]}"/>`;
  for (const [draw, count, spread, radius] of d.layers) food += scatter(random, count, (radius ?? R) * spread, draw);
  if (d.eggs)
    for (const [x, y] of d.eggs) food += `<ellipse cx="${x}" cy="${y}" rx="58" ry="52" fill="#fbf8f0"/><circle cx="${x + 4}" cy="${y - 2}" r="24" fill="#f4a51c"/>`;
  if (d.fillet)
    food += `<path d="M-250 -10 C-160 -190 180 -190 270 -40 C220 90 -150 110 -250 -10Z" fill="#ec7f52"/>` +
      Array.from({ length: 8 }, (_, i) => `<path d="M${-190 + i * 55} -140 q24 70 0 160" stroke="#f6b08b" stroke-width="8" fill="none"/>`).join("") +
      `<circle cx="120" cy="120" r="54" fill="#f7e35c"/><circle cx="120" cy="120" r="44" fill="#fbf0a0"/>` +
      Array.from({ length: 8 }, (_, i) => `<line x1="120" y1="120" x2="${120 + 42 * Math.cos(i * 0.785)}" y2="${120 + 42 * Math.sin(i * 0.785)}" stroke="#f2d43c" stroke-width="3"/>`).join("");
  if (d.loaf)
    food = `<rect x="-300" y="-150" width="600" height="300" rx="80" fill="#7a4220"/><rect x="-280" y="-130" width="560" height="260" rx="70" fill="#9a5a2c"/>` +
      `<path d="M-240 0 C-120 -60 120 60 240 0" stroke="#6b3818" stroke-width="22" fill="none" stroke-linecap="round"/>` +
      `<rect x="330" y="-140" width="70" height="280" rx="16" fill="#7a4220"/><rect x="342" y="-128" width="46" height="256" rx="12" fill="#e2b77c"/>` +
      scatter(random, 30, 110, (x, y) => `<circle cx="${365 + x * 0.15}" cy="${y}" r="3.5" fill="#5a3418"/>`) +
      `<ellipse cx="-200" cy="230" rx="90" ry="34" fill="#f2d65a" transform="rotate(-20 -200 230)"/>`;

  const vessel = {
    bowl: `<circle r="${R + 40}" fill="${d.rim}" filter="url(#shadow)"/><circle r="${R + 6}" fill="#000" opacity="0.15"/><circle r="${R}" fill="${d.base}"/>`,
    plate: `<circle r="${R + 90}" fill="${d.rim}" filter="url(#shadow)"/><circle r="${R + 30}" fill="#000" opacity="0.05"/><circle r="${R}" fill="${d.base}" opacity="0.9"/>`,
    pan: `<rect x="${R + 20}" y="-30" width="260" height="60" rx="30" fill="${d.rim}" filter="url(#shadow)"/><circle r="${R + 34}" fill="${d.rim}" filter="url(#shadow)"/><circle r="${R}" fill="${d.base}"/>`,
    board: `<rect x="-${R + 70}" y="-${R - 40}" width="${2 * R + 220}" height="${2 * R - 80}" rx="40" fill="${d.rim}" filter="url(#shadow)"/>`,
  }[d.vessel];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size * 0.66}" viewBox="-600 -396 1200 792">
  <defs>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="${d.table === "wood" ? "0.004 0.12" : "0.9"}" numOctaves="3" seed="4"/>
      <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${d.table === "wood" ? 0.35 : 0.12} 0"/>
      <feComposite in2="SourceGraphic" operator="in"/>
    </filter>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="18" dy="26" stdDeviation="22" flood-opacity="0.35"/></filter>
    <filter id="soft"><feGaussianBlur stdDeviation="0.8"/><feDropShadow dx="1.5" dy="2" stdDeviation="1.2" flood-opacity="0.35"/></filter>
    <radialGradient id="light" cx="35%" cy="25%" r="85%"><stop offset="0" stop-color="#fff" stop-opacity="0.18"/><stop offset="1" stop-color="#000" stop-opacity="0.35"/></radialGradient>
  </defs>
  <rect x="-600" y="-396" width="1200" height="792" fill="${t1}"/>
  <rect x="-600" y="-396" width="1200" height="792" fill="${t2}" filter="url(#grain)"/>
  <g transform="translate(${d.vessel === "pan" ? -110 : 0} 0)">${vessel}<g filter="url(#soft)">${food}${d.center ?? ""}</g></g>
  <rect x="-600" y="-396" width="1200" height="792" fill="url(#light)"/>
</svg>`;
}
