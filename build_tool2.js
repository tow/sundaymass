const fs = require("fs");
const path = require("path");
const ROOT = __dirname;
const SUNDAYS = fs.readFileSync(path.join(ROOT, "sundays.json"), "utf8");
const READINGS_JSON = fs.readFileSync(path.join(ROOT, "readings_text.json"), "utf8");

// embed template parts as base64
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(dir + "/" + e.name) : [dir + "/" + e.name]);
const parts = {};
const PARTS_DIR = path.join(ROOT, "tpl");
walk(PARTS_DIR).forEach(f => { parts[path.relative(PARTS_DIR, f)] = fs.readFileSync(f).toString("base64"); });
const PARTS_JSON = JSON.stringify(parts);
const parts2 = {};
const PARTS2_DIR = path.join(ROOT, "tpl2");
walk(PARTS2_DIR).forEach(f => { parts2[path.relative(PARTS2_DIR, f)] = fs.readFileSync(f).toString("base64"); });
const PARTS2_JSON = JSON.stringify(parts2);

const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>St James the Apostle — 6pm Mass Music Planner</title>
<meta name="theme-color" content="#002F45">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Mass Planner">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">
<link rel="apple-touch-icon" sizes="180x180" href="icons/apple-touch-icon.png">
<style>
  :root{ --accent:#002F45; --accent-dark:#001F2D; --accentlt:#F0E5C8; --ink:#271A01; --muted:#675F52; --line:#D8CDB8; --canvas:#FBF6EF; }
  *{ box-sizing:border-box; }
  .sr-only{ position:absolute!important; width:1px!important; height:1px!important; padding:0!important; margin:-1px!important; overflow:hidden!important; clip:rect(0,0,0,0)!important; white-space:nowrap!important; border:0!important; }
  body{ margin:0; font-family:"Libre Franklin",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; color:var(--ink); background:var(--canvas); padding:0 22px 40px; }
  .parish-bar{ margin:0 -22px; padding:11px 22px; background:var(--accent); color:#fff; }
  .parish-bar-inner{ max-width:880px; margin:0 auto; display:flex; align-items:center; justify-content:space-between; gap:20px; font-size:12px; letter-spacing:.15px; }
  .parish-home{ color:#fff; text-decoration:none; font-weight:650; }
  .bar-mobile,.mobile-title,.nav-mobile{ display:none; }
  .parish-bar-actions{ display:flex; align-items:center; gap:12px; }
  .install-app{ min-height:0; padding:4px 8px; border-color:rgba(255,255,255,.7); color:#fff; background:transparent; font-size:11px; }
  .install-app:hover{ background:rgba(255,255,255,.12); }
  .wrap{ max-width:880px; margin:0 auto; }
  header.app{ padding:34px 2px 22px; }
  header.app h1{ color:var(--ink); font-family:"Libre Caslon Text",Georgia,"Times New Roman",serif; font-size:34px; font-weight:400; line-height:1.18; margin:0 0 6px; letter-spacing:-.4px; }
  header.app p{ color:var(--muted); margin:0; font-size:14px; }
  .church-link{ display:inline-block; margin-top:8px; color:var(--accent); font-size:12px; font-weight:650; text-underline-offset:3px; }
  .card{ background:#fff; border:1px solid var(--line); border-radius:4px; padding:24px; margin-bottom:20px; box-shadow:0 2px 10px rgba(39,26,1,.045); }
  .setup-head,.section-heading{ display:flex; align-items:flex-start; justify-content:space-between; gap:18px; margin-bottom:18px; }
  .eyebrow{ color:var(--accent); font-size:11px; font-weight:750; letter-spacing:.8px; text-transform:uppercase; margin-bottom:4px; }
  .setup-head h2,.section-heading h2{ font-family:"Libre Caslon Text",Georgia,"Times New Roman",serif; font-size:23px; font-weight:400; line-height:1.2; margin:0; letter-spacing:-.2px; }
  label.fld{ display:block; font-weight:600; font-size:12px; margin:0 0 5px; color:var(--accent); text-transform:uppercase; letter-spacing:.4px; }
  .daterow{ display:grid; grid-template-columns:auto minmax(190px,1fr) auto auto; gap:9px; align-items:center; }
  input[type=date]{ width:100%; height:44px; font-size:16px; padding:9px 11px; color:var(--ink); background:#fff; border:1px solid #bdb4b5; border-radius:9px; }
  button{ min-height:44px; font-size:14px; font-weight:650; padding:9px 14px; border-radius:2px; border:1px solid var(--accent); cursor:pointer; touch-action:manipulation; background:#fff; color:var(--accent); transition:background .15s ease,border-color .15s ease,box-shadow .15s ease,transform .05s ease; }
  button:hover{ background:#f6f1e5; }
  button:focus-visible,input:focus-visible,summary:focus-visible{ outline:3px solid rgba(0,47,69,.22); outline-offset:2px; }
  button.primary{ background:var(--accent); color:#fff; box-shadow:0 3px 9px rgba(0,47,69,.16); }
  button.primary:hover{ background:var(--accent-dark); }
  button.nav{ padding:9px 12px; }
  button:disabled{ opacity:.4; cursor:not-allowed; }
  button:active{ transform:translateY(1px); }
  .resolved{ display:grid; grid-template-columns:1fr auto; gap:3px 18px; align-items:center; margin:16px 0 0; padding:15px 16px; background:var(--canvas); border-left:4px solid var(--accent); border-radius:0; }
  .selected-date{ color:var(--ink); font-size:17px; font-weight:750; }
  .selected-day{ grid-column:1; color:var(--ink); font-family:"Libre Caslon Text",Georgia,"Times New Roman",serif; font-size:16px; }
  .selected-meta{ grid-column:2; grid-row:1 / span 2; color:var(--muted); font-size:12px; text-align:right; }
  .reading-summary{ margin-top:14px; border:1px solid var(--line); }
  .reading-summary-title{ padding:9px 12px; background:var(--accentlt); color:var(--ink); font-size:11px; font-weight:750; letter-spacing:.6px; text-transform:uppercase; }
  .reading-grid{ display:grid; grid-template-columns:1fr 1fr; }
  .reading-item{ min-width:0; padding:10px 12px; border-top:1px solid #eee6d5; }
  .reading-item:nth-child(odd){ border-right:1px solid #eee6d5; }
  .reading-label{ display:block; color:var(--muted); font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.35px; margin-bottom:2px; }
  .reading-cite{ display:block; color:var(--ink); font-family:"Libre Caslon Text",Georgia,"Times New Roman",serif; font-size:13.5px; overflow-wrap:anywhere; }
  .warn{ color:#8a4b00; font-size:13px; margin-top:8px; }
  .actions{ display:flex; align-items:center; gap:10px; margin-top:16px; flex-wrap:wrap; }
  .actions .primary{ min-height:48px; padding:11px 19px; font-size:15px; }
  details.options{ margin-top:14px; border-top:1px solid #eee6d5; padding-top:12px; }
  details.options summary{ width:max-content; color:var(--muted); cursor:pointer; touch-action:manipulation; font-size:13px; font-weight:600; }
  .option-body{ padding:11px 0 0 2px; }
  .print-option{ margin-top:12px; }
  .checkrow{ display:flex; align-items:flex-start; gap:9px; color:var(--ink); font-size:13.5px; cursor:pointer; }
  .checkrow input{ width:17px; height:17px; margin-top:1px; accent-color:var(--accent); }
  .checkrow small{ display:block; color:var(--muted); margin-top:2px; font-size:11.5px; }
  .edit label{ display:block; font-size:11.5px; color:var(--accent); font-weight:600; margin:10px 0 3px; }
  .edit input{ width:100%; font-size:16px; padding:10px; border:1px solid #ccc; border-radius:8px; }
  .edit .two{ display:grid; grid-template-columns:1fr; gap:2px; }
  .editnote{ font-size:12px; color:var(--muted); margin:6px 0 0; }
  .edit-card{ padding:0; overflow:hidden; }
  .edit-card > summary{ display:flex; align-items:center; justify-content:space-between; gap:18px; padding:18px 22px; cursor:pointer; list-style:none; }
  .edit-card > summary::-webkit-details-marker{ display:none; }
  .edit-card > summary strong{ display:block; font-size:14px; color:var(--ink); }
  .edit-card > summary small{ display:block; color:var(--muted); font-size:12px; font-weight:400; margin-top:2px; }
  .summary-action{ color:var(--accent); font-size:13px; font-weight:700; }
  .edit-card[open] .summary-action{ font-size:0; }
  .edit-card[open] .summary-action:after{ content:"Close"; font-size:13px; }
  .edit-card .edit{ border-top:1px solid #eee6d5; padding:10px 22px 20px; }
  .preview-heading{ padding:4px 2px 0; }
  .preview-heading p{ color:var(--muted); font-size:12.5px; margin:4px 0 0; }
  .sheet-frame{ width:100%; max-width:100%; min-width:0; margin-bottom:20px; }
  /* printable sheet */
  .sheet{ width:100%; max-width:100%; min-width:0; background:#fff; border:1px solid var(--line); border-radius:2px; padding:32px 40px 38px; box-shadow:0 2px 8px rgba(39,26,1,.07); }
  .sheet h2{ text-align:center; color:var(--ink); font-family:"Libre Caslon Text",Georgia,"Times New Roman",serif; font-size:21px; font-weight:400; margin:0 0 2px; }
  .sheet .sub{ text-align:center; color:#444; font-size:13px; margin:0; }
  .rule{ height:2px; background:var(--accent); margin:7px 0 12px; }
  .sheet .dayline{ text-align:center; font-family:"Libre Caslon Text",Georgia,"Times New Roman",serif; font-weight:400; color:var(--ink); font-size:16px; margin:8px 0 1px; }
  .sheet .meta{ text-align:center; color:var(--muted); font-size:12.5px; margin:0 0 12px; }
  .readings{ background:var(--accentlt); border:1px solid #e4d3d5; border-radius:8px; padding:6px 14px; margin:0 0 16px; }
  .readings table{ width:100%; table-layout:fixed; border-collapse:collapse; }
  .readings td{ padding:5px 0; font-size:13.5px; vertical-align:top; border-bottom:1px solid #ecdcde; }
  .readings tr:last-child td{ border-bottom:none; }
  .readings td.lbl{ width:150px; color:var(--muted); }
  .readings td.cite{ font-weight:600; }
  table.parts{ width:100%; table-layout:fixed; border-collapse:collapse; }
  table.parts td{ min-width:0; overflow-wrap:anywhere; border:1px solid #aaa; padding:8px 12px; vertical-align:middle; }
  td.plabel{ width:42%; background:var(--accentlt); font-weight:700; color:var(--ink); font-size:13.5px; }
  td.plabel .note{ display:block; font-style:italic; font-weight:400; font-size:11px; color:#8a8a8a; margin-top:2px; }
  td.pblank{ height:26px; }
  .sectlabel{ font-size:11px; font-weight:700; color:#888; letter-spacing:.5px; margin:14px 0 6px; }
  .foot{ text-align:center; color:var(--muted); font-size:11px; margin-top:20px; }
  .readingpage{ margin-top:26px; padding-top:22px; border-top:2px dashed #d8ccce; }
  .rptitle{ text-align:center; color:var(--ink); font-family:"Libre Caslon Text",Georgia,"Times New Roman",serif; font-size:19px; font-weight:400; }
  .rpsub{ text-align:center; color:var(--muted); font-size:12.5px; margin:2px 0 14px; border-bottom:1px solid #e4d3d5; padding-bottom:10px; }
  .rblock{ margin:0 0 12px; }
  .rhead{ font-weight:700; color:var(--ink); font-size:14px; margin-bottom:3px; }
  .rhead .rcite{ font-style:italic; font-weight:400; color:var(--muted); font-size:12.5px; margin-left:8px; }
  .rtext{ font-size:13.5px; line-height:1.5; text-align:justify; }
  .rpcaveat{ font-size:11px; font-style:italic; color:var(--muted); margin-top:14px; }
  @media (display-mode:standalone){ .install-app{ display:none !important; } }
  @page{ size:A4; margin:12mm; }
  @media print{ .readingpage{ page-break-before:always; border-top:none; margin-top:0; padding-top:0; } }
  @media print{
    body{ background:#fff; padding:0; } .parish-bar,.app,.card,.foot{ display:none !important; }
    .preview-heading{ display:none; } .sheet-frame{ margin:0; overflow:visible; }
    .sheet{ min-width:0; border:none; box-shadow:none; border-radius:0; padding:0; }
    .readingpage.no-print{ display:none !important; }
    .sheet,.readings,table.parts,table.parts tr,table.parts td{ page-break-inside:avoid; }
    table.parts td{ padding:6px 12px; } td.pblank{ height:22px; }
  }
  @media (max-width:700px){
    body{ padding:0 12px calc(28px + env(safe-area-inset-bottom)); }
    .parish-bar{ margin:0 -12px; padding:7px 14px; }
    .parish-bar-inner{ display:flex; font-size:11px; }
    .parish-bar-actions > span{ display:none; }
    .bar-desktop,.desktop-title,.nav-desktop{ display:none; }
    .bar-mobile,.mobile-title,.nav-mobile{ display:inline; }
    .install-app{ padding:5px 8px; }
    header.app{ padding:14px 4px 11px; }
    header.app h1{ font-size:25px; line-height:1.1; margin:0; }
    header.app p,.church-link{ display:none; }
    .card{ padding:14px; border-radius:3px; margin-bottom:12px; }
    .planner-card{ margin-left:-4px; margin-right:-4px; }
    .setup-head{ margin-bottom:10px; }
    .setup-head .eyebrow{ display:none; }
    .setup-head h2{ font-size:20px; }
    .daterow{ grid-template-columns:46px minmax(0,1fr) 46px; gap:7px; }
    .daterow #prev{ grid-column:1; grid-row:1; }
    .daterow #date{ grid-column:2; grid-row:1; min-width:0; height:46px; padding:7px 8px; font-size:16px; }
    .daterow #next{ grid-column:3; grid-row:1; }
    .daterow #today{ grid-column:1 / -1; grid-row:2; min-height:42px; }
    .daterow button{ min-height:46px; padding:6px; font-size:25px; }
    .daterow #today{ font-size:13px; }
    .resolved{ grid-template-columns:1fr; }
    .resolved{ margin-top:9px; padding:9px 11px; border-left-width:3px; }
    .selected-date{ display:none; }
    .selected-day{ font-size:17px; line-height:1.2; }
    .selected-meta{ grid-column:1; grid-row:auto; text-align:left; margin-top:2px; font-size:11px; }
    .actions{ display:grid; grid-template-columns:1fr; margin-top:10px; }
    .actions button{ width:100%; }
    .actions .primary{ min-height:50px; }
    .reading-summary{ margin-top:11px; }
    .reading-summary-title{ padding:7px 9px; font-size:10px; }
    .reading-grid{ grid-template-columns:1fr; }
    .reading-item{ display:grid; grid-template-columns:100px minmax(0,1fr); gap:9px; align-items:start; padding:7px 9px; }
    .reading-item:nth-child(odd){ border-right:none; }
    .reading-label{ margin:1px 0 0; font-size:9.5px; }
    .reading-cite{ font-size:12.5px; line-height:1.25; }
    details.options{ margin-top:10px; padding-top:9px; }
    details.options summary{ font-size:12px; }
    .print-option{ width:100%; }
    .preview-heading{ padding:8px 4px 0; }
    .sheet-frame{ overflow:visible; margin:0 0 14px; padding:0; }
    .sheet{ width:100%; padding:22px 14px 26px; }
    .sheet h2{ font-size:18px; }
    .sheet .sub{ font-size:12px; }
    .sheet .dayline{ font-size:15px; }
    .sheet .meta{ font-size:11px; }
    .readings{ padding:5px 9px; }
    .readings td{ font-size:11.5px; }
    .readings td.lbl{ width:39%; padding-right:7px; }
    table.parts td{ padding:7px 8px; }
    td.plabel{ width:52%; font-size:11.5px; }
    td.plabel .note{ font-size:9.5px; }
    .readingpage{ margin-top:22px; padding-top:20px; }
    .rhead .rcite{ display:block; margin:1px 0 0; }
    .rtext{ font-size:14.5px; line-height:1.55; text-align:left; }
    .edit-card{ padding:0; }
    .edit-card > summary{ padding:16px 17px; }
    .edit-card .edit{ padding:8px 17px 17px; }
  }
</style></head>
<body>
<div class="parish-bar"><div class="parish-bar-inner"><a class="parish-home" href="https://henrik.katolinen.fi/en/masses-at-the-church-of-saint-james-the-apostle/" target="_blank" rel="noopener"><span class="bar-desktop">St. Henry’s Cathedral Parish</span><span class="bar-mobile">St James the Apostle</span></a><div class="parish-bar-actions"><span>Church of St. James the Apostle</span><button class="install-app" id="installApp" hidden>Install app</button></div></div></div>
<div class="wrap">
  <header class="app">
    <h1><span class="desktop-title">St James the Apostle — 6pm Mass</span><span class="mobile-title">6pm Mass music planner</span></h1>
    <p>Create a music-planning sheet for any Sunday Mass.</p>
    <a class="church-link" href="https://henrik.katolinen.fi/en/masses-at-the-church-of-saint-james-the-apostle/" target="_blank" rel="noopener">Visit the church webpage ↗</a>
  </header>

  <div class="card planner-card">
    <div class="setup-head">
      <div>
        <div class="eyebrow">Music planning sheet</div>
        <h2>Choose the Sunday</h2>
      </div>
    </div>
    <label class="fld sr-only" for="date">Choose a Sunday</label>
    <div class="daterow">
      <button class="nav" id="prev" title="Previous Sunday" aria-label="Previous Sunday"><span class="nav-desktop">‹ Previous</span><span class="nav-mobile" aria-hidden="true">‹</span></button>
      <input type="date" id="date">
      <button class="nav" id="next" title="Following Sunday" aria-label="Following Sunday"><span class="nav-desktop">Next ›</span><span class="nav-mobile" aria-hidden="true">›</span></button>
      <button class="nav" id="today">Jump to upcoming Sunday</button>
    </div>
    <div class="resolved" id="resolved"></div>
    <div class="warn" id="warn" style="display:none"></div>

    <div class="actions">
      <button class="primary" id="dl">↓ Download music sheet</button>
    </div>
    <div class="reading-summary" id="readingSummary"></div>
    <details class="options">
      <summary>Print settings</summary>
      <div class="option-body">
        <label class="checkrow">
          <input type="checkbox" id="incl">
          <span>Print full reading texts on a second page<small>The full texts always remain visible in the on-screen preview below.</small></span>
        </label>
        <button class="print-option" id="print">Print / Save as PDF</button>
      </div>
    </details>
  </div>

  <div class="preview-heading section-heading">
    <div>
      <div class="eyebrow">Preview</div>
      <h2>Your music-planning sheet</h2>
      <p>The blank right-hand column is where the music choices go.</p>
    </div>
  </div>
  <div class="sheet-frame"><div class="sheet" id="sheet"></div></div>

  <details class="card edit-card">
    <summary>
      <span><strong>Adjust liturgical day or readings</strong><small>Only needed when the parish readings differ from the lectionary.</small></span>
      <span class="summary-action">Edit</span>
    </summary>
    <div class="edit">
      <label for="e_day">Liturgical day (editable)</label>
      <input id="e_day" type="text">
      <label for="e_first">First Reading</label><input id="e_first" type="text">
      <label for="e_psalm">Responsorial Psalm</label><input id="e_psalm" type="text">
      <label for="e_second">Second Reading</label><input id="e_second" type="text">
      <label for="e_gospel">Gospel</label><input id="e_gospel" type="text">
      <p class="editnote">These are auto-filled from the lectionary. Edit any field to override — the priest's choice wins; the sheet above updates as you type. <a href="#" id="reset">Reset to computed</a>.</p>
    </div>
  </details>
  <div class="foot">Calendar: Catholic Church in Finland (Diocese of Helsinki) — Epiphany on 6 Jan, St Henry, All Souls handled. Sunday cycles A–C <span id="range"></span>, readings from the Order of Readings for Mass. Always confirm against your parish Ordo; edit any field to override.</div>
</div>

<script>
const SUNDAYS = ${SUNDAYS};
const PARTS = ${PARTS_JSON};
const PARTS2 = ${PARTS2_JSON};
const READINGS = ${READINGS_JSON};
const PARTLABELS = [
  ["Entrance / Processional Hymn",""],["Kyrie — Lord, Have Mercy",""],["Gloria — Glory to God","(omitted in Advent & Lent)"],
  ["Responsorial Psalm",""],["Gospel Acclamation — Alleluia","(Lenten acclamation in Lent)"],
  ["Preparation of the Gifts / Offertory",""],["Sanctus — Holy, Holy, Holy",""],["Memorial Acclamation — Mystery of Faith",""],
  ["Great Amen",""],["The Lord's Prayer — Our Father","(if sung)"],["Agnus Dei — Lamb of God",""],
  ["Communion Hymn",""],["Recessional / Closing Hymn",""],
];
const byDate = {}; SUNDAYS.forEach((s,i)=>byDate[s.d]=i);
const cycleName = c => "Year " + c;
function fmtLong(iso){ const d=new Date(iso+"T12:00:00Z"); return d.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}); }
function esc(s){ return (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

let curIdx = 0;  // index into SUNDAYS
let override = {}; // {day,first,psalm,second,gospel}

function current(){ return SUNDAYS[curIdx]; }
function vals(){
  const s = current();
  return {
    day: override.day ?? s.n,
    meta: fmtLong(s.d) + "  ·  " + s.s + "  ·  " + cycleName(s.c),
    first: override.first ?? s.f, psalm: override.psalm ?? s.p,
    second: override.second ?? s.e, gospel: override.gospel ?? s.g,
    date: s.d,
  };
}

function renderEditors(){
  const v = vals();
  e_day.value=v.day; e_first.value=v.first; e_psalm.value=v.psalm; e_second.value=v.second; e_gospel.value=v.gospel;
}
function renderSheet(){
  const v = vals();
  const rows = [["First Reading",v.first],["Responsorial Psalm",v.psalm],["Second Reading",v.second],["Gospel",v.gospel]]
    .map(r=>'<tr><td class="lbl">'+esc(r[0])+'</td><td class="cite">'+(esc(r[1])||"—")+'</td></tr>').join('');
  const partsHtml = PARTLABELS.map(([n,note])=>'<tr><td class="plabel">'+esc(n)+(note?'<span class="note">'+esc(note)+'</span>':'')+'</td><td class="pblank"></td></tr>').join('');
  const printReadings = document.getElementById("incl") && document.getElementById("incl").checked;
  const blk = (label,cite,text) => '<div class="rblock"><div class="rhead">'+esc(label)+'<span class="rcite">'+esc(cite)+'</span></div><div class="rtext">'+(esc(text)||'<em>(see citation)</em>')+'</div></div>';
  const page2 = '<div class="readingpage'+(printReadings?'':' no-print')+'"><div class="rptitle">Mass Readings</div><div class="rpsub">'+esc(v.day)+'  ·  '+esc(v.meta)+'</div>'
    + blk("First Reading", v.first, textFor(v.first))
    + blk("Responsorial Psalm", v.psalm, textFor(v.psalm)||"(sung — see citation)")
    + blk("Second Reading", v.second, textFor(v.second))
    + blk("Gospel", v.gospel, textFor(v.gospel))
    + '<div class="rpcaveat">Scripture: World English Bible (public domain). Verse numbering — especially in the Psalms — can differ slightly from the lectionary.</div></div>';
  sheet.innerHTML =
    '<h2>St James the Apostle — 6pm Mass</h2><div class="sub">Music Planning Sheet</div><div class="rule"></div>'
    + '<div class="dayline">'+esc(v.day)+'</div><div class="meta">'+esc(v.meta)+'</div>'
    + '<div class="readings"><table>'+rows+'</table></div>'
    + '<div class="sectlabel">SUNG PARTS OF THE MASS</div><table class="parts">'+partsHtml+'</table>'
    + page2;
}
function renderResolved(){
  const s = current();
  resolved.innerHTML = '<span class="selected-date">'+fmtLong(s.d)+'</span>'
    + '<span class="selected-day">'+esc(s.n)+'</span>'
    + '<span class="selected-meta">'+esc(s.s)+' · '+cycleName(s.c)+'</span>';
}
function renderReadingSummary(){
  const v=vals();
  const readings=[["First Reading",v.first],["Responsorial Psalm",v.psalm],["Second Reading",v.second],["Gospel",v.gospel]];
  readingSummary.innerHTML='<div class="reading-summary-title">Readings for this Sunday</div><div class="reading-grid">'
    + readings.map(r=>'<div class="reading-item"><span class="reading-label">'+esc(r[0])+'</span><span class="reading-cite">'+(esc(r[1])||"—")+'</span></div>').join('')
    + '</div>';
}
function refresh(){
  renderResolved(); renderReadingSummary(); renderEditors(); renderSheet();
  prev.disabled=curIdx===0; next.disabled=curIdx===SUNDAYS.length-1;
  today.hidden=curIdx===nextSundayIdx();
  const v = vals();
  if(!v.gospel && !v.first){ warn.style.display="block"; warn.textContent="This day (e.g. St Henry, patron of Finland) has proper readings that aren't in the dataset — please type them into the fields below from your parish Ordo."; }
  else if(warn.textContent.indexOf("outside the computed")<0){ warn.style.display="none"; }
}

// pick nearest Sunday to a chosen date
function goToDate(iso){
  if(byDate[iso]!==undefined){ curIdx=byDate[iso]; override={}; warn.style.display="none"; refresh(); return; }
  // find nearest Sunday record
  let best=-1,bestDiff=1e15; const t=new Date(iso+"T12:00:00Z").getTime();
  SUNDAYS.forEach((s,i)=>{ const diff=Math.abs(new Date(s.d+"T12:00:00Z").getTime()-t); if(diff<bestDiff){bestDiff=diff;best=i;} });
  if(best<0 || bestDiff>1000*3600*24*366){ warn.style.display="block"; warn.textContent="That date is outside the computed range (2025–2075). You can still type the readings in manually below."; }
  else warn.style.display="none";
  curIdx=best; override={}; refresh();
}

// ---- Word (.docx) generation in-browser ----
function b64ToBytes(b64){ const bin=atob(b64); const a=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i); return a; }
function crc32(bytes){ let t=crc32.t; if(!t){ t=crc32.t=[]; for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c=c&1?0xEDB88320^(c>>>1):c>>>1; t[n]=c>>>0; } } let crc=0xFFFFFFFF; for(let i=0;i<bytes.length;i++) crc=t[(crc^bytes[i])&0xFF]^(crc>>>8); return (crc^0xFFFFFFFF)>>>0; }
function zipStore(files){
  const enc=new TextEncoder(); const u16=n=>[n&255,(n>>8)&255]; const u32=n=>[n&255,(n>>8)&255,(n>>16)&255,(n>>24)&255];
  const chunks=[], central=[]; let offset=0;
  for(const f of files){
    const name=enc.encode(f.name); const crc=crc32(f.data); const sz=f.data.length;
    const local=new Uint8Array([].concat([0x50,0x4b,0x03,0x04],u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(sz),u32(sz),u16(name.length),u16(0)));
    chunks.push(local,name,f.data);
    central.push(new Uint8Array([].concat([0x50,0x4b,0x01,0x02],u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(sz),u32(sz),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset))),name);
    offset+=local.length+name.length+sz;
  }
  const cenSize=central.reduce((a,b)=>a+b.length,0);
  const eocd=new Uint8Array([].concat([0x50,0x4b,0x05,0x06],u16(0),u16(0),u16(files.length),u16(files.length),u32(cenSize),u32(offset),u16(0)));
  const all=[...chunks,...central,eocd]; const total=all.reduce((a,b)=>a+b.length,0);
  const out=new Uint8Array(total); let p=0; for(const c of all){ out.set(c,p); p+=c.length; } return out;
}
function textFor(cite){ return READINGS[cite] || ""; }
function downloadWord(){
  const v=vals(); const dec=new TextDecoder();
  const withRd = document.getElementById("incl").checked;
  const src = withRd ? PARTS2 : PARTS;
  let docXml=dec.decode(b64ToBytes(src["word/document.xml"]));
  const repl={ "@@DAY@@":v.day, "@@META@@":v.meta, "@@FIRST@@":v.first, "@@PSALM@@":v.psalm, "@@SECOND@@":(v.second||"—"), "@@GOSPEL@@":v.gospel };
  if(withRd){ Object.assign(repl, {
    "@@FIRSTTEXT@@": textFor(v.first) || "(full text not available — see citation above)",
    "@@PSALMTEXT@@": textFor(v.psalm) || "(sung — see citation above)",
    "@@SECONDTEXT@@": textFor(v.second) || "—",
    "@@GOSPELTEXT@@": textFor(v.gospel) || "(full text not available — see citation above)",
  }); }
  // replace longer tokens first so @@FIRST@@ doesn't clobber @@FIRSTTEXT@@
  Object.keys(repl).sort((a,b)=>b.length-a.length).forEach(k=>{ docXml=docXml.split(k).join(esc(repl[k])); });
  const enc=new TextEncoder();
  const files=Object.keys(src).map(name=> name==="word/document.xml" ? {name, data:enc.encode(docXml)} : {name, data:b64ToBytes(src[name])});
  const blob=new Blob([zipStore(files)],{type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="StJames_6pm_Mass_"+v.date+".docx";
  document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(()=>URL.revokeObjectURL(a.href),4000);
}

// wire up
function nextSundayIdx(){ const today=new Date().toISOString().slice(0,10); let i=SUNDAYS.findIndex(s=>s.d>=today); return i<0?SUNDAYS.length-1:i; }
[["e_day","day"],["e_first","first"],["e_psalm","psalm"],["e_second","second"],["e_gospel","gospel"]].forEach(([id,key])=>{
  document.getElementById(id).addEventListener("input", e=>{ override[key]=e.target.value; renderReadingSummary(); renderSheet(); });
});
document.getElementById("reset").addEventListener("click", e=>{ e.preventDefault(); override={}; refresh(); });
prev.addEventListener("click", ()=>{ if(curIdx>0){curIdx--; override={}; date.value=current().d; refresh(); } });
next.addEventListener("click", ()=>{ if(curIdx<SUNDAYS.length-1){curIdx++; override={}; date.value=current().d; refresh(); } });
document.getElementById("today").addEventListener("click", ()=>{ curIdx=nextSundayIdx(); override={}; date.value=current().d; refresh(); });
date.addEventListener("change", ()=>{ goToDate(date.value); date.value=current().d; });
dl.addEventListener("click", downloadWord);
document.getElementById("print").addEventListener("click", ()=>window.print());
document.getElementById("incl").addEventListener("change", renderSheet);
document.getElementById("range").textContent = "("+SUNDAYS[0].d.slice(0,4)+"–"+SUNDAYS[SUNDAYS.length-1].d.slice(0,4)+")";

curIdx=nextSundayIdx(); date.value=current().d; refresh();

// Installable app support. iPhone/iPad uses Safari's Share → Add to Home Screen flow.
let deferredInstallPrompt = null;
const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
if(ios && !standalone) installApp.hidden=false;
window.addEventListener("beforeinstallprompt", event=>{
  event.preventDefault();
  deferredInstallPrompt=event;
  if(!standalone) installApp.hidden=false;
});
installApp.addEventListener("click", async ()=>{
  if(deferredInstallPrompt){
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt=null;
    installApp.hidden=true;
  }else if(ios){
    alert("In Safari, tap the Share button, then choose “Add to Home Screen”.");
  }
});
window.addEventListener("appinstalled", ()=>{ installApp.hidden=true; deferredInstallPrompt=null; });
if("serviceWorker" in navigator && location.protocol!=="file:"){
  window.addEventListener("load", ()=>navigator.serviceWorker.register("./service-worker.js"));
}
</script></body></html>`;

fs.writeFileSync(path.join(ROOT, "StJames_Mass_Planner.html"), html);
console.log("written", Math.round(html.length/1024), "KB");
