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
  /* Raw deflate through the browser's own DecompressionStream, stopped past max bytes (a zip bomb gets nowhere). */
  function inflateRaw(data, max) {
    if (typeof DecompressionStream === 'undefined') return Promise.reject(new Error('nozip'));
    var ds;
    try { ds = new DecompressionStream('deflate-raw'); } catch (e) { return Promise.reject(new Error('nozip')); }
    var w = ds.writable.getWriter();
    w.write(data).catch(function () { /* the read side reports it */ });
    w.close().catch(function () { /* same */ });
    var reader = ds.readable.getReader(), chunks = [], total = 0;
    function pump() {
      return reader.read().then(function (r) {
        if (r.done) return concat(chunks, total);
        total += r.value.length;
        if (total > max) { reader.cancel().catch(function () { /* ignore */ }); throw new Error('toobig'); }
        chunks.push(r.value);
        return pump();
      });
    }
    return pump();
  }
  /* The files in a zip (stored or deflated; no encryption, no zip64), read from its central directory. */
  function readZip(bytes, want) {
    var b = bytes, eocd = -1;
    for (var i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) { if (u32(b, i) === 0x06054b50) { eocd = i; break; } }
    if (eocd < 0) return Promise.reject(new Error('badzip'));
    var count = u16(b, eocd + 10), p = u32(b, eocd + 16), entries = [];
    for (var n = 0; n < count && n < LIMITS.entries && p + 46 <= b.length; n++) {
      if (u32(b, p) !== 0x02014b50) break;
      var flags = u16(b, p + 8), method = u16(b, p + 10), csize = u32(b, p + 20), usize = u32(b, p + 24);
      var nlen = u16(b, p + 28), xlen = u16(b, p + 30), clen = u16(b, p + 32), lho = u32(b, p + 42);
      var name = utf8(b.subarray(p + 46, p + 46 + nlen));
      p += 46 + nlen + xlen + clen;
      if (/\/$/.test(name) || (flags & 1) || csize === 0xffffffff || lho + 30 > b.length || u32(b, lho) !== 0x04034b50) continue;
      if (want && !want(name)) continue;
      var start = lho + 30 + u16(b, lho + 26) + u16(b, lho + 28);
      if (start + csize > b.length) continue;
      entries.push({ name: name, method: method, usize: usize, data: b.subarray(start, start + csize) });
    }
    var total = 0;
    return entries.reduce(function (chain, e) {
      return chain.then(function (out) {
        if (e.method === 0) return e.data.length <= LIMITS.entry ? out.concat([{ name: e.name, data: e.data }]) : out;
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
    if (!base) return String(id || 'Item');
    if (m[1] === 'Weapon' || m[1] === 'Offhand') return base + (k > 1 ? ' (swap)' : '');
    if (m[1] === 'Ring') return base + ' ' + k;
    return base + (many ? ' ' + ((x | 0) + 1) : '');
  }
  function clip(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) : s; }
  function stepOf(name, i) {
    var nm = String(name || '').trim(), m = /\{(\d+)\}/.exec(nm);
    var label = nm.replace(/\s*\{\d+\}.*$/, '').trim() || nm || 'Step ' + (i + 1);
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
    var nm = String(o.name || ''), dash = nm.indexOf(' - ');
    var tail = dash > -1 ? nm.slice(dash + 3).trim() : '';
    var link = typeof o.link === 'string' && /^https?:\/\//i.test(o.link) ? clip(o.link, 300) : null;
    return { name: st.name, n: st.n, title: tail.length >= 8 && !/\.$/.test(tail) ? clip(tail, 80) : '', author: clip(typeof o.author === 'string' ? o.author : '', 60), link: link, items: items };
  }
  function cleanName(n) { return String(n || '').replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '').replace(/_+/g, ' ').replace(/\s+/g, ' ').trim(); }
  /* Steps in order: "{n}" when every step has one, else the file names' natural order. */
  function pack(steps, zipName) {
    var all = steps.filter(Boolean).slice(0, LIMITS.steps);
    if (!all.length) return null;
    var numbered = all.every(function (s) { return s.n !== null; });
    all.sort(function (a, b) { return numbered ? a.n - b.n : a.file.localeCompare(b.file, undefined, { numeric: true }); });
    var first = all[0];
    var title = zipName ? cleanName(zipName) : first.title || (first.author ? first.author + '’s build' : cleanName(first.file));
    return {
      title: clip(title, 80), author: first.author, link: first.link,
      steps: all.map(function (s) { return { name: s.name, items: s.items }; })
    };
  }
  /* Files from a picker or a drop: .build files and zips of them. Resolves to { build, files, skipped, error }. */
  function readFiles(files) {
    var list = Array.prototype.slice.call(files || []), steps = [], skipped = [], zipName = null, error = null, idx = 0;
    function take(name, bytes) {
      var s = parseBuild(utf8(bytes), name, idx++);
      if (s) { s.file = cleanName(name); steps.push(s); } else skipped.push(cleanName(name));
    }
    return list.reduce(function (chain, f) {
      return chain.then(function () {
        if (f.size > LIMITS.total) { skipped.push(cleanName(f.name)); return; }
        return f.arrayBuffer().then(function (buf) {
          var b = new Uint8Array(buf);
          if (!isZip(b)) { take(f.name, b); return; }
          if (list.length === 1) zipName = f.name;
          return readZip(b, function (n) { return /\.(build|json)$/i.test(n) && !/(^|\/)(__MACOSX|\.)/.test(n); })
            .then(function (entries) { entries.forEach(function (e) { take(e.name, e.data); }); if (!entries.length) skipped.push(cleanName(f.name)); })
            .catch(function (e) { error = e.message === 'nozip' ? 'nozip' : e.message === 'toobig' ? 'toobig' : 'badzip'; });
        });
      });
    }, Promise.resolve()).then(function () {
      return { build: pack(steps, zipName), files: steps.length, skipped: skipped, error: error };
    });
  }

  var api = { readZip: readZip, parseBuild: parseBuild, readFiles: readFiles, slotLabel: slotLabel, LIMITS: LIMITS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BuildFile = api;
})(typeof window !== 'undefined' ? window : this);
