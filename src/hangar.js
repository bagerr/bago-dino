// The hangar: what the bank is for
// Part of NEON DINO-AGE: RESCUE PROTOCOL. Loaded as a classic
// script, in the order index2.html lists — these files share one
// global scope on purpose and are not modules.

// ─── THE HANGAR ───────────────────────────────────────────────
// Permanent upgrades, bought between missions, kept forever.
//
// Every one of them buys CAPABILITY, and none of them buys POWER. No damage
// multiplier, no movement speed, no wider beam. That is not squeamishness —
// it is the only way this layer can exist without eating the game underneath
// it. The chain, the grade and the parry are all skill expressions; make the
// dino hit harder and every one of them stops mattering on the second
// evening. More hearts, more fuel, more credits and a better insurance
// payout change how much room you have to be bad, not how strong you are.
//
// Levels are stored on the bank object, so the wallet and what it bought
// persist together and cannot disagree with each other.
const UPGRADES=[
  {id:"hearts", name:"ZIRH PLAKASI", unit:"KALP",
   desc:"Dayanıklılık +1. Vuruş almamak\nhala notun en büyük parçası.",
   costs:[300,700,1400]},
  {id:"tank", name:"GENİŞ DEPO", unit:"KADEME",
   desc:"Jetpack yakıtı daha yavaş biter.\nDaha uzun havada kalış.",
   costs:[250,600,1200]},
  {id:"regen", name:"HIZLI İKMAL", unit:"KADEME",
   desc:"Yakıt yerde daha hızlı dolar.\nSık sık zıplamak ucuzlar.",
   costs:[250,600,1200]},
  {id:"credits", name:"YEDEK KREDİ", unit:"HAK",
   desc:"Devam hakkı +1. Görev biter,\nkoşu bitmez.",
   costs:[500,1200]},
  {id:"insurance", name:"KURTARMA SİGORTASI", unit:"KADEME",
   desc:"Kaybedilen koşudan kasaya\ndaha çok kredi kalır.",
   costs:[400,900]},
  {id:"magnet", name:"ÇEKİM ALANI", unit:"KADEME",
   desc:"Coin'ler daha uzaktan gelir.\nKese daha hızlı dolar.",
   costs:[250,600]},
];

function upgradeSpec(id){ return UPGRADES.find(u=>u.id===id)||null; }
function upgradeLevel(id){
  const v=bank.up&&bank.up[id];
  return Math.max(0,Math.min(upgradeMax(id),Math.floor(Number(v)||0)));
}
function upgradeMax(id){ const u=upgradeSpec(id); return u?u.costs.length:0; }
// null once it is maxed, which is how every caller tells "cannot afford"
// apart from "nothing left to buy"
function upgradeCost(id){
  const u=upgradeSpec(id);
  if(!u) return null;
  const lv=upgradeLevel(id);
  return lv>=u.costs.length ? null : u.costs[lv];
}
function canAfford(id){
  const c=upgradeCost(id);
  return c!==null && bank.coins>=c;
}
function buyUpgrade(id){
  const c=upgradeCost(id);
  if(c===null) return false;
  if(!spendCoins(c)) return false;      // spendCoins saves the bank
  bank.up=bank.up||{};
  bank.up[id]=upgradeLevel(id)+1;
  saveBank();
  return true;
}

// ── what the levels actually do ───────────────────────────────
// Read at the point of use rather than written into the constants, because
// the constants are shared with the arcade build and with the tests.
const BASE_HEARTS=3;
function maxHearts(){ return BASE_HEARTS+upgradeLevel("hearts"); }
function jetUseMult(){ return 1-0.12*upgradeLevel("tank"); }
function jetRegenMult(){ return 1+0.25*upgradeLevel("regen"); }
function maxContinues(){ return MAX_CONTINUES+upgradeLevel("credits"); }
function salvageFrac(){ return Math.min(0.9,SALVAGE_FRAC+0.15*upgradeLevel("insurance")); }
function collectRadius(){ return 50+22*upgradeLevel("magnet"); }

// ── the screen ────────────────────────────────────────────────
let hangarSel=0;
let hangarFlash=0;      // green on a purchase, red on a refusal
let hangarFlashBad=false;
let hangarKeyWasDown=false;

function openHangar(){ STATE="hangar"; stateTimer=0; hangarSel=0; hangarFlash=0; }
function closeHangar(){ STATE="map"; stateTimer=0; }

function tryBuy(id){
  if(buyUpgrade(id)){
    hangarFlash=0.5; hangarFlashBad=false;
    playPowerUp();
    return true;
  }
  hangarFlash=0.5; hangarFlashBad=true;
  playPew();
  return false;
}

// row geometry, shared by the drawing and the tapping so they cannot drift
const HANGAR_ROW_H=44, HANGAR_TOP=112, HANGAR_X=70, HANGAR_W=520;
function hangarRowAt(x,y){
  if(x<HANGAR_X||x>HANGAR_X+HANGAR_W) return -1;
  const i=Math.floor((y-HANGAR_TOP)/HANGAR_ROW_H);
  return (i>=0&&i<UPGRADES.length)?i:-1;
}
function hangarBackButton(){ return {x:W-132, y:H-52, w:110, h:34}; }
// the way IN, drawn on the map screen by drawWorldMap
function mapHangarButton(){ return {x:W-150, y:H-58, w:128, h:36}; }

function drawHangar(){
  const g=ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,"#04060e"); g.addColorStop(0.6,"#0a0a1c"); g.addColorStop(1,"#120a16");
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);

  ctx.textAlign="left";
  glow("#7dd3fc",14);
  ctx.font="bold 26px 'Courier New',monospace";
  ctx.fillStyle="#dff6ff";
  ctx.fillText("HANGAR",HANGAR_X,62);
  noGlow();
  ctx.font="bold 11px 'Courier New',monospace";
  ctx.fillStyle="#8899bb";
  ctx.fillText("KALICI YÜKSELTMELER — GÖREVLER ARASI",HANGAR_X,80);

  // the balance, and the flash that says whether the last press worked
  ctx.textAlign="right";
  const flash=hangarFlash>0?hangarFlash/0.5:0;
  glow(hangarFlashBad&&flash?"#ff4466":"#ffdd44",10+14*flash);
  ctx.font="bold 22px 'Courier New',monospace";
  ctx.fillStyle=hangarFlashBad&&flash?"#ff6688":"#ffdd44";
  ctx.fillText(bank.coins.toLocaleString()+" ¢",W-24,62);
  noGlow();
  ctx.font="bold 9px 'Courier New',monospace";
  ctx.fillStyle="#8899bb";
  ctx.fillText("KASA",W-24,78);
  ctx.textAlign="left";

  for(let i=0;i<UPGRADES.length;i++){
    const u=UPGRADES[i];
    const y=HANGAR_TOP+i*HANGAR_ROW_H;
    const on=i===hangarSel;
    const lv=upgradeLevel(u.id), max=upgradeMax(u.id);
    const cost=upgradeCost(u.id);
    const maxed=cost===null;
    const afford=canAfford(u.id);

    ctx.fillStyle=on?"rgba(125,211,252,0.12)":"rgba(255,255,255,0.03)";
    ctx.fillRect(HANGAR_X,y,HANGAR_W,HANGAR_ROW_H-6);
    if(on){
      ctx.strokeStyle="#7dd3fc"; ctx.lineWidth=2;
      ctx.strokeRect(HANGAR_X+0.5,y+0.5,HANGAR_W-1,HANGAR_ROW_H-7);
    }

    ctx.font="bold 15px 'Courier New',monospace";
    ctx.fillStyle=maxed?"#8effc9":(on?"#ffffff":"#c8d4ee");
    ctx.fillText(u.name,HANGAR_X+12,y+24);

    // level pips, so the state is readable without counting numbers
    const px=HANGAR_X+290;
    for(let p=0;p<max;p++){
      const filled=p<lv;
      ctx.fillStyle=filled?"#7dd3fc":"rgba(255,255,255,0.14)";
      ctx.fillRect(px+p*16,y+12,11,11);
    }

    ctx.textAlign="right";
    ctx.font="bold 14px 'Courier New',monospace";
    if(maxed){
      ctx.fillStyle="#8effc9";
      ctx.fillText("TAM",HANGAR_X+HANGAR_W-12,y+24);
    } else {
      ctx.fillStyle=afford?"#ffdd44":"#77607a";
      ctx.fillText(cost+" ¢",HANGAR_X+HANGAR_W-12,y+24);
    }
    ctx.textAlign="left";
  }

  // the description of whatever is highlighted, in its own panel
  const sel=UPGRADES[hangarSel];
  if(sel){
    const dy=HANGAR_TOP+UPGRADES.length*HANGAR_ROW_H+14;
    ctx.fillStyle="rgba(255,255,255,0.04)";
    ctx.fillRect(HANGAR_X,dy,HANGAR_W,54);
    ctx.font="12px 'Courier New',monospace";
    ctx.fillStyle="#9fb0d4";
    const lines=sel.desc.split("\n");
    for(let i=0;i<lines.length;i++) ctx.fillText(lines[i],HANGAR_X+12,dy+20+i*16);
  }

  // the back button is a real rect, because a tablet has no ESC
  const b=hangarBackButton();
  ctx.fillStyle="rgba(255,255,255,0.06)";
  ctx.fillRect(b.x,b.y,b.w,b.h);
  ctx.strokeStyle="#8899bb"; ctx.lineWidth=1;
  ctx.strokeRect(b.x+0.5,b.y+0.5,b.w-1,b.h-1);
  ctx.textAlign="center";
  ctx.font="bold 12px 'Courier New',monospace";
  ctx.fillStyle="#c8d4ee";
  ctx.fillText("HARİTA",b.x+b.w/2,b.y+22);

  ctx.font="bold 10px 'Courier New',monospace";
  ctx.fillStyle="#66708c";
  ctx.fillText(touchMode?"SATIRA DOKUN: SATIN AL":"↑↓ SEÇ    ENTER: SATIN AL    ESC: HARİTA",
               W/2,H-14);
  ctx.textAlign="left";
}

function updateHangar(dt){
  stateTimer+=dt;
  updateParticles(dt);
  if(hangarFlash>0) hangarFlash-=dt;

  const up=K["ArrowUp"]||K["KeyW"], down=K["ArrowDown"]||K["KeyS"];
  const anyDir=up||down;
  if(anyDir&&!hangarKeyWasDown){
    hangarSel=(hangarSel+(down?1:-1)+UPGRADES.length)%UPGRADES.length;
    playPew();
  }
  hangarKeyWasDown=anyDir;

  if(K["Enter"]&&stateTimer>0.25){
    K["Enter"]=false;             // a purchase is a press, not a hold
    tryBuy(UPGRADES[hangarSel].id);
  }
  if(K["Escape"]||K["Backspace"]){ K["Escape"]=false; K["Backspace"]=false; closeHangar(); }
}
