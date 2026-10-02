// Gazetteer of Lagos and Abuja areas: canonical names, aliases, city and
// neighbouring areas (used by the Matchmaker's area filter).

export interface Area {
  name: string;
  city: "Lagos" | "Abuja";
  aliases: string[];
  near: string[];
  lat: number;
  lng: number;
}

export const AREAS: Area[] = [
  { name: "Lekki Phase 1", city: "Lagos", aliases: ["lekki phase 1", "lekki phase one", "lekki ph 1", "lekki ph1", "phase 1", "lekki 1"], near: ["Ikate", "Oniru", "Victoria Island", "Osapa London", "Agungi", "Ikoyi"], lat: 6.4474, lng: 3.4723 },
  { name: "Ikate", city: "Lagos", aliases: ["ikate", "ikate elegushi", "elegushi"], near: ["Lekki Phase 1", "Agungi", "Osapa London", "Chevron"], lat: 6.4389, lng: 3.4952 },
  { name: "Agungi", city: "Lagos", aliases: ["agungi"], near: ["Ikate", "Osapa London", "Lekki Phase 1"], lat: 6.4398, lng: 3.5085 },
  { name: "Osapa London", city: "Lagos", aliases: ["osapa", "osapa london"], near: ["Agungi", "Ikate", "Chevron"], lat: 6.4354, lng: 3.5196 },
  { name: "Chevron", city: "Lagos", aliases: ["chevron", "chevy view", "chevron drive"], near: ["Osapa London", "Ikota", "Ajah", "Ikate"], lat: 6.4416, lng: 3.5361 },
  { name: "Ikota", city: "Lagos", aliases: ["ikota", "vgc"], near: ["Chevron", "Ajah"], lat: 6.4512, lng: 3.5535 },
  { name: "Ajah", city: "Lagos", aliases: ["ajah", "ado road", "badore"], near: ["Sangotedo", "Ikota", "Chevron", "Abraham Adesanya"], lat: 6.4698, lng: 3.5852 },
  { name: "Sangotedo", city: "Lagos", aliases: ["sangotedo", "abijo", "awoyaya"], near: ["Ajah", "Abraham Adesanya", "Ibeju-Lekki"], lat: 6.4733, lng: 3.6278 },
  { name: "Abraham Adesanya", city: "Lagos", aliases: ["abraham adesanya", "lekki scheme 2"], near: ["Ajah", "Sangotedo"], lat: 6.4673, lng: 3.6044 },
  { name: "Ibeju-Lekki", city: "Lagos", aliases: ["ibeju-lekki", "ibeju lekki", "ibeju", "eleko", "lakowe"], near: ["Sangotedo", "Awoyaya"], lat: 6.4501, lng: 3.7489 },
  { name: "Victoria Island", city: "Lagos", aliases: ["victoria island", "vi", "v.i", "v.i."], near: ["Oniru", "Ikoyi", "Lekki Phase 1"], lat: 6.4281, lng: 3.4219 },
  { name: "Oniru", city: "Lagos", aliases: ["oniru"], near: ["Victoria Island", "Lekki Phase 1"], lat: 6.4355, lng: 3.4467 },
  { name: "Ikoyi", city: "Lagos", aliases: ["ikoyi", "banana island", "old ikoyi", "parkview"], near: ["Victoria Island", "Lekki Phase 1", "Obalende"], lat: 6.4549, lng: 3.4346 },
  { name: "Yaba", city: "Lagos", aliases: ["yaba", "sabo", "akoka", "onike"], near: ["Surulere", "Ebute Metta", "Gbagada", "Ilupeju"], lat: 6.5095, lng: 3.3711 },
  { name: "Surulere", city: "Lagos", aliases: ["surulere", "aguda", "ojuelegba"], near: ["Yaba", "Ilupeju"], lat: 6.4969, lng: 3.3538 },
  { name: "Ebute Metta", city: "Lagos", aliases: ["ebute metta", "ebute-metta"], near: ["Yaba"], lat: 6.4853, lng: 3.3848 },
  { name: "Ilupeju", city: "Lagos", aliases: ["ilupeju"], near: ["Maryland", "Yaba", "Surulere", "Gbagada"], lat: 6.5536, lng: 3.3589 },
  { name: "Gbagada", city: "Lagos", aliases: ["gbagada", "gbagada phase 1", "gbagada phase 2"], near: ["Yaba", "Ogudu", "Maryland", "Ilupeju"], lat: 6.5536, lng: 3.3874 },
  { name: "Ogudu", city: "Lagos", aliases: ["ogudu", "ogudu gra"], near: ["Gbagada", "Magodo", "Ojota"], lat: 6.5743, lng: 3.3916 },
  { name: "Maryland", city: "Lagos", aliases: ["maryland", "mende"], near: ["Ikeja", "Ilupeju", "Gbagada"], lat: 6.5715, lng: 3.3666 },
  { name: "Ikeja", city: "Lagos", aliases: ["ikeja", "allen", "opebi", "alausa", "oregun"], near: ["Ikeja GRA", "Maryland", "Ogba", "Magodo"], lat: 6.6018, lng: 3.3515 },
  { name: "Ikeja GRA", city: "Lagos", aliases: ["ikeja gra", "gra ikeja"], near: ["Ikeja", "Maryland"], lat: 6.5833, lng: 3.3594 },
  { name: "Magodo", city: "Lagos", aliases: ["magodo", "magodo gra", "magodo phase 2"], near: ["Ogudu", "Ikeja", "Ojodu"], lat: 6.6219, lng: 3.3832 },
  { name: "Ogba", city: "Lagos", aliases: ["ogba", "agege"], near: ["Ikeja", "Magodo"], lat: 6.6317, lng: 3.3394 },
  // Abuja
  { name: "Maitama", city: "Abuja", aliases: ["maitama"], near: ["Asokoro", "Wuse 2", "Katampe"], lat: 9.0882, lng: 7.4934 },
  { name: "Asokoro", city: "Abuja", aliases: ["asokoro"], near: ["Maitama", "Garki", "Guzape"], lat: 9.0412, lng: 7.5244 },
  { name: "Wuse 2", city: "Abuja", aliases: ["wuse 2", "wuse ii", "wuse two", "wuse"], near: ["Maitama", "Garki", "Jabi", "Utako"], lat: 9.0817, lng: 7.4681 },
  { name: "Garki", city: "Abuja", aliases: ["garki", "area 11", "area 1"], near: ["Wuse 2", "Asokoro"], lat: 9.0333, lng: 7.4833 },
  { name: "Jabi", city: "Abuja", aliases: ["jabi"], near: ["Utako", "Wuse 2", "Life Camp"], lat: 9.0718, lng: 7.4243 },
  { name: "Utako", city: "Abuja", aliases: ["utako"], near: ["Jabi", "Wuse 2"], lat: 9.0705, lng: 7.4426 },
  { name: "Gwarinpa", city: "Abuja", aliases: ["gwarinpa", "gwarimpa"], near: ["Life Camp", "Kado", "Jabi"], lat: 9.1095, lng: 7.4042 },
  { name: "Life Camp", city: "Abuja", aliases: ["life camp", "lifecamp"], near: ["Gwarinpa", "Jabi", "Katampe"], lat: 9.0870, lng: 7.4120 },
  { name: "Katampe", city: "Abuja", aliases: ["katampe", "katampe extension"], near: ["Maitama", "Life Camp"], lat: 9.1100, lng: 7.4600 },
  { name: "Guzape", city: "Abuja", aliases: ["guzape"], near: ["Asokoro", "Lokogoma"], lat: 9.0200, lng: 7.5000 },
  { name: "Lokogoma", city: "Abuja", aliases: ["lokogoma", "galadimawa"], near: ["Guzape", "Apo"], lat: 8.9850, lng: 7.4730 },
  { name: "Kubwa", city: "Abuja", aliases: ["kubwa"], near: ["Gwarinpa"], lat: 9.1540, lng: 7.3220 },
];

/** Generic names that expand to a group of areas. */
const GROUPS: Record<string, string[]> = {
  lekki: ["Lekki Phase 1", "Ikate", "Agungi", "Osapa London", "Chevron", "Ikota"],
  "lekki axis": ["Lekki Phase 1", "Ikate", "Agungi", "Osapa London", "Chevron", "Ikota", "Ajah"],
  island: ["Victoria Island", "Ikoyi", "Oniru", "Lekki Phase 1"],
  mainland: ["Yaba", "Surulere", "Gbagada", "Ikeja", "Maryland", "Ilupeju", "Ogudu", "Magodo"],
};

const byName = new Map(AREAS.map((a) => [a.name.toLowerCase(), a]));

export function findArea(name: string): Area | undefined {
  return byName.get(name.toLowerCase());
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Longest aliases first, so "lekki phase 1" wins over "lekki".
const ALIAS_LIST: { alias: string; names: string[] }[] = [
  ...AREAS.flatMap((a) => a.aliases.map((alias) => ({ alias, names: [a.name] }))),
  ...Object.entries(GROUPS).map(([alias, names]) => ({ alias, names })),
].sort((a, b) => b.alias.length - a.alias.length);

/** Extract canonical area names mentioned in free text. */
export function extractAreas(text: string): string[] {
  let t = " " + text.toLowerCase().replace(/[’']/g, "'") + " ";
  const found: string[] = [];
  for (const { alias, names } of ALIAS_LIST) {
    // Whole-word match, so "vi" does not match "via".
    const re = new RegExp(`(^|[^a-z0-9])${escapeRe(alias)}(?=[^a-z0-9]|$)`, "i");
    if (!re.test(t)) continue;
    for (const n of names) if (!found.includes(n)) found.push(n);
    t = t.replace(re, "$1 ");
  }
  return found;
}

/** The given areas plus their neighbours, for the SQL filter. */
export function withNeighbours(areas: string[]): string[] {
  const out = new Set<string>();
  for (const a of areas) {
    out.add(a);
    const ar = findArea(a);
    ar?.near.forEach((n) => out.add(n));
  }
  return [...out];
}

export function isNeighbour(area: string, wanted: string[]): boolean {
  return wanted.some((w) => findArea(w)?.near.includes(area));
}

export function cityOf(areas: string[]): "Lagos" | "Abuja" | undefined {
  for (const a of areas) {
    const ar = findArea(a);
    if (ar) return ar.city;
  }
  return undefined;
}
