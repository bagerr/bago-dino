// The arsenal: the letters become a choice
// Part of NEON DINO-AGE: RESCUE PROTOCOL. Loaded as a classic
// script, in the order index2.html lists — these files share one
// global scope on purpose and are not modules.

// ─── MASTERY AND LOADOUT ──────────────────────────────────────
// Six weapon letters, and until now every one of them was a lottery ticket
// on the floor: you took whatever you walked into, and it deleted whatever
// you were holding. Nothing about the arsenal was ever a decision.
//
// Two things fix that, and neither of them makes the dino stronger.
//
// MASTERY is time on the trigger. Fire a letter and it accumulates seconds;
// past the first threshold it is unlocked for the loadout, and past the
// second and third it carries a bigger magazine. Deliberately ammo and not
// damage — the hangar rule holds here too. A letter that hits harder the
// more you use it would retire the other five by the second evening; a
// letter that lasts longer just means the thing you actually practise is
// the thing you can rely on.
//
// LOADOUT is which letter you walk in with. That is what turns the pickups
// on the floor from a lottery into a trade: if you start with SPREAD, the
// FLAME capsule in front of the ice block is a question rather than a gift.
// And a requisitioned letter comes out of the armoury PARTIALLY LOADED
// (LOADOUT_AMMO_FRAC), so bringing one is a head start and never a free
// upgrade — the floor pickup is still the full magazine.
const MASTERY_STEPS=[15,45,100];   // seconds of fire for level 1, 2, 3
const MASTERY_AMMO=[1, 1, 1.2, 1.45];
const LOADOUT_AMMO_FRAC=0.6;

let arsenal={mastery:{}, loadout:"beam"};
try{
  const raw=localStorage.getItem("neonDinoArsenal");
  if(raw){
    const p=JSON.parse(raw);
    if(p&&typeof p==="object"){
      if(p.mastery&&typeof p.mastery==="object") arsenal.mastery=p.mastery;
      if(typeof p.loadout==="string") arsenal.loadout=p.loadout;
    }
  }
}catch(e){ /* blocked or corrupt store: nothing practised yet */ }

function saveArsenal(){
  try{ localStorage.setItem("neonDinoArsenal",JSON.stringify(arsenal)); }catch(e){}
}

// every letter except the base beam, which is the fallback rather than a pick
function arsenalKinds(){ return Object.keys(WEAPONS).filter(k=>k!=="beam"); }

function masteryTime(kind){ return Math.max(0,Number(arsenal.mastery[kind])||0); }
function masteryLevel(kind){
  if(kind==="beam") return 3;            // always available, never practised
  const t=masteryTime(kind);
  let lv=0;
  for(const step of MASTERY_STEPS) if(t>=step) lv++;
  return lv;
}
// seconds still to go before the next level, or null at the top
function masteryNext(kind){
  const lv=masteryLevel(kind);
  if(kind==="beam"||lv>=MASTERY_STEPS.length) return null;
  return MASTERY_STEPS[lv]-masteryTime(kind);
}
function masteryAmmoMult(kind){ return MASTERY_AMMO[masteryLevel(kind)]||1; }

// a letter is a loadout option once it has been used enough to be known
function isUnlocked(kind){ return kind==="beam" || masteryLevel(kind)>=1; }

// time on the trigger. Called from the one place ammo is spent, so a letter
// cannot be practised without being paid for.
function addMastery(kind,dt){
  if(kind==="beam") return;
  const before=masteryLevel(kind);
  arsenal.mastery[kind]=masteryTime(kind)+dt;
  const after=masteryLevel(kind);
  if(after>before){
    const w=WEAPONS[kind];
    spawnFloatingText(player.x+PLAYER_W/2-camX,player.y-44,
      w.letter+" USTALIK "+after,w.color,15);
    playPowerUp();
    queueRadio(null,"SİLAH SİSTEMİ",
      [w.label+" ustalık "+after+".",
       after===1?"Artık göreve takılabilir.":"Şarjör büyüdü."],
      {color:w.color,hold:2.6});
    saveArsenal();
  } else if(Math.floor(before)!==Math.floor(after)) saveArsenal();
}

// what a floor pickup is worth, with mastery folded in
function ammoFor(kind){
  const w=WEAPONS[kind];
  if(!w) return 0;
  return w.ammo===Infinity ? Infinity : w.ammo*masteryAmmoMult(kind);
}

function setLoadout(kind){
  if(!WEAPONS[kind]||!isUnlocked(kind)) return false;
  arsenal.loadout=kind;
  saveArsenal();
  return true;
}
// what the dino walks in carrying: a partial magazine, so it is a head start
function applyLoadout(){
  const kind=arsenal.loadout;
  if(!kind||kind==="beam"||!WEAPONS[kind]||!isUnlocked(kind)){
    weapon="beam"; weaponAmmo=Infinity; rocketCd=0;
    return "beam";
  }
  weapon=kind;
  weaponAmmo=Math.max(1,ammoFor(kind)*LOADOUT_AMMO_FRAC);
  rocketCd=0;
  return kind;
}

// ── the screen ────────────────────────────────────────────────
let armSel=0;
let armKeyWasDown=false;
const ARM_ROW_H=46, ARM_TOP=118, ARM_X=64, ARM_W=540;

function openArsenal(){ STATE="arsenal"; stateTimer=0; armSel=0; }
function closeArsenal(){ STATE="map"; stateTimer=0; }
function arsenalBackButton(){ return {x:W-132, y:H-52, w:110, h:34}; }
function mapArsenalButton(){ return {x:W-150, y:H-146, w:128, h:36}; }
// beam first, so the list reads as "nothing special" down to the exotic
function arsenalList(){ return ["beam"].concat(arsenalKinds()); }
function arsenalRowAt(x,y){
  if(x<ARM_X||x>ARM_X+ARM_W) return -1;
  const i=Math.floor((y-ARM_TOP)/ARM_ROW_H);
  return (i>=0&&i<arsenalList().length)?i:-1;
}

function updateArsenal(dt){
  stateTimer+=dt;
  updateParticles(dt);
  const list=arsenalList();
  const up=K["ArrowUp"]||K["KeyW"], down=K["ArrowDown"]||K["KeyS"];
  const any=up||down;
  if(any&&!armKeyWasDown){
    armSel=(armSel+(down?1:-1)+list.length)%list.length;
    playPew();
  }
  armKeyWasDown=any;
  if(K["Enter"]&&stateTimer>0.25){
    K["Enter"]=false;
    if(setLoadout(list[armSel])) playPowerUp(); else playPew();
  }
  if(K["Escape"]||K["Backspace"]){ K["Escape"]=false; K["Backspace"]=false; closeArsenal(); }
}

function drawArsenal(){
  const g=ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,"#0c0710"); g.addColorStop(0.6,"#140a18"); g.addColorStop(1,"#0a0610");
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);

  ctx.textAlign="left";
  glow("#e879f9",14);
  ctx.font="bold 26px 'Courier New',monospace";
  ctx.fillStyle="#f5d0fe";
  ctx.fillText("CEPHANELİK",ARM_X,60);
  noGlow();
  ctx.font="bold 11px 'Courier New',monospace";
  ctx.fillStyle="#a78bba";
  ctx.fillText("KULLANDIKÇA AÇILIR — GÖREVE BİRİNİ TAK",ARM_X,78);

  const list=arsenalList();
  for(let i=0;i<list.length;i++){
    const kind=list[i];
    const w=WEAPONS[kind];
    const y=ARM_TOP+i*ARM_ROW_H;
    const on=i===armSel;
    const open=isUnlocked(kind);
    const equipped=arsenal.loadout===kind;

    ctx.fillStyle=on?"rgba(232,121,249,0.12)":"rgba(255,255,255,0.03)";
    ctx.fillRect(ARM_X,y,ARM_W,ARM_ROW_H-6);
    if(on){
      ctx.strokeStyle="#e879f9"; ctx.lineWidth=2;
      ctx.strokeRect(ARM_X+0.5,y+0.5,ARM_W-1,ARM_ROW_H-7);
    }

    // the letter, in its own colour, dimmed until it is known
    ctx.font="bold 22px 'Courier New',monospace";
    ctx.fillStyle=open?w.color:"#4a4055";
    ctx.fillText(w.letter,ARM_X+14,y+27);
    ctx.font="bold 14px 'Courier New',monospace";
    ctx.fillStyle=open?"#efe6f6":"#6b6075";
    ctx.fillText(w.label,ARM_X+44,y+20);

    ctx.font="bold 10px 'Courier New',monospace";
    if(!open){
      const left=masteryNext(kind);
      ctx.fillStyle="#7a6a86";
      ctx.fillText("KİLİTLİ — "+Math.ceil(left||0)+" sn daha ateşle",ARM_X+44,y+34);
    } else {
      const lv=masteryLevel(kind);
      ctx.fillStyle="#a78bba";
      const mag=(w.ammo===Infinity)?"SINIRSIZ"
               :(ammoFor(kind).toFixed(1)+" sn şarjör");
      ctx.fillText(kind==="beam"?"Temel silah · "+mag
                                :("USTALIK "+lv+" · "+mag),ARM_X+44,y+34);
    }

    // mastery pips
    if(kind!=="beam"){
      const px=ARM_X+ARM_W-150;
      for(let p=0;p<MASTERY_STEPS.length;p++){
        ctx.fillStyle=p<masteryLevel(kind)?w.color:"rgba(255,255,255,0.13)";
        ctx.fillRect(px+p*15,y+14,10,10);
      }
    }

    ctx.textAlign="right";
    ctx.font="bold 12px 'Courier New',monospace";
    if(equipped){
      glow("#8effc9",8);
      ctx.fillStyle="#8effc9";
      ctx.fillText("TAKILI",ARM_X+ARM_W-12,y+26);
      noGlow();
    } else if(open){
      ctx.fillStyle="#a78bba";
      ctx.fillText("TAK",ARM_X+ARM_W-12,y+26);
    }
    ctx.textAlign="left";
  }

  // the one thing that keeps this honest, said out loud
  const dy=ARM_TOP+list.length*ARM_ROW_H+10;
  ctx.font="11px 'Courier New',monospace";
  ctx.fillStyle="#8b7d97";
  ctx.fillText("Göreve takılan harf yarım şarjörle gelir — yerdeki kapsül hâlâ dolu.",
               ARM_X,dy+14);

  const b=arsenalBackButton();
  ctx.fillStyle="rgba(255,255,255,0.06)";
  ctx.fillRect(b.x,b.y,b.w,b.h);
  ctx.strokeStyle="#a78bba"; ctx.lineWidth=1;
  ctx.strokeRect(b.x+0.5,b.y+0.5,b.w-1,b.h-1);
  ctx.textAlign="center";
  ctx.font="bold 12px 'Courier New',monospace";
  ctx.fillStyle="#efe6f6";
  ctx.fillText("HARİTA",b.x+b.w/2,b.y+22);
  ctx.font="bold 10px 'Courier New',monospace";
  ctx.fillStyle="#6b6075";
  ctx.fillText(touchMode?"SATIRA DOKUN: TAK":"↑↓ SEÇ    ENTER: TAK    ESC: HARİTA",
               W/2,H-14);
  ctx.textAlign="left";
}
