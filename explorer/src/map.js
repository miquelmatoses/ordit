/* Coropleta de la Comunitat Valenciana per a l'explorador.
   Acoloreix els poligons municipals (GISCO LAU, codi_ine) segons l'agregat d'import de
   PAC, per comarca (vista principal) o per municipi. Sense fusionar geometries: la vista
   de comarca acoloreix cada municipi pel total de la seua comarca.

   Accessibilitat (design system): rampa blava seqüencial per trams discrets (sense
   patro), llegenda numerica, valor al focus, llista lateral sempre visible; mai
   roig-verd; el color mai es l'unica senyal (acompanyat de llista i etiqueta). */

const SEQ = ["--seq-0", "--seq-1", "--seq-2", "--seq-3", "--seq-4", "--seq-5", "--seq-6"];

const eur0 = new Intl.NumberFormat("ca-ES", { maximumFractionDigits: 0 });
export const fmtEur0 = (n) => eur0.format(Math.round(n)) + " €";

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function rings(geom) {
  if (geom.type === "Polygon") return geom.coordinates;
  if (geom.type === "MultiPolygon") return geom.coordinates.flat();
  return [];
}

/** Carrega el GeoJSON i precalcula el path SVG de cada municipi (projeccio equirectangular). */
export async function loadGeo(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`No s'ha pogut llegir la geometria (${resp.status}).`);
  const features = (await resp.json()).features;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of features)
    for (const r of rings(f.geometry))
      for (const [x, y] of r) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  const kx = Math.cos((((minY + maxY) / 2) * Math.PI) / 180); // correccio d'aspecte
  const W = 1000;
  const H = Math.round((W * (maxY - minY)) / ((maxX - minX) * kx));
  const px = (x) => (((x - minX) * kx) / ((maxX - minX) * kx)) * W;
  const py = (y) => ((maxY - y) / (maxY - minY)) * H;
  for (const f of features) {
    f._d = rings(f.geometry)
      .map((r) => "M" + r.map(([x, y]) => `${px(x).toFixed(1)} ${py(y).toFixed(1)}`).join("L") + "Z")
      .join("");
  }
  return { features, W, H };
}

function quantiles(values) {
  // 6 llindars -> 7 trams, sobre els valors positius (escala robusta a la asimetria).
  const v = values.filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return [];
  return [1, 2, 3, 4, 5, 6].map((i) => v[Math.min(v.length - 1, Math.floor((i / 7) * v.length))]);
}
function bucket(value, thresholds) {
  if (value <= 0) return -1; // sense dada
  let b = 0;
  while (b < thresholds.length && value > thresholds[b]) b += 1;
  return b;
}

/** HTML de la vista de mapa. `agg` = {byIne: Map, byComarca: Map, unresolved: number}. */
export function mapHtml(geo, agg, mapBy) {
  const valueOf = (f) =>
    mapBy === "comarca"
      ? agg.byComarca.get(f.properties.comarca) || 0
      : agg.byIne.get(f.properties.codi_ine) || 0;
  const thresholds = quantiles(geo.features.map(valueOf));

  const tiles = geo.features
    .map((f) => {
      const v = valueOf(f);
      const b = bucket(v, thresholds);
      const fill = b < 0 ? "var(--paper-inset)" : `var(${SEQ[b]})`;
      const name = mapBy === "comarca" ? f.properties.comarca : f.properties.municipi;
      return `<path d="${f._d}" class="map-tile" tabindex="0" role="img"
        data-name="${esc(name)}" data-val="${v}" fill="${fill}"
        aria-label="${esc(name)}: ${esc(fmtEur0(v))}"><title>${esc(name)} · ${esc(fmtEur0(v))}</title></path>`;
    })
    .join("");

  // Llegenda numerica (trams discrets).
  const edges = [0, ...thresholds];
  const legend = SEQ.map((s, i) => {
    const lo = edges[i];
    const hi = i < thresholds.length ? thresholds[i] : null;
    const range = hi == null ? `> ${fmtEur0(lo)}` : `${fmtEur0(lo)} – ${fmtEur0(hi)}`;
    return `<span class="leg-item"><i style="background:var(${s})"></i> ${esc(range)}</span>`;
  }).join("");

  // Llista lateral sempre visible (rang per valor), inclou els no resolts.
  const entries =
    mapBy === "comarca"
      ? [...agg.byComarca.entries()]
      : geo.features.map((f) => [f.properties.municipi, agg.byIne.get(f.properties.codi_ine) || 0]);
  const ranked = entries.filter(([, v]) => v !== 0).sort((a, b) => b[1] - a[1]);
  const list = ranked
    .map(([name, v]) => {
      const b = bucket(v, thresholds);
      const sw = b < 0 ? "var(--paper-inset)" : `var(${SEQ[b]})`;
      return `<div class="map-row"><span class="sw" style="background:${sw}"></span>
        <span class="nm">${esc(name)}</span><span class="vl tnum">${esc(fmtEur0(v))}</span></div>`;
    })
    .join("");
  const unres =
    agg.unresolved > 0
      ? `<div class="map-row map-unres"><span class="sw" style="background:var(--neutral)"></span>
        <span class="nm">(sense municipi)</span><span class="vl tnum">${esc(fmtEur0(agg.unresolved))}</span></div>`
      : "";

  return `<div class="card card-pad">
    <div class="cluster" style="justify-content:space-between;margin-bottom:var(--s-4)">
      <h3 style="font-size:var(--t-lg)">Import de PAC per ${mapBy === "comarca" ? "comarca" : "municipi"}</h3>
      <div class="seg">
        <button data-mapby="comarca" class="${mapBy === "comarca" ? "active" : ""}" aria-pressed="${mapBy === "comarca"}">Comarca</button>
        <button data-mapby="municipi" class="${mapBy === "municipi" ? "active" : ""}" aria-pressed="${mapBy === "municipi"}">Municipi</button>
      </div>
    </div>
    <div class="ex-map">
      <div class="map-figure">
        <svg viewBox="0 0 ${geo.W} ${geo.H}" class="map-svg" role="group" aria-label="Mapa de la Comunitat Valenciana">${tiles}</svg>
        <div class="map-legend mono" aria-hidden="true">${legend}<span class="leg-item"><i style="background:var(--paper-inset)"></i> sense dada</span></div>
      </div>
      <div class="map-aside">
        <div class="map-focus mono" id="map-focus">Passa el cursor o tabula per veure el valor.</div>
        <div class="map-list">${list}${unres}</div>
      </div>
    </div>
  </div>`;
}
