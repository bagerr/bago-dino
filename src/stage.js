// Entering a world, hazards, loadLevel
// Part of NEON DINO-AGE: RESCUE PROTOCOL. Loaded as a classic
// script, in the order index2.html lists — these files share one
// global scope on purpose and are not modules.

// ─── ENTERING A WORLD ─────────────────────────────────────────
// A world is a run of stages. Starting one is a fresh mission: score, credits
// and the arsenal all reset, which is what makes a per-world grade and a
// per-world rescue tally mean anything.
function worldOfLevel(i){
  for(let w=0;w<WORLDS.length;w++) if(WORLDS[w].levels.indexOf(i)>=0) return w;
  return 0;
}
function stageInWorld(){
  const lv=WORLDS[worldIndex]?WORLDS[worldIndex].levels:[];
  const p=lv.indexOf(levelIndex);
  return {pos:p<0?0:p, count:lv.length||1};
}
function startWorld(i){
  const w=WORLDS[i];
  if(!w||!w.levels.length) return false;
  worldIndex=i;
  score=0; chain=0; chainTimer=0; feverMode=false; feverFlash=0;
  newRecord=false;
  player.maxHp=maxHearts();          // the hangar's armour plating
  player.hp=player.maxHp; player.invuln=0;
  player.activePower=null; player.shieldCharge=false;
  player.dashTimer=0; player.dashCooldown=0; player.dashKeyWasDown=false;
  continuesLeft=maxContinues(); continueTimer=0;
  applyLoadout();   // a requisitioned letter, at half a magazine
  rescuedTotal=0; lastRescueBonus=0; lastComboBonus=0; babyDinos=[];
  screenShake=0; bossShakeTimer=0; hitStopTimer=0;
  stopLaserSound(); stopSiren(); player.wasFiring=false;
  loadLevel(w.levels[0]);
  STATE="playing"; stateTimer=0;
  return true;
}
// Called when the last stage of a world is signed off. Stamps the map,
// unlocks the next world, and drops the player back onto it.
function finishWorld(){
  markWorldCleared(worldIndex);
  mapStampWorld=worldIndex; mapStampTimer=2.4; mapSel=worldIndex;
  const anyLeft=WORLDS.some((w,i)=>w.levels.length&&!worldState(i).cleared);
  if(!anyLeft){ STATE="win"; stateTimer=0; return; }
  arcDebrief();
  STATE="map"; stateTimer=0;
  playPowerUp();
}

// A mirror sheen over every walking surface while the Titan's floor is
// frozen, so "you have no grip any more" is something you can see before it
// is something you discover.
function drawGlaze(){
  if(!titanSlick()) return;
  const pulse=0.5+0.5*Math.sin(t*3);
  ctx.save();
  ctx.globalCompositeOperation="lighter";
  for(const p of platforms){
    if(p.lavaPit||p.gone) continue;
    const sx=p.x-camX;
    if(sx>W||sx+p.w<0) continue;
    const g=ctx.createLinearGradient(0,p.y,0,p.y+16);
    g.addColorStop(0,"rgba(223,246,255,"+(0.20+0.10*pulse).toFixed(3)+")");
    g.addColorStop(1,"rgba(125,211,252,0)");
    ctx.fillStyle=g;
    ctx.fillRect(sx,p.y,p.w,16);
  }
  ctx.restore();
}

// The pond's whole warning is drawn, not felt: a fracture that spreads out
// from the middle as the fuse burns down, so you can see how much of the
// crossing you have left.
function drawCracks(px,p,urg){
  if(urg<=0) return;
  const cx=px+p.w/2, cy=p.y+3;
  ctx.save();
  ctx.strokeStyle="rgba(10,30,52,"+(0.35+0.5*urg).toFixed(3)+")";
  ctx.lineWidth=1+urg*1.6;
  for(let i=0;i<5;i++){
    // deterministic per pond and per branch, so the fracture does not
    // reshuffle itself every frame
    const seed=(p.x*7+i*131)%997;
    const dir=(i%2?1:-1), spread=(p.w/2)*urg;
    ctx.beginPath();
    ctx.moveTo(cx,cy);
    let x=cx, y=cy;
    for(let seg=1;seg<=3;seg++){
      x+=dir*spread/3;
      y+=((seed+seg*37)%11-5)*0.9;
      ctx.lineTo(x,y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// A low shelf gets teeth on its underside, because a plain dark box reads as
// "climb me" and this one has to read as "get under me".
function drawLowBars(){
  for(const p of platforms){
    if(!p.lowBar||p.gone) continue;
    const px=p.x-camX;
    if(px+p.w<0||px>W) continue;
    const base=p.y+p.h;
    ctx.save();
    ctx.fillStyle="#bae6fd";
    for(let x=px+4;x<px+p.w-2;x+=12){
      const h=9+((p.x+x)%7)*1.6;
      ctx.beginPath();
      ctx.moveTo(x,base); ctx.lineTo(x+6,base); ctx.lineTo(x+3,base+h);
      ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha=0.35;
    ctx.fillStyle="#7dd3fc";
    ctx.fillRect(px,base-4,p.w,4);
    ctx.restore();
  }
}

// ─── THE SLIDE ────────────────────────────────────────────────
// Down while you have your feet on something drops the dino into a baseball
// slide. It is not a second dash: there are no i-frames and no lift, it only
// carries you low and fast, which is the whole point — it is the only way
// under a low ice shelf, and on a cracking pond it is the difference between
// crossing and going through.
const SLIDE_TIME=0.55;      // how long the dino stays down
const SLIDE_SPD=430;        // the kick it starts with
const SLIDE_COOLDOWN=0.4;   // ...after it ends, so it is not a way to travel
function startSlide(){
  player.slideT=SLIDE_TIME;
  player.slideCooldown=SLIDE_TIME+SLIDE_COOLDOWN;
  player.vx=player.facing*SLIDE_SPD;
  playRicochet();
  spawnParticles(player.x+PLAYER_W/2-camX, player.y+PLAYER_H-4, 12,
    ["#dff6ff","#bae6fd","#ffffff"],
    {minSpd:60,maxSpd:200,minLife:0.2,maxLife:0.5,type:"square",gravity:260,minSz:2,maxSz:5});
}
function endSlide(){ player.slideT=0; }
function updateSlide(dt,downKey,jump){
  if(player.slideCooldown>0) player.slideCooldown-=dt;
  if(player.slideT>0){
    player.slideT-=dt;
    // the slide owns vx while it runs. On ice it barely bleeds off at all,
    // which is what makes the move belong to this biome.
    player.vx*=Math.pow(isIce()?0.62:0.2,dt);
    if(Math.random()<dt*40) spawnParticles(
      player.x+PLAYER_W/2-camX, player.y+PLAYER_H-3, 1,
      ["#dff6ff","#ffffff"],
      {minSpd:40,maxSpd:150,minLife:0.15,maxLife:0.4,type:"square",gravity:240,minSz:1,maxSz:4});
    // a jump cancels it, and so does leaving the ground
    if(jump || player.groundT>0.16 || player.slideT<=0) endSlide();
  } else if(downKey && !player.slideKeyWasDown &&
            player.groundT<0.12 && player.slideCooldown<=0){
    startSlide();
  }
  player.slideKeyWasDown=!!downKey;
}

// ─── THE BLIZZARD ─────────────────────────────────────────────
// A stage can declare `wind`: gusts that blow across it on a cycle — calm,
// a telegraphed warning, then a couple of seconds of real sideways pressure.
// It is the horizontal answer to the canopy's rising fog, and it only means
// anything on ice, where you cannot plant your feet and stop.
//
// The gust is modelled as drag toward a wind speed, not as a raw force: an
// unopposed dino is carried up to `speed` and no further, so the shove can
// never fling anyone across the level. And it only ever ACCELERATES you
// downwind — running with the wind faster than the wind is not braked, which
// would read as a bug rather than as weather.
let windState="off", windTimer=0, windDir=-1;
function initWind(){
  const w=LEVELS[levelIndex].wind;
  windState = w ? "calm" : "off";
  windTimer = w ? rnd(1.5,3) : 0;
  windDir   = -1;
}
function applyWind(dt){
  const w=LEVELS[levelIndex].wind;
  if(!w||windState!=="blow") return;
  const target=windDir*(w.speed||170);
  if((target-player.vx)*windDir>0)
    player.vx += (target-player.vx)*Math.min(1,dt*(w.rate||1.9));
}
function updateWind(dt){
  const w=LEVELS[levelIndex].wind;
  if(!w){ windState="off"; return; }
  windTimer-=dt;
  if(windState==="calm"&&windTimer<=0){
    // the direction is chosen at the warning, never at the gust, so the
    // arrow you are shown is always the way you are about to be pushed
    windDir=Math.random()<0.5?-1:1;
    windState="warn"; windTimer=w.warn||1;
    playRadioBeep(true);
    // the first gust of the stage explains itself; after that the arrow and
    // the whiteout are the whole language
    queueRadio("storm","TİPİ ALARMI",
      ["Şiddetli rüzgâr yaklaşıyor.","Ok yönünde savrulacaksın —",
       "sağlam zemine geç!"],
      {color:"#7dd3fc",urgent:true,hold:3.4});
  } else if(windState==="warn"&&windTimer<=0){
    windState="blow"; windTimer=w.blow||2;
    screenShake=Math.min(6,screenShake+3);
  } else if(windState==="blow"&&windTimer<=0){
    windState="calm"; windTimer=rnd(w.calmMin||3.2,w.calmMax||5);
  }
  if(windState==="blow"&&Math.random()<dt*70){
    // snow torn across the screen, so the gust is visible in the air and not
    // only in how the dino moves. Particles live in screen space.
    particles.push({
      x: windDir>0?-10:W+10, y: rnd(0,H-60),
      vx: windDir*rnd(430,780), vy: rnd(-30,60),
      life:1, maxLife:rnd(0.5,1.1),
      color: Math.random()<0.5?"#ffffff":"#bfe6ff",
      size: rnd(1,3), type:"square", gravity:0
    });
  }
}
function drawWind(){
  if(windState==="off"||windState==="calm") return;
  const blowing=windState==="blow";
  const pulse=0.5+0.5*Math.sin(t*(blowing?14:9));
  ctx.save();
  // a white-out crawling in from the side it blows from
  const g = windDir>0 ? ctx.createLinearGradient(0,0,W*0.45,0)
                      : ctx.createLinearGradient(W,0,W*0.55,0);
  const a=(blowing?0.16:0.07)+0.06*pulse;
  g.addColorStop(0,"rgba(223,246,255,"+a.toFixed(3)+")");
  g.addColorStop(1,"rgba(223,246,255,0)");
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);

  // the arrow, so which way it blows is never a guess
  ctx.textAlign="center";
  ctx.font="bold 24px 'Courier New',monospace";
  ctx.globalAlpha=blowing?1:0.45+0.55*pulse;
  ctx.fillStyle="#dff6ff";
  glow("#7dd3fc",blowing?16:8);
  ctx.fillText(windDir>0?"\u00bb\u00bb\u00bb":"\u00ab\u00ab\u00ab",
               W/2+(blowing?Math.sin(t*20)*6:0),52);
  ctx.font="bold 11px 'Courier New',monospace";
  ctx.fillText(blowing?"FIRTINA":"FIRTINA GELIYOR",W/2,70);
  noGlow();
  ctx.globalAlpha=1;
  ctx.textAlign="left";
  ctx.restore();
}

// ─── THE RISING TIDE ──────────────────────────────────────────
// A stage can declare `fog`: a sheet of spore-thick air that climbs from
// below and burns anything still under it. It is the only pressure in the
// game that is not an enemy — you cannot kill it, you can only out-climb it.
let fogY=Infinity, fogHurt=0;
function initFog(){
  const f=LEVELS[levelIndex].fog;
  fogY=f?f.startY:Infinity;
  fogHurt=0;
}
function updateFog(dt){
  const f=LEVELS[levelIndex].fog;
  if(!f) return;
  fogY=Math.max(f.topY,fogY-f.rise*dt);
  if(fogHurt>0) fogHurt-=dt;
  // standing in it burns, on a cooldown rather than every frame
  if(player.y+PLAYER_H>fogY && player.invuln<=0 && fogHurt<=0){
    fogHurt=1.1;
    takeDamage("enemy");
    spawnFloatingText(player.x+PLAYER_W/2-camX,player.y-18,"ZEHİR!","#6ee7b7",14);
  }
  // spores boiling off the surface
  if(Math.random()<dt*40){
    particles.push({
      x:rnd(0,W), y:fogY+rnd(-6,18),
      vx:rnd(-14,14), vy:-rnd(12,44),
      life:1, maxLife:rnd(0.8,1.8),
      color:Math.random()<0.5?"rgba(110,231,183,0.6)":"rgba(34,197,94,0.5)",
      size:rnd(2,5), type:"circle", gravity:-8
    });
  }
}
function drawFog(){
  if(!isFinite(fogY)) return;
  const top=fogY;
  if(top>H+camY) return;
  ctx.save();
  const g=ctx.createLinearGradient(0,top-30,0,top+120);
  g.addColorStop(0,"rgba(34,197,94,0)");
  g.addColorStop(0.25,"rgba(22,163,74,0.45)");
  g.addColorStop(1,"rgba(6,78,59,0.85)");
  ctx.fillStyle=g;
  ctx.fillRect(-200,top-30,W+400,H*2);
  // a wobbling surface line, same trick as the lava
  glow("#6ee7b7",16);
  ctx.strokeStyle="rgba(167,243,208,0.9)"; ctx.lineWidth=2;
  ctx.beginPath();
  for(let i=-40;i<=W+40;i+=12){
    const wx=(camX+i)/22;
    const hh=4*Math.sin(t*1.8+wx)+2*Math.sin(t*2.7+wx*1.5);
    i===-40?ctx.moveTo(i,top+hh):ctx.lineTo(i,top+hh);
  }
  ctx.stroke(); noGlow();
  ctx.restore();
}

// ─── FALLING ICICLES ──────────────────────────────────────────
// Hanging from the ceiling until you walk under one: it shakes for
// ICICLE_WARN, then drops like a stone and shatters. The warning is the
// whole mechanic — it is a hazard you are told about, not one that cheats.
const ICICLE_WARN=0.3, ICICLE_RESPAWN=6;
let icicles=[];
function initIcicles(){
  icicles=(LEVELS[levelIndex].icicles||[]).map(ic=>({
    x:ic.x, y:ic.y!==undefined?ic.y:40, baseY:ic.y!==undefined?ic.y:40,
    state:"hang", timer:0, vy:0
  }));
}
// the Titan's ground pound brings the whole ceiling down at once
function dropAllIcicles(){
  let n=0;
  for(const ic of icicles){
    if(ic.state!=="hang") continue;
    ic.state="shake"; ic.timer=ICICLE_WARN*0.6; n++;
  }
  return n;
}
function updateIcicles(dt){
  const pcx=player.x+PLAYER_W/2;
  for(const ic of icicles){
    if(ic.state==="hang"){
      // Shoot one down on purpose. No warning shake — it is your shot, you
      // already know it is coming, and dropping one on the armoured top of a
      // crusher is the point.
      if(laser && icicleInBeam(ic)){
        ic.state="fall"; ic.vy=160;
        spawnParticles(ic.x-camX,ic.y,8,["#dff6ff","#7dd3fc"],
          {minSpd:40,maxSpd:150,minLife:0.15,maxLife:0.4,type:"square",gravity:200,minSz:1,maxSz:3});
      }
      // armed by the player walking underneath it
      else if(Math.abs(pcx-ic.x)<26 && player.y>ic.y){ ic.state="shake"; ic.timer=ICICLE_WARN; }
    } else if(ic.state==="shake"){
      ic.timer-=dt;
      if(ic.timer<=0){ ic.state="fall"; ic.vy=120; }
    } else if(ic.state==="fall"){
      ic.vy+=1500*dt;
      ic.y+=ic.vy*dt;
      if(player.invuln<=0 &&
         Math.abs(pcx-ic.x)<20 && Math.abs((player.y+PLAYER_H/2)-ic.y)<38){
        takeDamage("enemy");
        shatterIcicle(ic);
        continue;
      }
      // a falling spike lands on enemies too, and it lands on TOP — which is
      // the side a crusher's armour does not cover
      let struck=null;
      for(const e of [...enemies,...groundEnemies]){
        if(e.dead||e.dying) continue;
        if(Math.abs((e.x+e.w/2)-ic.x)<e.w/2+14 && Math.abs((e.y+e.h/2)-ic.y)<e.h/2+20){
          struck=e; break;
        }
      }
      if(struck){
        if(struck.frozen>0) shatterFrozen(struck);
        else {
          struck.hp-=3; struck.hitFlash=0.3;
          spawnFloatingText(struck.x+struck.w/2-camX,struck.y-12,"BUZ!","#bae6fd",14);
          if(struck.hp<=0&&!struck.dying){ struck.dying=true; struck.deathTimer=0.07; }
        }
        shatterIcicle(ic);
        continue;
      }
      // shatters on the first solid thing under it
      let hit=ic.y>LAVA_Y;
      if(!hit) for(const p of platforms){
        if(p.lavaPit||p.gone) continue;
        if(ic.x>p.x && ic.x<p.x+p.w && ic.y>=p.y && ic.y<=p.y+p.h+20){ hit=true; break; }
      }
      if(hit) shatterIcicle(ic);
    } else {
      ic.timer-=dt;
      if(ic.timer<=0){ ic.state="hang"; ic.y=ic.baseY; ic.vy=0; }
    }
  }
}
// the beam test for a hanging icicle, in the same terms inLaserSweep uses
function icicleInBeam(ic){
  if(!laser) return false;
  const reach=laser.mouthX+laser.dir*laser.len;
  const withinX = laser.dir>0 ? (ic.x>=laser.mouthX&&ic.x<=reach)
                              : (ic.x<=laser.mouthX&&ic.x>=reach);
  if(!withinX) return false;
  const ys=laser.ys||[laser.mouthY];
  return ys.some(ly=>Math.abs(ly-ic.y)<40);
}
function shatterIcicle(ic){
  ic.state="gone"; ic.timer=ICICLE_RESPAWN;
  playExplosion();
  screenShake=Math.min(6,screenShake+3);
  spawnParticles(ic.x-camX,ic.y,16,["#dff6ff","#7dd3fc","#bae6fd","#ffffff"],
    {minSpd:70,maxSpd:240,minLife:0.25,maxLife:0.6,type:"square",gravity:420,minSz:2,maxSz:5});
}
function drawIcicles(){
  const a=artFor("ice_icicle.png");
  const ready=a&&a.loaded;
  for(const ic of icicles){
    if(ic.state==="gone") continue;
    let x=ic.x-camX;
    if(x<-40||x>W+40) continue;
    if(ic.state==="shake") x+=Math.sin(t*50)*3;   // the tell
    const h=74, w=22;
    if(ready){
      // one clean spike out of the middle of the cluster sheet
      ctx.drawImage(a.img,400,120,240,880, x-w/2,ic.y-h*0.5,w,h);
    } else {
      ctx.fillStyle="#9fd8f5";
      ctx.beginPath();
      ctx.moveTo(x-9,ic.y-h*0.5); ctx.lineTo(x+9,ic.y-h*0.5); ctx.lineTo(x,ic.y+h*0.5);
      ctx.closePath(); ctx.fill();
    }
    if(ic.state==="shake"){
      glow("#bae6fd",12);
      ctx.strokeStyle="rgba(190,230,255,0.9)"; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(x,ic.y+h*0.5); ctx.lineTo(x,LAVA_Y); ctx.stroke();
      noGlow();
    }
  }
}

// ─── CRUMBLING SHELVES ────────────────────────────────────────
// A mushroom shelf holds your weight for CRUMBLE_DELAY, shakes while it
// decides, drops away, and grows back. Platforms are per-stage COPIES, so
// this runtime state can live on them directly.
const CRUMBLE_DELAY=0.55, CRUMBLE_RESPAWN=2.8;
// A frozen pond is a crumbling shelf with a longer fuse and a different
// tell: it does not rattle, it cracks. It sits over a cryo pit, so the
// thing under it is not a drop, it is the end of the run.
const CRACK_DELAY=1.0, CRACK_RESPAWN=3.6;
function fuseFor(p){ return p.crack?CRACK_DELAY:CRUMBLE_DELAY; }
const BOUNCE_VY=-760;
const BOUNCE_FUEL=0.45;   // a fixed top-up per bounce, not a per-frame trickle
function updateCrumbles(dt){
  for(const p of platforms){
    if(!p.crumble&&!p.crack) continue;
    if(p.gone){
      p.respawnT-=dt;
      if(p.respawnT<=0){ p.gone=false; p.crumbleT=undefined; }
    } else if(p.crumbleT!==undefined){
      p.crumbleT-=dt;
      if(p.crumbleT<=0){
        p.gone=true; p.respawnT=p.crack?CRACK_RESPAWN:CRUMBLE_RESPAWN;
        p.crumbleT=undefined;
        if(p.crack){
          playExplosion();
          screenShake=Math.min(6,screenShake+3);
          spawnParticles(p.x+p.w/2-camX,p.y,22,["#dff6ff","#7dd3fc","#ffffff"],
            {minSpd:60,maxSpd:240,upBias:60,minLife:0.3,maxLife:0.7,
             type:"square",gravity:420,minSz:2,maxSz:6});
        }
        // anything standing on it goes down with it — the canopy's own way
        // of turning terrain into a weapon
        for(const e of groundEnemies){
          if(e.dead||e.dying||e.turret) continue;
          if(e.x+e.w>p.x && e.x<p.x+p.w && Math.abs((e.y+e.h)-p.y)<10){
            e.dying=true; e.deathTimer=0.07;
            spawnFloatingText(e.x+e.w/2-camX,e.y-10,"DÜŞTÜ!","#6ee7b7",14);
          }
        }
        playExplosion();
        spawnParticles(p.x+p.w/2-camX,p.y+6,16,["#6ee7b7","#2f6b3d","#4b9e5b"],
          {minSpd:50,maxSpd:190,minLife:0.4,maxLife:0.9,type:"square",gravity:420,minSz:2,maxSz:6});
      }
    }
  }
}

// ─── LOAD A STAGE ─────────────────────────────────────────────
// Rebuilds every piece of live level state from the LEVELS table. Called once
// at boot, on restart, and on each stage transition — nothing else needs to
// know which stage is running.
function loadLevel(i){
  levelIndex=clamp(i,0,LEVELS.length-1);
  const L=LEVELS[levelIndex];
  levelWidth=L.width;

  platforms=L.platforms.map(p=>({...p}));  // copies: drawPlatforms caches a
                                           // jagged edge profile on each one
  lavaPits=L.lavaPits.map(p=>({...p}));
  crystals=L.crystals.map(c=>({...c}));
  // small dark ceiling spikes, all within the top ~25px
  stalactites=[];
  const stalCount=Math.round(levelWidth/55);
  const shades=["#0e0b14","#15111c","#1b1622","#211b29"];
  for(let s=0;s<stalCount;s++){
    stalactites.push({
      x:rnd(0,levelWidth), len:rnd(9,25), w:rnd(6,14),
      shade:shades[Math.floor(Math.random()*shades.length)]
    });
  }

  levelHasArena=!!L.arena;
  ARENA_X_START=L.arena?L.arena.start:0;
  ARENA_X_END=L.arena?L.arena.end:0;
  cameraLock=false;
  arenaCleared=!levelHasArena;   // no arena ⇒ counts as already cleared
  arenaBannerTimer=0; arenaGoTimer=0;

  levelHasBoss=!!L.boss;
  BOSS_TRIGGER_X=L.boss?L.boss.triggerX:Infinity;

  initCoins(); initEnemies(); initGroundEnemies(); initVines(); initFog(); initIcicles(); initWind();
  initSecrets();
  runCoins=0;   // the pouch is per stage: a continue costs it, and hands the coins back to collect again
  initPowerUpBoxes(); initWeaponPickups(); initCages(); initBoss();

  // clear anything left over from the previous stage
  drops=[]; particles=[]; floatingTexts=[]; magmaBursts=[];
  playerBombs=[]; babyDinos=[]; laser=null; shockwaves=[];
  goalReached=false;
  camX=0; camY=0;
  player.x=60; player.y=360; player.vx=0; player.vy=0;
  player.jetFuel=1;

  // story state — each stage re-arms its own transmissions and starts with an
  // empty rescue train (the previous stage's hatchlings boarded the capsule)
  radio=null; radioQueue=[]; radioFired={};
  followers=[]; playerTrail=[]; rescuedThisLevel=0;
  scaredBabies=[]; babyShots=[];
  bestChainThisLevel=0;
  hitsThisLevel=0; levelTime=0; parriesThisLevel=0;
  checkpointX=L.checkpoint!==undefined?L.checkpoint:Infinity;
  checkpointUsed=false;
  warpTimer=0;   // portalReveal is set by initBoss(), which ran just above
  recordPlayerTrail();
  arcBrief();
}
