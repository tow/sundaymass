const fs = require("fs");
const SUNDAYS = fs.readFileSync("/root/sundays.json", "utf8");
const READINGS_JSON = fs.readFileSync("/root/readings_text.json", "utf8");

// embed template parts as base64
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(dir + "/" + e.name) : [dir + "/" + e.name]);
const parts = {};
walk("/root/tpl").forEach(f => { parts[f.replace("/root/tpl/", "")] = fs.readFileSync(f).toString("base64"); });
const PARTS_JSON = JSON.stringify(parts);
const parts2 = {};
walk("/root/tpl2").forEach(f => { parts2[f.replace("/root/tpl2/", "")] = fs.readFileSync(f).toString("base64"); });
const PARTS2_JSON = JSON.stringify(parts2);

const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>St James' 6pm Mass — Music Planner</title>
<style>
  :root{ --accent:#7A1F2B; --accentlt:#F3E9EA; --ink:#2b2b2b; --muted:#6b6b6b; --line:#d8ccce; }
  *{ box-sizing:border-box; }
  body{ margin:0; font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; color:var(--ink); background:#efe9e2; padding:22px; }
  .wrap{ max-width:840px; margin:0 auto; }
  header.app{ text-align:center; margin-bottom:16px; }
  header.app h1{ color:var(--accent); font-size:23px; margin:0 0 3px; }
  header.app p{ color:var(--muted); margin:0; font-size:13.5px; }
  .card{ background:#fff; border:1px solid var(--line); border-radius:12px; padding:16px 18px; margin-bottom:16px; box-shadow:0 1px 3px rgba(0,0,0,.05); }
  label.fld{ display:block; font-weight:600; font-size:12px; margin:0 0 5px; color:var(--accent); text-transform:uppercase; letter-spacing:.4px; }
  .daterow{ display:flex; gap:10px; align-items:end; flex-wrap:wrap; }
  input[type=date]{ font-size:15px; padding:9px 11px; border:1px solid #bbb; border-radius:8px; }
  button{ font-size:14px; font-weight:600; padding:9px 14px; border-radius:8px; border:1px solid var(--accent); cursor:pointer; background:#fff; color:var(--accent); }
  button.primary{ background:var(--accent); color:#fff; }
  button.nav{ padding:9px 12px; }
  button:active{ transform:translateY(1px); }
  .resolved{ margin:12px 0 2px; font-size:13px; color:var(--muted); }
  .resolved b{ color:var(--ink); }
  .warn{ color:#8a4b00; font-size:13px; margin-top:8px; }
  .edit label{ display:block; font-size:11.5px; color:var(--accent); font-weight:600; margin:10px 0 3px; }
  .edit input{ width:100%; font-size:14px; padding:8px 10px; border:1px solid #ccc; border-radius:7px; }
  .edit .two{ display:grid; grid-template-columns:1fr; gap:2px; }
  .editnote{ font-size:12px; color:var(--muted); margin:6px 0 0; }
  .btns{ display:flex; gap:10px; margin-top:16px; flex-wrap:wrap; }
  /* printable sheet */
  .sheet{ background:#fff; border:1px solid var(--line); border-radius:12px; padding:32px 40px 38px; box-shadow:0 2px 8px rgba(0,0,0,.08); }
  .sheet h2{ text-align:center; color:var(--accent); font-size:21px; margin:0 0 2px; }
  .sheet .sub{ text-align:center; color:#444; font-size:13px; margin:0; }
  .rule{ height:2px; background:var(--accent); margin:7px 0 12px; }
  .sheet .dayline{ text-align:center; font-weight:700; color:var(--accent); font-size:16px; margin:8px 0 1px; }
  .sheet .meta{ text-align:center; color:var(--muted); font-size:12.5px; margin:0 0 12px; }
  .readings{ background:var(--accentlt); border:1px solid #e4d3d5; border-radius:8px; padding:6px 14px; margin:0 0 16px; }
  .readings table{ width:100%; border-collapse:collapse; }
  .readings td{ padding:5px 0; font-size:13.5px; vertical-align:top; border-bottom:1px solid #ecdcde; }
  .readings tr:last-child td{ border-bottom:none; }
  .readings td.lbl{ width:150px; color:var(--muted); }
  .readings td.cite{ font-weight:600; }
  table.parts{ width:100%; border-collapse:collapse; }
  table.parts td{ border:1px solid #aaa; padding:8px 12px; vertical-align:middle; }
  td.plabel{ width:42%; background:var(--accentlt); font-weight:700; color:var(--accent); font-size:13.5px; }
  td.plabel .note{ display:block; font-style:italic; font-weight:400; font-size:11px; color:#8a8a8a; margin-top:2px; }
  td.pblank{ height:26px; }
  .sectlabel{ font-size:11px; font-weight:700; color:#888; letter-spacing:.5px; margin:14px 0 6px; }
  .foot{ text-align:center; color:var(--muted); font-size:11px; margin-top:20px; }
  .readingpage{ margin-top:26px; padding-top:22px; border-top:2px dashed #d8ccce; }
  .rptitle{ text-align:center; color:var(--accent); font-size:19px; font-weight:700; }
  .rpsub{ text-align:center; color:var(--muted); font-size:12.5px; margin:2px 0 14px; border-bottom:1px solid #e4d3d5; padding-bottom:10px; }
  .rblock{ margin:0 0 12px; }
  .rhead{ font-weight:700; color:var(--accent); font-size:14px; margin-bottom:3px; }
  .rhead .rcite{ font-style:italic; font-weight:400; color:var(--muted); font-size:12.5px; margin-left:8px; }
  .rtext{ font-size:13.5px; line-height:1.5; text-align:justify; }
  .rpcaveat{ font-size:11px; font-style:italic; color:var(--muted); margin-top:14px; }
  @page{ size:A4; margin:12mm; }
  @media print{ .readingpage{ page-break-before:always; border-top:none; margin-top:0; padding-top:0; } }
  @media print{
    body{ background:#fff; padding:0; } .app,.card,.foot{ display:none !important; }
    .sheet{ border:none; box-shadow:none; border-radius:0; padding:0; }
    .sheet,.readings,table.parts,table.parts tr,table.parts td{ page-break-inside:avoid; }
    table.parts td{ padding:6px 12px; } td.pblank{ height:22px; }
  }
</style></head>
<body><div class="wrap">
  <header class="app">
    <h1>St James' Church — 6pm Mass</h1>
    <p>Music planner · pick any Sunday, adjust the readings if needed, download a one-page Word sheet</p>
  </header>

  <div class="card">
    <label class="fld" for="date">Choose a Sunday</label>
    <div class="daterow">
      <button class="nav" id="prev" title="Previous Sunday">‹ Prev</button>
      <input type="date" id="date">
      <button class="nav" id="next" title="Next Sunday">Next ›</button>
      <button class="nav" id="today">Next Sunday</button>
    </div>
    <div class="resolved" id="resolved"></div>
    <div class="warn" id="warn" style="display:none"></div>

    <div class="edit">
      <label>Liturgical day (editable)</label>
      <input id="e_day" type="text">
      <label>First Reading</label><input id="e_first" type="text">
      <label>Responsorial Psalm</label><input id="e_psalm" type="text">
      <label>Second Reading</label><input id="e_second" type="text">
      <label>Gospel</label><input id="e_gospel" type="text">
      <p class="editnote">These are auto-filled from the lectionary. Edit any field to override — the priest's choice wins — then download. <a href="#" id="reset">Reset to computed</a>.</p>
    </div>

    <label style="display:flex;align-items:center;gap:8px;margin-top:14px;font-size:13.5px;color:var(--ink);font-weight:500;cursor:pointer">
      <input type="checkbox" id="incl" checked style="width:16px;height:16px"> Include the full text of the readings (adds a second page)
    </label>
    <div class="btns">
      <button class="primary" id="dl">⬇ Download Word</button>
      <button id="print">🖨 Print / Save as PDF</button>
    </div>
  </div>

  <div class="sheet" id="sheet"></div>
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
  let page2 = '';
  if(document.getElementById("incl") && document.getElementById("incl").checked){
    const blk = (label,cite,text) => '<div class="rblock"><div class="rhead">'+esc(label)+'<span class="rcite">'+esc(cite)+'</span></div><div class="rtext">'+(esc(text)||'<em>(see citation)</em>')+'</div></div>';
    page2 = '<div class="readingpage"><div class="rptitle">Mass Readings</div><div class="rpsub">'+esc(v.day)+'  ·  '+esc(v.meta)+'</div>'
      + blk("First Reading", v.first, textFor(v.first))
      + blk("Responsorial Psalm", v.psalm, textFor(v.psalm)||"(sung — see citation)")
      + blk("Second Reading", v.second, textFor(v.second))
      + blk("Gospel", v.gospel, textFor(v.gospel))
      + '<div class="rpcaveat">Scripture: World English Bible (public domain). Verse numbering — especially in the Psalms — can differ slightly from the lectionary.</div></div>';
  }
  sheet.innerHTML =
    '<h2>St James\\' Church — 6pm Mass</h2><div class="sub">Music Planning Sheet</div><div class="rule"></div>'
    + '<div class="dayline">'+esc(v.day)+'</div><div class="meta">'+esc(v.meta)+'</div>'
    + '<div class="readings"><table>'+rows+'</table></div>'
    + '<div class="sectlabel">SUNG PARTS OF THE MASS</div><table class="parts">'+partsHtml+'</table>'
    + page2;
}
function renderResolved(){
  const s = current();
  resolved.innerHTML = "Sheet for: <b>"+fmtLong(s.d)+"</b> — "+esc(s.n)+" ("+cycleName(s.c)+")";
}
function refresh(){
  renderResolved(); renderEditors(); renderSheet();
  const v = vals();
  if(!v.gospel && !v.first){ warn.style.display="block"; warn.textContent="This day (e.g. St Henry, patron of Finland) has proper readings that aren't in the dataset — please type them into the fields above from your parish Ordo."; }
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
  document.getElementById(id).addEventListener("input", e=>{ override[key]=e.target.value; renderSheet(); });
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
</script></body></html>`;

fs.writeFileSync("/root/StJames_Mass_Planner.html", html);
console.log("written", Math.round(html.length/1024), "KB");
