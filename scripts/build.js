#!/usr/bin/env node
/* Assemble the single-file app.
 *   dist/artifact.html  page content for publishing as a claude.ai artifact (the host adds <html>/<head>/<body>)
 *   docs/index.html     the same page as a standalone file: open it locally or serve it with GitHub Pages
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const data = read('data/data.json').replace(/<\//g, '<\\/');
const page = [
  '<title>PoE2 Crafting Playbook</title>',
  '<meta name="description" content="Design a Path of Exile 2 item, get a step-by-step crafting plan that re-plans as you go, and look up every crafting material.">',
  '<link rel="preconnect" href="https://fonts.googleapis.com">',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Alegreya+SC:wght@500;700&family=Alegreya+Sans:ital,wght@0,400;0,500;0,700;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap">',
  '<style>\n' + read('src/ui/app.css') + '\n</style>',
  read('src/ui/icons.html'),
  read('src/ui/markup.html'),
  '<script>window.DATA=' + data + ';</script>',
  '<script>\n' + read('src/prices.js') + '\n</script>',
  '<script>\n' + read('src/engine.js') + '\n</script>',
  '<script>\n' + read('src/ui/app.js') + '\n</script>',
  '<script>\n' + read('src/ui/ref.js') + '\n</script>'
].join('\n');

/* Mirrors the skeleton claude.ai wraps artifacts in, so both outputs behave the same. */
const skeleton = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
  '<style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif}img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>';

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'dist/artifact.html'), page);
fs.writeFileSync(path.join(ROOT, 'docs/index.html'), skeleton + page + '</body></html>');
console.log('dist/artifact.html and docs/index.html', (page.length / 1024).toFixed(0) + ' KB');
