// Generates lib/editor-host/tsl-textures-inline.generated.ts.
//
// For each supported tsl-textures function, bundles the library-local
// dependency closure (texture file + src/tsl-utils.js) with esbuild, keeping
// `three` / `three/tsl` external, then strips the external import/export
// statements and wraps the body in an IIFE so inlined helpers cannot collide
// on top-level identifiers (every texture file declares `defaults`, etc.).
// The stripped external imports are recorded so the inspector export can list
// them as host-resolved import groups.
//
// Run: npm run generate:tsl-textures-inline

import { build } from 'esbuild';
import * as acorn from 'acorn';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = path.join(repoRoot, 'node_modules', 'tsl-textures');
const outFile = path.join(repoRoot, 'lib', 'editor-host', 'tsl-textures-inline.generated.ts');

// Keep in sync with lib/nodes/tsl-textures.ts (verified by
// lib/editor-host/tsl-textures-inline.test.ts).
const TEXTURES = [
    { name: 'marble', entry: 'marble.js' },
    { name: 'polkaDots', entry: 'polka-dots.js' },
    { name: 'caustics', entry: 'caustics.js' },
    { name: 'roughClay', entry: 'rough-clay.js' },
    { name: 'clouds', entry: 'clouds.js' },
    { name: 'brain', entry: 'brain.js' },
    { name: 'camouflage', entry: 'camouflage.js' },
    { name: 'caveArt', entry: 'cave-art.js' },
    { name: 'circleDecor', entry: 'circle-decor.js' },
    { name: 'circles', entry: 'circles.js' },
    { name: 'concrete', entry: 'concrete.js' },
    { name: 'cork', entry: 'cork.js' },
    { name: 'crumpledFabric', entry: 'crumpled-fabric.js' },
    { name: 'dalmatianSpots', entry: 'dalmatian-spots.js' },
    { name: 'darthMaul', entry: 'darth-maul.js' },
    { name: 'dysonSphere', entry: 'dyson-sphere.js' },
    { name: 'entangled', entry: 'entangled.js' },
    { name: 'fordite', entry: 'fordite.js' },
    { name: 'gasGiant', entry: 'gas-giant.js' },
    { name: 'grid', entry: 'grid.js' },
    { name: 'halftone', entry: 'halftone.js' },
    { name: 'isolayers', entry: 'isolayers.js' },
    { name: 'isolines', entry: 'isolines.js' },
    { name: 'karstRock', entry: 'karst-rock.js' },
    { name: 'neonLights', entry: 'neon-lights.js' },
    { name: 'perlinNoise', entry: 'perlin-noise.js' },
    { name: 'photosphere', entry: 'photosphere.js' },
    { name: 'planet', entry: 'planet.js' },
    { name: 'processedWood', entry: 'processed-wood.js' },
    { name: 'protozoa', entry: 'protozoa.js' },
    { name: 'reticularVeins', entry: 'reticular-veins.js' },
    { name: 'romanPaving', entry: 'roman-paving.js' },
    { name: 'runnyEggs', entry: 'runny-eggs.js' },
    { name: 'rust', entry: 'rust.js' },
    { name: 'satin', entry: 'satin.js' },
    { name: 'scepterHead', entry: 'scepter-head.js' },
    { name: 'scream', entry: 'scream.js' },
    { name: 'stars', entry: 'stars.js' },
    { name: 'staticNoise', entry: 'static-noise.js' },
    { name: 'tigerFur', entry: 'tiger-fur.js' },
    { name: 'turbulentSmoke', entry: 'turbulent-smoke.js' },
    { name: 'voronoiCells', entry: 'voronoi-cells.js' },
    { name: 'waterDrops', entry: 'water-drops.js' },
    { name: 'watermelon', entry: 'watermelon.js' },
    { name: 'waves', entry: 'waves.js' },
    { name: 'wood', entry: 'wood.js' },
    { name: 'zebraLines', entry: 'zebra-lines.js' },
    { name: 'bricks', entry: 'bricks.js' },
];

const EXTERNAL_MODULES = ['three', 'three/tsl'];

const pkgVersion = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8')).version;

/**
 * Strip top-level import/export statements from bundled ESM output.
 * Returns the remaining body, the imported names per external module, and
 * alias bindings (`import { mx_noise_float as noise }` -> `const noise = mx_noise_float;`)
 * so the body keeps working when names are provided via scope instead of imports.
 */
function stripModuleSyntax(code, exportName) {
    const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
    const removals = [];
    const importsByModule = new Map();
    const aliasBindings = [];

    for (const node of ast.body) {
        if (node.type === 'ImportDeclaration') {
            const source = node.source.value;
            if (!EXTERNAL_MODULES.includes(source)) {
                throw new Error(`Unexpected non-external import "${source}" in bundled output`);
            }
            const names = importsByModule.get(source) ?? new Set();
            for (const spec of node.specifiers) {
                if (spec.type !== 'ImportSpecifier' || spec.imported.type !== 'Identifier') {
                    throw new Error(`Unsupported import specifier type ${spec.type} for "${source}"`);
                }
                names.add(spec.imported.name);
                if (spec.local.name !== spec.imported.name) {
                    aliasBindings.push(`const ${spec.local.name} = ${spec.imported.name};`);
                }
            }
            importsByModule.set(source, names);
            removals.push([node.start, node.end]);
        } else if (node.type === 'ExportNamedDeclaration' && !node.declaration) {
            const exported = node.specifiers.map((spec) => spec.exported.name);
            if (!exported.includes(exportName)) {
                throw new Error(`Bundle exports ${exported.join(', ')} but expected "${exportName}"`);
            }
            removals.push([node.start, node.end]);
        } else if (node.type.startsWith('Export')) {
            throw new Error(`Unsupported export statement (${node.type}) in bundled output`);
        }
    }

    let body = code;
    for (const [start, end] of removals.sort((a, b) => b[0] - a[0])) {
        body = body.slice(0, start) + body.slice(end);
    }

    return { body: body.trim(), importsByModule, aliasBindings };
}

async function bundleTexture({ name, entry }) {
    const result = await build({
        entryPoints: [path.join(pkgDir, 'src', entry)],
        bundle: true,
        format: 'esm',
        external: EXTERNAL_MODULES,
        write: false,
        minify: false,
        legalComments: 'none',
        target: 'es2022',
        logLevel: 'silent',
    });

    const { body, importsByModule, aliasBindings } = stripModuleSyntax(result.outputFiles[0].text, name);

    const prologue = aliasBindings.length > 0 ? `${aliasBindings.join('\n')}\n` : '';
    const code = `const ${name} = (() => {\n${prologue}${body}\nreturn ${name};\n})();`;

    return { name, code, importsByModule };
}

const bundles = [];
for (const texture of TEXTURES) {
    bundles.push(await bundleTexture(texture));
}

const sharedByModule = new Map(EXTERNAL_MODULES.map((module) => [module, new Set()]));
for (const bundle of bundles) {
    for (const [module, names] of bundle.importsByModule) {
        for (const name of names) sharedByModule.get(module).add(name);
    }
}

const sorted = (set) => Array.from(set).sort((a, b) => a.localeCompare(b));
const tslImports = sorted(sharedByModule.get('three/tsl'));
const threeImports = sorted(sharedByModule.get('three'));

const helperEntries = bundles
    .map(({ name, code }) => `        ${name}: {\n            code: ${JSON.stringify(code)},\n        },`)
    .join('\n');

const output = `// AUTO-GENERATED by scripts/generate-tsl-textures-inline.mjs — do not edit.
// Regenerate with: npm run generate:tsl-textures-inline
// Source package: tsl-textures@${pkgVersion} (MIT, Pavel Boytchev, https://github.com/boytchev/tsl-textures)
import type { InlineTslModuleDefinition } from './tsl-utils-inline';

export const TSL_TEXTURES_VERSION = ${JSON.stringify(pkgVersion)};

export const TSL_TEXTURES_INLINE_MODULE: InlineTslModuleDefinition = {
    label: \`Inline tsl-textures helpers (tsl-textures@\${TSL_TEXTURES_VERSION}, MIT, Pavel Boytchev)\`,
    sharedImports: ${JSON.stringify(tslImports)},
    sharedImportGroups: [
        { from: 'three', imports: ${JSON.stringify(threeImports)} },
    ],
    helpers: {
${helperEntries}
    },
};
`;

writeFileSync(outFile, output);
console.log(`Wrote ${path.relative(repoRoot, outFile)} (tsl-textures@${pkgVersion}, ${bundles.length} helpers)`);
console.log(`  three/tsl imports: ${tslImports.length}`);
console.log(`  three imports: ${threeImports.join(', ')}`);
