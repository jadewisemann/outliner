#!/usr/bin/env node
/**
 * Enforces the source layout of docs/adr/0013-fsd-light.md: Feature-Sliced
 * Design, kept light. Run with `npm run check:layers`; CI runs it too.
 *
 *   app → widgets → features → entities → shared
 *
 * 1. A file imports only from layers below its own. The one exception is
 *    `entities`, whose slices may use each other, as long as the graph among
 *    them stays acyclic.
 * 2. Another slice is reached through its public API (`@/layer/slice`, its
 *    index.ts), never through a file inside it. `shared` has no slices: its
 *    modules are imported by path (`@/shared/lib/order`).
 * 3. Inside a slice (and inside `app` or `shared`), imports are relative, and
 *    a relative import never leaves it.
 * 4. A slice's index.ts only re-exports from its own files.
 *
 * Uses only Node and the TypeScript compiler the repository already has.
 */
import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src");
const ts = createRequire(join(root, "package.json"))("typescript");

const LAYERS = ["shared", "entities", "features", "widgets", "app"];
const SLICED = new Set(["entities", "features", "widgets"]);
const problems = [];
const complain = (file, message) => problems.push(`${relative(root, file)}: ${message}`);

/** Where a file sits: its layer, and the unit its relative imports must stay in. */
function place(file) {
  const [layer, slice] = relative(src, file).split(sep);
  if (!LAYERS.includes(layer)) return null;
  return { layer, slice: SLICED.has(layer) ? slice : null, unit: SLICED.has(layer) ? `${layer}/${slice}` : layer };
}

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) files.push(path);
  }
};
walk(src);

function resolveRelative(from, spec) {
  const base = resolve(dirname(from), spec);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return base;
}

/** entity slice → the entity slices it imports */
const entityGraph = new Map();
let checked = 0;

for (const file of files) {
  const from = place(file);
  if (!from) {
    complain(file, "is outside the layers (app, widgets, features, entities, shared)");
    continue;
  }
  const isIndex = from.slice !== null && relative(join(src, from.unit), file) === "index.ts";
  const { importedFiles } = ts.preProcessFile(readFileSync(file, "utf8"), true, true);

  for (const { fileName: spec } of importedFiles) {
    checked += 1;
    if (spec.startsWith(".")) {
      const target = place(resolveRelative(file, spec));
      if (!target || target.unit !== from.unit) complain(file, `relative import "${spec}" leaves ${from.unit}`);
      continue;
    }
    if (!spec.startsWith("@/")) continue; // a package
    if (isIndex) complain(file, `a public API re-exports only its own files, not "${spec}"`);

    const [layer, slice, ...rest] = spec.slice(2).split("/");
    if (!LAYERS.includes(layer)) {
      complain(file, `"${spec}" names no layer`);
      continue;
    }
    const up = LAYERS.indexOf(layer) - LAYERS.indexOf(from.layer);
    if (layer === "app") complain(file, `nothing imports the app layer ("${spec}")`);
    else if (up > 0) complain(file, `${from.layer} cannot import from ${layer} ("${spec}")`);
    else if (up === 0 && layer !== "entities") {
      complain(file, `${from.unit} cannot import another ${layer} slice or itself through "${spec}"`);
    }

    if (SLICED.has(layer)) {
      if (!slice || rest.length > 0) complain(file, `"${spec}" reaches inside a slice; import "@/${layer}/${slice}"`);
      else if (!existsSync(join(src, layer, slice, "index.ts"))) complain(file, `@/${layer}/${slice} has no index.ts`);
      if (`${layer}/${slice}` === from.unit) complain(file, `imports its own slice through "${spec}"; use a relative path`);
      if (from.layer === "entities" && layer === "entities" && slice !== from.slice) {
        if (!entityGraph.has(from.slice)) entityGraph.set(from.slice, new Set());
        entityGraph.get(from.slice).add(slice);
      }
    } else if (layer === "shared" && (!slice || rest.length === 0)) {
      complain(file, `"${spec}": import a shared module by its path, e.g. @/shared/lib/order`);
    }
  }
}

for (const layer of SLICED) {
  const dir = join(src, layer);
  if (!existsSync(dir)) continue;
  for (const slice of readdirSync(dir)) {
    if (!existsSync(join(dir, slice, "index.ts"))) problems.push(`src/${layer}/${slice}: has no index.ts (public API)`);
  }
}

/** Entity slices, lowest first; also proves the graph among them is acyclic. */
function entityOrder() {
  const order = [];
  const state = new Map(); // slice → "visiting" | "done"
  const visit = (slice, path) => {
    if (state.get(slice) === "done") return;
    if (state.get(slice) === "visiting") {
      problems.push(`entities import each other in a cycle: ${[...path, slice].join(" → ")}`);
      return;
    }
    state.set(slice, "visiting");
    for (const next of [...(entityGraph.get(slice) ?? [])].sort()) visit(next, [...path, slice]);
    state.set(slice, "done");
    order.push(slice);
  };
  const slices = existsSync(join(src, "entities")) ? readdirSync(join(src, "entities")).sort() : [];
  for (const slice of slices) visit(slice, []);
  return order;
}
const order = entityOrder();

if (problems.length > 0) {
  console.error(`check-layers: ${problems.length} problem(s)\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`check-layers: ${files.length} files, ${checked} imports; entities lowest first: ${order.join(" → ")}`);
