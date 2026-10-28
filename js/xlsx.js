/* Minimal, dependency-free .xlsx writer + reader for the MDP twin.
 * Writer: one styled sheet (frozen header, column widths, number formats, list validations).
 * Reader: first worksheet -> array of rows (handles shared/inline strings, numbers, booleans).
 * No CDN needed, so it works on locked-down corporate desktops.
 */
(function () {
  'use strict';
  var enc = new TextEncoder();

  /* ---------- CRC32 + ZIP (store) ---------- */
  var CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(files) {
    var parts = [], central = [], offset = 0;
    var now = new Date(), dt = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF,
        dd = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;
    files.forEach(function (f) {
      var name = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data);
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, dt, true); lh.setUint16(12, dd, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, dt, true); ch.setUint16(14, dd, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
      ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    });
    var csize = central.reduce(function (a, p) { return a + p.length; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, csize, true); end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  /* ---------- writer ---------- */
  function x(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function colName(i) { var s = ''; i++; while (i) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - m - 1) / 26 | 0; } return s; }
  var NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  var FONT = 'Aptos Narrow';
  /* style ids: 0 default | 1 header | 2 header (required) | 3 text cell | 4 price 0.00 | 5 weight 0.000 */
  /* style ids
   *  0 default | 1 header (optional) | 2 header (required) | 3 text cell | 4 price 0.00 | 5 weight 0.000
   *  6 title | 7 body (wrap) | 8 muted note | 9 reference header | 10 reference text | 11 reference price | 12 bold body (wrap)
   */
  var STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="' + NS + '"><numFmts count="2"><numFmt numFmtId="164" formatCode="0.00"/><numFmt numFmtId="165" formatCode="0.000"/></numFmts>' +
    '<fonts count="7"><font><sz val="11"/><color rgb="FF1C1C1C"/><name val="' + FONT + '"/><family val="2"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="' + FONT + '"/><family val="2"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FF1C1C1C"/><name val="' + FONT + '"/><family val="2"/></font>' +
    '<font><b/><sz val="15"/><color rgb="FF1C1C1C"/><name val="' + FONT + '"/><family val="2"/></font>' +
    '<font><i/><sz val="10.5"/><color rgb="FF5A5D5C"/><name val="' + FONT + '"/><family val="2"/></font>' +
    '<font><sz val="11"/><color rgb="FF8A8A8A"/><name val="' + FONT + '"/><family val="2"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FF8A8A8A"/><name val="' + FONT + '"/><family val="2"/></font></fonts>' +
    '<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF5A5D5C"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFE9E6E0"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF4F4F4"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
    '<border><left style="thin"><color rgb="FFDCDCDC"/></left><right style="thin"><color rgb="FFDCDCDC"/></right><top style="thin"><color rgb="FFDCDCDC"/></top><bottom style="thin"><color rgb="FFDCDCDC"/></bottom><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="13"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="6" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="49" fontId="5" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>' +
    '<xf numFmtId="164" fontId="5" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>' +
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  function cellXml(ref, v, st) {
    if (v === '' || v == null) return '<c r="' + ref + '" s="' + st + '"/>';
    if (typeof v === 'number') return '<c r="' + ref + '" s="' + st + '"><v>' + v + '</v></c>';
    return '<c r="' + ref + '" s="' + st + '" t="inlineStr"><is><t xml:space="preserve">' + x(v) + '</t></is></c>';
  }
  var PAGE = '<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>';
  /* Table sheet. cols: [{h, w, required, ref, fmt:'price'|'weight', list:[...], prompt, max}] */
  function tableSheet(sh, selected) {
    var cols = sh.cols, rows = sh.rows || [], n = cols.length, last = colName(n - 1), dataRows = Math.max(rows.length, sh.blankRows || 0) + 1;
    var cellStyle = function (c) { return c.ref ? (c.fmt === 'price' ? 11 : 10) : ({ price: 4, weight: 5 }[c.fmt] || 3); };
    var colsXml = '<cols>' + cols.map(function (c, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (c.w || 14) + '" customWidth="1" style="' + cellStyle(c) + '"/>'; }).join('') + '</cols>';
    var sd = '<row r="1" ht="34" customHeight="1">' + cols.map(function (c, i) { return cellXml(colName(i) + '1', c.h, c.ref ? 9 : c.required ? 2 : 1); }).join('') + '</row>';
    for (var r = 2; r <= dataRows; r++) {
      var vals = rows[r - 2] || [];
      sd += '<row r="' + r + '">' + cols.map(function (c, i) { return cellXml(colName(i) + r, vals[i], cellStyle(c)); }).join('') + '</row>';
    }
    var dv = cols.map(function (c, i) {
      var col = colName(i), sq = ' sqref="' + col + '2:' + col + '2000"', pr = c.prompt ? ' showInputMessage="1" promptTitle="' + x(c.promptTitle || c.h).slice(0, 32) + '" prompt="' + x(c.prompt).slice(0, 250) + '"' : '';
      if (c.list) return '<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="Invalid value" error="Choose a value from the list, or leave it blank."' + pr + sq + '><formula1>"' + x(c.list.join(',')) + '"</formula1></dataValidation>';
      if (c.max != null) return '<dataValidation type="decimal" operator="between" allowBlank="1" showErrorMessage="1" errorStyle="warning" errorTitle="Check the weight" error="Weights are percentages from 0 to ' + c.max + '. Example: 4.5 means 4.5%."' + pr + sq + '><formula1>0</formula1><formula2>' + c.max + '</formula2></dataValidation>';
      if (pr) return '<dataValidation allowBlank="1"' + pr + sq + '/>';
      return '';
    }).filter(Boolean);
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="' + NS + '" xmlns:r="' + RNS + '"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
      '<dimension ref="A1:' + last + dataRows + '"/>' +
      '<sheetViews><sheetView' + (selected ? ' tabSelected="1"' : '') + ' workbookViewId="0" zoomScale="100"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="15"/>' + colsXml + '<sheetData>' + sd + '</sheetData>' +
      (dv.length ? '<dataValidations count="' + dv.length + '">' + dv.join('') + '</dataValidations>' : '') + PAGE + '</worksheet>';
  }
  /* Free-form notes sheet. lines: [{cells:[...], style:'title'|'muted'|'hdr'|'row'|'gap'}] */
  function notesSheet(sh, selected) {
    var STY = { title: 6, muted: 8, hdr: 1, row: 7 }, sd = '', r = 0, merges = [], w = sh.widths.length;
    sh.lines.forEach(function (ln) {
      r++;
      if (ln.style === 'gap') { sd += '<row r="' + r + '"/>'; return; }
      var cells = ln.cells, ht = ln.style === 'title' ? ' ht="24" customHeight="1"' : ln.style === 'hdr' ? ' ht="22" customHeight="1"' : '';
      sd += '<row r="' + r + '"' + ht + '>' + cells.map(function (v, i) { return cellXml(colName(i) + r, v, ln.style === 'row' && i === 0 ? 12 : STY[ln.style]); }).join('') + '</row>';
      if ((ln.style === 'muted' || ln.style === 'title') && cells.length === 1 && w > 1) merges.push('A' + r + ':' + colName(w - 1) + r);
    });
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="' + NS + '" xmlns:r="' + RNS + '"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
      '<sheetViews><sheetView' + (selected ? ' tabSelected="1"' : '') + ' workbookViewId="0" showGridLines="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/>' +
      '<cols>' + sh.widths.map(function (wd, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + wd + '" customWidth="1"/>'; }).join('') + '</cols>' +
      '<sheetData>' + sd + '</sheetData>' + (merges.length ? '<mergeCells count="' + merges.length + '">' + merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join('') + '</mergeCells>' : '') + PAGE + '</worksheet>';
  }
  /* sheets: [{name, cols, rows, blankRows} | {name, notes:true, widths, lines}]; the first sheet is selected */
  function writeBook(filename, sheets, opts) {
    opts = opts || {};
    var CT = 'application/vnd.openxmlformats-officedocument.spreadsheetml.';
    var files = [
      { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="' + CT + 'sheet.main+xml"/>' + sheets.map(function (sh, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="' + CT + 'worksheet+xml"/>'; }).join('') + '<Override PartName="/xl/styles.xml" ContentType="' + CT + 'styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>' },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>' },
      { name: 'docProps/core.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>' + x(opts.title || sheets[0].name) + '</dc:title><dc:creator>Model Delivery Portal</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">' + new Date().toISOString().replace(/\.\d+Z$/, 'Z') + '</dcterms:created></cp:coreProperties>' },
      { name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="' + NS + '" xmlns:r="' + RNS + '"><bookViews><workbookView activeTab="0"/></bookViews><sheets>' + sheets.map(function (sh, i) { return '<sheet name="' + x(sh.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map(function (sh, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') + '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { name: 'xl/styles.xml', data: STYLES }
    ];
    sheets.forEach(function (sh, i) { files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: sh.notes ? notesSheet(sh, i === 0) : tableSheet(sh, i === 0) }); });
    var blob = zip(files), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
    return blob;
  }
  function write(filename, sheetName, cols, rows, opts) {
    opts = opts || {};
    return writeBook(filename, [{ name: sheetName, cols: cols, rows: rows, blankRows: opts.blankRows }], opts);
  }

  /* ---------- reader ---------- */
  function inflate(bytes) {
    if (typeof DecompressionStream === 'undefined') return Promise.reject(new Error('This browser cannot read compressed Excel files.'));
    var ds = new DecompressionStream('deflate-raw');
    var stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Response(stream).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }
  function unzip(buf) {
    var u8 = new Uint8Array(buf), dv = new DataView(buf), eocd = -1;
    for (var i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) return Promise.reject(new Error('Not a valid .xlsx file'));
    var count = dv.getUint16(eocd + 10, true), p = dv.getUint32(eocd + 16, true), dec = new TextDecoder(), jobs = {};
    for (var e = 0; e < count; e++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      var method = dv.getUint16(p + 10, true), csz = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
      var name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
      var start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true), data = u8.subarray(start, start + csz);
      if (/^xl\/(sharedStrings|workbook|styles)\.xml$|^xl\/worksheets\/sheet\d+\.xml$|^xl\/_rels\/workbook\.xml\.rels$/.test(name)) jobs[name] = method === 8 ? inflate(data) : Promise.resolve(data);
      p += 46 + nl + xl + cl;
    }
    var names = Object.keys(jobs);
    return Promise.all(names.map(function (n) { return jobs[n]; })).then(function (res) {
      var out = {}; names.forEach(function (n, i) { out[n] = dec.decode(res[i]); }); return out;
    });
  }
  function colIndex(ref) { var m = /^([A-Z]+)/.exec(ref), n = 0; for (var i = 0; i < m[1].length; i++) n = n * 26 + m[1].charCodeAt(i) - 64; return n - 1; }
  /* Reads every sheet. Percent-formatted cells come back as "4.500%" strings, so 4.5% is never mistaken for 0.045. */
  function readAll(buf) {
    return unzip(buf).then(function (files) {
      var parse = function (s) { return new DOMParser().parseFromString(s, 'application/xml'); };
      var shared = [];
      if (files['xl/sharedStrings.xml']) {
        Array.prototype.forEach.call(parse(files['xl/sharedStrings.xml']).getElementsByTagName('si'), function (si) {
          shared.push(Array.prototype.map.call(si.getElementsByTagName('t'), function (t) { return t.textContent; }).join(''));
        });
      }
      // which cell styles are percentages
      var pctStyle = [];
      if (files['xl/styles.xml']) {
        var st = parse(files['xl/styles.xml']), pctFmt = { 9: 1, 10: 1 };
        Array.prototype.forEach.call(st.getElementsByTagName('numFmt'), function (f) { if (/%/.test(f.getAttribute('formatCode') || '')) pctFmt[f.getAttribute('numFmtId')] = 1; });
        var xfs = st.getElementsByTagName('cellXfs')[0];
        if (xfs) Array.prototype.forEach.call(xfs.getElementsByTagName('xf'), function (xf, i) { pctStyle[i] = !!pctFmt[xf.getAttribute('numFmtId')]; });
      }
      var sheets = [], active = 0;
      if (files['xl/workbook.xml'] && files['xl/_rels/workbook.xml.rels']) {
        var wb = parse(files['xl/workbook.xml']), rels = {};
        var view = wb.getElementsByTagName('workbookView')[0];
        active = view && view.getAttribute('activeTab') ? +view.getAttribute('activeTab') : 0;
        Array.prototype.forEach.call(parse(files['xl/_rels/workbook.xml.rels']).getElementsByTagName('Relationship'), function (r) {
          rels[r.getAttribute('Id')] = 'xl/' + r.getAttribute('Target').replace(/^\/?xl\//, '').replace(/^\//, '');
        });
        Array.prototype.forEach.call(wb.getElementsByTagName('sheet'), function (sh) {
          var rid = sh.getAttribute('r:id') || sh.getAttributeNS(RNS, 'id');
          if (files[rels[rid]]) sheets.push({ name: sh.getAttribute('name'), path: rels[rid] });
        });
      }
      if (!sheets.length) Object.keys(files).filter(function (k) { return /worksheets\/sheet\d+\.xml$/.test(k); }).sort().forEach(function (k, i) { sheets.push({ name: 'Sheet' + (i + 1), path: k }); });
      if (!sheets.length) throw new Error('No worksheet found in file');
      return sheets.map(function (sh, idx) {
        var rows = [];
        Array.prototype.forEach.call(parse(files[sh.path]).getElementsByTagName('row'), function (row) {
          var out = [];
          Array.prototype.forEach.call(row.getElementsByTagName('c'), function (c) {
            var t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0], val = '';
            if (t === 's') val = shared[+v.textContent] || '';
            else if (t === 'inlineStr') val = Array.prototype.map.call(c.getElementsByTagName('t'), function (n) { return n.textContent; }).join('');
            else if (t === 'b') val = v && v.textContent === '1' ? 'TRUE' : 'FALSE';
            else if (v) {
              if (t === 'str' || t === 'e') val = v.textContent;
              else { val = +v.textContent; if (pctStyle[+(c.getAttribute('s') || 0)]) val = (Math.round(val * 1e7) / 1e5) + '%'; }
            }
            out[colIndex(c.getAttribute('r') || 'A')] = val;
          });
          for (var i = 0; i < out.length; i++) if (out[i] === undefined) out[i] = '';
          rows.push(out);
        });
        return { name: sh.name, rows: rows, active: idx === active };
      });
    });
  }
  function read(buf) { return readAll(buf).then(function (all) { return (all.filter(function (s) { return s.active; })[0] || all[0]).rows; }); }

  window.MDPXlsx = { write: write, writeBook: writeBook, read: read, readAll: readAll };
})();
