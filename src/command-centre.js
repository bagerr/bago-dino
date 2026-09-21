// The command centre: what MISSION SELECT sits on
// Part of NEON DINO-AGE: RESCUE PROTOCOL. Loaded as a classic
// script, in the order index2.html lists — these files share one
// global scope on purpose and are not modules.

// ─── THE TACTICAL PLATE ───────────────────────────────────────
// The mission screen used to be a gradient and the cave's starfield. It is a
// room now: a photograph of a situation table under a darkening wash, a
// sonar line going round, CRT lines over the glass, and the walls picking up
// the colour of whichever region the cursor is on.
//
// The brief asked for these in CSS terms — repeating-linear-gradient for the
// scanlines, drop-shadow for the key. There is no CSS here; everything is
// the canvas equivalent, which is what the rest of the game draws with.
const MAP_WASH="rgba(10,10,25,0.65)";
const SONAR_PERIOD=9;        // seconds for one full sweep
const AMBIENT_EASE=2.2;      // how fast the walls take a new colour

// the ambient colour eases rather than cutting, so moving the cursor feels
// like a room relighting instead of a lamp switching
let ambientRGB=[120,130,170];

function hexToRGB(hex){
  const h=String(hex||"#8899bb").replace("#","");
  const n=h.length===3
    ? h.split("").map(c=>parseInt(c+c,16))
    : [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];
  return n.map(v=>isFinite(v)?v:128);
}

function updateAmbient(dt){
  const w=WORLDS[mapSel];
  const want=hexToRGB(w?w.color:"#8899bb");
  const k=Math.min(1,dt*AMBIENT_EASE);
  for(let i=0;i<3;i++) ambientRGB[i]+=(want[i]-ambientRGB[i])*k;
}
function ambientCSS(a){
  return "rgba("+Math.round(ambientRGB[0])+","+Math.round(ambientRGB[1])+","+
         Math.round(ambientRGB[2])+","+a+")";
}

// ── the floor: the photograph, washed down so text survives on it ──
function drawMapPlate(){
  const art=artFor("mission_map_bg.png");
  if(art&&art.loaded){
    const iw=art.img.naturalWidth, ih=art.img.naturalHeight;
    // cover: fill both axes, crop the overflow, never squash the picture
    const sc=Math.max(W/iw,H/ih);
    const dw=iw*sc, dh=ih*sc;
    ctx.drawImage(art.img,0,0,iw,ih,(W-dw)/2,(H-dh)/2,dw,dh);
  } else {
    const g=ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,"#05030f"); g.addColorStop(0.55,"#0b0722"); g.addColorStop(1,"#12061a");
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  }
  ctx.fillStyle=MAP_WASH;
  ctx.fillRect(0,0,W,H);
}

// ── the sonar: one faint line going round, and the wedge trailing it ──
function drawSonar(){
  const cx=W/2, cy=H/2+10, r=Math.max(W,H)*0.62;
  const ang=(t%SONAR_PERIOD)/SONAR_PERIOD*Math.PI*2;
  ctx.save();
  ctx.globalCompositeOperation="lighter";
  ctx.translate(cx,cy);

  // the trailing wedge, fading behind the line
  const wedge=ctx.createRadialGradient(0,0,10,0,0,r);
  wedge.addColorStop(0,ambientCSS(0.05));
  wedge.addColorStop(1,ambientCSS(0));
  ctx.fillStyle=wedge;
  ctx.beginPath();
  ctx.moveTo(0,0);
  ctx.arc(0,0,r,ang-0.55,ang);
  ctx.closePath();
  ctx.fill();

  // the line itself
  ctx.strokeStyle=ambientCSS(0.16);
  ctx.lineWidth=2;
  ctx.beginPath();
  ctx.moveTo(0,0);
  ctx.lineTo(Math.cos(ang)*r,Math.sin(ang)*r);
  ctx.stroke();

  // range rings, very faint
  ctx.strokeStyle=ambientCSS(0.055);
  ctx.lineWidth=1;
  for(let k=1;k<=3;k++){
    ctx.beginPath(); ctx.arc(0,0,r*k/3.4,0,Math.PI*2); ctx.stroke();
  }
  ctx.restore();
}

// ── the walls take the selected region's colour ──────────────
function drawAmbientWalls(){
  ctx.save();
  ctx.globalCompositeOperation="lighter";
  const band=170;
  const sides=[
    [0,0,band,H, 0,0,band,0],            // left
    [W-band,0,band,H, W,0,W-band,0],     // right
  ];
  for(const [x,y,w,h,gx0,gy0,gx1,gy1] of sides){
    const g=ctx.createLinearGradient(gx0,gy0,gx1,gy1);
    g.addColorStop(0,ambientCSS(0.17));
    g.addColorStop(1,ambientCSS(0));
    ctx.fillStyle=g; ctx.fillRect(x,y,w,h);
  }
  const top=ctx.createLinearGradient(0,0,0,110);
  top.addColorStop(0,ambientCSS(0.10));
  top.addColorStop(1,ambientCSS(0));
  ctx.fillStyle=top; ctx.fillRect(0,0,W,110);
  ctx.restore();
}

// ── the glass: scanlines, then a vignette ────────────────────
function drawCRT(){
  ctx.save();
  ctx.globalAlpha=0.10;
  ctx.fillStyle="#000";
  for(let y=0;y<H;y+=3) ctx.fillRect(0,y,W,1);
  ctx.globalAlpha=1;
  // a bright line crawling down the tube, the way a real one rolls
  const roll=((t*46)%(H+120))-60;
  const rg=ctx.createLinearGradient(0,roll-30,0,roll+30);
  rg.addColorStop(0,"rgba(255,255,255,0)");
  rg.addColorStop(0.5,"rgba(255,255,255,0.028)");
  rg.addColorStop(1,"rgba(255,255,255,0)");
  ctx.fillStyle=rg; ctx.fillRect(0,roll-30,W,60);
  ctx.restore();
}
function drawVignette(){
  ctx.save();
  const g=ctx.createRadialGradient(W/2,H/2,H*0.32,W/2,H/2,H*0.86);
  g.addColorStop(0,"rgba(0,0,0,0)");
  g.addColorStop(1,"rgba(0,0,0,0.62)");
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  ctx.restore();
}

// ── a biome emblem, where the padlock used to be ─────────────
// Each is drawn rather than lettered, so an unlocked node reads as a place
// at a glance instead of as a word to be read.
function drawBiomeEmblem(id,x,y,col){
  ctx.save();
  ctx.translate(x,y);
  glow(col,10);
  ctx.strokeStyle=col; ctx.fillStyle=col; ctx.lineWidth=2;
  if(id==="volcano"){
    // a cone with a vent
    ctx.beginPath();
    ctx.moveTo(-9,7); ctx.lineTo(-3,-6); ctx.lineTo(3,-6); ctx.lineTo(9,7);
    ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,-6); ctx.lineTo(0,-11); ctx.stroke();
  } else if(id==="forest"){
    // a frond
    ctx.beginPath(); ctx.moveTo(0,9); ctx.lineTo(0,-9); ctx.stroke();
    for(let k=-1;k<=1;k+=2) for(let j=0;j<3;j++){
      const yy=-6+j*5;
      ctx.beginPath(); ctx.moveTo(0,yy); ctx.lineTo(k*7,yy+4); ctx.stroke();
    }
  } else if(id==="frozen"){
    // a six-spoke flake
    for(let k=0;k<6;k++){
      const a=k*Math.PI/3;
      ctx.beginPath(); ctx.moveTo(0,0);
      ctx.lineTo(Math.cos(a)*9,Math.sin(a)*9); ctx.stroke();
    }
  } else {
    // a circuit node
    ctx.beginPath(); ctx.arc(0,0,4,0,Math.PI*2); ctx.stroke();
    for(const [dx,dy] of [[0,-9],[0,9],[-9,0],[9,0]]){
      ctx.beginPath(); ctx.moveTo(dx*0.45,dy*0.45); ctx.lineTo(dx,dy); ctx.stroke();
    }
  }
  noGlow();
  ctx.restore();
}
