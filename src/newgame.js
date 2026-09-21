// New game: the one thing six persistent stores were missing
// Part of NEON DINO-AGE: RESCUE PROTOCOL. Loaded as a classic
// script, in the order index2.html lists — these files share one
// global scope on purpose and are not modules.

// ─── STARTING OVER ────────────────────────────────────────────
// Six separate stores had accumulated — the bank, the world unlocks, the
// brood, the secret seals, the grades, the high score, and then the arsenal
// made seven — and there was no way to clear any of them. A player who
// wanted to see the campaign again could not, and the endings made that
// worse: two of the three became unreachable the moment all three records
// had ever been found.
//
// Wiping is destructive and irreversible, so it asks first. Press once to
// raise the prompt, once more to go through with it.
const RESET_STORES=[
  "neonDinoBank","neonDinoWorlds","neonDinoRoster",
  "neonDinoSecrets","neonDinoGrades","neonDinoHiScore","neonDinoArsenal",
];

let resetPrompt=false;      // the confirmation is up
let resetFlash=0;           // brief "done" flash after a wipe
let resetKeyWasDown=false;

function openResetPrompt(){ resetPrompt=true; playPew(); }
function closeResetPrompt(){ resetPrompt=false; }

// Everything a store feeds also lives in a module-level binding, so wiping
// the store alone would leave the screens showing figures that no longer
// exist anywhere. Both halves are cleared together.
function resetAll(){
  for(const k of RESET_STORES){
    try{
      if(localStorage.removeItem) localStorage.removeItem(k);
      else localStorage.setItem(k,"");
    }catch(e){}
  }
  bank={coins:0, earned:0, firstClear:{}, up:{}};
  roster={members:[], lost:0, delivered:0, nextId:1};
  secretSeals={};
  arsenal={mastery:{}, loadout:"beam"};
  worldProgress={};
  bestGrades={};
  hiScore=0;
  newRecord=false;
  // the story too: beats, and the records this run is carrying
  arcSeen={};
  arcOpened={};
  // put the cursor back on the only world that is open again
  mapSel=0; worldIndex=0;
  resetPrompt=false;
  resetFlash=1.6;
  playPowerUp();
}

function mapResetButton(){ return {x:24, y:H-58, w:150, h:36}; }
function resetYesButton(){ return {x:W/2-150, y:H/2+26, w:130, h:40}; }
function resetNoButton(){  return {x:W/2+20,  y:H/2+26, w:130, h:40}; }

// called from the map's update, before the map's own keys are read
function updateReset(dt){
  if(resetFlash>0) resetFlash-=dt;
  if(!resetPrompt){
    const n=K["KeyN"];
    if(n&&!resetKeyWasDown&&stateTimer>0.25) openResetPrompt();
    resetKeyWasDown=n;
    return false;
  }
  resetKeyWasDown=K["KeyN"];
  // while the prompt is up it owns the input, so a stray ENTER cannot start
  // a world behind it
  if(K["Enter"]){ K["Enter"]=false; resetAll(); }
  if(K["Escape"]||K["Backspace"]||K["KeyR"]){
    K["Escape"]=false; K["Backspace"]=false; K["KeyR"]=false;
    closeResetPrompt();
  }
  return true;
}

function drawResetButton(){
  const b=mapResetButton();
  ctx.save();
  ctx.fillStyle="rgba(255,255,255,0.04)";
  ctx.fillRect(b.x,b.y,b.w,b.h);
  ctx.strokeStyle="#5a4a58"; ctx.lineWidth=1;
  ctx.strokeRect(b.x+0.5,b.y+0.5,b.w-1,b.h-1);
  ctx.textAlign="center";
  ctx.font="bold 12px 'Courier New',monospace";
  ctx.fillStyle="#9a8aa0";
  ctx.fillText("YENİ OYUN",b.x+b.w/2,b.y+17);
  ctx.font="bold 9px 'Courier New',monospace";
  ctx.fillStyle="#6a5a70";
  ctx.fillText(touchMode?"DOKUN":"N",b.x+b.w/2,b.y+30);
  if(resetFlash>0){
    ctx.globalAlpha=Math.min(1,resetFlash);
    glow("#8effc9",10);
    ctx.fillStyle="#8effc9";
    ctx.font="bold 11px 'Courier New',monospace";
    ctx.fillText("SİLİNDİ",b.x+b.w/2,b.y-8);
    noGlow();
  }
  ctx.textAlign="left";
  ctx.restore();
}

function drawResetPrompt(){
  if(!resetPrompt) return;
  ctx.save();
  ctx.fillStyle="rgba(0,0,0,0.78)";
  ctx.fillRect(0,0,W,H);
  const bw=520,bh=230,bx=W/2-bw/2,by=H/2-bh/2;
  ctx.fillStyle="rgba(12,6,10,0.96)";
  ctx.fillRect(bx,by,bw,bh);
  glow("#ff5577",16);
  ctx.strokeStyle="#ff5577"; ctx.lineWidth=2;
  ctx.strokeRect(bx,by,bw,bh);
  noGlow();

  ctx.textAlign="center";
  glow("#ff5577",12);
  ctx.font="bold 22px 'Courier New',monospace";
  ctx.fillStyle="#ff8899";
  ctx.fillText("YENİ OYUN",W/2,by+40);
  noGlow();

  ctx.font="13px 'Courier New',monospace";
  ctx.fillStyle="#e6d6dc";
  const lines=[
    "Her şey silinecek ve geri alınamaz:",
    "kasa ve yükseltmeler, soy listesi,",
    "gizli mühürler, dereceler, rekor,",
    "silah ustalığı ve açılmış bölgeler.",
  ];
  for(let i=0;i<lines.length;i++) ctx.fillText(lines[i],W/2,by+72+i*18);

  const yes=resetYesButton(), no=resetNoButton();
  ctx.fillStyle="rgba(255,85,119,0.16)";
  ctx.fillRect(yes.x,yes.y,yes.w,yes.h);
  ctx.strokeStyle="#ff5577"; ctx.lineWidth=2;
  ctx.strokeRect(yes.x+0.5,yes.y+0.5,yes.w-1,yes.h-1);
  ctx.font="bold 14px 'Courier New',monospace";
  ctx.fillStyle="#ff8899";
  ctx.fillText("SİL",yes.x+yes.w/2,yes.y+25);

  ctx.fillStyle="rgba(255,255,255,0.06)";
  ctx.fillRect(no.x,no.y,no.w,no.h);
  ctx.strokeStyle="#8899bb"; ctx.lineWidth=2;
  ctx.strokeRect(no.x+0.5,no.y+0.5,no.w-1,no.h-1);
  ctx.fillStyle="#c8d4ee";
  ctx.fillText("VAZGEÇ",no.x+no.w/2,no.y+25);

  ctx.font="bold 10px 'Courier New',monospace";
  ctx.fillStyle="#7a6a80";
  ctx.fillText(touchMode?"BİRİNE DOKUN":"ENTER: SİL     ESC: VAZGEÇ",W/2,by+bh-14);
  ctx.textAlign="left";
  ctx.restore();
}

// taps, handled before the map's own node hit-test
function resetTapAt(p){
  if(resetPrompt){
    const yes=resetYesButton(), no=resetNoButton();
    if(p.x>=yes.x&&p.x<=yes.x+yes.w&&p.y>=yes.y&&p.y<=yes.y+yes.h){ resetAll(); return true; }
    if(p.x>=no.x&&p.x<=no.x+no.w&&p.y>=no.y&&p.y<=no.y+no.h){ closeResetPrompt(); return true; }
    return true;        // the prompt swallows every other tap
  }
  const b=mapResetButton();
  if(p.x>=b.x&&p.x<=b.x+b.w&&p.y>=b.y&&p.y<=b.y+b.h){ openResetPrompt(); return true; }
  return false;
}
