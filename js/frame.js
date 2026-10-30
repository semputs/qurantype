// Draws the illuminated frame around the ayah: a double gold rule, a
// patterned band with rosettes in the corners, a lobed window like a mushaf
// cartouche, and a leaf finial on each side. It is drawn as SVG to fit the
// box exactly, so it works for one-word ayat and for Al-Baqarah 282 alike.

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

export function drawFrame(svg, w, h, b) {
  if (w < 4 * b || h < 4 * b) {
    svg.replaceChildren();
    return;
  }
  const outer = `M 4 4 H ${w - 4} V ${h - 4} H 4 Z`;
  const win = windowPath(w, h, b);
  const c = 4 + (b - 4) / 2;
  // On phones the side leaves would reach the screen edge, so they shrink.
  const side = innerWidth < 520 ? b * 0.6 : b * 0.9;
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.innerHTML = `
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
    ${leaf(w / 2, 0.6, 0, b * 0.9)}${leaf(w - 0.6, h / 2, 90, side)}${leaf(w / 2, h - 0.6, 180, b * 0.9)}${leaf(0.6, h / 2, 270, side)}
  `;
}

// Keep the frame fitted to its box as the ayah inside changes size.
export function frameBox(box, svg) {
  const redraw = () => {
    // Matches --band-width in the CSS: clamp(18px, 3.4vw, 30px).
    const bandWidth = Math.min(30, Math.max(18, innerWidth * 0.034));
    drawFrame(svg, box.clientWidth, box.clientHeight, bandWidth);
  };
  new ResizeObserver(redraw).observe(box);
  redraw();
}
