// Turns the raw product rows from the sheet into clean search entries.
// The fix tables below are applied on every load; add a line to fix a new typo.

const BRAND_FIXES = {
  "exttrait": "Extrait",
  "afictionado": "Afictionado",
  "prescripto": "Prescripto",
  "DSQUARD2": "DSQUARED2",
  "chanel": "Chanel",
  "clinique": "Clinique",
  "coach": "Coach",
  "ck": "CK",
  "versace": "Versace",
  "playboy": "Playboy",
  "Jo malone": "Jo Malone",
  "Jimmy choo": "Jimmy Choo",
  "Michael kors": "Michael Kors",
  "Al haramain": "Al Haramain",
  "Morgan's vintage": "Morgan's Vintage",
  // Category is already in the Type row, so keep just the brand.
  "bbw": "BBW",
  "BBW Mist": "BBW",
  "BBW Lotion": "BBW",
  "VS others": "VS",
};
const FRAGRANCE_FIXES = {
  "Orchid & AppleJulicy set": "Orchid & Applejuice set",
  "Twilight malvue": "Twilight Mauve",
  "Twilight Malive & Tuberose set": "Twilight Mauve & Tuberose set",
  "Odyssey Manadarin Sky": "Odyssey Mandarin Sky",
  "Odyssey Manadarin Sky Elixir": "Odyssey Mandarin Sky Elixir",
  "Origianl For Woman": "Original For Woman",
  "ICONIC ON THE COLUDS": "ICONIC ON THE CLOUDS",
  "Japanese Cherry Bloosom": "Japanese Cherry Blossom",
  "Viva Vanila": "Viva Vanilla",
  "Vanilla bean noe": "Vanilla Bean Noel",
  "Khair Pistachi": "Khair Pistachio",
  "Balle Nights": "Belle Nights",
};
const TYPE_FIXES = {
  "Cream Colud": "Cream Cloud",
  "SCARET": "Scarlet",
  "Hairmist": "Hair Mist",
  "Bodywash": "Body Wash",
  "Body spray": "Body Spray",
  "body wash": "Body Wash",
  "body scrub": "Body Scrub",
};

const PRICE_RE = /\$\s*\d[\d,.]*/g;
const SIZE_PRICE_RE = /(\d+(?:\.\d+)?\s*ml)\s*\$\s*(\d[\d,.]*)/gi;

function asciiNorm(s) {
  return String(s).normalize("NFD").replace(/[^\x00-\x7f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

// "350.0" -> "350"; non-numbers pass through.
function cleanNumber(v) {
  v = String(v).trim();
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(v)) return v;
  return String(Number(v));
}

// "BBW Mist $450 $230" -> "BBW Mist"; "Perfume Dessert 30ml $350, ..." -> "Perfume Dessert".
function stripPrices(s, bareTrailingNumber = false) {
  s = s.replace(SIZE_PRICE_RE, "").replace(PRICE_RE, "");
  if (bareTrailingNumber) s = s.replace(/\s+\d{2,5}\s*$/, ""); // "BBW Lotion 400"
  return s.replace(/\s+/g, " ").replace(/[\s,;/-]+$/, "").trim();
}

// Explicit fixes, then unify case variants ("edp", "Edp") to one spelling:
// a capitalized one first, then the most used.
function fixCasing(items, field, fixes) {
  const counts = new Map();
  for (const it of items) {
    it[field] = fixes[it[field]] ?? it[field];
    counts.set(it[field], (counts.get(it[field]) || 0) + 1);
  }
  const isLower = v => v === v.toLowerCase() && v !== v.toUpperCase();
  const best = new Map();
  [...counts.keys()]
    .sort((a, b) => (isLower(a) - isLower(b)) || (counts.get(b) - counts.get(a)))
    .forEach(v => { if (!best.has(v.toLowerCase())) best.set(v.toLowerCase(), v); });
  for (const it of items) it[field] = best.get(it[field].toLowerCase());
}

// "100ML" -> "100ml"; "001 woman EDP 100ml" -> "100ml"; "set" -> "Set".
function fixVolume(v) {
  const sizes = v.match(/\d+(?:\.\d+)?\s*ml\b/gi) || [];
  if (sizes.length === 1 && !/^[\d.]+\s*ml\s*(x\d+)?$/i.test(v) && !v.includes("+"))
    return sizes[0].replace(/ /g, "").toLowerCase();
  v = v.replace(/(\d)\s*ML\b/g, "$1ml");
  return /^\p{L}+$/u.test(v) ? v[0].toUpperCase() + v.slice(1) : v;
}

// Join name parts top row to bottom, skipping blanks and parts already said.
// ("YSL", "YSL Y", "EDP") -> "YSL Y EDP"; ("BBW", "Hand Cream", "Hand Cream") -> "BBW Hand Cream".
function hierarchyName(...parts) {
  let name = "";
  for (const p of parts) {
    if (!p) continue;
    const words = ` ${asciiNorm(p)} `, have = ` ${asciiNorm(name)} `;
    if (!name || words.startsWith(have)) name = p;
    else if (!have.includes(words)) name = `${name} ${p}`;
  }
  return name;
}

// fields: { brand: [...], fragrance: [...], type, volume, price, stock, left }, one value per product column.
function buildItems(fields) {
  const keys = ["brand", "fragrance", "type", "volume", "price", "stock", "left"];
  const width = Math.max(...keys.map(k => (fields[k] || []).length));
  const items = [], priceLists = new Map();

  for (let c = 0; c < width; c++) {
    const item = {};
    for (const k of keys) item[k] = String(fields[k]?.[c] ?? "").replace(/\s+/g, " ").trim();
    if (!item.brand && !item.fragrance) continue;
    for (const k of ["price", "stock", "left", "fragrance"]) item[k] = cleanNumber(item[k]);

    // A brand header like "Perfume Dessert 30ml $350, 50ml $580" is a price list:
    // each size/price pair becomes its own entry, and the name keeps only the text.
    const rawBrand = item.brand;
    const brand = stripPrices(rawBrand, true);
    if (!priceLists.has(rawBrand))
      priceLists.set(rawBrand, [...rawBrand.matchAll(SIZE_PRICE_RE)]
        .map(m => [m[1].replace(/ /g, "").toLowerCase(), cleanNumber(m[2].replace(/,/g, ""))]));
    item.brand = BRAND_FIXES[brand] ?? brand;
    const frag = stripPrices(item.fragrance);
    item.fragrance = FRAGRANCE_FIXES[frag] ?? frag;
    items.push(item);
  }

  for (const [rawBrand, pairs] of priceLists) {
    const brand = stripPrices(rawBrand, true);
    for (const [volume, price] of pairs)
      items.push({ brand: BRAND_FIXES[brand] ?? brand, fragrance: "", type: "", volume, price,
                   stock: "", left: "", note: "Price list" });
  }

  fixCasing(items, "type", TYPE_FIXES);
  for (const it of items) {
    it.volume = fixVolume(it.volume);
    it.name = hierarchyName(it.brand, it.fragrance, it.type);
  }
  return items;
}

if (typeof module !== "undefined") module.exports = { buildItems };
