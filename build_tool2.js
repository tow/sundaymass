const fs = require("fs");
const path = require("path");
const ROOT = __dirname;
const CALENDAR = fs.readFileSync(path.join(ROOT, "sunday-calendar.json"), "utf8");
const SUNDAY_LECTIONARY = fs.readFileSync(path.join(ROOT, "sunday-lectionary.json"), "utf8");
const CELEBRATIONS = fs.readFileSync(path.join(ROOT, "celebrations.json"), "utf8");
const COMMONS = fs.readFileSync(path.join(ROOT, "commons.json"), "utf8");
const READINGS_JSON = fs.readFileSync(path.join(ROOT, "readings_text.json"), "utf8");
const LECTIONARY_CATALOG_JS = fs.readFileSync(path.join(ROOT, "lectionary-catalog.js"), "utf8");

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
  [hidden]{ display:none!important; }
  .sr-only{ position:absolute!important; width:1px!important; height:1px!important; padding:0!important; margin:-1px!important; overflow:hidden!important; clip:rect(0,0,0,0)!important; white-space:nowrap!important; border:0!important; }
  body{ margin:0; font-family:"Libre Franklin",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; color:var(--ink); background:var(--canvas); padding:0 22px 40px; }
  .parish-bar{ margin:0 -22px; padding:11px 22px; background:var(--accent); color:#fff; }
  .parish-bar-inner{ min-height:26px; max-width:880px; margin:0 auto; display:flex; align-items:center; justify-content:space-between; gap:20px; font-size:12px; letter-spacing:.15px; }
  .parish-home{ flex:none; color:#fff; text-decoration:none; font-weight:650; white-space:nowrap; }
  .parish-home:hover,.parish-home:focus-visible{ text-decoration:underline; text-underline-offset:3px; }
  .bar-mobile,.mobile-title,.nav-mobile{ display:none; }
  .parish-bar-actions{ display:flex; flex:none; align-items:center; gap:12px; }
  .install-app{ flex:none; min-height:0; padding:4px 8px; border-color:rgba(255,255,255,.7); color:#fff; background:transparent; font-size:11px; white-space:nowrap; }
  .install-app:hover{ background:rgba(255,255,255,.12); }
  .help-button{ display:inline-flex; align-items:center; justify-content:center; min-height:0; padding:5px 9px; border:1px solid rgba(255,255,255,.72); border-radius:2px; color:#fff; background:transparent; font-size:11px; font-weight:650; line-height:1; text-decoration:none; white-space:nowrap; }
  .help-button:hover{ background:rgba(255,255,255,.12); }
  .wrap{ max-width:880px; margin:0 auto; }
  header.app{ padding:34px 2px 22px; }
  header.app h1{ color:var(--ink); font-family:"Libre Caslon Text",Georgia,"Times New Roman",serif; font-size:34px; font-weight:400; line-height:1.18; margin:0 0 6px; letter-spacing:-.4px; }
  header.app p{ color:var(--muted); margin:0; font-size:14px; }
  .church-link{ display:inline-block; margin-top:8px; color:var(--accent); font-size:12px; font-weight:650; text-underline-offset:3px; }
  .app-meta{ margin-top:8px; color:var(--muted); font-size:11px; }
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
  .reading-editor-card{ padding:0; overflow:hidden; }
  .reading-editor-head{ display:flex; align-items:flex-start; justify-content:space-between; gap:16px; padding:20px 22px 15px; border-bottom:1px solid #eee6d5; }
  .reading-editor-head h2{ margin:0; font-family:"Libre Caslon Text",Georgia,"Times New Roman",serif; font-size:23px; font-weight:400; line-height:1.2; }
  .reading-editor-head p{ margin:4px 0 0; color:var(--muted); font-size:12.5px; line-height:1.4; }
  .reading-editor-list{ margin:0; }
  .reading-editor-row{ display:grid; grid-template-columns:minmax(0,1fr) auto; gap:12px; align-items:center; padding:13px 22px; border-bottom:1px solid #eee6d5; }
  .reading-editor-row:last-child{ border-bottom:none; }
  .reading-editor-label{ display:flex; align-items:center; gap:7px; margin-bottom:3px; color:var(--muted); font-size:10.5px; font-weight:750; letter-spacing:.3px; text-transform:uppercase; }
  .reading-editor-cite{ font-family:"Libre Caslon Text",Georgia,"Times New Roman",serif; font-size:15px; line-height:1.3; overflow-wrap:anywhere; }
  .reading-editor-actions{ display:flex; gap:7px; }
  .reading-editor-actions button{ min-height:38px; padding:7px 10px; font-size:12px; }
  .reading-status-badge{ display:inline-block; padding:2px 6px; border-radius:999px; color:#38704b; background:#e5f0e7; font-family:"Libre Franklin",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; font-size:9px; font-weight:750; letter-spacing:.2px; line-height:1.3; text-transform:uppercase; }
  .reading-status-badge.changed{ color:#86510d; background:#f5e7c8; }
  .reading-editor-footer{ display:flex; align-items:center; justify-content:flex-end; padding:11px 22px; background:#fcfaf6; border-top:1px solid #eee6d5; }
  .reading-editor-footer button{ min-height:38px; padding:7px 10px; font-size:12px; }
  .reading-adjusted-note{ margin-left:7px; color:#86510d; font-family:"Libre Franklin",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; font-size:9px; font-weight:750; letter-spacing:.25px; text-transform:uppercase; white-space:nowrap; }
  .reading-item.changed{ box-shadow:inset 3px 0 #c79238; }
  .reading-dialog{ width:min(650px,calc(100% - 28px)); max-height:min(760px,calc(100dvh - 28px)); padding:0; border:1px solid var(--line); border-radius:5px; color:var(--ink); background:#fff; box-shadow:0 18px 55px rgba(0,31,45,.24); }
  .reading-dialog::backdrop{ background:rgba(0,31,45,.48); }
  .reading-dialog-form{ display:flex; flex-direction:column; max-height:inherit; }
  .reading-dialog-head{ display:flex; align-items:flex-start; justify-content:space-between; gap:14px; padding:20px 22px 14px; border-bottom:1px solid #eee6d5; }
  .reading-dialog-head h2{ margin:0; font-family:"Libre Caslon Text",Georgia,"Times New Roman",serif; font-size:25px; font-weight:400; }
  .reading-dialog-head p{ margin:4px 0 0; color:var(--muted); font-size:12.5px; line-height:1.4; }
  .reading-dialog-close{ min-width:40px; min-height:40px; padding:3px; border-color:transparent; font-size:24px; line-height:1; }
  .reading-dialog-body{ padding:18px 22px; overflow:auto; overscroll-behavior:contain; }
  .reading-dialog fieldset{ min-width:0; margin:0 0 18px; padding:0; border:0; }
  .reading-dialog legend,.reading-search label{ display:block; margin:0 0 7px; color:var(--accent); font-size:11px; font-weight:750; letter-spacing:.4px; text-transform:uppercase; }
  .suggested-readings{ display:grid; gap:7px; }
  .suggested-reading{ position:relative; display:grid; grid-template-columns:auto minmax(0,1fr); gap:9px; align-items:start; min-height:44px; padding:10px 11px; border:1px solid #c9c0b1; border-radius:6px; cursor:pointer; }
  .suggested-reading:has(input:checked){ border-color:var(--accent); background:#f4f7f7; box-shadow:inset 0 0 0 1px var(--accent); }
  .suggested-reading input{ margin:2px 0 0; }
  .suggested-reading strong{ display:block; font-size:14px; line-height:1.3; }
  .suggested-reading small{ display:block; margin-top:2px; color:var(--muted); font-size:11px; line-height:1.35; }
  .reading-search input[type=text]{ width:100%; height:44px; padding:9px 11px; border:1px solid #c9c0b1; border-radius:7px; color:var(--ink); font-size:16px; }
  .reading-search-help{ margin:6px 0 0; color:var(--muted); font-size:11px; line-height:1.4; }
  .reading-validation{ min-height:19px; margin:7px 0 0; color:var(--muted); font-size:12px; line-height:1.4; }
  .reading-validation.error{ color:#9a3b22; }
  .reading-validation.valid{ color:#38704b; }
  .reading-text-preview{ margin-top:12px; padding:12px 13px; border-left:3px solid var(--accent); background:#fcfaf6; color:var(--ink); font-size:12.5px; line-height:1.5; }
  .reading-text-preview strong{ display:block; margin-bottom:4px; color:var(--accent); font-size:10px; letter-spacing:.35px; text-transform:uppercase; }
  .ordo-confirm{ display:flex; gap:9px; align-items:flex-start; margin:13px 0 0; padding:10px 11px; border:1px solid #e4cfaa; border-radius:6px; background:#fff9ec; font-size:12px; line-height:1.4; }
  .ordo-confirm input{ flex:none; margin-top:2px; }
  .reading-dialog-actions{ display:grid; grid-template-columns:1fr 1fr; gap:8px; padding:13px 22px calc(13px + env(safe-area-inset-bottom)); border-top:1px solid #eee6d5; background:#fff; }
  .liturgical-edit-launch{ display:flex; justify-content:center; margin:4px 0 20px; }
  .liturgical-edit-launch button{ min-height:40px; padding:7px 12px; border-color:#9e9689; color:var(--muted); background:transparent; font-size:12px; }
  .celebration-current{ padding:15px 16px; border-left:4px solid var(--accent); background:var(--canvas); }
  .celebration-current.changed{ border-left-color:#c79238; }
  .celebration-current-label{ display:flex; align-items:center; gap:7px; margin-bottom:4px; color:var(--muted); font-size:10.5px; font-weight:750; letter-spacing:.35px; text-transform:uppercase; }
  .celebration-current-name{ font-family:"Libre Caslon Text",Georgia,"Times New Roman",serif; font-size:20px; line-height:1.25; }
  .celebration-current-meta{ margin-top:4px; color:var(--muted); font-size:11.5px; line-height:1.4; }
  .celebration-actions{ display:grid; grid-template-columns:1fr auto; gap:8px; margin-top:11px; }
  .celebration-actions button{ min-height:42px; padding:8px 10px; font-size:12.5px; }
  .fine-tune-head{ margin:24px 0 8px; }
  .fine-tune-head h3{ margin:0; font-family:"Libre Caslon Text",Georgia,"Times New Roman",serif; font-size:20px; font-weight:400; }
  .fine-tune-head p{ margin:4px 0 0; color:var(--muted); font-size:11.5px; line-height:1.4; }
  .liturgical-dialog-list{ border:1px solid #eee6d5; }
  .celebration-search label{ display:block; margin:0 0 7px; color:var(--accent); font-size:11px; font-weight:750; letter-spacing:.4px; text-transform:uppercase; }
  .celebration-search input{ width:100%; height:44px; padding:9px 11px; border:1px solid #c9c0b1; border-radius:7px; color:var(--ink); font-size:16px; }
  .celebration-results-heading{ margin:18px 0 7px; color:var(--accent); font-size:11px; font-weight:750; letter-spacing:.4px; text-transform:uppercase; }
  .celebration-results{ display:grid; gap:7px; }
  .celebration-result{ width:100%; min-height:0; padding:10px 11px; border-color:#c9c0b1; border-radius:6px; text-align:left; }
  .celebration-result strong{ display:block; color:var(--ink); font-family:"Libre Caslon Text",Georgia,"Times New Roman",serif; font-size:15px; line-height:1.3; }
  .celebration-result small{ display:block; margin-top:3px; color:var(--muted); font-size:10.5px; font-weight:400; line-height:1.35; }
  .celebration-result.selected{ border-color:var(--accent); background:#f4f7f7; box-shadow:inset 0 0 0 1px var(--accent); }
  .celebration-preview{ margin-top:15px; padding:13px; border:1px solid var(--line); background:#fcfaf6; }
  .celebration-preview h3{ margin:0 0 4px; font-family:"Libre Caslon Text",Georgia,"Times New Roman",serif; font-size:20px; font-weight:400; }
  .celebration-preview p{ margin:0 0 10px; color:var(--muted); font-size:11px; }
  .celebration-preview-grid{ display:grid; grid-template-columns:125px minmax(0,1fr); gap:6px 10px; font-size:12px; line-height:1.35; }
  .celebration-preview-grid dt{ color:var(--muted); font-weight:700; }
  .celebration-preview-grid dd{ margin:0; overflow-wrap:anywhere; }
  .celebration-preview-grid select{ width:100%; min-height:40px; padding:7px 9px; border:1px solid #c9c0b1; border-radius:5px; color:var(--ink); background:#fff; font-size:16px; }
  .celebration-options-note{ margin-top:10px!important; padding-top:9px; border-top:1px solid #e5ddcf; line-height:1.4; }
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
  .listen-link{ display:block; width:max-content; max-width:100%; margin-top:4px; color:var(--accent); font-size:11.5px; font-weight:700; text-underline-offset:2px; }
  .music-attribution{ display:block; margin-top:5px; color:var(--muted); font-size:11.5px; font-weight:400; line-height:1.4; }
  .copyright-warning{ color:#96541a; }
  .music-edit-row{ padding:14px 22px 16px; border-bottom:1px solid #eee6d5; }
  .music-edit-row:last-child{ border-bottom:none; }
  .music-edit-row .music-part-label{ display:block; margin-bottom:7px; color:var(--ink); }
  .music-fields{ display:grid; grid-template-columns:minmax(0,1.4fr) minmax(0,1fr); gap:8px; }
  .music-fields input{ width:100%; min-width:0; height:42px; padding:8px 10px; border:1px solid #c9c0b1; border-radius:7px; color:var(--ink); background:#fff; font-size:15px; }
  .music-fields input::placeholder{ color:#958d81; }
  .copyright-details{ margin-top:8px; border:1px solid #ddd4c5; border-radius:7px; background:#fcfaf6; }
  .copyright-details > summary{ display:flex; align-items:center; justify-content:space-between; gap:12px; min-height:38px; padding:7px 10px; color:var(--accent); cursor:pointer; font-size:12px; font-weight:700; list-style:none; }
  .copyright-details > summary::-webkit-details-marker{ display:none; }
  .copyright-details > summary:before{ content:"›"; flex:none; font-size:18px; line-height:1; transition:transform .15s ease; }
  .copyright-details[open] > summary:before{ transform:rotate(90deg); }
  .copyright-status{ margin-left:auto; padding:2px 7px; border-radius:999px; color:#96541a; background:#f7e8d5; font-size:10px; font-weight:750; }
  .copyright-status.complete{ color:#38704b; background:#e5f0e7; }
  .copyright-fields{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; padding:0 10px 10px; }
  .copyright-field{ min-width:0; }
  .copyright-field label{ display:block; margin:0 0 3px; color:var(--muted); font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.25px; }
  .copyright-field input{ width:100%; min-width:0; height:40px; padding:7px 9px; border:1px solid #c9c0b1; border-radius:6px; color:var(--ink); background:#fff; font-size:14px; }
  .copyright-help{ grid-column:1 / -1; margin:0; color:var(--muted); font-size:10.5px; line-height:1.35; }
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
    .parish-bar-inner{ min-height:34px; display:flex; gap:8px; font-size:11px; }
    .parish-bar-actions{ gap:6px; }
    .parish-bar-actions > span{ display:none; }
    .bar-desktop,.desktop-title,.nav-desktop{ display:none; }
    .bar-mobile,.mobile-title,.nav-mobile{ display:inline; }
    .install-app,.auth-button,.help-button{ min-height:34px; padding:5px 7px; font-size:10.5px; line-height:1; }
    header.app{ padding:14px 4px 11px; }
    header.app h1{ font-size:25px; line-height:1.1; margin:0; }
    header.app p,.church-link{ display:none; }
    .app-meta{ margin-top:6px; font-size:10.5px; }
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
    .reading-editor-head{ padding:15px 16px 12px; }
    .reading-editor-head h2{ font-size:21px; }
    .reading-editor-head p{ font-size:11.5px; }
    .reading-editor-row{ grid-template-columns:minmax(0,1fr); gap:9px; padding:12px 16px; }
    .reading-editor-actions{ display:grid; grid-template-columns:1fr auto; }
    .reading-editor-actions button{ min-height:42px; }
    .reading-editor-footer{ padding:10px 16px; }
    .reading-dialog{ inset:0; width:100%; height:100dvh; max-width:none; max-height:none; margin:0; border:0; border-radius:0; }
    .reading-dialog-form{ height:100%; max-height:none; }
    .reading-dialog-head{ padding:15px 16px 12px; }
    .reading-dialog-head h2{ font-size:22px; }
    .reading-dialog-body{ padding:14px 16px; }
    .reading-dialog-actions{ padding:10px 16px calc(10px + env(safe-area-inset-bottom)); }
    .liturgical-edit-launch{ margin-bottom:12px; }
    .celebration-preview-grid{ grid-template-columns:100px minmax(0,1fr); }
    .music-head{ padding:15px 16px 12px; }
    .music-head h2{ font-size:21px; }
    .music-head p{ font-size:11.5px; }
    .music-view-row{ grid-template-columns:112px minmax(0,1fr); gap:10px; padding:10px 16px; }
    .music-part-label{ font-size:10px; }
    .music-choice{ font-size:13.5px; }
    .music-edit-row{ padding:12px 16px 14px; }
    .music-fields{ grid-template-columns:1fr; gap:7px; }
    .music-fields input{ height:44px; font-size:16px; }
    .copyright-fields{ grid-template-columns:1fr; gap:7px; }
    .copyright-field input{ height:44px; font-size:16px; }
    .copyright-help{ grid-column:1; }
    .editor-help{ padding:9px 16px; }
    .sync-status{ font-size:10.5px; }
    .login-form{ padding:20px; }
    .login-actions{ display:grid; grid-template-columns:1fr 1fr; }
  }
</style></head>
<body>
<div class="parish-bar"><div class="parish-bar-inner"><a class="parish-home" href="https://henrik.katolinen.fi/en/masses-at-the-church-of-saint-james-the-apostle/" target="_blank" rel="noopener" aria-label="Visit the St James the Apostle church webpage">St James the Apostle ↗</a><div class="parish-bar-actions"><span>Church of St. James the Apostle</span><a class="help-button" href="./about.html">Help</a><button class="install-app" id="installApp" hidden>Install</button><button class="auth-button" id="authButton">Sign in</button></div></div></div>
<div class="wrap">
  <header class="app">
    <h1><span class="desktop-title">St James the Apostle — 6pm Mass</span><span class="mobile-title">6pm Mass music planner</span></h1>
    <p>Create a music-planning sheet for any Sunday Mass.</p>
    <a class="church-link" href="https://henrik.katolinen.fi/en/masses-at-the-church-of-saint-james-the-apostle/" target="_blank" rel="noopener">Visit the church webpage ↗</a>
    <div class="app-meta">&copy; 2026 Datamediate Oy</div>
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

  <div class="liturgical-edit-launch" id="liturgicalEditLaunch" hidden>
    <button type="button" id="openLiturgicalEditor">Edit celebration or readings</button>
  </div>
</div>

<dialog class="reading-dialog" id="liturgicalDialog">
  <div class="reading-dialog-form">
    <div class="reading-dialog-head">
      <div>
        <div class="eyebrow">Rarely needed</div>
        <h2>Edit celebration or readings</h2>
        <p>Use another Mass as a complete set, or fine-tune an individual reading.</p>
      </div>
      <button class="reading-dialog-close" id="liturgicalDialogClose" type="button" aria-label="Close">×</button>
    </div>
    <div class="reading-dialog-body">
      <div class="celebration-current" id="celebrationCurrent"></div>
      <div class="celebration-actions">
        <button class="primary" type="button" id="chooseCelebration">Use another celebration</button>
        <button type="button" id="restoreCelebration" hidden>Restore Sunday</button>
      </div>
      <div class="fine-tune-head">
        <h3>Fine-tune individual readings</h3>
        <p>Only use this when one reading differs from the selected celebration.</p>
      </div>
      <div class="reading-editor-list liturgical-dialog-list" id="readingEditorList"></div>
      <div class="reading-editor-footer" id="readingEditorFooter" hidden>
        <button type="button" id="restoreAllReadings">Restore all individual readings</button>
      </div>
      <span class="sync-status" id="readingSaveStatus" role="status"></span>
    </div>
  </div>
</dialog>

<dialog class="reading-dialog" id="celebrationDialog">
  <form class="reading-dialog-form" id="celebrationForm">
    <div class="reading-dialog-head">
      <div>
        <div class="eyebrow">Use another Mass</div>
        <h2>Choose a celebration</h2>
        <p id="celebrationDialogContext"></p>
      </div>
      <button class="reading-dialog-close" id="celebrationDialogClose" type="button" aria-label="Close">×</button>
    </div>
    <div class="reading-dialog-body">
      <div class="celebration-search">
        <label for="celebrationSearch">Search the standard lectionary</label>
        <input id="celebrationSearch" type="search" autocomplete="off" placeholder="e.g. St James, Christmas, 25 July">
      </div>
      <div class="celebration-results-heading" id="celebrationResultsHeading">Nearby celebrations</div>
      <div class="celebration-results" id="celebrationResults"></div>
      <div class="celebration-preview" id="celebrationPreview" hidden></div>
    </div>
    <div class="reading-dialog-actions">
      <button type="button" id="celebrationCancel">Cancel</button>
      <button class="primary" type="submit" id="celebrationUse" disabled>Use this celebration</button>
    </div>
  </form>
</dialog>

<dialog class="reading-dialog" id="readingDialog">
  <form class="reading-dialog-form" id="readingForm">
    <div class="reading-dialog-head">
      <div>
        <div class="eyebrow">Change reading</div>
        <h2 id="readingDialogTitle"></h2>
        <p id="readingDialogContext"></p>
      </div>
      <button class="reading-dialog-close" id="readingDialogClose" type="button" aria-label="Close">×</button>
    </div>
    <div class="reading-dialog-body">
      <fieldset>
        <legend>Options for this celebration</legend>
        <div class="suggested-readings" id="readingSuggested"></div>
      </fieldset>
      <div class="reading-search">
        <label for="readingCitationInput">Another passage from the lectionary</label>
        <input id="readingCitationInput" type="text" list="readingCitationOptions" autocomplete="off" spellcheck="false" placeholder="Start typing a citation">
        <datalist id="readingCitationOptions"></datalist>
        <p class="reading-search-help" id="readingSearchHelp"></p>
        <p class="reading-validation" id="readingValidation" role="status"></p>
      </div>
      <div class="reading-text-preview" id="readingTextPreview" hidden></div>
      <label class="ordo-confirm" id="ordoConfirmWrap" hidden>
        <input id="ordoConfirm" type="checkbox">
        <span>I have checked this selection against the parish Ordo or with the celebrant.</span>
      </label>
    </div>
    <div class="reading-dialog-actions">
      <button type="button" id="readingCancel">Cancel</button>
      <button class="primary" type="submit" id="readingUse" disabled>Use reading</button>
    </div>
  </form>
</dialog>

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
${LECTIONARY_CATALOG_JS}
const CALENDAR = ${CALENDAR};
const SUNDAY_LECTIONARY = ${SUNDAY_LECTIONARY};
const CELEBRATIONS = ${CELEBRATIONS};
const COMMONS = ${COMMONS};
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
const lectionary=LectionaryCatalog.create({
  calendar:CALENDAR,
  sundayLectionary:SUNDAY_LECTIONARY,
  celebrations:CELEBRATIONS,
  commons:COMMONS,
  readings:READINGS,
});
const READING_SLOTS=lectionary.readingSlots;
const ROLE_CITATIONS=lectionary.roleCitations;
const CITATION_ROLES=lectionary.citationRoles;
const normalizedCitation=lectionary.normalizedCitation;
const citationAlternatives=lectionary.citationAlternatives;
const parseReadingCitation=lectionary.parseReadingCitation;
const dayDistance=lectionary.dayDistance;
const byDate = {}; CALENDAR.forEach((s,i)=>byDate[s.d]=i);
const cycleName = c => "Year " + c;
function fmtLong(iso){ const d=new Date(iso+"T12:00:00Z"); return d.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}); }
function fmtPicker(iso){ const d=new Date(iso+"T12:00:00Z"); return d.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"}); }
function esc(s){ return (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
let curIdx = 0;  // index into CALENDAR
let musicChoices = {};
let readingOverrides = {};
let celebrationOverride = null;
let planStore = null;
let stopPlanSubscription = null;
let stopAuthSubscription = null;
let isEditor = false;
let signedIn = false;
let saveTimers = {};
let editingReadingSlot = null;
let pendingReadingSelection = null;
let pendingCelebration = null;

function current(){ return CALENDAR[curIdx]; }
function baseCelebration(){
  const sunday=current();
  return celebrationOverride || lectionary.scheduledCelebration(sunday);
}
function vals(){
  const s = current();
  const celebration=baseCelebration();
  const citationFor=slot=>readingOverrides[slot.key]?.citation || celebration.readings?.[slot.key] || "";
  const baseMeta=celebrationOverride
    ? (celebration.rank || "Celebration")+" · normally "+fmtLong(celebration.sourceDate)
    : s.s+" · "+cycleName(s.c);
  return {
    day: celebration.name,
    meta: fmtLong(s.d) + "  ·  " + baseMeta,
    first: citationFor(READING_SLOTS[0]), psalm: citationFor(READING_SLOTS[1]),
    second: citationFor(READING_SLOTS[2]), gospel: citationFor(READING_SLOTS[3]),
    date: s.d,
  };
}
function choiceFor(key){
  const value=musicChoices[key] || {};
  return {
    song:value.song || "",
    youtubeUrl:value.youtubeUrl || "",
    authors:value.authors || "",
    copyrightOwner:value.copyrightOwner || "",
    copyrightYear:value.copyrightYear || "",
    source:value.source || "",
  };
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
function copyrightComplete(choice){
  if(!choice.song) return true;
  const publicDomain=/\\bpublic domain\\b/i.test(choice.copyrightOwner);
  return !!(choice.authors.trim() && choice.copyrightOwner.trim() && (choice.copyrightYear.trim() || publicDomain));
}
function attributionLine(choice){
  const items=[];
  if(choice.authors.trim()) items.push("Authors: "+choice.authors.trim());
  const publicDomain=/\\bpublic domain\\b/i.test(choice.copyrightOwner);
  const copyright=[choice.copyrightYear.trim(),choice.copyrightOwner.trim()].filter(Boolean).join(" ");
  if(copyright) items.push(publicDomain ? copyright : "© "+copyright);
  if(choice.source.trim()) items.push("Source: "+choice.source.trim());
  return items.join(" · ");
}
function copyrightFields(part,choice){
  const status=copyrightComplete(choice);
  const statusLabel=!choice.song ? "After choosing song" : (status ? "Complete" : "Incomplete");
  return '<details class="copyright-details"><summary><span>Copyright details</span><span class="copyright-status'+(status && choice.song?' complete':'')+'">'+statusLabel+'</span></summary>'
    +'<div class="copyright-fields">'
    +'<div class="copyright-field"><label for="authors_'+part.key+'">Author(s)</label><input id="authors_'+part.key+'" data-part="'+part.key+'" data-field="authors" type="text" value="'+esc(choice.authors)+'" placeholder="Composer, lyricist, translator"></div>'
    +'<div class="copyright-field"><label for="owner_'+part.key+'">Copyright owner / publisher</label><input id="owner_'+part.key+'" data-part="'+part.key+'" data-field="copyrightOwner" type="text" value="'+esc(choice.copyrightOwner)+'" placeholder="e.g. OCP or Public domain"></div>'
    +'<div class="copyright-field"><label for="year_'+part.key+'">Copyright year(s)</label><input id="year_'+part.key+'" data-part="'+part.key+'" data-field="copyrightYear" type="text" value="'+esc(choice.copyrightYear)+'" placeholder="e.g. 1975, 2016"></div>'
    +'<div class="copyright-field"><label for="source_'+part.key+'">Source (optional)</label><input id="source_'+part.key+'" data-part="'+part.key+'" data-field="source" type="text" value="'+esc(choice.source)+'" placeholder="Hymnal + number, publication or website"></div>'
    +'<p class="copyright-help">Source is optional. Leave the year blank only when the copyright owner is entered as “Public domain”.</p>'
    +'</div></details>';
}
function renderMusicPlan(){
  editorHelp.hidden=!isEditor;
  musicIntro.textContent=isEditor ? "Choose each song, then record the copyright details needed when its lyrics are projected." : "Selections for this Sunday appear here as they are chosen.";
  if(isEditor){
    if(musicList.dataset.mode!=="edit"){
      musicList.innerHTML=MUSIC_PARTS.map(part=>{
        const choice=choiceFor(part.key);
        return '<div class="music-edit-row"><label class="music-part-label" for="song_'+part.key+'">'+musicLabel(part)+'</label>'
          +'<div class="music-fields"><input id="song_'+part.key+'" data-part="'+part.key+'" data-field="song" type="text" value="'+esc(choice.song)+'" placeholder="Song title">'
          +'<input id="youtube_'+part.key+'" data-part="'+part.key+'" data-field="youtubeUrl" type="url" inputmode="url" value="'+esc(choice.youtubeUrl)+'" placeholder="YouTube link (optional)" aria-label="'+esc(part.label)+' YouTube link"></div>'
          +copyrightFields(part,choice)+'</div>';
      }).join("");
      musicList.dataset.mode="edit";
    }else{
      musicList.querySelectorAll("input[data-part]").forEach(input=>{
        if(input===document.activeElement) return;
        const choice=choiceFor(input.dataset.part);
        const value=choice[input.dataset.field] || "";
        if(input.value!==value) input.value=value;
      });
      MUSIC_PARTS.forEach(part=>{
        const status=musicList.querySelector("#song_"+part.key)?.closest(".music-edit-row")?.querySelector(".copyright-status");
        if(!status) return;
        const choice=choiceFor(part.key);
        const complete=copyrightComplete(choice);
        status.textContent=!choice.song ? "After choosing song" : (complete ? "Complete" : "Incomplete");
        status.classList.toggle("complete",complete && !!choice.song);
      });
    }
  }else{
    musicList.innerHTML=MUSIC_PARTS.map(part=>{
      const choice=choiceFor(part.key);
      const link=safeYoutubeUrl(choice.youtubeUrl);
      const attribution=attributionLine(choice);
      const incomplete=choice.song && !copyrightComplete(choice);
      return '<div class="music-view-row"><div class="music-part-label">'+musicLabel(part)+'</div><div class="music-choice">'
        +(choice.song?esc(choice.song):'<span class="music-empty">Not yet chosen</span>')
        +(attribution?'<span class="music-attribution">'+esc(attribution)+'</span>':'')
        +(incomplete?'<span class="music-attribution copyright-warning">Copyright information incomplete</span>':'')
        +(link?'<a class="listen-link" href="'+esc(link)+'" target="_blank" rel="noopener">Listen / practise ↗</a>':'')+'</div></div>';
    }).join("");
    musicList.dataset.mode="view";
  }
}
function readingSlot(key){ return READING_SLOTS.find(slot=>slot.key===key); }
function computedCitation(slot){ return baseCelebration().readings?.[slot.key] || ""; }
function displayedCitation(slot){ return readingOverrides[slot.key]?.citation || computedCitation(slot); }
function setReadingStatus(text,state){
  readingSaveStatus.textContent=text || "";
  readingSaveStatus.dataset.state=state || "";
}
function renderReadingEditor(){
  liturgicalEditLaunch.hidden=!isEditor;
  if(!isEditor) return;
  const celebration=baseCelebration();
  celebrationCurrent.classList.toggle("changed",!!celebrationOverride);
  celebrationCurrent.innerHTML='<div class="celebration-current-label">Celebration for this Mass'
    +'<span class="reading-status-badge'+(celebrationOverride?' changed':'')+'">'+(celebrationOverride?'Changed':'Computed')+'</span></div>'
    +'<div class="celebration-current-name">'+esc(celebration.name)+'</div>'
    +'<div class="celebration-current-meta">'+(celebrationOverride
      ? esc((celebration.rank||"Celebration")+" · normally "+fmtLong(celebration.sourceDate))
      : esc(fmtLong(current().d)+" · "+current().s+" · "+cycleName(current().c)))+'</div>';
  restoreCelebration.hidden=!celebrationOverride;
  const changed=READING_SLOTS.filter(slot=>readingOverrides[slot.key]);
  readingEditorList.innerHTML=READING_SLOTS.map(slot=>{
    const adjusted=!!readingOverrides[slot.key];
    return '<div class="reading-editor-row"><div><div class="reading-editor-label">'+esc(slot.label)
      +'<span class="reading-status-badge'+(adjusted?' changed':'')+'">'+(adjusted?'Changed':(celebrationOverride?'Selected Mass':'Computed'))+'</span></div>'
      +'<div class="reading-editor-cite">'+(esc(displayedCitation(slot))||"—")+'</div></div>'
      +'<div class="reading-editor-actions"><button type="button" data-reading-action="change" data-reading-slot="'+slot.key+'">Change</button>'
      +(adjusted?'<button type="button" data-reading-action="restore" data-reading-slot="'+slot.key+'">Restore</button>':'')+'</div></div>';
  }).join("");
  readingEditorFooter.hidden=changed.length===0;
}
function searchText(value){
  return (value||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
}
let visibleCelebrationCandidates=[];
function celebrationMeta(candidate){
  return (candidate.rank||"Celebration")+" · "+fmtLong(candidate.sourceDate)
    +(candidate.cycle && candidate.rank==="Sunday" ? " · "+cycleName(candidate.cycle) : "")
    +(candidate.lectionary ? " · Lectionary "+candidate.lectionary : "");
}
function renderCelebrationPreview(){
  if(!pendingCelebration){ celebrationPreview.hidden=true; celebrationUse.disabled=true; return; }
  const readings=pendingCelebration.readings;
  const field=(slot,label)=>{
    const options=pendingCelebration.readingOptions?.[slot] || [];
    const allowNone=slot==="second" && !readings.second;
    if(options.length<=1 && !allowNone) return '<dt>'+esc(label)+'</dt><dd>'+(esc(readings[slot])||"—")+'</dd>';
    return '<dt><label for="celebrationReading_'+slot+'">'+esc(label)+'</label></dt><dd><select id="celebrationReading_'+slot+'" data-celebration-reading="'+slot+'">'
      +(slot==="second"?'<option value="">No second reading</option>':'')
      +options.map(citation=>'<option value="'+esc(citation)+'"'+(citation===readings[slot]?' selected':'')+'>'+esc(citation)+'</option>').join("")
      +'</select></dd>';
  };
  celebrationPreview.innerHTML='<h3>'+esc(pendingCelebration.name)+'</h3><p>'+esc(celebrationMeta(pendingCelebration))+'</p>'
    +'<dl class="celebration-preview-grid">'+field("first","First Reading")+field("psalm","Psalm")
    +field("second","Second Reading")+field("gospel","Gospel")+'</dl>'
    +(pendingCelebration.commonNames?.length
      ? '<p class="celebration-options-note">Reading choices include '+esc(pendingCelebration.commonNames.join(" and "))+".</p>"
      : "");
  celebrationPreview.hidden=false;
  celebrationUse.disabled=false;
}
function renderCelebrationResults(){
  const query=searchText(celebrationSearch.value);
  const anchor=current().d;
  const all=lectionary.availableCelebrations(current()).filter(candidate=>!(candidate.sourceDate===current().d && candidate.name===current().n));
  if(query){
    celebrationResultsHeading.textContent="Matching celebrations";
    visibleCelebrationCandidates=all.filter(candidate=>{
      const haystack=searchText(candidate.name+" "+candidate.rank+" "+fmtLong(candidate.sourceDate)+" "+(candidate.cycle||"")+" "+(candidate.commonNames||[]).join(" "));
      return query.split(" ").every(word=>haystack.includes(word));
    }).sort((a,b)=>a.name.localeCompare(b.name) || a.sourceDate.localeCompare(b.sourceDate)).slice(0,40);
  }else{
    celebrationResultsHeading.textContent="Nearby celebrations";
    visibleCelebrationCandidates=all.filter(candidate=>Math.abs(dayDistance(candidate.sourceDate,anchor))<=14)
      .sort((a,b)=>Math.abs(dayDistance(a.sourceDate,anchor))-Math.abs(dayDistance(b.sourceDate,anchor)) || a.sourceDate.localeCompare(b.sourceDate))
      .slice(0,30);
  }
  celebrationResults.innerHTML=visibleCelebrationCandidates.length
    ? visibleCelebrationCandidates.map((candidate,index)=>'<button class="celebration-result'+(pendingCelebration?.id===candidate.id?' selected':'')+'" type="button" data-celebration-index="'+index+'"><strong>'+esc(candidate.name)+'</strong><small>'+esc(celebrationMeta(candidate))+'</small></button>').join("")
    : '<p class="reading-validation">No available celebration matches that search.</p>';
}
function openCelebrationDialog(){
  pendingCelebration=null;
  celebrationSearch.value="";
  celebrationUse.textContent="Use this celebration";
  celebrationDialogContext.textContent="For the Mass on "+fmtLong(current().d);
  renderCelebrationResults();
  renderCelebrationPreview();
  celebrationDialog.showModal();
  setTimeout(()=>celebrationSearch.focus(),0);
}
function suggestedCitations(slot){
  const computed=computedCitation(slot);
  const alternatives=citationAlternatives(computed);
  if(alternatives.length===1) return [{citation:computed,label:computed,note:"Computed for this celebration",isDefault:true}];
  return alternatives.map((citation,index)=>({
    citation,
    label:citation,
    note:index===0 ? "Longer form" : "Shorter or alternative form",
    isDefault:false,
  }));
}
function fillReadingOptions(slot){
  const suggestions=suggestedCitations(slot);
  readingSuggested.innerHTML=suggestions.map((option,index)=>
    '<label class="suggested-reading"><input type="radio" name="suggestedReading" value="'+esc(option.citation)+'" data-default="'+(option.isDefault?'true':'false')+'">'
    +'<span><strong>'+esc(option.label)+'</strong><small>'+esc(option.note)+'</small></span></label>'
  ).join("");
  readingCitationOptions.innerHTML=Array.from(ROLE_CITATIONS[slot.key].values()).sort((a,b)=>a.localeCompare(b)).map(citation=>'<option value="'+esc(citation)+'"></option>').join("");
  readingSearchHelp.textContent="Only "+slot.label.toLowerCase()+" passages contained in this app’s lectionary data can be selected.";
}
function showReadingValidation(message,state){
  readingValidation.textContent=message || "";
  readingValidation.className="reading-validation"+(state?" "+state:"");
}
function validateReadingSelection(){
  pendingReadingSelection=null;
  readingUse.disabled=true;
  readingTextPreview.hidden=true;
  ordoConfirmWrap.hidden=true;
  const slot=readingSlot(editingReadingSlot);
  if(!slot) return;
  const raw=readingCitationInput.value.trim();
  if(!raw){
    showReadingValidation("Choose one of the options above or enter a citation.","");
    return;
  }
  const computed=computedCitation(slot);
  const suggestions=suggestedCitations(slot);
  const defaultOption=suggestions.find(option=>option.isDefault && normalizedCitation(option.citation)===normalizedCitation(raw));
  if(defaultOption){
    pendingReadingSelection={slot:slot.key,citation:computed,isDefault:true,requiresConfirmation:false};
    readingTextPreview.innerHTML='<strong>Full text preview</strong>'+esc(READINGS[computed] || "The text is not available in this app.");
    readingTextPreview.hidden=false;
    showReadingValidation("This restores the computed reading.","valid");
    readingUse.textContent="Use computed reading";
    readingUse.disabled=false;
    return;
  }
  const canonical=ROLE_CITATIONS[slot.key].get(normalizedCitation(raw));
  if(!canonical){
    const otherRoles=CITATION_ROLES[normalizedCitation(raw)] || [];
    if(otherRoles.length){
      const labels=otherRoles.map(key=>readingSlot(key).label.toLowerCase()).join(" or ");
      showReadingValidation("That passage is known as a "+labels+", not a "+slot.label.toLowerCase()+".","error");
    }else{
      showReadingValidation("That citation is not in the available "+slot.label.toLowerCase()+" lectionary passages.","error");
    }
    return;
  }
  const parsed=parseReadingCitation(canonical);
  const text=READINGS[canonical];
  if(!parsed || !text){
    showReadingValidation("This passage is missing a valid citation or full text and cannot be selected.","error");
    return;
  }
  const approved=suggestions.some(option=>normalizedCitation(option.citation)===normalizedCitation(canonical));
  const requiresConfirmation=!approved;
  pendingReadingSelection={
    slot:slot.key,
    citation:canonical,
    book:parsed.book,
    segments:parsed.segments,
    origin:approved ? "ordo-option" : "lectionary-catalog",
    translation:"World English Bible",
    textVersion:"embedded-2026-07",
    requiresConfirmation,
  };
  readingCitationInput.value=canonical;
  readingTextPreview.innerHTML='<strong>Full text preview</strong>'+esc(text);
  readingTextPreview.hidden=false;
  ordoConfirmWrap.hidden=!requiresConfirmation;
  showReadingValidation(requiresConfirmation ? "Valid for this reading slot. Confirm the non-standard selection below." : "Valid option for this celebration.","valid");
  readingUse.textContent="Use reading";
  readingUse.disabled=requiresConfirmation && !ordoConfirm.checked;
}
function openReadingDialog(key){
  const slot=readingSlot(key);
  if(!slot || !isEditor) return;
  editingReadingSlot=key;
  pendingReadingSelection=null;
  readingDialogTitle.textContent=slot.label;
  readingDialogContext.textContent=baseCelebration().name+" · "+fmtLong(current().d);
  fillReadingOptions(slot);
  const suggestions=suggestedCitations(slot);
  readingCitationInput.value=readingOverrides[key]?.citation || suggestions[0]?.citation || computedCitation(slot);
  readingSuggested.querySelectorAll('input[name="suggestedReading"]').forEach(input=>{
    input.checked=normalizedCitation(input.value)===normalizedCitation(readingCitationInput.value);
  });
  ordoConfirm.checked=false;
  readingUse.textContent="Use reading";
  validateReadingSelection();
  readingDialog.showModal();
  setTimeout(()=>readingCitationInput.focus(),0);
}
async function restoreReadingOverride(slotKey){
  if(!planStore || !isEditor) return;
  setReadingStatus("Saving…","");
  try{
    await planStore.clearReadingOverride(current().d,slotKey);
    delete readingOverrides[slotKey];
    refresh();
    setReadingStatus("Saved","saved");
  }catch(error){
    console.error(error);
    setReadingStatus("Save failed","error");
  }
}
function renderFullReadings(){
  const v = vals();
  readingsIntro.textContent=v.day+" · "+v.meta;
  const blk = (slot,id,label,cite,text) => '<article class="rblock reading-anchor" id="'+id+'"><div class="rhead">'+esc(label)+'<span class="rcite">'+esc(cite)+'</span>'
    +(celebrationOverride || readingOverrides[slot]?'<span class="reading-adjusted-note">Adjusted</span>':'')+'</div><div class="rtext">'+(esc(text)||'<em>(see citation)</em>')+'</div></article>';
  readingTexts.innerHTML =
    blk("first","reading-first","First Reading",v.first,textFor(v.first))
    + blk("psalm","reading-psalm","Responsorial Psalm",v.psalm,textFor(v.psalm)||"(sung — see citation)")
    + blk("second","reading-second","Second Reading",v.second,textFor(v.second))
    + blk("gospel","reading-gospel","Gospel",v.gospel,textFor(v.gospel))
    + '<div class="rpcaveat">Scripture: World English Bible (public domain). Verse numbering — especially in the Psalms — can differ slightly from the lectionary.</div>';
}
function renderResolved(){
  const s=current();
  const celebration=baseCelebration();
  resolved.innerHTML = '<span class="selected-date">'+fmtLong(s.d)+'</span>'
    + '<span class="selected-day">'+esc(celebration.name)+(celebrationOverride?'<span class="reading-adjusted-note">Changed celebration</span>':'')+'</span>'
    + '<span class="selected-meta">'+(celebrationOverride
      ? esc((celebration.rank||"Celebration")+" · normally "+fmtLong(celebration.sourceDate))
      : esc(s.s)+' · '+cycleName(s.c))+'</span>';
}
function renderReadingSummary(){
  const v=vals();
  const readings=[
    ["first","First Reading",v.first,"reading-first"],
    ["psalm","Responsorial Psalm",v.psalm,"reading-psalm"],
    ["second","Second Reading",v.second,"reading-second"],
    ["gospel","Gospel",v.gospel,"reading-gospel"],
  ];
  const anyAdjusted=!!celebrationOverride || READING_SLOTS.some(slot=>readingOverrides[slot.key]);
  readingSummary.innerHTML='<div class="reading-summary-title">Readings for this Mass'+(anyAdjusted?'<span class="reading-adjusted-note">Adjusted</span>':'')+'</div><div class="reading-grid">'
    + readings.map(r=>'<a class="reading-item'+(celebrationOverride || readingOverrides[r[0]]?' changed':'')+'" href="#'+r[3]+'"><span class="reading-label">'+esc(r[1])+(readingOverrides[r[0]]?'<span class="reading-adjusted-note">Adjusted</span>':'')+'</span><span class="reading-cite">'+(esc(r[2])||"—")+'</span></a>').join('')
    + '</div>';
}
function syncDateControl(){
  date.value=current().d;
  dateDisplay.textContent=fmtPicker(current().d);
}
function refresh(){
  syncDateControl(); renderResolved(); renderReadingSummary(); renderFullReadings(); renderReadingEditor();
  prev.disabled=curIdx===0; next.disabled=curIdx===CALENDAR.length-1;
  today.hidden=curIdx===nextSundayIdx();
  const v = vals();
  if(!v.gospel && !v.first){ warn.style.display="block"; warn.textContent="This day has proper readings that are not in the dataset. Please confirm them against the parish Ordo."; }
  else if(warn.textContent.indexOf("outside the computed")<0){ warn.style.display="none"; }
}

function setSyncStatus(text,state){
  syncStatus.textContent=text;
  syncStatus.dataset.state=state || "";
}
function subscribeToCurrentPlan(){
  if(stopPlanSubscription){ stopPlanSubscription(); stopPlanSubscription=null; }
  musicChoices={};
  readingOverrides={};
  celebrationOverride=null;
  renderMusicPlan();
  refresh();
  if(!planStore){ setSyncStatus("Connecting…",""); return; }
  setSyncStatus("Loading…","");
  stopPlanSubscription=planStore.subscribePlan(current().d,(plan,meta)=>{
    musicChoices=plan?.choices || {};
    readingOverrides=plan?.readingOverrides || {};
    celebrationOverride=plan?.celebrationOverride || null;
    renderMusicPlan();
    refresh();
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
    if(!isEditor){
      if(liturgicalDialog.open) liturgicalDialog.close();
      if(celebrationDialog.open) celebrationDialog.close();
      if(readingDialog.open) readingDialog.close();
    }
    renderMusicPlan();
    renderReadingEditor();
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
openLiturgicalEditor.addEventListener("click",()=>{
  if(!isEditor) return;
  renderReadingEditor();
  liturgicalDialog.showModal();
});
function closeLiturgicalDialog(){ liturgicalDialog.close(); }
liturgicalDialogClose.addEventListener("click",closeLiturgicalDialog);
liturgicalDialog.addEventListener("click",event=>{ if(event.target===liturgicalDialog) closeLiturgicalDialog(); });
chooseCelebration.addEventListener("click",openCelebrationDialog);
celebrationSearch.addEventListener("input",()=>{
  pendingCelebration=null;
  renderCelebrationResults();
  renderCelebrationPreview();
});
celebrationResults.addEventListener("click",event=>{
  const button=event.target.closest("button[data-celebration-index]");
  if(!button) return;
  pendingCelebration=visibleCelebrationCandidates[Number(button.dataset.celebrationIndex)] || null;
  renderCelebrationResults();
  renderCelebrationPreview();
  celebrationPreview.scrollIntoView({block:"nearest"});
});
celebrationPreview.addEventListener("change",event=>{
  const select=event.target.closest("select[data-celebration-reading]");
  if(!select || !pendingCelebration || !isEditor) return;
  pendingCelebration.readings[select.dataset.celebrationReading]=select.value;
});
function closeCelebrationDialog(){
  celebrationDialog.close();
  pendingCelebration=null;
}
celebrationDialogClose.addEventListener("click",closeCelebrationDialog);
celebrationCancel.addEventListener("click",closeCelebrationDialog);
celebrationDialog.addEventListener("click",event=>{ if(event.target===celebrationDialog) closeCelebrationDialog(); });
celebrationForm.addEventListener("submit",async event=>{
  event.preventDefault();
  if(!pendingCelebration || !isEditor || !planStore || celebrationUse.disabled) return;
  const selection=pendingCelebration;
  const payload={
    id:selection.id,
    name:selection.name,
    sourceDate:selection.sourceDate,
    rank:selection.rank,
    season:selection.season,
    cycle:selection.cycle,
    lectionary:selection.lectionary || "",
    source:selection.source || "Standard lectionary",
    readings:selection.readings,
    checkedAgainstOrdo:true,
  };
  celebrationUse.disabled=true;
  celebrationUse.textContent="Saving…";
  setReadingStatus("Saving…","");
  try{
    await planStore.saveCelebrationOverride(current().d,payload);
    celebrationOverride=payload;
    readingOverrides={};
    refresh();
    setReadingStatus("Saved","saved");
    closeCelebrationDialog();
  }catch(error){
    console.error(error);
    setReadingStatus("Save failed","error");
    celebrationUse.disabled=false;
    celebrationUse.textContent="Use this celebration";
  }
});
restoreCelebration.addEventListener("click",async ()=>{
  if(!isEditor || !planStore) return;
  if(!confirm("Restore the computed Sunday celebration and all of its readings?")) return;
  setReadingStatus("Saving…","");
  try{
    await planStore.clearCelebrationOverride(current().d);
    celebrationOverride=null;
    readingOverrides={};
    refresh();
    setReadingStatus("Saved","saved");
  }catch(error){
    console.error(error);
    setReadingStatus("Save failed","error");
  }
});
readingEditorList.addEventListener("click",event=>{
  const button=event.target.closest("button[data-reading-action]");
  if(!button || !isEditor) return;
  if(button.dataset.readingAction==="change") openReadingDialog(button.dataset.readingSlot);
  if(button.dataset.readingAction==="restore") restoreReadingOverride(button.dataset.readingSlot);
});
restoreAllReadings.addEventListener("click",async ()=>{
  if(!isEditor || !planStore) return;
  if(!confirm("Restore all individual readings to the selected celebration?")) return;
  setReadingStatus("Saving…","");
  try{
    await planStore.clearReadingOverride(current().d,null);
    readingOverrides={};
    refresh();
    setReadingStatus("Saved","saved");
  }catch(error){
    console.error(error);
    setReadingStatus("Save failed","error");
  }
});
readingSuggested.addEventListener("change",event=>{
  const input=event.target.closest('input[name="suggestedReading"]');
  if(!input) return;
  readingCitationInput.value=input.value;
  ordoConfirm.checked=false;
  validateReadingSelection();
});
readingCitationInput.addEventListener("input",()=>{
  readingSuggested.querySelectorAll('input[name="suggestedReading"]').forEach(input=>{
    input.checked=normalizedCitation(input.value)===normalizedCitation(readingCitationInput.value);
  });
  ordoConfirm.checked=false;
  validateReadingSelection();
});
ordoConfirm.addEventListener("change",validateReadingSelection);
function closeReadingDialog(){
  readingDialog.close();
  editingReadingSlot=null;
  pendingReadingSelection=null;
}
readingDialogClose.addEventListener("click",closeReadingDialog);
readingCancel.addEventListener("click",closeReadingDialog);
readingDialog.addEventListener("click",event=>{ if(event.target===readingDialog) closeReadingDialog(); });
readingForm.addEventListener("submit",async event=>{
  event.preventDefault();
  const selection=pendingReadingSelection;
  if(!selection || !isEditor || !planStore || readingUse.disabled) return;
  readingUse.disabled=true;
  readingUse.textContent="Saving…";
  setReadingStatus("Saving…","");
  try{
    if(selection.isDefault){
      await planStore.clearReadingOverride(current().d,selection.slot);
      delete readingOverrides[selection.slot];
    }else{
      const readingOverride={
        citation:selection.citation,
        book:selection.book,
        segments:selection.segments,
        origin:selection.origin,
        translation:selection.translation,
        textVersion:selection.textVersion,
        checkedAgainstOrdo:selection.requiresConfirmation ? ordoConfirm.checked : true,
      };
      await planStore.saveReadingOverride(current().d,selection.slot,readingOverride);
      readingOverrides[selection.slot]=readingOverride;
    }
    refresh();
    setReadingStatus("Saved","saved");
    closeReadingDialog();
  }catch(error){
    console.error(error);
    showReadingValidation("The reading could not be saved. Please try again.","error");
    setReadingStatus("Save failed","error");
    readingUse.textContent=selection.isDefault ? "Use computed reading" : "Use reading";
    readingUse.disabled=false;
  }
});

// pick nearest Sunday to a chosen date
function goToDate(iso){
  if(byDate[iso]!==undefined){ curIdx=byDate[iso]; warn.style.display="none"; refresh(); subscribeToCurrentPlan(); return; }
  // find nearest Sunday record
  let best=-1,bestDiff=1e15; const t=new Date(iso+"T12:00:00Z").getTime();
  CALENDAR.forEach((s,i)=>{ const diff=Math.abs(new Date(s.d+"T12:00:00Z").getTime()-t); if(diff<bestDiff){bestDiff=diff;best=i;} });
  if(best<0 || bestDiff>1000*3600*24*366){ warn.style.display="block"; warn.textContent="That date is outside the computed range (2025–2075)."; }
  else warn.style.display="none";
  curIdx=best; refresh(); subscribeToCurrentPlan();
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
  MUSIC_PARTS.forEach(part=>{
    const choice=choiceFor(part.key);
    repl["@@MUSIC_"+part.token+"@@"]=choice.song;
    repl["@@ATTR_"+part.token+"@@"]=attributionLine(choice)+(choice.song && !copyrightComplete(choice) ? (attributionLine(choice) ? " · " : "")+"Copyright information incomplete" : "");
  });
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
function nextSundayIdx(){ const today=new Date().toISOString().slice(0,10); let i=CALENDAR.findIndex(s=>s.d>=today); return i<0?CALENDAR.length-1:i; }
prev.addEventListener("click", ()=>{ if(curIdx>0){curIdx--; refresh(); subscribeToCurrentPlan(); } });
next.addEventListener("click", ()=>{ if(curIdx<CALENDAR.length-1){curIdx++; refresh(); subscribeToCurrentPlan(); } });
document.getElementById("today").addEventListener("click", ()=>{ curIdx=nextSundayIdx(); refresh(); subscribeToCurrentPlan(); });
date.addEventListener("change", ()=>{ if(date.value) goToDate(date.value); else syncDateControl(); });
printMusic.addEventListener("click", ()=>downloadWord(false));
printMusicReadings.addEventListener("click", ()=>downloadWord(true));

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
