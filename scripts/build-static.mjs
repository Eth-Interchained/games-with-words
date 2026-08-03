/**
 * Bundle the pass-and-play build into ONE self-contained HTML file.
 *
 * It imports the real shared modules (word pack, frames, scoring, filter), so
 * the single-device game and the multiplayer server cannot drift apart.
 *
 *   node scripts/build-static.mjs  ->  dist-static/pass-and-play.html
 */

import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const outDir = 'dist-static';
fs.mkdirSync(outDir, { recursive: true });

const result = await build({
  entryPoints: ['client/passandplay.ts'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  write: false,
  logLevel: 'info',
});

const js = result.outputFiles[0].text;
const css = fs.readFileSync('client/src/styles/app.css', 'utf8');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,maximum-scale=1,user-scalable=no">
<meta name="theme-color" content="#14110e">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>Games with Words — pass &amp; play</title>
<meta name="description" content="Three words. Everyone has a different story.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT@0,9..144,300..900,0..100;1,9..144,300..900,0..100&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
${css}
</style>
</head>
<body>
<div id="root"></div>
<script>
${js}
</script>
</body>
</html>
`;

const outFile = path.join(outDir, 'pass-and-play.html');
fs.writeFileSync(outFile, html);
console.log(`\n  ${outFile} — ${(html.length / 1024).toFixed(1)} kB\n`);
