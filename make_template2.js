const {
  Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, PageBreak,
  Table, TableRow, TableCell, WidthType, VerticalAlign, HeightRule, ShadingType,
} = require("docx");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const ROOT = __dirname;
const TEMPLATE_PATH = path.join(ROOT, "template2.docx");
const PARTS_DIR = path.join(ROOT, "tpl2");

const ACCENT = "002F45", LABELBG = "F0E5C8", LINE = "AAA08D";
const TABLE_W = 9360, LCOL = 3500, RCOL = 5860;
const cb = () => ({ top:{style:BorderStyle.SINGLE,size:4,color:LINE}, bottom:{style:BorderStyle.SINGLE,size:4,color:LINE}, left:{style:BorderStyle.SINGLE,size:4,color:LINE}, right:{style:BorderStyle.SINGLE,size:4,color:LINE} });
const PARTS = [["ENTRANCE","Entrance / Processional Hymn",""],["KYRIE","Kyrie — Lord, Have Mercy",""],["GLORIA","Gloria — Glory to God","(omitted in Advent & Lent)"],["PSALM_MUSIC","Responsorial Psalm",""],["ACCLAMATION","Gospel Acclamation — Alleluia","(Lenten acclamation in Lent)"],["OFFERTORY","Preparation of the Gifts / Offertory",""],["SANCTUS","Sanctus — Holy, Holy, Holy",""],["MEMORIAL","Memorial Acclamation — Mystery of Faith",""],["AMEN","Great Amen",""],["LORD_PRAYER","The Lord's Prayer — Our Father","(if sung)"],["AGNUS","Agnus Dei — Lamb of God",""],["COMMUNION","Communion Hymn 1",""],["COMMUNION_2","Communion Hymn 2",""],["RECESSIONAL","Recessional / Closing Hymn",""]];
function labelCell(text,note){ const runs=[new TextRun({text,bold:true,size:22,color:ACCENT})]; if(note)runs.push(new TextRun({text:"  "+note,italics:true,size:15,color:"8A8A8A",break:1})); return new TableCell({width:{size:LCOL,type:WidthType.DXA},verticalAlign:VerticalAlign.CENTER,shading:{type:ShadingType.CLEAR,color:"auto",fill:LABELBG},margins:{top:60,bottom:60,left:140,right:120},borders:cb(),children:[new Paragraph({children:runs})]}); }
function musicCell(songToken,attributionToken){ return new TableCell({width:{size:RCOL,type:WidthType.DXA},verticalAlign:VerticalAlign.CENTER,margins:{top:45,bottom:45,left:140,right:140},borders:cb(),children:[new Paragraph({children:[new TextRun({text:songToken,size:22}),new TextRun({text:attributionToken,size:14,color:"6B6B6B",break:1})]})]}); }
function partRow(key,l,n){ return new TableRow({height:{value:560,rule:HeightRule.ATLEAST},children:[labelCell(l,n),musicCell(`@@MUSIC_${key}@@`,`@@ATTR_${key}@@`)]}); }
function readingRow(label,tok){ const l=new TableCell({width:{size:2400,type:WidthType.DXA},verticalAlign:VerticalAlign.CENTER,shading:{type:ShadingType.CLEAR,color:"auto",fill:LABELBG},margins:{top:40,bottom:40,left:140,right:100},borders:cb(),children:[new Paragraph({children:[new TextRun({text:label,bold:true,size:19,color:ACCENT})]})]}); const c=new TableCell({width:{size:6960,type:WidthType.DXA},verticalAlign:VerticalAlign.CENTER,shading:{type:ShadingType.CLEAR,color:"auto",fill:"FBF6F6"},margins:{top:40,bottom:40,left:140,right:140},borders:cb(),children:[new Paragraph({children:[new TextRun({text:tok,size:21})]})]}); return new TableRow({children:[l,c]}); }
const spacer=(h)=>new Paragraph({spacing:{after:h},children:[new TextRun({text:"",size:6})]});

// page-2 reading block
function readingBlock(label, citeTok, textTok){
  return [
    new Paragraph({ spacing:{before:160,after:20}, children:[
      new TextRun({text:label, bold:true, size:22, color:ACCENT}),
      new TextRun({text:"   "+citeTok, italics:true, size:18, color:"6B6B6B"}),
    ]}),
    new Paragraph({ spacing:{after:60}, alignment:AlignmentType.JUSTIFIED, children:[new TextRun({text:textTok, size:20})] }),
  ];
}

const doc = new Document({
  creator:"St James the Apostle", title:"St James the Apostle 6pm Mass — planning sheet with readings",
  styles:{default:{document:{run:{font:"Calibri"}}}},
  sections:[{
    properties:{ page:{ size:{width:11906,height:16838}, margin:{top:700,bottom:600,left:1273,right:1273} } },
    children:[
      new Paragraph({alignment:AlignmentType.CENTER,spacing:{after:10},children:[new TextRun({text:"St James the Apostle — 6pm Mass",bold:true,size:34,color:ACCENT})]}),
      new Paragraph({alignment:AlignmentType.CENTER,spacing:{after:60},border:{bottom:{style:BorderStyle.SINGLE,size:8,color:ACCENT,space:6}},children:[new TextRun({text:"Music Planning Sheet",size:21,color:"444444"})]}),
      new Paragraph({alignment:AlignmentType.CENTER,spacing:{before:40,after:10},children:[new TextRun({text:"@@DAY@@",bold:true,size:26,color:ACCENT})]}),
      new Paragraph({alignment:AlignmentType.CENTER,spacing:{after:120},children:[new TextRun({text:"@@META@@",size:18,color:"6B6B6B"})]}),
      new Table({width:{size:TABLE_W,type:WidthType.DXA},columnWidths:[2400,6960],rows:[readingRow("First Reading","@@FIRST@@"),readingRow("Responsorial Psalm","@@PSALM@@"),readingRow("Second Reading","@@SECOND@@"),readingRow("Gospel","@@GOSPEL@@")]}),
      spacer(80),
      new Paragraph({spacing:{before:60,after:30},children:[new TextRun({text:"SUNG PARTS OF THE MASS",bold:true,size:18,color:"888888"})]}),
      new Table({width:{size:TABLE_W,type:WidthType.DXA},columnWidths:[LCOL,RCOL],rows:PARTS.map(([key,n,note])=>partRow(key,n,note))}),
      spacer(70),
      new Table({width:{size:TABLE_W,type:WidthType.DXA},columnWidths:[TABLE_W],rows:[
        new TableRow({height:{value:340,rule:HeightRule.ATLEAST},children:[new TableCell({width:{size:TABLE_W,type:WidthType.DXA},shading:{type:ShadingType.CLEAR,color:"auto",fill:LABELBG},margins:{top:60,bottom:60,left:140,right:140},borders:cb(),children:[new Paragraph({children:[new TextRun({text:"Notes",bold:true,size:22,color:ACCENT})]})]})]}),
        new TableRow({height:{value:520,rule:HeightRule.ATLEAST},children:[new TableCell({width:{size:TABLE_W,type:WidthType.DXA},margins:{top:60,bottom:60,left:140,right:140},borders:cb(),children:[new Paragraph({children:[new TextRun({text:"",size:22})]})]})]}),
      ]}),
      // ---- PAGE 2: readings ----
      new Paragraph({ children:[new PageBreak()] }),
      new Paragraph({alignment:AlignmentType.CENTER,spacing:{after:6},children:[new TextRun({text:"Mass Readings",bold:true,size:30,color:ACCENT})]}),
      new Paragraph({alignment:AlignmentType.CENTER,spacing:{after:60},border:{bottom:{style:BorderStyle.SINGLE,size:6,color:ACCENT,space:6}},children:[new TextRun({text:"@@DAY@@  ·  @@META@@",size:17,color:"6B6B6B"})]}),
      ...readingBlock("First Reading","@@FIRST@@","@@FIRSTTEXT@@"),
      ...readingBlock("Responsorial Psalm","@@PSALM@@","@@PSALMTEXT@@"),
      ...readingBlock("Second Reading","@@SECOND@@","@@SECONDTEXT@@"),
      ...readingBlock("Gospel","@@GOSPEL@@","@@GOSPELTEXT@@"),
      new Paragraph({spacing:{before:200},children:[new TextRun({text:"Scripture: World English Bible (public domain). Verse numbering — especially in the Psalms — can differ slightly from the lectionary. Confirm the proclaimed text against your parish Ordo.",italics:true,size:15,color:"8A8A8A"})]}),
    ],
  }],
});

Packer.toBuffer(doc).then((buf)=>{
  fs.writeFileSync(TEMPLATE_PATH, buf);
  fs.rmSync(PARTS_DIR, { recursive: true, force: true });
  fs.mkdirSync(PARTS_DIR);
  execFileSync("unzip", ["-q", TEMPLATE_PATH, "-d", PARTS_DIR]);
  const dx=fs.readFileSync(path.join(PARTS_DIR, "word/document.xml"),"utf8");
  ["@@DAY@@","@@FIRST@@","@@FIRSTTEXT@@","@@PSALMTEXT@@","@@SECONDTEXT@@","@@GOSPELTEXT@@",...PARTS.flatMap(([key])=>[`@@MUSIC_${key}@@`,`@@ATTR_${key}@@`])].forEach(t=>console.log(t, dx.includes(t)?"ok":"MISSING"));
  console.log("template2 built");
});
