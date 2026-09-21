// The secret: a key on a perch, a chest by the rift
// Part of NEON DINO-AGE: RESCUE PROTOCOL. Loaded as a classic
// script, in the order index2.html lists — these files share one
// global scope on purpose and are not modules.

// ─── THE SECRET ───────────────────────────────────────────────
// One key per stage that asks for one, sitting on a perch above the route
// rather than on it — the whole point is that you have to go out of your way
// and spend fuel to get there. The chest waits on the goal ledge beside the
// rift, so the reward is collected on the way out and a key you never found
// is a chest you walk past.
//
// The key is re-collected every run: it opens that run's chest. What
// persists is only the fact that you have EVER found it, which is what the
// map screen reads. So the seal is a record, not an inventory.
const SECRET_SCORE=10000;
const KEY_W=34, KEY_H=48;
const CHEST_W=56, CHEST_H=46;
const KEY_NOTICE_SECONDS=2.6;

let secretKey=null;       // {x,y,taken,bob} — this run's key
let secretChest=null;     // {x,y,open,pulse}
let keyNoticeTimer=0;     // the KEY COLLECTED! banner
let secretSeals={};       // persisted: {stage0_key:true, ...}
try{
  const raw=localStorage.getItem("neonDinoSecrets");
  if(raw){
    const p=JSON.parse(raw);
    if(p&&typeof p==="object") secretSeals=p;
  }
}catch(e){ /* blocked or corrupt store: nothing has been found yet */ }

// One store entry holding fields named stage<N>_key, rather than N separate
// localStorage keys — same record, one thing to read back and validate.
function sealKeyName(i){ return "stage"+i+"_key"; }
function hasSeal(i){ return secretSeals[sealKeyName(i)]===true; }
function saveSeals(){
  try{ localStorage.setItem("neonDinoSecrets",JSON.stringify(secretSeals)); }catch(e){}
}
// has any stage of this world given up its key?
function worldHasSeal(wi){
  const w=WORLDS[wi];
  if(!w) return false;
  return w.levels.some(li=>hasSeal(li));
}
// ...and does this world hide one at all?
function worldHasSecret(wi){
  const w=WORLDS[wi];
  if(!w) return false;
  return w.levels.some(li=>!!(LEVELS[li]&&LEVELS[li].secretKey));
}

function initSecrets(){
  const spec=LEVELS[levelIndex].secretKey;
  secretKey = spec ? {x:spec.x, y:spec.y, taken:false, bob:rnd(0,Math.PI*2)} : null;
  secretChest=null;
  keyNoticeTimer=0;
  if(!spec) return;
  // the chest lives on the goal ledge, off to one side of the rift
  for(const p of platforms){
    if(!p.goal) continue;
    secretChest={x:p.x+p.w-CHEST_W-10, y:p.y-CHEST_H, open:false, pulse:0};
    break;
  }
}

function keyHeld(){ return !!(secretKey&&secretKey.taken); }

function collectSecretKey(){
  secretKey.taken=true;
  keyNoticeTimer=KEY_NOTICE_SECONDS;
  secretSeals[sealKeyName(levelIndex)]=true;
  saveSeals();
  playPowerUp();
  playChime(8);
  feverFlash=Math.max(feverFlash,0.5);
  screenShake=Math.min(6,screenShake+2);
  spawnFloatingText(secretKey.x-camX,secretKey.y-30,"GİZLİ ANAHTAR!","#ffdd44",16);
  spawnParticles(secretKey.x-camX,secretKey.y-10,26,["#ffdd44","#ffaa00","#ffffff"],
    {minSpd:70,maxSpd:260,minLife:0.4,maxLife:1.0,type:"circle",gravity:60,minSz:2,maxSz:6});
}

function openSecretChest(){
  secretChest.open=true;
  score+=SECRET_SCORE;
  // the shield is already a ten-second power-up, which is what was asked for
  applyPowerUp("shield");
  playPowerUp();
  playExplosion();
  hitStopTimer=Math.max(hitStopTimer,0.08);
  screenShake=Math.min(6,screenShake+5);
  feverFlash=Math.max(feverFlash,0.9);
  const cx=secretChest.x+CHEST_W/2-camX, cy=secretChest.y+CHEST_H/2;
  spawnFloatingText(cx,cy-46,"+"+SECRET_SCORE.toLocaleString(),"#ffdd44",22);
  spawnFloatingText(cx,cy-22,"ENERJİ KALKANI","#33ff88",15);
  spawnParticles(cx,cy,44,["#ffdd44","#ffaa00","#33ff88","#ffffff"],
    {minSpd:90,maxSpd:340,upBias:80,minLife:0.4,maxLife:1.2,type:"square",gravity:180,minSz:2,maxSz:7});
  queueRadio(null,"KOMUTA MERKEZİ",
    ["Gizli sandık açıldı!","Enerji kalkanı devrede."],
    {color:"#ffdd44",hold:2.6});
  // ...and then somebody else does. The chest is the only place in the game
  // the archive gets a word in, which is why it is behind a detour.
  arcLog();
}

function updateSecrets(dt){
  if(keyNoticeTimer>0) keyNoticeTimer-=dt;
  const pr={x:player.x, y:player.y, w:PLAYER_W, h:PLAYER_H};
  if(secretKey&&!secretKey.taken){
    secretKey.bob+=dt*2.4;
    if(overlaps(pr,{x:secretKey.x-KEY_W/2, y:secretKey.y-KEY_H, w:KEY_W, h:KEY_H}))
      collectSecretKey();
  }
  if(secretChest&&!secretChest.open){
    secretChest.pulse+=dt*3;
    if(keyHeld()&&overlaps(pr,{x:secretChest.x,y:secretChest.y,w:CHEST_W,h:CHEST_H}))
      openSecretChest();
  }
}

// ── drawing ───────────────────────────────────────────────────
// Both sprites get a procedural stand-in, because art loads asynchronously
// and the first frames render before it arrives.
function drawSecretKey(){
  if(!secretKey||secretKey.taken) return;
  const sx=secretKey.x-camX;
  if(sx<-80||sx>W+80) return;
  const lift=Math.sin(secretKey.bob)*4;
  ctx.save();
  // a beacon, so it is visible from the route you are leaving
  ctx.globalCompositeOperation="lighter";
  const g=ctx.createRadialGradient(sx,secretKey.y-KEY_H*0.6,2,sx,secretKey.y-KEY_H*0.6,54);
  g.addColorStop(0,"rgba(255,221,68,0.34)");
  g.addColorStop(1,"rgba(255,221,68,0)");
  ctx.fillStyle=g;
  ctx.fillRect(sx-54,secretKey.y-KEY_H*0.6-54,108,108);
  ctx.restore();

  const art=artFor("secret_key.png");
  if(art&&art.loaded){
    const bb=art.bbox||{x:0,y:0,w:art.img.naturalWidth,h:art.img.naturalHeight};
    const sc=Math.min(KEY_W*1.5/bb.w, KEY_H*1.5/bb.h);
    const dw=bb.w*sc, dh=bb.h*sc;
    ctx.drawImage(art.img,bb.x,bb.y,bb.w,bb.h,sx-dw/2,secretKey.y-dh+lift,dw,dh);
  } else {
    // stand-in: a gold key shape on a stub of pillar
    ctx.fillStyle="#4a4a56";
    ctx.fillRect(sx-14,secretKey.y-16,28,16);
    glow("#ffdd44",14);
    ctx.fillStyle="#ffdd44";
    ctx.beginPath();
    ctx.arc(sx,secretKey.y-40+lift,7,0,Math.PI*2);
    ctx.fill();
    ctx.fillRect(sx-2,secretKey.y-36+lift,4,20);
    ctx.fillRect(sx-2,secretKey.y-22+lift,9,3);
    noGlow();
  }
}

function drawSecretChest(){
  if(!secretChest) return;
  const sx=secretChest.x-camX;
  if(sx<-90||sx>W+90) return;
  const armed=keyHeld()&&!secretChest.open;
  if(armed){
    // it answers the key: the chest lights up once you are carrying one
    ctx.save();
    ctx.globalCompositeOperation="lighter";
    const p=0.5+0.5*Math.sin(secretChest.pulse*2);
    const g=ctx.createRadialGradient(sx+CHEST_W/2,secretChest.y+CHEST_H/2,2,
                                     sx+CHEST_W/2,secretChest.y+CHEST_H/2,60);
    g.addColorStop(0,"rgba(255,221,68,"+(0.18+0.20*p).toFixed(3)+")");
    g.addColorStop(1,"rgba(255,221,68,0)");
    ctx.fillStyle=g;
    ctx.fillRect(sx+CHEST_W/2-60,secretChest.y+CHEST_H/2-60,120,120);
    ctx.restore();
  }
  const art=artFor("secret_chest.png");
  ctx.save();
  if(secretChest.open) ctx.globalAlpha=0.55;
  if(art&&art.loaded){
    const bb=art.bbox||{x:0,y:0,w:art.img.naturalWidth,h:art.img.naturalHeight};
    const sc=Math.min(CHEST_W*1.35/bb.w, CHEST_H*1.35/bb.h);
    const dw=bb.w*sc, dh=bb.h*sc;
    ctx.drawImage(art.img,bb.x,bb.y,bb.w,bb.h,
                  sx+CHEST_W/2-dw/2, secretChest.y+CHEST_H-dh, dw, dh);
  } else {
    ctx.fillStyle="#6b4425";
    ctx.fillRect(sx,secretChest.y+10,CHEST_W,CHEST_H-10);
    ctx.fillStyle="#8a5a2f";
    ctx.fillRect(sx,secretChest.y,CHEST_W,14);
    ctx.fillStyle=armed?"#ffdd44":"#c8a24a";
    ctx.fillRect(sx+CHEST_W/2-6,secretChest.y+12,12,12);
  }
  ctx.restore();
  if(secretChest.open){
    ctx.save();
    ctx.textAlign="center";
    ctx.font="bold 10px 'Courier New',monospace";
    ctx.fillStyle="#8effc9";
    ctx.fillText("AÇILDI",sx+CHEST_W/2,secretChest.y-8);
    ctx.textAlign="left";
    ctx.restore();
  }
}

// the notice, bottom-right, in screen space
function drawKeyNotice(){
  if(keyNoticeTimer<=0) return;
  const k=Math.min(1,keyNoticeTimer/0.4);      // fades out at the end
  const pulse=0.5+0.5*Math.sin(t*10);
  ctx.save();
  ctx.globalAlpha=k;
  ctx.textAlign="right";
  glow("#ffdd44",12+10*pulse);
  ctx.font="bold 18px 'Courier New',monospace";
  ctx.fillStyle="#ffdd44";
  ctx.fillText("KEY COLLECTED!",W-20,H-64);
  noGlow();
  ctx.font="bold 11px 'Courier New',monospace";
  ctx.fillStyle="#ffeaa0";
  ctx.fillText("Sandık portalın yanında",W-20,H-48);
  ctx.textAlign="left";
  ctx.restore();
}

// the little key glyph the map screen draws under a world node
function drawKeyGlyph(cx,cy,lit,scale){
  const s=scale||1;
  ctx.save();
  if(lit) glow("#ffdd44",10);
  ctx.fillStyle=lit?"#ffdd44":"#4a4f60";
  ctx.beginPath(); ctx.arc(cx,cy-4*s,4*s,0,Math.PI*2); ctx.fill();
  ctx.fillRect(cx-1.2*s,cy-2*s,2.4*s,10*s);
  ctx.fillRect(cx-1.2*s,cy+4*s,5*s,1.8*s);
  ctx.fillRect(cx-1.2*s,cy+7*s,4*s,1.8*s);
  if(lit) noGlow();
  ctx.restore();
}
