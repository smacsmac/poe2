/* Build files: what the game's Build Planner reads (patch 0.5+). A .build file is JSON: the build's author and link,
   then inventory_slots, each with an inventory_id (Weapon1, Helm1, Ring2, Flask1...), a slot_x for the flasks and
   charms, and either additional_text (the base on the first line, then the mods the creator wants) or unique_name.
   Guides ship one file per step (Act 1, Endgame Step 1...), often zipped together; "{n}" in a step's name is its order.
   No DOM here: readFiles takes File-like objects ({name, arrayBuffer()}), so node tests can feed it buffers. */
(function (root) {
  'use strict';
  var LIMITS = { entries: 200, entry: 1 << 20, total: 8 << 20, steps: 60, items: 40, text: 4000 };

  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
  function isZip(b) { return b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04; }
  function utf8(b) { return new TextDecoder('utf-8').decode(b); }
  function concat(chunks, total) {
    var out = new Uint8Array(total), at = 0;
    chunks.forEach(function (c) { out.set(c, at); at += c.length; });
    return out;
  }
  /* Raw deflate through the browser's own DecompressionStream, stopped past max bytes. The input goes in 4 KB at a
     time, each write waiting for the reader, so a zip bomb never gets to inflate more than a few MB (a browser
     inflates a whole written chunk before anyone can read it). */
  function noop() { /* the read side reports errors */ }
  function inflateRaw(data, max) {
    if (typeof DecompressionStream === 'undefined') return Promise.reject(new Error('nozip'));
    var ds;
    try { ds = new DecompressionStream('deflate-raw'); } catch (e) { return Promise.reject(new Error('nozip')); }
    var w = ds.writable.getWriter(), stop = false, STEP = 4096;
    (function feed(at) {
      if (stop) return;
      if (at >= data.length) { w.close().catch(noop); return; }
      w.write(data.subarray(at, at + STEP)).then(function () { feed(at + STEP); }, noop);
    })(0);
    var reader = ds.readable.getReader(), chunks = [], total = 0;
    function pump() {
      return reader.read().then(function (r) {
        if (r.done) return concat(chunks, total);
        total += r.value.length;
        if (total > max) { stop = true; reader.cancel().catch(noop); throw new Error('toobig'); }
        chunks.push(r.value);
        return pump();
      });
    }
    return pump();
  }
  /* The files in a zip (stored or deflated; no encryption, no zip64), read from its central directory. */
  function readZip(bytes, want) {
    // the end record: the one whose comment ends the file (a comment can hold a fake one), else the last one found
    var b = bytes, eocd = -1, loose = -1;
    for (var i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
      if (u32(b, i) !== 0x06054b50) continue;
      if (loose < 0) loose = i;
      if (i + 22 + u16(b, i + 20) === b.length) { eocd = i; break; }
    }
    if (eocd < 0) eocd = loose;
    if (eocd < 0) return Promise.reject(new Error('badzip'));
    var count = u16(b, eocd + 10), p = u32(b, eocd + 16), entries = [], seen = {};
    for (var n = 0; n < count && n < LIMITS.entries && p + 46 <= b.length; n++) {
      if (u32(b, p) !== 0x02014b50) break;
      var flags = u16(b, p + 8), method = u16(b, p + 10), csize = u32(b, p + 20), usize = u32(b, p + 24);
      var nlen = u16(b, p + 28), xlen = u16(b, p + 30), clen = u16(b, p + 32), lho = u32(b, p + 42);
      var name = utf8(b.subarray(p + 46, p + 46 + nlen));
      p += 46 + nlen + xlen + clen;
      if (/\/$/.test(name) || (flags & 1) || csize === 0xffffffff || lho + 30 > b.length || u32(b, lho) !== 0x04034b50 || seen[lho]) continue;
      seen[lho] = 1;   // two entries can't share one file's bytes
      if (want && !want(name)) continue;
      var start = lho + 30 + u16(b, lho + 26) + u16(b, lho + 28);
      if (start + csize > b.length) continue;
      entries.push({ name: name, method: method, usize: usize, data: b.subarray(start, start + csize) });
    }
    var total = 0;
    return entries.reduce(function (chain, e) {
      return chain.then(function (out) {
        if (e.method === 0) {
          if (e.data.length > LIMITS.entry) return out;
          total += e.data.length;
          if (total > LIMITS.total) throw new Error('toobig');
          return out.concat([{ name: e.name, data: e.data }]);
        }
        if (e.method !== 8 || e.usize > LIMITS.entry) return out;
        return inflateRaw(e.data, LIMITS.entry).then(function (d) {
          total += d.length;
          if (total > LIMITS.total) throw new Error('toobig');
          return out.concat([{ name: e.name, data: d }]);
        });
      });
    }, Promise.resolve([]));
  }

  var SLOTS = { Weapon: 'Weapon', Offhand: 'Off hand', Helm: 'Helmet', BodyArmour: 'Body armour', Gloves: 'Gloves', Boots: 'Boots',
    Amulet: 'Amulet', Ring: 'Ring', Belt: 'Belt', Flask: 'Flask', Charm: 'Charm' };
  /* "Weapon2" is the second weapon set; "Ring2" the second ring. */
  function slotLabel(id, x, many) {
    var m = /^([A-Za-z]+?)(\d*)$/.exec(String(id || '')), base = m && SLOTS[m[1]], k = m ? +(m[2] || 1) : 1;
    if (!base) return clip(String(id || 'Item'), 30);
    if (m[1] === 'Weapon' || m[1] === 'Offhand') return base + (k > 1 ? ' (swap)' : '');
    if (m[1] === 'Ring') return base + ' ' + k;
    return base + (many ? ' ' + ((x | 0) + 1) : '');
  }
  function clip(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) : s; }
  function stepOf(name, i) {
    var nm = clip(String(name || '').trim(), 200), m = /\{(\d+)\}/.exec(nm);
    var label = (m ? nm.slice(0, m.index) : nm).trim() || nm || 'Step ' + (i + 1);
    return { n: m ? +m[1] : null, name: clip(label, 80) };
  }
  /* One .build file's JSON -> a step: { name, n, title, author, link, items: [{ slot, label, text | unique }] } */
  function parseBuild(text, fileName, i) {
    var o;
    try { o = JSON.parse(String(text).replace(/^﻿/, '')); } catch (e) { return null; }
    if (!o || typeof o !== 'object' || !Array.isArray(o.inventory_slots)) return null;
    var st = stepOf(o.name || String(fileName || '').replace(/\.[^.]+$/, ''), i || 0);
    var count = {};
    o.inventory_slots.forEach(function (s) { if (s && s.inventory_id) count[s.inventory_id] = (count[s.inventory_id] || 0) + 1; });
    var items = o.inventory_slots.filter(function (s) { return s && typeof s.inventory_id === 'string' && (typeof s.additional_text === 'string' || typeof s.unique_name === 'string'); })
      .slice(0, LIMITS.items).map(function (s) {
        var it = { slot: clip(s.inventory_id, 30), label: slotLabel(s.inventory_id, s.slot_x, count[s.inventory_id] > 1) };
        if (typeof s.unique_name === 'string' && !s.additional_text) it.unique = clip(s.unique_name, 80);
        else it.text = clip(s.additional_text, LIMITS.text);
        return it;
      });
    var nm = clip(String(o.name || ''), 200), dash = nm.indexOf(' - ');
    var tail = dash > -1 ? nm.slice(dash + 3).trim() : '';
    var link = typeof o.link === 'string' && /^https?:\/\//i.test(o.link) ? clip(o.link, 300) : null;
    return { name: st.name, n: st.n, title: tail.length >= 8 && !/\.$/.test(tail) ? clip(tail, 80) : '', author: clip(typeof o.author === 'string' ? o.author : '', 60), link: link, items: items };
  }
  /* A file's name without its folder or extension, underscores as spaces, and no " (1)" a second download adds. */
  function cleanName(n) { return clip(String(n || ''), 300).replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '').replace(/_+/g, ' ').replace(/\s+/g, ' ').replace(/\s*\(\d+\)$/, '').trim(); }
  /* The guide a build belongs to: its link (and author) when it has one, else its title and author. Steps of one guide
     merge into one build, whichever files they came in. */
  function guideKey(b) { return (b.author || '') + '\n' + (b.link || 't:' + b.title); }
  /* Steps in order: "{n}" when every step has one, else the file names' natural order. */
  function pack(steps, zipName) {
    var all = steps.filter(Boolean).slice(0, LIMITS.steps);
    if (!all.length) return null;
    var numbered = all.every(function (s) { return s.n !== null; });
    all.sort(function (a, b) { return numbered ? a.n - b.n : a.file.localeCompare(b.file, undefined, { numeric: true }); });
    var first = all[0];
    var title = zipName ? cleanName(zipName) : first.title || (first.author ? first.author + '’s build' : cleanName(first.file));
    var b = {
      title: clip(title, 80), zip: !!zipName, author: first.author, link: first.link,
      steps: all.map(function (s) { return { name: s.name, n: s.n, items: s.items }; })
    };
    b.key = guideKey(b);
    return b;
  }
  /* Files from a picker or a drop: .build files and zips of them. Each zip is one build; loose .build files are
     grouped by guide. Resolves to { builds, build (the first), files, skipped, error }. */
  function readFiles(files) {
    var list = Array.prototype.slice.call(files || []), groups = [], loose = {}, skipped = [], error = null, idx = 0, count = 0;
    function take(name, bytes, into) {
      var s = parseBuild(utf8(bytes), name, idx++);
      if (!s) { skipped.push(cleanName(name)); return; }
      s.file = cleanName(name); count += 1;
      if (into) { into.steps.push(s); return; }
      var k = guideKey(s);
      if (!loose[k]) { loose[k] = { steps: [], zip: null }; groups.push(loose[k]); }
      loose[k].steps.push(s);
    }
    return list.reduce(function (chain, f) {
      return chain.then(function () {
        if (f.size > LIMITS.total) { skipped.push(cleanName(f.name)); return; }
        return f.arrayBuffer().then(function (buf) {
          var b = new Uint8Array(buf);
          if (!isZip(b)) { take(f.name, b); return; }
          var g = { steps: [], zip: f.name };
          return readZip(b, function (n) { return /\.(build|json)$/i.test(n) && !/(^|\/)(__MACOSX|\.)/.test(n); })
            .then(function (entries) {
              entries.forEach(function (e) { take(e.name, e.data, g); });
              if (g.steps.length) groups.push(g); else skipped.push(cleanName(f.name));
            })
            .catch(function (e) { error = e.message === 'nozip' ? 'nozip' : e.message === 'toobig' ? 'toobig' : 'badzip'; });
        });
      });
    }, Promise.resolve()).then(function () {
      var builds = groups.map(function (g) {
        // one step per {n} or name: the same step twice in one pick keeps the first
        var seen = {};
        return pack(g.steps.filter(function (s) { var k = s.n !== null ? '#' + s.n : 'n:' + s.name; if (seen[k]) return false; seen[k] = 1; return true; }), g.zip);
      }).filter(Boolean);
      return { builds: builds, build: builds[0] || null, files: count, skipped: skipped, error: error };
    });
  }
  /* A build added to the ones kept: a build of the same guide takes the new steps (a step with the same {n}, or the
     same name, is replaced), keeps its id, and goes first. A zip's name makes the better title (a step file's own
     name is cut short), else the longer one wins.
     Returns { list, build, added, merged }. */
  function mergeInto(list, nb, max) {
    var old = list.find(function (x) { return (x.key || guideKey(x)) === nb.key; });
    if (!old) {
      nb.id = nb.id || 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      return { list: [nb].concat(list).slice(0, max), build: nb, added: nb.steps.length, merged: false };
    }
    var steps = old.steps.slice(), added = 0;
    nb.steps.forEach(function (s) {
      var i = steps.findIndex(function (x) { return (s.n !== null && s.n !== undefined && x.n === s.n) || x.name === s.name; });
      if (i > -1) steps[i] = s; else { steps.push(s); added += 1; }
    });
    if (steps.every(function (s) { return typeof s.n === 'number'; })) steps.sort(function (a, b) { return a.n - b.n; });
    var lastName = typeof old.last === 'number' && old.steps[old.last] ? old.steps[old.last].name : null;
    var m = {
      id: old.id, key: nb.key, zip: !!(old.zip || nb.zip),
      title: old.zip ? old.title : nb.zip ? nb.title : old.title.length >= nb.title.length ? old.title : nb.title,
      author: nb.author || old.author, link: nb.link || old.link, at: nb.at || old.at,
      steps: steps.slice(0, LIMITS.steps)
    };
    if (lastName) { var li = m.steps.findIndex(function (x) { return x.name === lastName; }); if (li > -1) m.last = li; }
    return { list: [m].concat(list.filter(function (x) { return x !== old; })).slice(0, max), build: m, added: added, merged: true };
  }

  var api = { readZip: readZip, parseBuild: parseBuild, readFiles: readFiles, mergeInto: mergeInto, guideKey: guideKey, slotLabel: slotLabel, LIMITS: LIMITS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BuildFile = api;
})(typeof window !== 'undefined' ? window : this);
