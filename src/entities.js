// Vines, coins, enemies, player, arsenal, cages
// Part of NEON DINO-AGE: RESCUE PROTOCOL. Loaded as a classic
// script, in the order index2.html lists — these files share one
// global scope on purpose and are not modules.

// ─── SWINGING VINES ───────────────────────────────────────────
// A vine is a pendulum with a player on the end. Touching one in mid-air
// grabs it; left/right pumps the swing the way a real one does (push at the
// bottom of the arc), and jump lets go with whatever tangential speed you
// had built up. Momentum is the whole point — a released swing should carry
// you further than a jump ever could.
const VINE_GRAB_R=30;
const VINE_RELEASE_BOOST=-180;   // a little lift on top of the tangent
let vines=[];
let vineGrab=null;               // the vine currently held, or null
let vineCooldown=0;              // stops an instant re-grab after releasing
function initVines(){
  vines=(LEVELS[levelIndex].vines||[]).map(v=>({
    x:v.x, y:v.y, len:v.len||130,
    ang:v.ang!==undefined?v.ang:rnd(-0.45,0.45),
    angVel:0
  }));
  vineGrab=null; vineCooldown=0;
}
// where the grabbable tip of a vine currently hangs, in world space
function vineTip(v){
  return {x:v.x+Math.sin(v.ang)*v.len, y:v.y+Math.cos(v.ang)*v.len};
}
function updateVines(dt,left,right,jump){
  if(vineCooldown>0) vineCooldown-=dt;
  for(const v of vines){
    if(v===vineGrab) continue;
    // free vines settle back toward hanging
    v.angVel+=(-(2200/v.len)*Math.sin(v.ang))*dt;
    v.angVel*=Math.pow(0.35,dt);
    v.ang+=v.angVel*dt;
  }
  if(vineGrab){
    const v=vineGrab;
    // gravity on the pendulum, plus pumping from the player's input
    v.angVel+=(-(2600/v.len)*Math.sin(v.ang))*dt;
    if(left)  v.angVel-=2.6*dt;
    if(right) v.angVel+=2.6*dt;
    v.angVel=clamp(v.angVel,-4.5,4.5);
    v.angVel*=Math.pow(0.86,dt);
    v.ang+=v.angVel*dt;
    const tip=vineTip(v);
    player.x=tip.x-PLAYER_W/2;
    player.y=tip.y-PLAYER_H*0.35;
    player.vx=0; player.vy=0;
    player.onGround=false;
    player.facing=v.angVel>=0?1:-1;
    if(jump && !player.vineJumpHeld){
      // release: convert the swing into real velocity
      const tan=v.angVel*v.len;
      player.vx=Math.cos(v.ang)*tan;
      player.vy=-Math.sin(v.ang)*tan+VINE_RELEASE_BOOST;
      vineGrab=null; vineCooldown=0.35;
      playPowerUp();
      spawnParticles(tip.x-camX,tip.y,10,["#a7f3d0","#34d399","#ffffff"],
        {minSpd:60,maxSpd:200,minLife:0.2,maxLife:0.5,type:"circle",gravity:120});
    }
  } else if(vineCooldown<=0 && !player.onGround){
    // grab whatever tip you brush against on the way past
    const pcx=player.x+PLAYER_W/2, pcy=player.y+PLAYER_H*0.35;
    for(const v of vines){
      const tip=vineTip(v);
      if(Math.hypot(pcx-tip.x,pcy-tip.y)<VINE_GRAB_R){
        vineGrab=v;
        // carry the approach speed into the swing instead of killing it dead
        v.angVel=clamp(v.angVel+player.vx/v.len,-4.5,4.5);
        playChime(chain);
        break;
      }
    }
  }
  player.vineJumpHeld=jump;
}
function drawVines(){
  for(const v of vines){
    const ax=v.x-camX, ay=v.y;
    if(ax<-80||ax>W+80) continue;
    const tip=vineTip(v);
    const tx=tip.x-camX, ty=tip.y;
    // the vine itself, drawn as a slightly slack curve
    ctx.strokeStyle="#2f6b3d"; ctx.lineWidth=6; ctx.lineCap="round";
    ctx.beginPath();
    ctx.moveTo(ax,ay);
    ctx.quadraticCurveTo(ax+(tx-ax)*0.45,ay+(ty-ay)*0.55+10,tx,ty);
    ctx.stroke();
    ctx.strokeStyle="#4b9e5b"; ctx.lineWidth=3;
    ctx.beginPath();
    ctx.moveTo(ax,ay);
    ctx.quadraticCurveTo(ax+(tx-ax)*0.45,ay+(ty-ay)*0.55+10,tx,ty);
    ctx.stroke();
    // leaves along it
    ctx.fillStyle="#3f8a4c";
    for(let i=1;i<=3;i++){
      const f=i/4;
      const lx=lerp(ax,tx,f), ly=lerp(ay,ty,f)+8*Math.sin(f*Math.PI);
      ctx.beginPath(); ctx.ellipse(lx+6,ly,7,3,0.5,0,Math.PI*2); ctx.fill();
    }
    // the grab knot, brighter when it is free to take
    const ready=!vineGrab&&vineCooldown<=0;
    glow(ready?"#7dffcf":"#2f6b3d",ready?12:4);
    ctx.fillStyle=v===vineGrab?"#ffdd66":(ready?"#7dffcf":"#4b9e5b");
    ctx.beginPath(); ctx.arc(tx,ty,7,0,Math.PI*2); ctx.fill();
    noGlow();
  }
}

// ─── COINS ──────────────────────────────────────────────────
let coins = [];
// a straight row of n coins centered above a platform
function coinRow(px,py,pw,n,yOff){
  const arr=[];
  const totalW=(n-1)*28;
  const startX=px+pw/2-totalW/2;
  for(let i=0;i<n;i++) arr.push({x:startX+i*28, y:py+yOff});
  return arr;
}
// an arc of n coins tracing the jump path between two points (peaks upward by `height`)
function coinArc(x1,y1,x2,y2,n,height){
  const arr=[];
  for(let i=0;i<n;i++){
    const tt=i/(n-1);
    arr.push({x:lerp(x1,x2,tt), y:lerp(y1,y2,tt)-Math.sin(tt*Math.PI)*height});
  }
  return arr;
}
// a shallow arc of n coins hanging 30px above a platform, inset from its
// edges — the standard pickup line over any ledge
function coinArcOver(px,py,pw,n){
  const inset=Math.min(24,pw*0.18);
  return coinArc(px+inset, py-30, px+pw-inset, py-30, n, 22);
}
function initCoins(){
  coins = [];
  const positions = LEVELS[levelIndex].coins();
  for(const p of positions) coins.push({x:p.x,y:p.y,r:10,collected:false,popping:false,popT:0,bob:rnd(0,Math.PI*2),bobSpd:rnd(2,4)});
}

// ─── ENEMY — flying pterodactyl (enemy1.png) ──────────────────
const ENEMY_FLY_W=56, ENEMY_FLY_H=38;
let enemies = [];
function initEnemies(){
  enemies = [];
  const defs = LEVELS[levelIndex].flyers;
  defs.forEach((d,i) => enemies.push({
    type:"fly", id:i,
    species:d.species||null,
    dripCooldown:rnd(0.6,2.2),
    x:d.x, y:d.y, baseY:d.y,
    w:(d.species&&SPECIES[d.species]?SPECIES[d.species].w:ENEMY_FLY_W),
    h:(d.species&&SPECIES[d.species]?SPECIES[d.species].h:ENEMY_FLY_H),
    vx:d.spd, vy:0,
    patrolMin:d.patrol[0], patrolMax:d.patrol[1],
    // the canopy's dragonfly dies in two laser hits; the volcano's
    // pterodactyl still takes three
    hp:ENEMY_HP[d.species]||3, maxHp:ENEMY_HP[d.species]||3,
    wingPhase:rnd(0,Math.PI*2),
    glowPhase:rnd(0,Math.PI*2),
    wavePhase:rnd(0,Math.PI*2),
    hitFlash:0, dying:false, deathTimer:0, dead:false, beamTick:0,
    // enemies spawned inside the arena band are the mandatory wave that
    // locks the camera until they're all cleared (Metal Slug style)
    arenaEnemy: levelHasArena && d.x>=ARENA_X_START && d.x<=ARENA_X_END
  }));
}

// ─── ENEMY — ground patroller (enemyground.png) ───────────────
const ENEMY_GROUND_W=40, ENEMY_GROUND_H=40;
let groundEnemies = [];
function initGroundEnemies(){
  groundEnemies = [];
  // one patroller per solid ground platform, bounded so it turns around
  // at the platform's own edges (which — for the mid platforms flanked by
  // lava pits — IS the lava's edge)
  const defs = LEVELS[levelIndex].grounders;
  for(const d of defs){
    const margin=6;
    const sp=d.species?SPECIES[d.species]:null;
    const w=sp?sp.w:ENEMY_GROUND_W, h=sp?sp.h:ENEMY_GROUND_H;
    // a "fixed" grounder is a turret: it never walks, it just sits and spits
    const turret=!!d.fixed;
    const bx=turret?d.fixed.x:d.platX+margin;
    const by=(turret?d.fixed.y:GROUND_Y)-h;
    groundEnemies.push({
      type:"ground",
      species:d.species||null,
      turret,
      faceDir:-1,
      shield:d.species==="forest_crawler"||d.species==="ice_crusher",  // armoured from the front
      spitCooldown:rnd(1.2,2.6),
      x:bx, y:by, w, h,
      vx:turret?0:(d.spd||55),
      patrolMin:turret?bx:d.platX+margin,
      patrolMax:turret?bx:d.platX+d.platW-margin-w,
      hp:ENEMY_HP[d.species]||2, maxHp:ENEMY_HP[d.species]||2,
      hitFlash:0, dying:false, deathTimer:0, dead:false, beamTick:0,
      arenaEnemy: !turret && levelHasArena && d.platX>=ARENA_X_START && d.platX<=ARENA_X_END
    });
  }
}

// ─── CONTINUOUS PLASMA LASER ──────────────────────────────────
// a single hitscan ray recomputed every frame while fire is held, rather
// than a stream of discrete projectiles
let laser = null; // {mouthX,mouthY,dir,len,thickness,fever,hitEnemy}

// ─── ENEMY DROPS — piñata effect (gems + coins) on kill ───────
let drops = [];
function dropColors(kind){
  switch(kind){
    case "gem-pink":   return ["#ff4fd8","#ffb3f0"];
    case "gem-cyan":   return ["#4fe0ff","#b3faff"];
    case "gem-yellow": return ["#ffe94f","#fff6b3"];
    case "fuel":       return ["#44aaff","#bbe8ff"];
    case "bosscoin":   return ["#ffcc00","#fff3a0"];
    default:           return ["#ffdd00","#ffaa00"]; // coin
  }
}
function spawnDrop(x,y,kind){
  drops.push({
    x,y,vx:rnd(-90,90),vy:rnd(-280,-180),
    kind, landed:false, life:0, rot:rnd(0,Math.PI*2)
  });
}

// ─── PLAYER ──────────────────────────────────────────────────
// scaled up ~20% (44×50 → 53×60) so the dino reads clearly against the
// platforms/enemies around it, roughly the "64×64-ish" footprint requested
const PLAYER_W = 53, PLAYER_H = 60;
let player = {
  x:60, y:360,
  vx:0, vy:0,
  onGround:false,
  facing:1,
  jetpack:false,
  jetFuel:1,        // 0..1
  legPhase:0,
  idlePhase:0,
  jetPhase:0,
  invuln:0,
  hp:3, maxHp:3,
  dead:false,
  wasFiring:false,
  activePower:null, // {kind:'magnet'|'shield'|'hyper', timer, maxTimer, color}
  shieldCharge:false,
  dashTimer:0, dashCooldown:0, dashKeyWasDown:false,
  chilled:0,          // seconds of slowed movement left, from a chill shot
  groundT:0,          // seconds since last touching the floor (coyote window)
  slideT:0, slideCooldown:0, slideKeyWasDown:false,
};
// recalibrated for a heavier, more inertia-driven feel: gravity pulls a
// little harder, thrust eases in/out (see the jetpack block below) instead
// of snapping straight to its cap
// JET_THRUST is a real acceleration that gravity fights every frame, so the
// net climb is (JET_THRUST - GRAV) ≈ 770 px/s². It has to comfortably exceed
// GRAV or holding jump just hovers in place.
const GRAV = 980, JUMP_VY = -440, MOVE_SPD = 200, JET_THRUST = 1750, JET_MAX_RISE = -320, JET_FUEL_USE = 0.55, JET_REGEN = 0.4, RECOIL_FORCE = 26, FALL_GRAV_MULT = 1.4;
const DASH_SPEED = 620, DASH_DURATION = 0.18, DASH_COOLDOWN = 1.2;

// ─── POWER-UPS ─────────────────────────────────────────────────
const POWERUP_INFO = {
  magnet: {label:"MAGNET",   color:"#44aaff", duration:7},
  shield: {label:"SHIELD",   color:"#33ff88", duration:10},
  hyper:  {label:"HYPER BEAM", color:"#ff4444", duration:5},
};
let powerUpBoxes = [];
function initPowerUpBoxes(){
  // slow-floating crystal/egg boxes hovering over or above a few platforms
  powerUpBoxes = LEVELS[levelIndex].powerBoxes.map(b=>(
    {x:b.x,y:b.y,bob:rnd(0,Math.PI*2),alive:true}
  ));
}
function applyPowerUp(kind){
  const info=POWERUP_INFO[kind];
  player.activePower={kind, timer:info.duration, maxTimer:info.duration, color:info.color, label:info.label};
  if(kind==="shield") player.shieldCharge=true;
  playPowerUp();
  spawnFloatingText(player.x+PLAYER_W/2-camX, player.y-14, info.label+"!", info.color, 15);
}
function breakPowerUpBox(box){
  box.alive=false;
  playPowerUp();
  spawnParticles(box.x-camX,box.y,16,["#ffe94f","#fff6b3","#ffffff","#ffcc33"],
    {minSpd:60,maxSpd:220,minLife:0.3,maxLife:0.6,type:"square",gravity:160,minSz:3,maxSz:6});
  // the golden crystal box only ever rolls the three classic buffs — the
  // weapon-swap pickups below are deliberately separate, fixed items
  const kinds=["magnet","shield","hyper"];
  applyPowerUp(kinds[Math.floor(Math.random()*kinds.length)]);
}

// ─── THE ARSENAL (Contra letter pickups) ──────────────────────
// The base plasma beam never runs out. Everything else is a letter you pick
// up, fire until the ammo clock empties, and then lose — which is what makes
// finding one matter and losing one sting.
//
// Ammo is measured in SECONDS OF FIRE for every weapon, including the rocket
// pod (which auto-fires while held). One unit for all four keeps the HUD bar
// honest and stops "12 rockets vs 6 seconds" from needing two mental models.
const WEAPONS={
  beam:   {letter:"B", label:"PLASMA BEAM", color:"#ff8800", ammo:Infinity},
  spread: {letter:"S", label:"SPREAD BEAM", color:"#3ec6ff", ammo:6.5},
  rocket: {letter:"R", label:"ROCKET POD",  color:"#ff4477", ammo:5.0},
  flame:  {letter:"F", label:"FLAME SHRED", color:"#ffaa22", ammo:5.0},
  seed:   {letter:"T", label:"SİSMİK TOHUM",color:"#22c55e", ammo:5.5},
  // Not a damage weapon at all: it turns a living enemy into scenery. A
  // frozen one is inert, is a platform you can stand on, and shatters into
  // shards that cut down whatever is standing near it.
  freeze: {letter:"D", label:"DONDURUCU",   color:"#7dd3fc", ammo:6.0},
};
const FREEZE_TO_SOLID=0.8;   // seconds of beam to lock one up
const FROZEN_SECONDS=6;      // how long it stays a block
let weapon="beam";
let weaponAmmo=Infinity;
let rocketCd=0;

function equipWeapon(kind){
  const w=WEAPONS[kind];
  if(!w) return;
  weapon=kind; weaponAmmo=ammoFor(kind); rocketCd=0;
  playPowerUp();
  spawnFloatingText(player.x+PLAYER_W/2-camX,player.y-28,w.letter+" — "+w.label,w.color,16);
  queueRadio(null,"SİLAH SİSTEMİ",[w.label+" hazır!","Cephane sınırlı — iyi kullan."],
    {color:w.color,hold:2.2});
}
function dropToBaseWeapon(){
  weapon="beam"; weaponAmmo=Infinity; rocketCd=0;
  spawnFloatingText(player.x+PLAYER_W/2-camX,player.y-28,"CEPHANE BİTTİ","#ff6677",14);
  queueRadio(null,"SİLAH SİSTEMİ",["Cephane bitti.","Temel plazmaya dönüldü."],
    {color:"#ff6677",hold:2.0});
}
// a straight-flying rocket, reusing the lava bomb's projectile and splash
function firePlayerRocket(){
  const mx=player.x+(player.facing>0?PLAYER_W+2:-4);
  const my=player.y+PLAYER_H*0.38;
  playerBombs.push({x:mx,y:my,vx:player.facing*560,vy:0,life:0,straight:true});
  player.vx-=player.facing*RECOIL_FORCE*0.5;
  playPew();
}
// The canopy's own weapon: a seed lobbed on an arc that erupts into a vine
// burst where it lands. Slower than the rocket pod, wider blast, and it
// reaches over a ledge instead of through it.
function firePlayerSeed(){
  const mx=player.x+(player.facing>0?PLAYER_W+2:-4);
  const my=player.y+PLAYER_H*0.30;
  playerBombs.push({x:mx,y:my,vx:player.facing*330,vy:-320,life:0,seed:true});
  player.vx-=player.facing*RECOIL_FORCE*0.4;
  playPew();
}

POWERUP_INFO.pierce = {label:"PLASMA PIERCE", color:"#3ec6ff", duration:10};
let weaponPickups=[];
function initWeaponPickups(){
  weaponPickups=LEVELS[levelIndex].weapons.map(w=>(
    {x:w.x,y:w.y,kind:w.kind,bob:rnd(0,Math.PI*2),alive:true}
  ));
}
function collectWeaponPickup(wp){
  wp.alive=false;
  const w=WEAPONS[wp.kind]||WEAPONS.spread;
  spawnParticles(wp.x-camX,wp.y,16,[w.color,"#ffffff","#aee9ff"],
    {minSpd:50,maxSpd:210,minLife:0.3,maxLife:0.6,type:"circle",gravity:90});
  equipWeapon(WEAPONS[wp.kind]?wp.kind:"spread");
}

// ─── PLAYER LAVA BOMB (Magma Crystal instant attack) ──────────
let playerBombs=[];
function firePlayerLavaBomb(){
  const mx=player.x+(player.facing>0?PLAYER_W+2:-4);
  const my=player.y+PLAYER_H*0.38;
  playerBombs.push({x:mx,y:my,vx:player.facing*280,vy:-360,life:0});
  player.vx-=player.facing*RECOIL_FORCE*1.5;
}
function explodePlayerBomb(bomb){
  const ex=bomb.x-camX, ey=bomb.y;
  const seed=!!bomb.seed;
  // the seed erupts wider than a bomb and throws its debris upward
  const radius=seed?110:70;
  spawnParticles(ex,ey,seed?30:22,
    seed?["#22c55e","#4ade80","#a7f3d0","#ffffff"]:["#ff4400","#ff8800","#ffdd44","#ffffff"],
    {minSpd:100,maxSpd:seed?340:300,upBias:seed?120:0,
     minLife:0.3,maxLife:seed?0.9:0.7,type:seed?"square":"circle",gravity:seed?120:180});
  if(seed){
    // a ring of vines whipping up out of the ground
    for(let i=0;i<10;i++){
      const a=(i/10)*Math.PI-Math.PI;
      particles.push({
        x:ex+Math.cos(a)*30, y:ey,
        vx:Math.cos(a)*90, vy:-rnd(180,320),
        life:1, maxLife:rnd(0.4,0.8),
        color:"#2f6b3d", size:rnd(3,7), type:"square", gravity:420
      });
    }
  }
  screenShake=Math.min(6,screenShake+(seed?6:5));
  hitStopTimer=Math.max(hitStopTimer,seed?0.07:0.05);
  playExplosion();
  // heavy splash damage to every enemy (and the boss) within the blast radius
  const targets=[...enemies,...groundEnemies];
  if(boss&&!boss.dead&&boss.introState==="active") targets.push(boss);
  for(const e of targets){
    if(e.dead||e.dying) continue;
    const ecx=e.type==="ground"?e.x+e.w/2:e.x, ecy=e.y;
    if(Math.hypot(ecx-bomb.x,ecy-bomb.y)<radius){
      e.hp-=e.type==="boss"?4:99;
      e.hitFlash=0.3;
      if(e.hp<=0 && !e.dying){ e.dying=true; e.deathTimer=0.07; }
    }
  }
}

// ─── CAPTIVE CAGES: shoot to free a baby dino (drops coins + fuel) ────
// the captive is baby.png — the little dino you're here to rescue. Its art is
// already cleanly cut out, so the bbox is a plain alpha trim (no near-white
// exclusion, which would eat its eye highlight and teeth).
const babySprite=new Image();
let babySpriteLoaded=false;
let babySpriteBBox=null;
babySprite.onload=()=>{
  babySpriteBBox=computeSpriteBBox(babySprite,false);
  babySpriteLoaded=true;
};
babySprite.src=assetURL("baby.png");
// draws the captive at (cx,cy) scaled to `h` px tall, optionally mirrored
function drawBaby(cx,cy,h,faceDir,species){
  // a rescued hatchling can be a different species — the canopy's hostage is
  // a triceratops, and it runs in the same train as the volcano's babies
  if(species&&species!=="baby"){
    if(drawSpeciesArt(species,cx,cy,h*1.5,h,faceDir||1)) return;
  }
  if(!babySpriteLoaded){
    ctx.fillStyle="#e8834a";
    ctx.beginPath(); ctx.ellipse(cx,cy,h*0.32,h*0.28,0,0,Math.PI*2); ctx.fill();
    return;
  }
  const bb=babySpriteBBox;
  const dh=h, dw=bb.w*(dh/bb.h);
  ctx.save();
  ctx.translate(cx,cy);
  ctx.scale(faceDir<0?-1:1,1);
  ctx.drawImage(babySprite,bb.x,bb.y,bb.w,bb.h,-dw/2,-dh/2,dw,dh);
  ctx.restore();
}

let cages=[];
function initCages(){
  cages=LEVELS[levelIndex].cages.map(c=>({x:c.x,y:c.y,hp:1,alive:true,species:c.species||"baby"}));
}
let babyDinos=[]; // hatchlings that have peeled off the train and run for it
