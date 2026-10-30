// Draws the illuminated frame around the ayah. Every frame is SVG drawn to fit
// the box exactly, so it works for one-word ayat and for Al-Baqarah 282 alike.
// They are original drawings in the styles of classic mushaf illumination.

const f = (n) => Math.round(n * 10) / 10;

// Draw something along each side. `draw(len, side)` works in local
// coordinates: x runs along the side, y points inward from the outer edge.
function onSides(w, h, draw) {
  return [[0, 0, 0, w, "top"], [w, 0, 90, h, "right"], [w, h, 180, w, "bottom"], [0, h, 270, h, "left"]]
    .map(([x, y, a, len, name]) => `<g transform="translate(${x} ${y}) rotate(${a})">${draw(len, name)}</g>`)
    .join("");
}

// Draw something in each corner, with the corner at the origin and the
// frame running along +x and +y.
function atCorners(w, h, draw) {
  return [[0, 0, 0], [w, 0, 90], [w, h, 180], [0, h, 270]]
    .map(([x, y, a]) => `<g transform="translate(${x} ${y}) rotate(${a})">${draw()}</g>`)
    .join("");
}

// Evenly spaced points from `from` to `len - from`, about `step` apart.
function spots(len, from, step) {
  const n = Math.max(1, Math.round((len - 2 * from) / step));
  const gap = (len - 2 * from) / n;
  return Array.from({ length: n + 1 }, (_, i) => from + i * gap);
}

// A small repeatable random number generator, so pearls stay put on redraw.
function seeded(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

const rect = (x, y, w, h) => `M ${f(x)} ${f(y)} H ${f(x + w)} V ${f(y + h)} H ${f(x)} Z`;

// One side of the window, from (x0, y0) to (x1, y1), travelling clockwise.
// In the middle the window bulges out into the band as a large lobe with a
// small scallop either side.
function side(x0, y0, x1, y1, depth) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const ux = (x1 - x0) / len;
  const uy = (y1 - y0) / len;
  const at = (t) => `${(x0 + ux * t).toFixed(1)} ${(y0 + uy * t).toFixed(1)}`;
  const angle = (Math.atan2(uy, ux) * 180) / Math.PI;
  const rx = Math.min(Math.max(len * 0.11, 26), 84);
  const rs = depth * 0.5;
  const mid = len / 2;
  if (len < 2 * (rx + 2 * rs) + 8) return `L ${at(len)}`;
  return [
    `L ${at(mid - rx - 2 * rs)}`,
    `A ${rs} ${rs} 0 0 1 ${at(mid - rx)}`,
    `A ${rx} ${depth} ${angle.toFixed(1)} 0 1 ${at(mid + rx)}`,
    `A ${rs} ${rs} 0 0 1 ${at(mid + rx + 2 * rs)}`,
    `L ${at(len)}`,
  ].join(" ");
}

function windowPath(w, h, b) {
  const depth = Math.max(b - 9, 6);
  const s = b * 0.55; // concave corner radius
  const L = b;
  const T = b;
  const R = w - b;
  const B = h - b;
  return [
    `M ${L + s} ${T}`,
    side(L + s, T, R - s, T, depth),
    `A ${s} ${s} 0 0 0 ${R} ${T + s}`,
    side(R, T + s, R, B - s, depth),
    `A ${s} ${s} 0 0 0 ${R - s} ${B}`,
    side(R - s, B, L + s, B, depth),
    `A ${s} ${s} 0 0 0 ${L} ${B - s}`,
    side(L, B - s, L, T + s, depth),
    `A ${s} ${s} 0 0 0 ${L + s} ${T}`,
    "Z",
  ].join(" ");
}

function rosette(cx, cy, r) {
  let petals = "";
  for (let i = 0; i < 8; i++) {
    petals += `<ellipse class="rosette" cx="${cx}" cy="${cy - r * 0.55}" rx="${r * 0.22}" ry="${r * 0.45}" transform="rotate(${i * 45} ${cx} ${cy})"/>`;
  }
  return petals + `<circle class="rosette-eye" cx="${cx}" cy="${cy}" r="${r * 0.2}"/>`;
}

// A leaf standing on the outer rule at (x, y), pointing outward at `angle`.
function leaf(x, y, angle, size) {
  const w = size * 0.75;
  const h = size;
  const shape = `M 0 0 C ${-w} ${-h * 0.15} ${-w * 0.7} ${-h * 0.75} 0 ${-h} C ${w * 0.7} ${-h * 0.75} ${w} ${-h * 0.15} 0 0 Z`;
  const vein = `M 0 ${-h * 0.12} L 0 ${-h * 0.8} M 0 ${-h * 0.42} L ${-w * 0.32} ${-h * 0.62} M 0 ${-h * 0.42} L ${w * 0.32} ${-h * 0.62}`;
  return `<g transform="translate(${x} ${y}) rotate(${angle})"><path class="leaf" d="${shape}"/><path class="leaf-vein" d="${vein}"/></g>`;
}


// ---- Cartouche: soft gold, lobed window, leaf finials -----------------------

function cartouche(w, h, b) {
  const outer = `M 4 4 H ${w - 4} V ${h - 4} H 4 Z`;
  const win = windowPath(w, h, b);
  const c = 4 + (b - 4) / 2;
  // On phones the side leaves would reach the screen edge, so they shrink.
  const sideLeaf = innerWidth < 520 ? b * 0.6 : b * 0.9;
  return `
    <defs>
      <pattern id="lattice" width="12" height="12" patternUnits="userSpaceOnUse">
        <path class="pattern" d="M 6 0 L 12 6 L 6 12 L 0 6 Z M 6 4.2 A 1.8 1.8 0 1 0 6 7.8 A 1.8 1.8 0 1 0 6 4.2"/>
      </pattern>
    </defs>
    <path class="band" fill-rule="evenodd" d="${outer} ${win}"/>
    <path fill="url(#lattice)" fill-rule="evenodd" d="${outer} ${win}"/>
    <rect class="rule" x="0.6" y="0.6" width="${w - 1.2}" height="${h - 1.2}"/>
    <rect class="rule-thin" x="4" y="4" width="${w - 8}" height="${h - 8}"/>
    <path class="window" d="${win}"/>
    ${rosette(c, c, b * 0.42)}${rosette(w - c, c, b * 0.42)}${rosette(c, h - c, b * 0.42)}${rosette(w - c, h - c, b * 0.42)}
    ${leaf(w / 2, 0.6, 0, b * 0.9)}${leaf(w - 0.6, h / 2, 90, sideLeaf)}${leaf(w / 2, h - 0.6, 180, b * 0.9)}${leaf(0.6, h / 2, 270, sideLeaf)}
  `;
}

// ---- Tulip border: a band of tulips with spear finials, red rule, braid -----

function tulip(x, y, s) {
  const petal = `M 0 ${-s} C ${s * 0.75} ${-s * 0.45} ${s * 0.65} ${s * 0.45} 0 ${s * 0.6} C ${-s * 0.65} ${s * 0.45} ${-s * 0.75} ${-s * 0.45} 0 ${-s} Z`;
  const heart = `M 0 ${-s * 0.35} C ${s * 0.3} ${-s * 0.1} ${s * 0.25} ${s * 0.3} 0 ${s * 0.35} C ${-s * 0.25} ${s * 0.3} ${-s * 0.3} ${-s * 0.1} 0 ${-s * 0.35} Z`;
  const leaves = `M 0 ${s * 0.55} C ${s * 0.6} ${s * 0.9} ${s * 1.1} ${s * 0.5} ${s * 1.15} ${s * 0.05} C ${s * 0.8} ${s * 0.45} ${s * 0.4} ${s * 0.55} 0 ${s * 0.55} C ${-s * 0.4} ${s * 0.55} ${-s * 0.8} ${s * 0.45} ${-s * 1.15} ${s * 0.05} C ${-s * 1.1} ${s * 0.5} ${-s * 0.6} ${s * 0.9} 0 ${s * 0.55} Z`;
  return `<g transform="translate(${f(x)} ${f(y)})"><path class="t-leaf" d="${leaves}"/><path class="t-petal" d="${petal}"/><path class="t-heart" d="${heart}"/></g>`;
}

function palmette(x, y, s) {
  return `<g transform="translate(${f(x)} ${f(y)})"><path class="t-palm" d="M ${-s} ${s * 0.3} Q 0 ${-s * 1.3} ${s} ${s * 0.3} Q 0 ${-s * 0.2} ${-s} ${s * 0.3} Z"/><circle class="t-dot" cx="0" cy="${f(s * 0.25)}" r="${f(s * 0.22)}"/></g>`;
}

// A spear pointing outward (toward -y) from (x, 0).
function spear(x, s) {
  return `<g transform="translate(${f(x)} 0)"><path class="t-stem" d="M 0 0 V ${f(-s)}"/><path class="t-leaf" d="M 0 ${f(-s * 0.25)} Q ${f(s * 0.35)} ${f(-s * 0.35)} ${f(s * 0.3)} ${f(-s * 0.05)} Q ${f(s * 0.15)} ${f(-s * 0.2)} 0 ${f(-s * 0.25)} Q ${f(-s * 0.15)} ${f(-s * 0.2)} ${f(-s * 0.3)} ${f(-s * 0.05)} Q ${f(-s * 0.35)} ${f(-s * 0.35)} 0 ${f(-s * 0.25)} Z"/><path class="t-tip" d="M 0 ${f(-s * 1.05)} L ${f(s * 0.1)} ${f(-s * 0.7)} L 0 ${f(-s * 0.55)} L ${f(-s * 0.1)} ${f(-s * 0.7)} Z"/></g>`;
}

function braid(len, y1, y2) {
  const mid = (y1 + y2) / 2;
  const amp = (y2 - y1) / 2 - 1;
  const period = (y2 - y1) * 1.7;
  const wave = (phase) => {
    const pts = [];
    for (let x = y2; x <= len - y2; x += period / 10) pts.push(`${f(x)} ${f(mid + amp * Math.sin((2 * Math.PI * x) / period + phase))}`);
    return `M ${pts.join(" L ")}`;
  };
  return `<path class="t-braid" d="${wave(0)}"/><path class="t-braid" d="${wave(Math.PI)}"/>`;
}

function tulips(w, h, b) {
  const B = b;
  const motif = B * 0.6;
  const step = Math.max(B * 1.15, 26);
  const spike = B * 0.5;
  const sideSpike = innerWidth < 520 ? spike * 0.6 : spike;
  return `
    <path class="t-band" fill-rule="evenodd" d="${rect(0, 0, w, h)} ${rect(motif, motif, w - 2 * motif, h - 2 * motif)}"/>
    <path class="t-blush" fill-rule="evenodd" d="${rect(motif, motif, w - 2 * motif, h - 2 * motif)} ${rect(B * 0.66, B * 0.66, w - B * 1.32, h - B * 1.32)}"/>
    <path class="t-red" fill-rule="evenodd" d="${rect(B * 0.66, B * 0.66, w - B * 1.32, h - B * 1.32)} ${rect(B * 0.76, B * 0.76, w - B * 1.52, h - B * 1.52)}"/>
    <path class="t-braid-band" fill-rule="evenodd" d="${rect(B * 0.76, B * 0.76, w - B * 1.52, h - B * 1.52)} ${rect(B, B, w - 2 * B, h - 2 * B)}"/>
    ${onSides(w, h, (len, side) => {
      const at = spots(len, B * 0.95, step);
      const s = side === "left" || side === "right" ? sideSpike : spike;
      let out = "";
      at.forEach((x, i) => {
        out += spear(x, s) + tulip(x, motif * 0.5, motif * 0.36);
        if (i < at.length - 1) {
          const m = (x + at[i + 1]) / 2;
          out += spear(m, s * 0.55) + palmette(m, motif * 0.5, motif * 0.32);
        }
      });
      return out + braid(len, B * 0.78, B * 0.98);
    })}
    ${atCorners(w, h, () => `<rect class="t-corner" x="0" y="0" width="${f(motif)}" height="${f(motif)}"/><g transform="rotate(-45)">${spear(0, spike * 1.5)}</g>${tulip(motif / 2, motif / 2, motif * 0.3)}`)}
    <rect class="t-outline" x="0.5" y="0.5" width="${w - 1}" height="${h - 1}"/>
    <rect class="t-window" x="${f(B)}" y="${f(B)}" width="${f(w - 2 * B)}" height="${f(h - 2 * B)}"/>
  `;
}

// ---- Pearl arch: navy band with gold vines, pearls around a pointed arch ----

function archGeometry(w, b) {
  const band = b;
  const bevel = Math.max(4, b * 0.22);
  const panel = b * 0.95;
  const t = band + bevel + panel;
  const half = (w - 2 * t) / 2;
  const rise = Math.min(half * 0.5, 120);
  return { band, bevel, panel, t, half, rise };
}

function arch(w, h, b) {
  const { band, bevel, panel, t, half, rise } = archGeometry(w, b);
  const cx = w / 2;
  const apex = t - panel * 0.45;
  const spring = apex + rise;
  const L = t;
  const R = w - t;
  const left = [[L, spring], [L, spring - rise * 0.6], [cx - half * 0.35, apex + rise * 0.08], [cx, apex]];
  const bez = (p, u) => p[0].map((_, k) => (1 - u) ** 3 * p[0][k] + 3 * (1 - u) ** 2 * u * p[1][k] + 3 * (1 - u) * u * u * p[2][k] + u ** 3 * p[3][k]);
  const curve = Array.from({ length: 61 }, (_, i) => bez(left, i / 60));
  const archY = (x) => {
    const dx = cx - Math.abs(x - cx); // fold the right half onto the left
    if (dx <= L) return spring;
    for (let i = 1; i < curve.length; i++) {
      if (curve[i][0] >= dx) {
        const [x0, y0] = curve[i - 1];
        const [x1, y1] = curve[i];
        return y0 + ((dx - x0) / (x1 - x0 || 1)) * (y1 - y0);
      }
    }
    return apex;
  };
  const p = left.map(([x, y]) => `${f(x)} ${f(y)}`);
  const pr = left.map(([x, y]) => `${f(2 * cx - x)} ${f(y)}`);
  const win = `M ${f(L)} ${f(h - t)} L ${p[0]} C ${p[1]} ${p[2]} ${p[3]} C ${pr[2]} ${pr[1]} ${pr[0]} L ${f(R)} ${f(h - t)} Z`;

  // Pearls: a column down each side and along the bottom, two large ones in
  // the upper corners, and a cluster filling the spandrels above the arch.
  const rand = seeded(7);
  const inner = band + bevel;
  const pearls = [];
  const big = Math.min(rise * 0.42, panel * 1.3, half * 0.3);
  const bigs = [[inner + big + 3, inner + big + 3], [w - inner - big - 3, inner + big + 3]];
  bigs.forEach(([x, y]) => pearls.push([x, y, big, true]));
  const clear = (x, y, r) => bigs.every(([bx, by]) => Math.hypot(x - bx, y - by) > big + r + 2);
  for (const y of spots(h - inner - (spring + panel * 0.2), 0, panel * 0.78).map((v) => v + spring + panel * 0.2)) {
    if (y > h - inner - panel * 0.5) continue;
    for (const x of [inner + panel / 2, w - inner - panel / 2]) {
      const r = panel * (0.3 + rand() * 0.12);
      if (clear(x, y, r)) pearls.push([x, y, r]);
    }
  }
  for (const x of spots(w - 2 * inner, panel / 2, panel * 0.78).map((v) => v + inner)) {
    pearls.push([x, h - inner - panel / 2, panel * (0.3 + rand() * 0.12)]);
  }
  const gap = panel * 0.62;
  for (let y = inner + gap * 0.55; y < spring + panel * 0.2; y += gap * 0.86) {
    const shift = Math.round((y - inner) / (gap * 0.86)) % 2 ? gap / 2 : 0;
    for (let x = inner + gap * 0.55 + shift; x < w - inner - gap * 0.4; x += gap) {
      const r = gap * (0.32 + rand() * 0.16);
      const jx = x + (rand() - 0.5) * gap * 0.15;
      const jy = y + (rand() - 0.5) * gap * 0.15;
      if (jy + r + 2 < archY(jx) && jy - r > inner + 1 && jx - r > inner + 1 && jx + r < w - inner - 1 && clear(jx, jy, r)) pearls.push([jx, jy, r]);
    }
  }
  const pearlSvg = pearls
    .map(([x, y, r, ring]) => (ring ? `<circle class="a-ring" cx="${f(x)}" cy="${f(y)}" r="${f(r + 3)}"/>` : "") + `<circle class="a-pearl" cx="${f(x)}" cy="${f(y)}" r="${f(r)}"/>`)
    .join("");

  const vines = onSides(w, h, (len) => {
    const mid = band / 2;
    const unit = Math.max(band * 1.7, 30);
    let d = "";
    let gems = "";
    spots(len, band, unit).forEach((x, i, all) => {
      if (i === all.length - 1) return;
      const u = all[i + 1] - x;
      const dir = i % 2 ? 1 : -1;
      d += `M ${f(x)} ${f(mid)} C ${f(x + u * 0.3)} ${f(mid + dir * band * 0.34)} ${f(x + u * 0.7)} ${f(mid + dir * band * 0.34)} ${f(x + u)} ${f(mid)} `;
      d += `M ${f(x + u * 0.5)} ${f(mid + dir * band * 0.26)} q ${f(u * 0.12)} ${f(-dir * band * 0.2)} ${f(u * 0.24)} ${f(-dir * band * 0.05)} q ${f(-u * 0.05)} ${f(dir * band * 0.12)} ${f(-u * 0.12)} ${f(-dir * band * 0.02)} `;
      d += `M ${f(x + u * 0.5)} ${f(mid + dir * band * 0.26)} q ${f(-u * 0.12)} ${f(-dir * band * 0.2)} ${f(-u * 0.24)} ${f(-dir * band * 0.05)} `;
      if (i % 3 === 0) gems += `<path class="a-gem" d="M ${f(x)} ${f(mid - band * 0.16)} l ${f(band * 0.13)} ${f(band * 0.16)} l ${f(-band * 0.13)} ${f(band * 0.16)} l ${f(-band * 0.13)} ${f(-band * 0.16)} Z"/>`;
    });
    return `<path class="a-vine" d="${d}"/>${gems}`;
  });

  return `
    <defs>
      <radialGradient id="pearl" cx="0.36" cy="0.3" r="0.75">
        <stop offset="0" stop-color="#fffefa"/><stop offset="0.5" stop-color="#f1ebde"/><stop offset="1" stop-color="#c9bea6"/>
      </radialGradient>
      <linearGradient id="gilt" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#f2d58a"/><stop offset="0.5" stop-color="#c8963c"/><stop offset="1" stop-color="#f0cf7d"/>
      </linearGradient>
    </defs>
    <path class="a-band" fill-rule="evenodd" d="${rect(0, 0, w, h)} ${rect(band, band, w - 2 * band, h - 2 * band)}"/>
    ${vines}
    <path fill="url(#gilt)" fill-rule="evenodd" d="${rect(band, band, w - 2 * band, h - 2 * band)} ${rect(inner, inner, w - 2 * inner, h - 2 * inner)}"/>
    <path class="a-panel" fill-rule="evenodd" d="${rect(inner, inner, w - 2 * inner, h - 2 * inner)} ${win}"/>
    ${pearlSvg}
    <rect class="a-rule" x="1.5" y="1.5" width="${w - 3}" height="${h - 3}"/>
    <path class="a-window" d="${win}"/>
  `;
}

// ---- Jewel bloom: bright panels, gold bars, a crown above and below ---------

// A layered flame-like crown standing on y = 0, pointing toward -y.
function crown(x, s, colors) {
  const shape = (k) => {
    const a = s * k;
    return `M ${f(-a * 1.1)} 0 C ${f(-a * 1.05)} ${f(-a * 0.45)} ${f(-a * 0.55)} ${f(-a * 0.35)} ${f(-a * 0.5)} ${f(-a * 0.7)} C ${f(-a * 0.42)} ${f(-a * 1.0)} ${f(-a * 0.12)} ${f(-a * 0.95)} 0 ${f(-a * 1.35)} C ${f(a * 0.12)} ${f(-a * 0.95)} ${f(a * 0.42)} ${f(-a * 1.0)} ${f(a * 0.5)} ${f(-a * 0.7)} C ${f(a * 0.55)} ${f(-a * 0.35)} ${f(a * 1.05)} ${f(-a * 0.45)} ${f(a * 1.1)} 0 Z`;
  };
  return `<g transform="translate(${f(x)} 0)">${colors.map((c, i) => `<path class="j-ink" fill="${c}" d="${shape(1 - i * 0.28)}"/>`).join("")}<circle class="j-ink" fill="#fff6c8" cx="0" cy="${f(-s * 0.3)}" r="${f(s * 0.09)}"/></g>`;
}

function bloom(w, h, b) {
  const B = b;
  const bar = B * 0.3;
  const small = innerWidth < 520;
  const flowers = (len) =>
    spots(len, B * 0.8, B * 1.4)
      .map((x) => `<circle class="j-ink" fill="#fff4d6" cx="${f(x)}" cy="${f(bar / 2)}" r="${f(bar * 0.22)}"/>`)
      .join("");
  const cart = Math.min(w * 0.18, B * 3);
  return `
    <path class="j-ink" fill="#9e2a3f" fill-rule="evenodd" d="${rect(0, 0, w, h)} ${rect(B, B, w - 2 * B, h - 2 * B)}"/>
    <path class="j-ink" fill="#5d3a8e" d="${rect(0, B, B, h - 2 * B)} ${rect(w - B, B, B, h - 2 * B)}"/>
    ${onSides(w, h, (len, side) => {
      if (side === "left" || side === "right") {
        const vine = spots(len, B * 1.4, B * 1.1)
          .map((x, i) => `<path class="j-vine" d="M ${f(x - B * 0.5)} ${f(B * 0.5)} q ${f(B * 0.25)} ${f((i % 2 ? 1 : -1) * B * 0.35)} ${f(B * 0.5)} 0 t ${f(B * 0.5)} 0"/><circle fill="#f6c343" cx="${f(x)}" cy="${f(B * 0.5)}" r="${f(B * 0.08)}"/>`)
          .join("");
        const s = small ? B * 0.5 : B * 1.15;
        return vine + crown(len / 2, s, ["#f2b42a", "#c8324b", "#f4a3b5"]) + crown(len * 0.22, s * 0.5, ["#6aa84f", "#c8324b"]) + crown(len * 0.78, s * 0.5, ["#6aa84f", "#c8324b"]);
      }
      const motifs = spots(len, B * 1.6, B * 1.3)
        .filter((x) => Math.abs(x - len / 2) > cart * 0.7)
        .map((x) => `<circle class="j-ink" fill="#f6c343" cx="${f(x)}" cy="${f(B * 0.62)}" r="${f(B * 0.13)}"/><circle fill="#3f8f3a" cx="${f(x)}" cy="${f(B * 0.62)}" r="${f(B * 0.05)}"/>`)
        .join("");
      const c = `<g transform="translate(${f(len / 2)} ${f(B)})"><path class="j-ink" fill="#b9cf86" d="M ${f(-cart)} 0 C ${f(-cart * 0.7)} ${f(-B * 0.1)} ${f(-cart * 0.75)} ${f(-B * 0.62)} ${f(-cart * 0.42)} ${f(-B * 0.62)} C ${f(-cart * 0.3)} ${f(-B * 0.62)} ${f(-cart * 0.25)} ${f(-B * 0.66)} 0 ${f(-B * 0.66)} C ${f(cart * 0.25)} ${f(-B * 0.66)} ${f(cart * 0.3)} ${f(-B * 0.62)} ${f(cart * 0.42)} ${f(-B * 0.62)} C ${f(cart * 0.75)} ${f(-B * 0.62)} ${f(cart * 0.7)} ${f(-B * 0.1)} ${f(cart)} 0 Z"/><path fill="#fbf6d2" d="M ${f(-cart * 0.38)} 0 A ${f(cart * 0.38)} ${f(B * 0.55)} 0 0 1 ${f(cart * 0.38)} 0 Z"/></g>`;
      return motifs + c + crown(len / 2, B * 1.15, ["#f2b42a", "#6a3fa0", "#f2b42a"]);
    })}
    ${onSides(w, h, (len, side) => (side === "top" || side === "bottom" ? `<rect class="j-ink" fill="#f2a71b" x="${f(-B * 0.4)}" y="0" width="${f(len + B * 0.8)}" height="${f(bar)}"/>${flowers(len)}` : ""))}
    ${atCorners(w, h, () => `<g transform="rotate(-45)">${crown(0, B * 0.75, ["#6aa84f", "#c8324b"])}</g>`)}
    <rect class="j-window" x="${f(B)}" y="${f(B)}" width="${f(w - 2 * B)}" height="${f(h - 2 * B)}"/>
  `;
}

// ---- Jewel octagon: a cut-corner window in a band of coloured triangles -----

function octagon(w, h, b) {
  const B = b;
  const cut = B * 0.85;
  const L = B;
  const T = B;
  const R = w - B;
  const D = h - B;
  const win = `M ${f(L + cut)} ${f(T)} H ${f(R - cut)} L ${f(R)} ${f(T + cut)} V ${f(D - cut)} L ${f(R - cut)} ${f(D)} H ${f(L + cut)} L ${f(L)} ${f(D - cut)} V ${f(T + cut)} Z`;
  const colors = ["#e0405f", "#f5a623", "#2d8fd0", "#62b33c", "#8c4fd0", "#f17c2f"];
  const small = innerWidth < 520;
  return `
    <path class="j-ink" fill="#f3b51b" fill-rule="evenodd" d="${rect(0, 0, w, h)} ${win}"/>
    ${onSides(w, h, (len, side) => {
      const scallops = spots(len, B * 0.3, B * 0.5)
        .map((x) => `<path class="j-ink" fill="#f3b51b" d="M ${f(x - B * 0.22)} 0 A ${f(B * 0.22)} ${f(B * 0.22)} 0 0 1 ${f(x + B * 0.22)} 0 Z"/>`)
        .join("");
      if (side === "top" || side === "bottom") {
        const s = B * 0.7;
        let tri = "";
        for (let x = B, i = 0; x < len - B - 1; x += s / 2, i++) {
          const up = i % 2 === 0;
          tri += `<path class="j-ink" fill="${colors[i % colors.length]}" d="M ${f(x)} ${f(up ? B * 0.9 : B * 0.2)} L ${f(Math.min(x + s / 2, len - B))} ${f(up ? B * 0.2 : B * 0.9)} L ${f(Math.min(x + s, len - B))} ${f(up ? B * 0.9 : B * 0.2)} Z"/>`;
        }
        return scallops + tri + crown(len / 2, B * 1.05, ["#f17c2f", "#f3b51b", "#e0405f"]);
      }
      const ovals = spots(len, B * 1.6, B * 1.1)
        .map((x, i) => `<ellipse class="j-ink" fill="${i % 2 ? "#8c4fd0" : "#e0405f"}" cx="${f(x)}" cy="${f(B * 0.55)}" rx="${f(B * 0.38)}" ry="${f(B * 0.2)}"/>`)
        .join("");
      const s = small ? B * 0.45 : B * 0.95;
      const fleur = `<g transform="translate(${f(len / 2)} 0)"><path class="j-ink" fill="#ef7f95" d="M ${f(-s * 0.9)} ${f(B * 0.3)} C ${f(-s * 0.9)} ${f(-s * 0.4)} ${f(-s * 0.3)} ${f(-s * 0.5)} 0 ${f(-s * 1.1)} C ${f(s * 0.3)} ${f(-s * 0.5)} ${f(s * 0.9)} ${f(-s * 0.4)} ${f(s * 0.9)} ${f(B * 0.3)} Z"/><circle class="j-ink" fill="#f3d23a" cx="0" cy="${f(-s * 0.45)}" r="${f(s * 0.16)}"/></g>`;
      return scallops + `<path class="j-ink" fill="#5aa83a" d="${rect(B * 0.9, B * 0.15, len - B * 1.8, B * 0.8)}"/>` + ovals + fleur;
    })}
    ${atCorners(w, h, () => `<path class="j-ink" fill="#e0405f" d="M ${f(B * 0.15)} ${f(B * 0.15)} L ${f(B + cut * 0.9)} ${f(B * 0.15)} L ${f(B * 0.15)} ${f(B + cut * 0.9)} Z"/><circle class="j-ink" fill="#2d8fd0" cx="${f(B * 0.55)}" cy="${f(B * 0.55)}" r="${f(B * 0.2)}"/>`)}
    <path class="j-window-edge" d="${win}"/>
    <path class="j-window" d="${win}"/>
  `;
}

// Each frame: how wide its band is (times the base width), how far its
// ornaments reach outside the box, how much room the text keeps from the
// edge when that differs from the band, and any extra room above the text.
export const FRAMES = {
  cartouche: { label: "Illuminated cartouche", band: 1, out: 0.9, draw: cartouche },
  tulips: { label: "Tulip border", band: 1.45, out: 0.6, draw: tulips },
  arch: { label: "Pearl arch", band: 1, out: 0, draw: arch, pad: (w, b) => archGeometry(w, b).t, top: (w, b) => archGeometry(w, b).rise * 0.75 },
  bloom: { label: "Jewel bloom", band: 1.25, out: 1.45, draw: bloom },
  octagon: { label: "Jewel octagon", band: 1.3, out: 1.3, draw: octagon },
  none: { label: "No frame", band: 0, out: 0, draw: null },
};

// Matches the old --band-width in the CSS: clamp(18px, 3.4vw, 30px).
const baseBand = () => Math.min(30, Math.max(18, innerWidth * 0.034));

export function drawFrame(svg, w, h, b, name = "cartouche") {
  const frame = FRAMES[name] || FRAMES.cartouche;
  if (!frame.draw || w < 4 * b || h < 4 * b) {
    svg.replaceChildren();
    return;
  }
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.innerHTML = frame.draw(w, h, b);
}

// Keep the frame fitted to its box as the ayah inside changes size. Returns a
// function that switches to another frame.
export function frameBox(box, svg, name) {
  let current = FRAMES[name] ? name : "cartouche";
  const redraw = () => {
    const frame = FRAMES[current];
    const b = baseBand() * frame.band;
    box.dataset.frame = current;
    box.style.setProperty("--band-width", `${f(frame.pad ? frame.pad(box.clientWidth, b) : b)}px`);
    box.style.setProperty("--frame-out", `${f(baseBand() * frame.out)}px`);
    box.style.setProperty("--frame-top", `${f(frame.top ? frame.top(box.clientWidth, b) : 0)}px`);
    drawFrame(svg, box.clientWidth, box.clientHeight, b, current);
  };
  new ResizeObserver(redraw).observe(box);
  redraw();
  return (next) => {
    current = FRAMES[next] ? next : "cartouche";
    redraw();
  };
}
