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
  html{ -webkit-text-size-adjust:100%; text-size-adjust:100%; }
  *{ box-sizing:border-box; }
  .sr-only{ position:absolute!important; width:1px!important; height:1px!important; padding:0!important; margin:-1px!important; overflow:hidden!important; clip:rect(0,0,0,0)!important; white-space:nowrap!important; border:0!important; }
  body{ margin:0; font-family:"Libre Franklin",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; color:var(--ink); background:var(--canvas); padding:0 22px 40px; }
  .parish-bar{ margin:0 -22px; padding:11px 22px; background:var(--accent); color:#fff; }
  .parish-bar-inner{ max-width:880px; margin:0 auto; display:flex; align-items:center; justify-content:space-between; gap:20px; font-size:12px; letter-spacing:.15px; }
  .parish-home{ flex:none; color:#fff; text-decoration:none; font-weight:650; white-space:nowrap; }
  .parish-home:hover,.parish-home:focus-visible{ text-decoration:underline; text-underline-offset:3px; }
  .bar-mobile,.mobile-title,.nav-mobile{ display:none; }
  .parish-bar-actions{ display:flex; flex:none; align-items:center; gap:12px; }
  .install-app{ flex:none; min-height:0; padding:4px 8px; border-color:rgba(255,255,255,.7); color:#fff; background:transparent; font-size:11px; white-space:nowrap; }
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
  .date-slot{ position:relative; display:grid; place-items:center; width:100%; min-width:0; height:44px; overflow:hidden; background:#fff; border:1px solid #bdb4b5; border-radius:9px; }
  .date-slot:focus-within{ outline:3px solid rgba(0,47,69,.22); outline-offset:2px; }
  .date-display{ color:var(--ink); font-size:16px; font-weight:650; line-height:1; pointer-events:none; }
  input[type=date]{ position:absolute; inset:0; z-index:1; width:100%; min-width:0; max-width:100%; height:100%; margin:0; padding:0; cursor:pointer; opacity:0; }
  button{ min-height:44px; font-size:14px; font-weight:650; padding:9px 14px; border-radius:2px; border:1px solid var(--accent); cursor:pointer; touch-action:manipulation; background:#fff; color:var(--accent); transition:background .15s ease,border-color .15s ease,box-shadow .15s ease,transform .05s ease; }
  button:hover{ background:#f6f1e5; }
  button:focus-visible,input:focus-visible,summary:focus-visible,a:focus-visible{ outline:3px solid rgba(0,47,69,.22); outline-offset:2px; }
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
  .reading-item{ display:block; min-width:0; padding:10px 12px; border-top:1px solid #eee6d5; color:inherit; text-decoration:none; }
  .reading-item:nth-child(odd){ border-right:1px solid #eee6d5; }
  .reading-item:hover{ background:#fcfaf6; }
  .reading-label{ display:block; color:var(--muted); font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.35px; margin-bottom:2px; }
  .reading-cite{ display:block; color:var(--ink); font-family:"Libre Caslon Text",Georgia,"Times New Roman",serif; font-size:13.5px; overflow-wrap:anywhere; }
  .warn{ color:#8a4b00; font-size:13px; margin-top:8px; }
  .actions{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; margin-top:16px; }
  .actions button{ width:100%; min-width:0; min-height:48px; padding:10px 12px; font-size:14px; line-height:1.2; }
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
  .music-card{ padding:0; overflow:hidden; }
  .music-head{ display:flex; align-items:flex-start; justify-content:space-between; gap:16px; padding:20px 22px 15px; border-bottom:1px solid #eee6d5; }
  .music-head h2{ font-family:"Libre Caslon Text",Georgia,"Times New Roman",serif; font-size:23px; font-weight:400; line-height:1.2; margin:0; }
  .music-head p{ color:var(--muted); font-size:12.5px; line-height:1.4; margin:4px 0 0; }
  .sync-status{ flex:none; color:var(--muted); font-size:11.5px; padding-top:4px; }
  .sync-status[data-state="saved"]{ color:#38704b; }
  .sync-status[data-state="error"]{ color:#9a3b22; }
  .music-list{ margin:0; }
  .music-view-row{ display:grid; grid-template-columns:minmax(150px,38%) minmax(0,1fr); gap:14px; padding:12px 22px; border-bottom:1px solid #eee6d5; }
  .music-view-row:last-child{ border-bottom:none; }
  .music-part-label{ color:var(--muted); font-size:11.5px; font-weight:700; line-height:1.35; text-transform:uppercase; letter-spacing:.25px; }
  .music-part-note{ display:block; margin-top:2px; color:#8a8173; font-size:10px; font-style:italic; font-weight:400; letter-spacing:0; text-transform:none; }
  .music-choice{ min-width:0; color:var(--ink); font-size:14px; font-weight:650; line-height:1.35; overflow-wrap:anywhere; }
  .music-empty{ color:#9a9286; font-weight:400; }
  .listen-link{ display:inline-block; margin-top:4px; color:var(--accent); font-size:11.5px; font-weight:700; text-underline-offset:2px; }
  .music-edit-row{ padding:14px 22px 16px; border-bottom:1px solid #eee6d5; }
  .music-edit-row:last-child{ border-bottom:none; }
  .music-edit-row .music-part-label{ display:block; margin-bottom:7px; color:var(--ink); }
  .music-fields{ display:grid; grid-template-columns:minmax(0,1.4fr) minmax(0,1fr); gap:8px; }
  .music-fields input{ width:100%; min-width:0; height:42px; padding:8px 10px; border:1px solid #c9c0b1; border-radius:7px; color:var(--ink); background:#fff; font-size:15px; }
  .music-fields input::placeholder{ color:#958d81; }
  .editor-help{ padding:10px 22px; color:var(--muted); background:#fcfaf6; border-bottom:1px solid #eee6d5; font-size:11.5px; }
  .auth-button{ flex:none; min-height:0; padding:5px 9px; border-color:rgba(255,255,255,.72); color:#fff; background:transparent; font-size:11px; white-space:nowrap; }
  .auth-button:hover{ background:rgba(255,255,255,.12); }
  .login-dialog{ width:min(420px,calc(100% - 28px)); padding:0; border:1px solid var(--line); border-radius:5px; color:var(--ink); background:#fff; box-shadow:0 18px 55px rgba(0,31,45,.24); }
  .login-dialog::backdrop{ background:rgba(0,31,45,.48); }
  .login-form{ padding:24px; }
  .login-form h2{ margin:0; font-family:"Libre Caslon Text",Georgia,"Times New Roman",serif; font-size:25px; font-weight:400; }
  .login-form p{ margin:5px 0 18px; color:var(--muted); font-size:12.5px; line-height:1.45; }
  .login-form label{ display:block; margin:11px 0 4px; color:var(--accent); font-size:11px; font-weight:700; letter-spacing:.35px; text-transform:uppercase; }
  .login-form input{ width:100%; height:44px; padding:9px 11px; border:1px solid #c9c0b1; border-radius:7px; color:var(--ink); font-size:16px; }
  .login-actions{ display:flex; justify-content:flex-end; gap:8px; margin-top:18px; }
  .login-error{ min-height:18px; margin:9px 0 -3px!important; color:#9a3b22!important; }
  .readings-card{ padding:24px 28px 26px; }
  .readings-card .section-heading{ margin-bottom:16px; }
  .readings-card .section-heading p{ color:var(--muted); font-size:12.5px; margin:4px 0 0; }
  .reading-anchor{ scroll-margin-top:16px; }
  .foot{ text-align:center; color:var(--muted); font-size:11px; margin-top:20px; }
  .rblock{ margin:0; padding:16px 0; border-top:1px solid #eee6d5; }
  .rblock:first-child{ border-top:none; padding-top:0; }
  .rblock:last-of-type{ padding-bottom:0; }
  .rhead{ font-weight:700; color:var(--ink); font-size:14px; margin-bottom:3px; }
  .rhead .rcite{ font-style:italic; font-weight:400; color:var(--muted); font-size:12.5px; margin-left:8px; }
  .rtext{ font-size:13.5px; line-height:1.5; text-align:justify; }
  .rpcaveat{ font-size:11px; font-style:italic; color:var(--muted); margin-top:14px; }
  @media (display-mode:standalone){ .install-app{ display:none !important; } }
  @media (max-width:700px){
    body{ padding:0 12px calc(28px + env(safe-area-inset-bottom)); }
    .parish-bar{ margin:0 -12px; padding:7px 12px; }
    .parish-bar-inner{ display:flex; gap:8px; font-size:11px; }
    .parish-bar-actions{ gap:6px; }
    .parish-bar-actions > span{ display:none; }
    .bar-desktop,.desktop-title,.nav-desktop{ display:none; }
    .bar-mobile,.mobile-title,.nav-mobile{ display:inline; }
    .install-app,.auth-button{ min-height:34px; padding:5px 7px; font-size:10.5px; line-height:1; }
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
    .daterow .date-slot{ grid-column:2; grid-row:1; width:100%; min-width:0; max-width:100%; height:46px; }
    .daterow #date{ width:100%; min-width:0; max-width:100%; height:100%; }
    .date-display{ font-size:16px; }
    .daterow #next{ grid-column:3; grid-row:1; }
    .daterow #today{ grid-column:1 / -1; grid-row:2; min-height:42px; }
    .daterow button{ min-width:0; min-height:46px; padding:6px; font-size:25px; }
    .daterow #prev,.daterow #next{ width:46px; min-width:46px; max-width:46px; }
    .daterow #today{ font-size:13px; }
    .resolved{ grid-template-columns:1fr; }
    .resolved{ margin-top:9px; padding:9px 11px; border-left-width:3px; }
    .selected-date{ display:none; }
    .selected-day{ font-size:17px; line-height:1.2; }
    .selected-meta{ grid-column:1; grid-row:auto; text-align:left; margin-top:2px; font-size:11px; }
    .actions{ grid-template-columns:repeat(2,minmax(0,1fr)); gap:7px; margin-top:10px; }
    .actions button{ min-height:50px; padding:8px 7px; font-size:12.5px; }
    .reading-summary{ margin-top:11px; }
    .reading-summary-title{ padding:7px 9px; font-size:10px; }
    .reading-grid{ grid-template-columns:1fr; }
    .reading-item{ display:grid; grid-template-columns:100px minmax(0,1fr); gap:9px; align-items:start; padding:7px 9px; }
    .reading-item:nth-child(odd){ border-right:none; }
    .reading-label{ margin:1px 0 0; font-size:9.5px; }
    .reading-cite{ font-size:12.5px; line-height:1.25; }
    .readings-card{ padding:18px 16px 20px; }
    .readings-card .section-heading{ margin-bottom:12px; }
    .rhead .rcite{ display:block; margin:1px 0 0; }
    .rtext{ font-size:14.5px; line-height:1.55; text-align:left; }
    .edit-card{ padding:0; }
    .edit-card > summary{ padding:16px 17px; }
    .edit-card .edit{ padding:8px 17px 17px; }
    .music-head{ padding:15px 16px 12px; }
    .music-head h2{ font-size:21px; }
    .music-head p{ font-size:11.5px; }
    .music-view-row{ grid-template-columns:112px minmax(0,1fr); gap:10px; padding:10px 16px; }
    .music-part-label{ font-size:10px; }
    .music-choice{ font-size:13.5px; }
    .music-edit-row{ padding:12px 16px 14px; }
    .music-fields{ grid-template-columns:1fr; gap:7px; }
    .music-fields input{ height:44px; font-size:16px; }
    .editor-help{ padding:9px 16px; }
    .sync-status{ font-size:10.5px; }
    .login-form{ padding:20px; }
    .login-actions{ display:grid; grid-template-columns:1fr 1fr; }
  }
</style></head>
<body>
<div class="parish-bar"><div class="parish-bar-inner"><a class="parish-home" href="https://henrik.katolinen.fi/en/masses-at-the-church-of-saint-james-the-apostle/" target="_blank" rel="noopener" aria-label="Visit the St James the Apostle church webpage">St James the Apostle ↗</a><div class="parish-bar-actions"><span>Church of St. James the Apostle</span><button class="install-app" id="installApp" hidden>Install</button><button class="auth-button" id="authButton">Sign in</button></div></div></div>
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
      <div class="date-slot"><span class="date-display" id="dateDisplay" aria-hidden="true"></span><input type="date" id="date"></div>
      <button class="nav" id="next" title="Following Sunday" aria-label="Following Sunday"><span class="nav-desktop">Next ›</span><span class="nav-mobile" aria-hidden="true">›</span></button>
      <button class="nav" id="today">Jump to upcoming Sunday</button>
    </div>
    <div class="resolved" id="resolved"></div>
    <div class="warn" id="warn" style="display:none"></div>

    <div class="actions">
      <button class="primary" id="printMusic">Print music sheet</button>
      <button id="printMusicReadings">Print music + readings</button>
    </div>
    <div class="reading-summary" id="readingSummary"></div>
  </div>

  <section class="card music-card" aria-labelledby="musicTitle">
    <div class="music-head">
      <div>
        <div class="eyebrow">Live plan</div>
        <h2 id="musicTitle">Music choices</h2>
        <p id="musicIntro">Selections for this Sunday appear here as they are chosen.</p>
      </div>
      <span class="sync-status" id="syncStatus" role="status">Connecting…</span>
    </div>
    <div class="editor-help" id="editorHelp" hidden>Changes save automatically and are immediately visible to everyone.</div>
    <div class="music-list" id="musicList"></div>
  </section>

  <section class="card readings-card" id="fullReadings" aria-labelledby="readingsTitle">
    <div class="section-heading">
      <div>
        <div class="eyebrow">Readings</div>
        <h2 id="readingsTitle">Full texts</h2>
        <p id="readingsIntro"></p>
      </div>
    </div>
    <div id="readingTexts"></div>
  </section>

  <details class="card edit-card">
    <summary>
      <span><strong>Adjust liturgical day or readings</strong><small>Only needed when the parish readings differ from the lectionary.</small></span>
      <span class="summary-action">Edit</span>
    </summary>
    <div>
      <div class="edit">
        <label for="e_day">Liturgical day (editable)</label>
        <input id="e_day" type="text">
        <label for="e_first">First Reading</label><input id="e_first" type="text">
        <label for="e_psalm">Responsorial Psalm</label><input id="e_psalm" type="text">
        <label for="e_second">Second Reading</label><input id="e_second" type="text">
        <label for="e_gospel">Gospel</label><input id="e_gospel" type="text">
        <p class="editnote">These are auto-filled from the lectionary. Edit any field to override — the priest's choice wins; the full texts above update as you type. <a href="#" id="reset">Reset to computed</a>.</p>
      </div>
    </div>
  </details>
  <div class="foot">Calendar: Catholic Church in Finland (Diocese of Helsinki) — Epiphany on 6 Jan, St Henry, All Souls handled. Sunday cycles A–C <span id="range"></span>, readings from the Order of Readings for Mass. Always confirm against your parish Ordo; edit any field to override.</div>
</div>

<dialog class="login-dialog" id="loginDialog">
  <form class="login-form" id="loginForm">
    <h2>Editor sign in</h2>
    <p>Sign in to edit music choices. Your session stays signed in on this device.</p>
    <label for="loginEmail">Email</label>
    <input id="loginEmail" name="email" type="email" autocomplete="username" required>
    <label for="loginPassword">Password</label>
    <input id="loginPassword" name="password" type="password" autocomplete="current-password" required>
    <p class="login-error" id="loginError" role="alert"></p>
    <div class="login-actions">
      <button type="button" id="loginCancel">Cancel</button>
      <button class="primary" type="submit" id="loginSubmit">Sign in</button>
    </div>
  </form>
</dialog>

<script>
const SUNDAYS = ${SUNDAYS};
const PARTS = ${PARTS_JSON};
const PARTS2 = ${PARTS2_JSON};
const READINGS = ${READINGS_JSON};
const MUSIC_PARTS = [
  {key:"entrance",token:"ENTRANCE",label:"Entrance / Processional Hymn",note:""},
  {key:"kyrie",token:"KYRIE",label:"Kyrie — Lord, Have Mercy",note:""},
  {key:"gloria",token:"GLORIA",label:"Gloria — Glory to God",note:"(omitted in Advent & Lent)"},
  {key:"psalm",token:"PSALM_MUSIC",label:"Responsorial Psalm",note:""},
  {key:"acclamation",token:"ACCLAMATION",label:"Gospel Acclamation — Alleluia",note:"(Lenten acclamation in Lent)"},
  {key:"offertory",token:"OFFERTORY",label:"Preparation of the Gifts / Offertory",note:""},
  {key:"sanctus",token:"SANCTUS",label:"Sanctus — Holy, Holy, Holy",note:""},
  {key:"memorial",token:"MEMORIAL",label:"Memorial Acclamation — Mystery of Faith",note:""},
  {key:"amen",token:"AMEN",label:"Great Amen",note:""},
  {key:"lordPrayer",token:"LORD_PRAYER",label:"The Lord's Prayer — Our Father",note:"(if sung)"},
  {key:"agnus",token:"AGNUS",label:"Agnus Dei — Lamb of God",note:""},
  {key:"communion",token:"COMMUNION",label:"Communion Hymn 1",note:""},
  {key:"communion2",token:"COMMUNION_2",label:"Communion Hymn 2",note:""},
  {key:"recessional",token:"RECESSIONAL",label:"Recessional / Closing Hymn",note:""},
];
const byDate = {}; SUNDAYS.forEach((s,i)=>byDate[s.d]=i);
const cycleName = c => "Year " + c;
function fmtLong(iso){ const d=new Date(iso+"T12:00:00Z"); return d.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}); }
function fmtPicker(iso){ const d=new Date(iso+"T12:00:00Z"); return d.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"}); }
function esc(s){ return (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

let curIdx = 0;  // index into SUNDAYS
let override = {}; // {day,first,psalm,second,gospel}
let musicChoices = {};
let planStore = null;
let stopPlanSubscription = null;
let stopAuthSubscription = null;
let isEditor = false;
let signedIn = false;
let saveTimers = {};

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
function choiceFor(key){
  const value=musicChoices[key] || {};
  return {song:value.song || "", youtubeUrl:value.youtubeUrl || ""};
}
function safeYoutubeUrl(value){
  if(!value) return "";
  try{
    const url=new URL(value);
    const host=url.hostname.toLowerCase().replace(/^www\\./,"");
    return url.protocol==="https:" && (host==="youtube.com" || host.endsWith(".youtube.com") || host==="youtu.be") ? url.href : "";
  }catch(error){ return ""; }
}
function musicLabel(part){
  return esc(part.label)+(part.note?'<span class="music-part-note">'+esc(part.note)+'</span>':'');
}
function renderMusicPlan(){
  editorHelp.hidden=!isEditor;
  musicIntro.textContent=isEditor ? "Enter a song title and, optionally, a YouTube practice link." : "Selections for this Sunday appear here as they are chosen.";
  if(isEditor){
    if(musicList.dataset.mode!=="edit"){
      musicList.innerHTML=MUSIC_PARTS.map(part=>{
        const choice=choiceFor(part.key);
        return '<div class="music-edit-row"><label class="music-part-label" for="song_'+part.key+'">'+musicLabel(part)+'</label>'
          +'<div class="music-fields"><input id="song_'+part.key+'" data-part="'+part.key+'" data-field="song" type="text" value="'+esc(choice.song)+'" placeholder="Song title">'
          +'<input id="youtube_'+part.key+'" data-part="'+part.key+'" data-field="youtubeUrl" type="url" inputmode="url" value="'+esc(choice.youtubeUrl)+'" placeholder="YouTube link (optional)" aria-label="'+esc(part.label)+' YouTube link"></div></div>';
      }).join("");
      musicList.dataset.mode="edit";
    }else{
      musicList.querySelectorAll("input[data-part]").forEach(input=>{
        if(input===document.activeElement) return;
        const choice=choiceFor(input.dataset.part);
        const value=choice[input.dataset.field] || "";
        if(input.value!==value) input.value=value;
      });
    }
  }else{
    musicList.innerHTML=MUSIC_PARTS.map(part=>{
      const choice=choiceFor(part.key);
      const link=safeYoutubeUrl(choice.youtubeUrl);
      return '<div class="music-view-row"><div class="music-part-label">'+musicLabel(part)+'</div><div class="music-choice">'
        +(choice.song?esc(choice.song):'<span class="music-empty">Not yet chosen</span>')
        +(link?'<br><a class="listen-link" href="'+esc(link)+'" target="_blank" rel="noopener">Listen / practise ↗</a>':'')+'</div></div>';
    }).join("");
    musicList.dataset.mode="view";
  }
}
function renderFullReadings(){
  const v = vals();
  readingsIntro.textContent=v.day+" · "+v.meta;
  const blk = (id,label,cite,text) => '<article class="rblock reading-anchor" id="'+id+'"><div class="rhead">'+esc(label)+'<span class="rcite">'+esc(cite)+'</span></div><div class="rtext">'+(esc(text)||'<em>(see citation)</em>')+'</div></article>';
  readingTexts.innerHTML =
    blk("reading-first","First Reading",v.first,textFor(v.first))
    + blk("reading-psalm","Responsorial Psalm",v.psalm,textFor(v.psalm)||"(sung — see citation)")
    + blk("reading-second","Second Reading",v.second,textFor(v.second))
    + blk("reading-gospel","Gospel",v.gospel,textFor(v.gospel))
    + '<div class="rpcaveat">Scripture: World English Bible (public domain). Verse numbering — especially in the Psalms — can differ slightly from the lectionary.</div>';
}
function renderResolved(){
  const s = current();
  resolved.innerHTML = '<span class="selected-date">'+fmtLong(s.d)+'</span>'
    + '<span class="selected-day">'+esc(s.n)+'</span>'
    + '<span class="selected-meta">'+esc(s.s)+' · '+cycleName(s.c)+'</span>';
}
function renderReadingSummary(){
  const v=vals();
  const readings=[
    ["First Reading",v.first,"reading-first"],
    ["Responsorial Psalm",v.psalm,"reading-psalm"],
    ["Second Reading",v.second,"reading-second"],
    ["Gospel",v.gospel,"reading-gospel"],
  ];
  readingSummary.innerHTML='<div class="reading-summary-title">Readings for this Sunday</div><div class="reading-grid">'
    + readings.map(r=>'<a class="reading-item" href="#'+r[2]+'"><span class="reading-label">'+esc(r[0])+'</span><span class="reading-cite">'+(esc(r[1])||"—")+'</span></a>').join('')
    + '</div>';
}
function syncDateControl(){
  date.value=current().d;
  dateDisplay.textContent=fmtPicker(current().d);
}
function refresh(){
  syncDateControl(); renderResolved(); renderReadingSummary(); renderEditors(); renderFullReadings();
  prev.disabled=curIdx===0; next.disabled=curIdx===SUNDAYS.length-1;
  today.hidden=curIdx===nextSundayIdx();
  const v = vals();
  if(!v.gospel && !v.first){ warn.style.display="block"; warn.textContent="This day (e.g. St Henry, patron of Finland) has proper readings that aren't in the dataset — please type them into the fields below from your parish Ordo."; }
  else if(warn.textContent.indexOf("outside the computed")<0){ warn.style.display="none"; }
}

function setSyncStatus(text,state){
  syncStatus.textContent=text;
  syncStatus.dataset.state=state || "";
}
function subscribeToCurrentPlan(){
  if(stopPlanSubscription){ stopPlanSubscription(); stopPlanSubscription=null; }
  musicChoices={};
  renderMusicPlan();
  if(!planStore){ setSyncStatus("Connecting…",""); return; }
  setSyncStatus("Loading…","");
  stopPlanSubscription=planStore.subscribePlan(current().d,(choices,meta)=>{
    musicChoices=choices || {};
    renderMusicPlan();
    setSyncStatus(meta && meta.offline ? "Offline — showing saved copy" : "Up to date",meta && meta.offline ? "" : "saved");
  },error=>{
    console.error(error);
    setSyncStatus("Could not load plan","error");
  });
}
function connectPlanStore(store){
  planStore=store;
  if(stopAuthSubscription) stopAuthSubscription();
  stopAuthSubscription=store.subscribeAuth(auth=>{
    isEditor=!!auth.isEditor;
    signedIn=!!auth.user;
    authButton.textContent=signedIn ? "Sign out" : "Sign in";
    renderMusicPlan();
  });
  subscribeToCurrentPlan();
}
window.massPlanApp={connect:connectPlanStore};

musicList.addEventListener("input",event=>{
  const input=event.target.closest("input[data-part]");
  if(!input || !isEditor) return;
  const key=input.dataset.part;
  const field=input.dataset.field;
  const sunday=current().d;
  const choice=choiceFor(key);
  choice[field]=input.value;
  musicChoices[key]=choice;
  clearTimeout(saveTimers[key]);
  setSyncStatus("Saving…","");
  saveTimers[key]=setTimeout(async ()=>{
    try{
      await planStore.savePart(sunday,key,choice);
      setSyncStatus(navigator.onLine ? "Saved" : "Saved offline","saved");
    }catch(error){
      console.error(error);
      setSyncStatus("Save failed","error");
    }
  },500);
});
authButton.addEventListener("click",async ()=>{
  if(!planStore){ setSyncStatus("Editor sign-in unavailable","error"); return; }
  try{
    if(signedIn) await planStore.signOut();
    else{
      loginError.textContent="";
      loginDialog.showModal();
      setTimeout(()=>loginEmail.focus(),0);
    }
  }catch(error){
    console.error(error);
    setSyncStatus("Sign-in failed","error");
  }
});
loginCancel.addEventListener("click",()=>loginDialog.close());
loginDialog.addEventListener("click",event=>{
  if(event.target===loginDialog) loginDialog.close();
});
loginForm.addEventListener("submit",async event=>{
  event.preventDefault();
  loginError.textContent="";
  loginSubmit.disabled=true;
  loginSubmit.textContent="Signing in…";
  try{
    await planStore.signIn(loginEmail.value.trim(),loginPassword.value);
    loginPassword.value="";
    loginDialog.close();
  }catch(error){
    console.error(error);
    loginError.textContent="Sign-in failed. Check the email and password.";
  }finally{
    loginSubmit.disabled=false;
    loginSubmit.textContent="Sign in";
  }
});

// pick nearest Sunday to a chosen date
function goToDate(iso){
  if(byDate[iso]!==undefined){ curIdx=byDate[iso]; override={}; warn.style.display="none"; refresh(); subscribeToCurrentPlan(); return; }
  // find nearest Sunday record
  let best=-1,bestDiff=1e15; const t=new Date(iso+"T12:00:00Z").getTime();
  SUNDAYS.forEach((s,i)=>{ const diff=Math.abs(new Date(s.d+"T12:00:00Z").getTime()-t); if(diff<bestDiff){bestDiff=diff;best=i;} });
  if(best<0 || bestDiff>1000*3600*24*366){ warn.style.display="block"; warn.textContent="That date is outside the computed range (2025–2075). You can still type the readings in manually below."; }
  else warn.style.display="none";
  curIdx=best; override={}; refresh(); subscribeToCurrentPlan();
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
function downloadWord(withRd){
  const v=vals(); const dec=new TextDecoder();
  const src = withRd ? PARTS2 : PARTS;
  let docXml=dec.decode(b64ToBytes(src["word/document.xml"]));
  const repl={ "@@DAY@@":v.day, "@@META@@":v.meta, "@@FIRST@@":v.first, "@@PSALM@@":v.psalm, "@@SECOND@@":(v.second||"—"), "@@GOSPEL@@":v.gospel };
  MUSIC_PARTS.forEach(part=>{ repl["@@MUSIC_"+part.token+"@@"]=choiceFor(part.key).song; });
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
  const suffix=withRd ? "_with_readings" : "";
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="StJames_6pm_Mass_"+v.date+suffix+".docx";
  document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(()=>URL.revokeObjectURL(a.href),4000);
}

// wire up
function nextSundayIdx(){ const today=new Date().toISOString().slice(0,10); let i=SUNDAYS.findIndex(s=>s.d>=today); return i<0?SUNDAYS.length-1:i; }
[["e_day","day"],["e_first","first"],["e_psalm","psalm"],["e_second","second"],["e_gospel","gospel"]].forEach(([id,key])=>{
  document.getElementById(id).addEventListener("input", e=>{ override[key]=e.target.value; renderReadingSummary(); renderFullReadings(); });
});
document.getElementById("reset").addEventListener("click", e=>{ e.preventDefault(); override={}; refresh(); });
prev.addEventListener("click", ()=>{ if(curIdx>0){curIdx--; override={}; refresh(); subscribeToCurrentPlan(); } });
next.addEventListener("click", ()=>{ if(curIdx<SUNDAYS.length-1){curIdx++; override={}; refresh(); subscribeToCurrentPlan(); } });
document.getElementById("today").addEventListener("click", ()=>{ curIdx=nextSundayIdx(); override={}; refresh(); subscribeToCurrentPlan(); });
date.addEventListener("change", ()=>{ if(date.value) goToDate(date.value); else syncDateControl(); });
printMusic.addEventListener("click", ()=>downloadWord(false));
printMusicReadings.addEventListener("click", ()=>downloadWord(true));
document.getElementById("range").textContent = "("+SUNDAYS[0].d.slice(0,4)+"–"+SUNDAYS[SUNDAYS.length-1].d.slice(0,4)+")";

curIdx=nextSundayIdx(); refresh(); renderMusicPlan();

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
</script>
<script src="./supabase-config.js"></script>
<script type="module" src="./supabase-client.js"></script>
</body></html>`;

fs.writeFileSync(path.join(ROOT, "StJames_Mass_Planner.html"), html);
fs.writeFileSync(path.join(ROOT, "index.html"), html);
console.log("written", Math.round(html.length/1024), "KB");
