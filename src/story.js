// Radio, portal, warp, boss state
// Part of NEON DINO-AGE: RESCUE PROTOCOL. Loaded as a classic
// script, in the order index2.html lists — these files share one
// global scope on purpose and are not modules.

// ─── RADIO TRANSMISSION SYSTEM ────────────────────────────────
// A small pixel comms window in the top-left that wipes open, types its line
// out and wipes shut again. It is purely presentational — nothing in here
// touches the simulation, so a transmission plays over a live firefight
// without stealing a single frame of control from the player.
//
// Screen-space only: RADIO_X/RADIO_Y are canvas coordinates, never world
// coordinates, so camX must NOT be applied anywhere in this block.
const RADIO_X=12, RADIO_Y=44, RADIO_W=336, RADIO_H=84;
let radio=null;      // the transmission currently on the air
let radioQueue=[];   // transmissions waiting their turn
let radioFired={};   // per-stage dedupe keys — cleared by loadLevel()
let radioTypeTick=0;

// key   — dedupe id; the same key never fires twice in one stage
// lines — pre-wrapped, at most 3 lines of ~40 chars (no runtime measuring)
function queueRadio(key,title,lines,opts){
  opts=opts||{};
  if(key && radioFired[key]) return;
  if(key) radioFired[key]=true;
  const msg={
    title:title, lines:lines,
    color:opts.color||"#44ffcc",
    urgent:!!opts.urgent,
    hold:opts.hold||3.4,
    phase:"open", timer:0, chars:0
  };
  if(msg.urgent && radio){
    // an urgent call (heat alarm, boss) cuts straight over whatever is on the
    // air instead of politely queueing up behind it
    radioQueue.unshift(radio);
    radio=null;
  }
  if(radio) radioQueue.push(msg);
  else { radio=msg; playRadioBeep(msg.urgent); }
}
function updateRadio(dt){
  if(!radio){
    if(radioQueue.length){ radio=radioQueue.shift(); playRadioBeep(radio.urgent); }
    return;
  }
  radio.timer+=dt;
  if(radio.phase==="open"){
    if(radio.timer>=0.22){ radio.phase="type"; radio.timer=0; }
  } else if(radio.phase==="type"){
    const total=radio.lines.join("").length;
    const prev=radio.chars;
    radio.chars=Math.min(total,Math.floor(radio.timer*46));
    if(radio.chars>prev){
      radioTypeTick-=dt;
      if(radioTypeTick<=0){ playRadioType(); radioTypeTick=0.045; }
    }
    if(radio.chars>=total){ radio.phase="hold"; radio.timer=0; }
  } else if(radio.phase==="hold"){
    if(radio.timer>=radio.hold){ radio.phase="close"; radio.timer=0; }
  } else {
    if(radio.timer>=0.2) radio=null;
  }
}
// the little radio set drawn in the window's title bar
function drawRadioIcon(ix,iy,color,urgent){
  ctx.fillStyle="#12202a"; ctx.fillRect(ix,iy+2,16,12);
  ctx.strokeStyle=color; ctx.lineWidth=1;
  ctx.strokeRect(ix+0.5,iy+2.5,15,11);
  ctx.beginPath(); ctx.moveTo(ix+13,iy+3); ctx.lineTo(ix+17,iy-2); ctx.stroke();
  // VU bars bounce only while a line is actually printing
  const live=radio&&radio.phase==="type";
  for(let b=0;b<3;b++){
    const hgt=live?2+Math.abs(Math.sin(t*14+b))*7:2;
    ctx.fillStyle=urgent?"#ff5555":color;
    ctx.fillRect(ix+3+b*4,iy+12-hgt,3,hgt);
  }
}
function drawRadio(){
  if(!radio) return;
  // open/close wipe: the window grows out of a single scanline
  let openness=1;
  if(radio.phase==="open") openness=clamp(radio.timer/0.22,0,1);
  else if(radio.phase==="close") openness=1-clamp(radio.timer/0.2,0,1);
  const h=Math.max(2,RADIO_H*openness);
  const y=RADIO_Y+(RADIO_H-h)/2;

  ctx.save();
  ctx.fillStyle="rgba(4,10,14,0.88)";
  ctx.fillRect(RADIO_X,y,RADIO_W,h);
  ctx.shadowColor=radio.color; ctx.shadowBlur=10;
  ctx.strokeStyle=radio.color; ctx.lineWidth=2;
  ctx.strokeRect(RADIO_X,y,RADIO_W,h);
  ctx.shadowBlur=0;
  if(openness<0.995){ ctx.restore(); return; } // mid-wipe: draw the frame only

  ctx.globalAlpha=0.18; ctx.fillStyle=radio.color;
  ctx.fillRect(RADIO_X+2,y+2,RADIO_W-4,16);
  ctx.globalAlpha=1;
  drawRadioIcon(RADIO_X+8,y+4,radio.color,radio.urgent);
  ctx.textAlign="left";
  ctx.font="bold 10px 'Courier New',monospace";
  ctx.fillStyle=radio.color;
  ctx.fillText(radio.title,RADIO_X+32,y+14);
  if(Math.sin(t*10)>0){
    ctx.fillStyle=radio.urgent?"#ff3344":"#ffdd44";
    ctx.fillRect(RADIO_X+RADIO_W-16,y+6,8,8);
  }

  // message body, revealed character by character across the lines
  ctx.font="12px 'Courier New',monospace";
  ctx.fillStyle="#dff7ff";
  let budget=(radio.phase==="type")?radio.chars:1e9;
  let ty=y+36;
  for(const line of radio.lines){
    if(budget<=0) break;
    ctx.fillText(line.slice(0,Math.max(0,budget)),RADIO_X+10,ty);
    budget-=line.length;
    ty+=16;
  }
  // CRT scanlines over the whole window
  ctx.globalAlpha=0.12; ctx.fillStyle="#000";
  for(let sy=y+2;sy<y+h-2;sy+=3) ctx.fillRect(RADIO_X+2,sy,RADIO_W-4,1);
  ctx.globalAlpha=1;
  ctx.restore();
}

// ─── FLOATING TEXT (score pop-ups, combo/fever callouts) ──────
let floatingTexts=[];
function spawnFloatingText(x,y,text,color,size){
  floatingTexts.push({x,y,text,color,size:size||14,life:1,vy:-46});
}
function updateFloatingTexts(dt){
  floatingTexts=floatingTexts.filter(f=>{
    f.life-=dt/1.0;
    f.y+=f.vy*dt;
    f.vy*=Math.pow(0.06,dt);
    return f.life>0;
  });
}
function drawFloatingTexts(){
  ctx.textAlign="center";
  for(const f of floatingTexts){
    ctx.globalAlpha=Math.max(0,f.life);
    ctx.fillStyle=f.color;
    ctx.font=`bold ${f.size}px 'Courier New',monospace`;
    ctx.fillText(f.text,f.x,f.y);
  }
  ctx.globalAlpha=1;
  ctx.textAlign="left";
}

// ─── HIGH SCORE (persisted in localStorage) ───────────────────
let hiScore=0;
try{ hiScore=Number(localStorage.getItem("neonDinoHiScore"))||0; }catch(e){ hiScore=0; }
let newRecord=false;
function saveHiScoreIfNeeded(){
  if(score>hiScore){
    hiScore=score;
    try{ localStorage.setItem("neonDinoHiScore",String(hiScore)); }catch(e){}
    return true;
  }
  return false;
}

// ─── DYNAMIC HAZARD: magma bursts from the lava ───────────────
let magmaBursts=[];
function spawnMagmaBurst(){
  magmaBursts.push({
    x:rnd(-100,1200), y:LAVA_Y,
    vx:rnd(-50,50), vy:rnd(-420,-320),
    life:0
  });
}

// ─── EVACUATION PORTAL SPRITE (portal.png) ────────────────────
// The rift art. Like every other sprite here it needs a fallback, because it
// loads asynchronously and may not exist at all: until (or unless) it
// arrives, drawPlatforms() keeps rendering the procedural obsidian arch on
// its own, and the arch stays underneath the sprite once it does load.
//
// The shipped portal.jpg is really a WebP with an opaque white background;
// portal.png is that file with the white keyed out, which is why the sprite
// path prefers the .png and only falls back to the original.
const PORTAL_H=170;            // drawn height in px, before the pulse
const portalSprite=new Image();
let portalLoaded=false;
let portalBBox=null;
let portalTriedFallback=false;
portalSprite.onload=()=>{
  portalBBox=computeSpriteBBox(portalSprite,false);
  portalLoaded=true;
};
portalSprite.onerror=()=>{
  // no portal.png — try the original drop, then give up and stay procedural
  if(!portalTriedFallback){ portalTriedFallback=true; portalSprite.src=assetURL("portal.jpg"); }
};
portalSprite.src=assetURL("portal.png");

let portalReveal=0;            // 0→1 materialise animation, driven by gateOpen

// where the rift sits in WORLD space: centred on the goal platform, standing
// on it. camX is applied by the caller, never here.
function goalPortalPos(){
  for(const p of platforms){
    if(p.goal) return {x:p.x+p.w/2, y:p.y+6-PORTAL_H/2};
  }
  return {x:0,y:0};
}

// ─── WARP-IN: the squad gets drunk by the rift ────────────────
const WARP_DUR=1.15;
let warpTimer=0, warpX=0, warpY=0;
function startPortalWarp(pp){
  goalReached=true;
  STATE="warp"; stateTimer=0;
  warpTimer=0; warpX=pp.x; warpY=pp.y;
  stopLaserSound(); player.wasFiring=false; laser=null;
  radio=null; radioQueue=[];
  screenShake=Math.min(6,screenShake+4);
  playPowerUp();
}
// Wraps a draw call so everything it renders is sucked toward the rift:
// scaling about the portal's centre pulls the dino AND every hatchling in
// proportionally, which is exactly the shape of the effect we want.
function drawWarped(fn){
  if(STATE!=="warp"){ fn(); return; }
  const p=clamp(warpTimer/WARP_DUR,0,1);
  const ease=p*p;                       // accelerates as it goes in
  const s=Math.max(0.02,1-0.96*ease);
  const cx=warpX-camX, cy=warpY;
  ctx.save();
  ctx.globalAlpha=Math.max(0,1-0.85*ease*ease);
  ctx.translate(cx,cy);
  ctx.rotate(ease*2.6);                 // spun around as it is drawn in
  ctx.scale(s,s);
  ctx.translate(-cx,-cy);
  fn();
  ctx.restore();
}

// ─── BOSS: Alpha Pterodactyl guarding the exit gate ───────────
const BOSS_W=140, BOSS_H=100;
const BOSS_BREATH_REACH=430;   // how far the Glacier Titan's breath carries
const BREATH_ARC=0.52;         // radians either side of level, phase 2 only
const BREATH_HALF_W=34;        // how thick the beam is, measured off its axis

// Distance from a point to a segment. The breath is tested with this rather
// than as an x-range plus a y-band, because in phase 2 the beam is no longer
// horizontal — and at angle 0 this is the same band it always was.
function segDist(px,py,ax,ay,bx,by){
  const dx=bx-ax, dy=by-ay;
  const len2=dx*dx+dy*dy;
  const u=len2>0 ? clamp(((px-ax)*dx+(py-ay)*dy)/len2,0,1) : 0;
  return Math.hypot(px-(ax+u*dx), py-(ay+u*dy));
}
// Where the breath starts and ends, in world space. One source of truth, so
// the hit test and the drawing can never disagree about where the beam is.
function breathRay(){
  const dir=boss.breathDir||-1;
  const ang=boss.breathAngle||0;
  const ax=boss.x+dir*boss.w*0.45, ay=boss.y-boss.h*0.18;
  return {ax, ay,
          bx:ax+dir*BOSS_BREATH_REACH*Math.cos(ang),
          by:ay+BOSS_BREATH_REACH*Math.sin(ang)};
}
// The Titan's phase 2 glazes the whole floor. It reads as "the arena froze
// over" because the fight is camera-locked into the arena band anyway.
function titanSlick(){
  return !!(boss && !boss.dead && !boss.dying &&
            boss.kind==="titan" && boss.phase>=2 && boss.introState==="active");
}
let boss=null;
let gateOpen=false;
let bossShakeTimer=0; // sustained heavier shake on boss death, separate from normal hit-shake decay
let lavaBalls=[];
let bossFlameBursts=[]; // vertical flame-burst hazards from the boss's second attack
let shockwaves=[];      // ground waves thrown out by the walker's stomp
function initBoss(){
  const spec=LEVELS[levelIndex].boss;
  // stages without a boss get no boss entity at all, and their exit portal
  // starts already open — there's nothing guarding it
  boss = spec ? {
    type:"boss",
    x:spec.x, y:-160, baseY:170, w:spec.w||BOSS_W, h:spec.h||BOSS_H,
    hp:spec.hp||12, maxHp:spec.hp||12,
    name:spec.name||"ALFA PTERODACTYL", title:spec.title||"",
    kind:spec.kind||"flyer",
    art:spec.sprite||"enemyboss.png", rageArt:spec.rageSprite||null,
    summons:spec.summons||null,
    phase:1,               // flips to 2 at half health — see enterBossPhase2
    diveState:"none", diveTimer:0, diveCooldown:rnd(3,5), diveDir:-1,
    stompCooldown:2.2, walkDir:-1,
    breathState:"none", breathTimer:0, breathCooldown:rnd(2.5,4), breathDir:-1,
    breathAngle:0, breathDur:1,   // the sweep — stays 0 for the whole of phase 1
    poundCooldown:rnd(5,7),
    wavePhase:rnd(0,Math.PI*2),
    fireCooldown:2.5,      // slow homing lava-ball attack
    flameCooldown:4,       // vertical flame-burst attack
    hitFlash:0, dying:false, deathTimer:0, dead:false, beamTick:0,
    introState:"pending", introTimer:0 // pending → warning → descending → active
  } : null;
  bossCardTimer=0; bossRageTimer=0;
  gateOpen = !spec;
  // stages with no boss have the rift standing there from the start; on the
  // boss stage it has to be earned, so it materialises in killBoss()
  portalReveal = spec?0:1;
  lavaBalls=[];
  bossFlameBursts=[];
  shockwaves=[];
  { const TH=themeOf();
    if(TH.portalArt) artFor(TH.portalArt);
    if(TH.bg) artFor(TH.bg);
    if(TH.cap) artFor(TH.cap.art); }   // start the biome plates downloading
  if(boss) artFor(boss.art);            // start the download early
  if(boss&&boss.rageArt) artFor(boss.rageArt);
  bossIntroTriggered=false;
  warningBannerTimer=0;
  stageClearDelay=0;
}
