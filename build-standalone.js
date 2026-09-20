// ============================================================
//  Build one sendable file.
//
//    node build-standalone.js            -> neon-dino-age.html
//    node build-standalone.js out.html   -> somewhere else
//
//  index2.html loads its art from sibling PNGs, so mailing that file alone
//  gives the other person a game with no graphics. This wraps the art into
//  the page: every sprite is a data: URI in window.__ASSETS, which
//  assetURL() inside the game reads before falling back to a filename.
//
//  The encoded art comes from assets-inline.json, produced by the PowerShell
//  step in README-BUILD.md (Windows Imaging Component does the decoding,
//  downscaling and re-encoding — no npm packages involved). Re-run that step
//  whenever the art changes; this script only assembles.
//
//  Inlining has a second benefit worth knowing: a data: URI does not taint
//  the canvas the way a file:// image does, so computeSpriteBBox can measure
//  sprites properly in the standalone build.
// ============================================================
const fs=require('fs');
const path=require('path');

const HERE=__dirname;
const SRC=path.join(HERE,'index2.html');
const MANIFEST=path.join(HERE,'assets-inline.json');
const OUT=path.resolve(process.argv[2]||path.join(HERE,'neon-dino-age.html'));

// the fallback drop: portal.png is always bundled, so this one is never asked for
const OPTIONAL=new Set(['portal.jpg']);

if(!fs.existsSync(MANIFEST)){
  console.error('assets-inline.json is missing — run the encode step in README-BUILD.md first.');
  process.exit(1);
}

const shell=fs.readFileSync(SRC,'utf8');

// Pull the game's own scripts in. They are separate files so the source can
// be worked on in pieces; the person receiving the bundle wants one file, so
// this is where the pieces come back together. Order is document order and
// each keeps its own <script> tag, because these files rely on being
// separate scripts no more than they rely on being one -- but keeping the
// boundaries means the bundle runs exactly like the folder build does.
let inlinedScripts=0;
const html=shell.replace(/<script\s+src\s*=\s*["']([^"']+)["']\s*><\/script>/g,(m,rel)=>{
  const p=path.resolve(path.dirname(SRC),rel);
  if(!fs.existsSync(p)){
    console.error('index2.html references '+rel+', which does not exist.');
    process.exit(1);
  }
  inlinedScripts++;
  const code=fs.readFileSync(p,'utf8');
  // a closing tag inside a string would end the script element early
  if(/<\/script/i.test(code)){
    console.error(rel+' contains a literal closing script tag; it cannot be inlined as-is.');
    process.exit(1);
  }
  return '<script>\n// ===== '+rel+' =====\n'+code+'</script>';
});
if(!inlinedScripts){
  console.error('index2.html loads no external scripts — expected the split build.');
  process.exit(1);
}
let assets;
try{
  // PowerShell's Set-Content -Encoding utf8 prepends a BOM, which JSON.parse
  // refuses — strip it rather than depending on how the file was written
  assets=JSON.parse(fs.readFileSync(MANIFEST,'utf8').replace(/^﻿/,''));
}
catch(e){ console.error('assets-inline.json will not parse: '+e.message); process.exit(1); }

// every filename the game asks for, so a missing one is caught here rather
// than as an invisible sprite on someone else's tablet
const wanted=[...new Set([...html.matchAll(/["']([\w./-]+\.(?:png|jpg|jpeg|webp))["']/gi)]
  .map(m=>m[1]))];
const missing=wanted.filter(n=>!assets[n]&&!OPTIONAL.has(n));
if(missing.length){
  console.error('these assets are referenced but not in the manifest:\n  '+missing.join('\n  '));
  process.exit(1);
}
const unused=Object.keys(assets).filter(n=>!wanted.includes(n));

if(!/function assetURL\(/.test(html)){
  console.error('index2.html has no assetURL() — the inlined art would be ignored.');
  process.exit(1);
}

// The manifest goes in its own script tag ahead of the game, because the game
// reads window.__ASSETS the moment its first sprite is constructed.
const banner=
`<!-- Everything this game needs is in this one file: no folder, no server,\n`+
`     no internet. Open it in any browser. On a tablet the on-screen pad\n`+
`     appears automatically. -->\n`;
const inject=`<script>window.__ASSETS=${JSON.stringify(assets)};</script>\n`;

const marker='<canvas id="c"></canvas>';
if(html.split(marker).length-1!==1){
  console.error('could not find the canvas element to inject before.');
  process.exit(1);
}
const out=html
  .replace('<!DOCTYPE html>','<!DOCTYPE html>\n'+banner)
  .replace(marker, marker+'\n'+inject);

fs.writeFileSync(OUT,out,'utf8');
const mb=n=>(n/1024/1024).toFixed(2)+' MB';
console.log('wrote '+path.basename(OUT)+'  '+mb(Buffer.byteLength(out,'utf8')));
console.log('  '+inlinedScripts+' scripts inlined, '+Object.keys(assets).length+' assets inlined, '+wanted.length+' referenced');
if(unused.length) console.log('  (bundled but unused: '+unused.join(', ')+')');
console.log('  send this single file — it needs nothing beside it.');
