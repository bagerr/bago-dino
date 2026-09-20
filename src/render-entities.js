// Everything that moves, drawn
// Part of NEON DINO-AGE: RESCUE PROTOCOL. Loaded as a classic
// script, in the order index2.html lists — these files share one
// global scope on purpose and are not modules.


// ─── ENEMY SPRITES ─────────────────────────────────────────────
const enemy1Sprite = new Image();
let enemy1Loaded = false;
enemy1Sprite.onload = () => { enemy1Loaded = true; };
enemy1Sprite.src = assetURL("enemy_fly.png");

const enemyGroundSprite = new Image();
let enemyGroundLoaded = false;
enemyGroundSprite.onload = () => { enemyGroundLoaded = true; };
enemyGroundSprite.src = assetURL("enemy_ground.png");

// shared: one full-bright white/yellow flash frame before a kill actually resolves
function drawDeathFlash(w,h){
  ctx.shadowColor="#fff9c4"; ctx.shadowBlur=16;
  ctx.fillStyle="#fffde7";
  ctx.fillRect(-w/2,-h/2,w,h);
}

// ─── DRAW FLYING ENEMY (enemy1.png, 56×38) ────────────────────
function drawFrozenShell(e){
  const cx=e.x+e.w/2-camX, cy=e.y+e.h/2;
  const fade=clamp(e.frozen/1.2,0,1);     // flickers as it is about to thaw
  if(fade<1 && Math.sin(t*22)<-0.2) return;
  ctx.save();
  ctx.globalCompositeOperation="lighter";
  ctx.globalAlpha=0.42;
  ctx.fillStyle="#7dd3fc";
  ctx.fillRect(cx-e.w/2-3,cy-e.h/2-3,e.w+6,e.h+6);
  ctx.restore();
  glow("#bae6fd",10);
  ctx.strokeStyle="rgba(223,246,255,0.95)"; ctx.lineWidth=2;
  ctx.strokeRect(cx-e.w/2-3,cy-e.h/2-3,e.w+6,e.h+6);
  // a couple of fracture lines so it reads as ice rather than a tint
  ctx.beginPath();
  ctx.moveTo(cx-e.w/2,cy-e.h/4); ctx.lineTo(cx,cy+e.h/6); ctx.lineTo(cx+e.w/3,cy-e.h/3);
  ctx.stroke();
  noGlow();
}
function drawPtero(e){
  if(e.frozen>0){ drawFrozenShell(e); }
  if(e.species){
    // the dragonfly: registry art, mirrored to its heading, with a green
    // shimmer under it so it reads against the dark canopy
    const cx=e.x+e.w/2-camX, cy=e.y+e.h/2;
    if(e.hitFlash>0) ctx.globalAlpha=0.55+0.45*Math.sin(e.hitFlash*30);
    glow("#34d399",10);
    const ok=drawSpeciesArt(e.species,cx,cy,e.w,e.h,Math.sign(e.vx)||1);
    noGlow();
    ctx.globalAlpha=1;
    if(ok) return;
    // fallback silhouette until (or unless) the sheet arrives
    ctx.fillStyle="#34d399";
    ctx.fillRect(cx-e.w/2,cy-e.h/2,e.w,e.h);
    return;
  }
  const ex=e.x-camX, ey=e.y;
  ctx.save(); ctx.translate(ex,ey); ctx.scale(e.vx<0?1:-1,1);

  if(e.dying){
    drawDeathFlash(e.w,e.h);
    ctx.restore();
    return;
  }

  if(e.hitFlash>0){
    ctx.globalAlpha=0.5+0.5*Math.sin(e.hitFlash*30);
  }

  // wing-flap squish: no new art needed — just squash/stretch the sprite's
  // vertical scale in a fast sine cycle so it reads as flapping wings
  const flapSquish=1+0.3*Math.sin(Date.now()/80+e.id);
  ctx.save();
  ctx.scale(1,flapSquish);
  if(enemy1Loaded){
    ctx.drawImage(enemy1Sprite,-e.w/2,-e.h/2,e.w,e.h);
  } else {
    ctx.fillStyle="#ff0000";
    ctx.fillRect(-e.w/2,-e.h/2,e.w,e.h);
  }
  ctx.restore();

  // pulsing neon eye glow overlaid near the sprite's face (front-facing side)
  const eyePulse=0.5+0.5*Math.sin(e.glowPhase*3);
  ctx.shadowColor="#eab308"; ctx.shadowBlur=6+8*eyePulse;
  ctx.fillStyle=`rgba(253,224,71,${0.55+0.45*eyePulse})`;
  ctx.beginPath(); ctx.arc(e.w*0.22,-e.h*0.12,2.5,0,Math.PI*2); ctx.fill();
  noGlow();

  // HP bar
  if(e.hp < e.maxHp){
    const hbW=e.w*0.7;
    ctx.fillStyle="rgba(0,0,0,0.6)"; ctx.fillRect(-hbW/2,-e.h/2-14,hbW,6);
    ctx.fillStyle="#ff3322"; ctx.fillRect(-hbW/2,-e.h/2-14,(e.hp/e.maxHp)*hbW,6);
  }

  ctx.restore();
}

// ─── DRAW GROUND ENEMY (enemyground.png, 40×40) ───────────────
function drawGroundEnemy(e){
  if(e.frozen>0){ drawFrozenShell(e); }
  if(e.species){
    const cx=e.x+e.w/2-camX, cy=e.y+e.h/2;
    if(e.hitFlash>0) ctx.globalAlpha=0.55+0.45*Math.sin(e.hitFlash*30);
    glow(e.shield?(isIce()?"#7dd3fc":"#10b981"):"#a855f7",e.shield?12:10);
    const ok=drawSpeciesArt(e.species,cx,cy,e.w,e.h,e.faceDir||1);
    noGlow();
    ctx.globalAlpha=1;
    if(e.shield){
      // the armour flares while it is actually deflecting, so the rule is
      // visible rather than something the player has to infer from damage
      const blocking=laser&&player.facing!==(Math.sign(e.vx)||e.faceDir||1);
      ctx.save();
      ctx.globalCompositeOperation="lighter";
      ctx.globalAlpha=(blocking?0.5:0.22)+0.18*Math.sin(t*(blocking?18:4));
      ctx.fillStyle=isIce()?"#7dd3fc":"#10b981";
      ctx.fillRect(cx-e.w/2,cy-e.h/2,e.w,e.h*0.45);
      ctx.restore();
    }
    if(ok) return;
    ctx.fillStyle=e.shield?"#10b981":"#a855f7";
    ctx.fillRect(cx-e.w/2,cy-e.h/2,e.w,e.h);
    return;
  }
  const ex=e.x-camX+e.w/2, ey=e.y+e.h/2;
  ctx.save(); ctx.translate(ex,ey); ctx.scale(e.vx<0?-1:1,1);

  if(e.dying){
    drawDeathFlash(e.w,e.h);
    ctx.restore();
    return;
  }

  if(e.hitFlash>0){
    ctx.globalAlpha=0.5+0.5*Math.sin(e.hitFlash*30);
  }

  if(enemyGroundLoaded){
    ctx.drawImage(enemyGroundSprite,-e.w/2,-e.h/2,e.w,e.h);
  } else {
    ctx.fillStyle="#ff0000";
    ctx.fillRect(-e.w/2,-e.h/2,e.w,e.h);
  }

  if(e.hp < e.maxHp){
    const hbW=e.w*0.8;
    ctx.fillStyle="rgba(0,0,0,0.6)"; ctx.fillRect(-hbW/2,-e.h/2-12,hbW,5);
    ctx.fillStyle="#ff3322"; ctx.fillRect(-hbW/2,-e.h/2-12,(e.hp/e.maxHp)*hbW,5);
  }

  ctx.restore();
}

// ─── PLAYER SPRITE ───────────────────────────────────────────
const playerSprite = new Image();
let playerSpriteLoaded = false;
let playerSpriteBBox = null;
playerSprite.onload = () => {
  playerSpriteBBox = computeSpriteBBox(playerSprite, true);
  playerSpriteLoaded = true;
};
playerSprite.src = assetURL("bagodino.png");

// ─── PLAYER SPRITE METRICS ───────────────────────────────────
// Single source of truth for how large the dino is actually drawn and where
// the jetpack nozzle sits on it, so rendering and thrust-particle spawning
// can never drift apart. Everything here derives from the sprite's DRAWN rect
// (which is bigger than the physics hitbox and anchored at the feet), not
// from PLAYER_W/PLAYER_H — anchoring the flame to the hitbox instead put it
// out of the dino's hip rather than out of the backpack nozzles.
const SPRITE_SCALE = 1.6;     // drawn height ÷ hitbox height
const JET_NOZZLE_FX = 0.25;   // nozzle X as a fraction of sprite width, measured from its BACK edge
const JET_NOZZLE_FY = 0.60;   // nozzle Y as a fraction of sprite height, measured from its TOP
function playerSpriteMetrics(){
  const dh=PLAYER_H*SPRITE_SCALE;
  const bb=playerSpriteBBox;
  const dw=bb ? bb.w*(dh/bb.h) : PLAYER_W*SPRITE_SCALE;
  const centerX=player.x+PLAYER_W/2;  // world space
  const feetY=player.y+PLAYER_H;      // world space
  return {
    dw, dh, centerX, feetY,
    // mirrors correctly with facing: the nozzle always stays on the back
    nozzleX: centerX+player.facing*dw*(JET_NOZZLE_FX-0.5),
    nozzleY: feetY-dh*(1-JET_NOZZLE_FY)
  };
}

// ─── DRAW PLAYER (sprite-based) ───────────────────────────────
function drawPlayer(){
  const p=player;
  const px=p.x+PLAYER_W/2-camX, py=p.y+PLAYER_H;
  const facing=p.facing;
  const cxWorld=p.x+PLAYER_W/2;

  // contact shadow: find the nearest solid platform top directly beneath the
  // dino and pin a soft dark ellipse to it, so the sprite reads as standing
  // ON the scene instead of floating pasted over it
  let groundY=null;
  for(const pf of platforms){
    if(pf.lavaPit) continue;
    if(cxWorld>=pf.x && cxWorld<=pf.x+pf.w && pf.y>=p.y+PLAYER_H-2){
      if(groundY===null||pf.y<groundY) groundY=pf.y;
    }
  }
  if(groundY!==null){
    const distToGround=groundY-(p.y+PLAYER_H);
    // a proper dark, semi-transparent contact shadow (rgba(0,0,0,0.4) at its
    // strongest, right underfoot) that pins the dino to the platform surface
    const shadowAlpha=clamp(0.4-distToGround*0.003,0.08,0.4);
    const shadowScale=clamp(1-distToGround*0.003,0.35,1);
    ctx.fillStyle=`rgba(0,0,0,${shadowAlpha})`;
    ctx.beginPath();
    ctx.ellipse(px,groundY+3,PLAYER_W*0.44*shadowScale,8*shadowScale,0,0,Math.PI*2);
    ctx.fill();
  }

  // is the dino currently over a lava pit? (used for the belly light-up below)
  let overLava=false;
  for(const lp of lavaPits){
    if(cxWorld>=lp.x-10 && cxWorld<=lp.x+lp.w+10){ overLava=true; break; }
  }

  ctx.save();
  ctx.translate(px,py);
  ctx.scale(facing,1);

  if(p.invuln>0 && Math.floor(p.invuln*12)%2===0){ ctx.globalAlpha=0.4; }
  // flattened while sliding. The sprite is anchored at the feet, so a plain
  // squash keeps it on the floor instead of sinking it into one.
  if(p.slideT>0){ ctx.scale(1.18,0.66); }

  let headTopY;
  if(playerSpriteLoaded){
    // draw from the tight, smoke-excluded bounding box (see computeSpriteBBox)
    // so the dino's actual feet — not empty margin or the baked-in dust puff —
    // land exactly on the ground/shadow anchor point below
    const bb=playerSpriteBBox;
    const m=playerSpriteMetrics();
    const dh=m.dh, dw=m.dw;
    ctx.drawImage(playerSprite,bb.x,bb.y,bb.w,bb.h,-dw/2,-dh,dw,dh);
    headTopY=-dh;
  } else {
    ctx.fillStyle="#ff0000";
    ctx.fillRect(-PLAYER_W/2,-PLAYER_H,PLAYER_W,PLAYER_H);
    headTopY=-PLAYER_H;
  }

  // ambient lava glow: a faint constant warm undertint on the lower half from
  // the cave's general lava-lit atmosphere, boosted into a stronger spotlight
  // when actually hovering over an open lava pit
  ctx.globalCompositeOperation="lighter";
  const ambientG=ctx.createRadialGradient(0,-PLAYER_H*0.1,2,0,-PLAYER_H*0.1,PLAYER_W*0.9);
  ambientG.addColorStop(0,`rgba(255,110,20,${overLava?0.5:0.16})`);
  ambientG.addColorStop(1,"rgba(255,80,0,0)");
  ctx.fillStyle=ambientG;
  ctx.beginPath(); ctx.ellipse(0,-PLAYER_H*0.1,PLAYER_W*(overLava?1.1:0.9),PLAYER_H*0.4,0,0,Math.PI*2); ctx.fill();
  ctx.globalCompositeOperation="source-over";

  // jetpack back-light glow, sat on the backpack tanks themselves. Inside this
  // transform local -x is always "behind" the dino (the sprite draws mirrored),
  // and sizing off the drawn sprite keeps it on the art at any scale.
  const met=playerSpriteMetrics();
  const backGlowAlpha=p.jetpack?0.9:0.3;
  ctx.shadowColor="#00e5ff"; ctx.shadowBlur=15;
  ctx.fillStyle=`rgba(0,229,255,${backGlowAlpha})`;
  ctx.beginPath(); ctx.arc(met.dw*(0.32-0.5),-met.dh*0.67,4,0,Math.PI*2); ctx.fill();
  ctx.shadowBlur=0;

  // small jetpack fuel bar hovering just above the dino's head
  ctx.globalAlpha=1;
  const fbW=34, fbH=5, fbY=headTopY-12;
  ctx.fillStyle="rgba(0,0,0,0.55)";
  ctx.fillRect(-fbW/2,fbY,fbW,fbH);
  const fuelColor=player.jetFuel>0.3?"#44aaff":"#ff4422";
  ctx.shadowColor=fuelColor; ctx.shadowBlur=6;
  ctx.fillStyle=fuelColor;
  ctx.fillRect(-fbW/2,fbY,fbW*player.jetFuel,fbH);
  ctx.shadowBlur=0;

  // active power-up aura — a rotating neon ring tinted by whichever power is
  // active, fading out smoothly as its timer runs down
  if(p.activePower){
    const ap=p.activePower;
    const fade=clamp(ap.timer/1.0,0,1); // last second fades the glow out instead of a hard cutoff
    ctx.save();
    ctx.globalCompositeOperation="lighter";
    ctx.rotate(t*(ap.kind==="shield"?3:1.5));
    ctx.shadowColor=ap.color; ctx.shadowBlur=16*fade;
    ctx.strokeStyle=ap.color; ctx.globalAlpha=0.7*fade; ctx.lineWidth=3;
    ctx.beginPath(); ctx.arc(0,-PLAYER_H*0.55,PLAYER_W*0.85,0,Math.PI*1.5); ctx.stroke();
    ctx.globalAlpha=1;
    ctx.restore();
    ctx.shadowBlur=0;
  }

  ctx.restore();
}

// ─── BEAM SPRITES ─────────────────────────────────────────────
// beam.png and beam_hyper.png both point RIGHT and are vertically centred on
// their bright core. These fractions are the measured height of that bright
// core within the full frame — sizing the art by them makes the drawn core
// line up with the hitscan `thickness` instead of being eyeballed. Both are
// drawn with 'lighter', which is also what makes beam_hyper.png's opaque
// black background disappear (adding zero) and leaves only the energy.
const beamSprite=new Image(); let beamLoaded=false;
beamSprite.onload=()=>{ beamLoaded=true; };
beamSprite.src=assetURL("beam.png");
const beamHyperSprite=new Image(); let beamHyperLoaded=false;
beamHyperSprite.onload=()=>{ beamHyperLoaded=true; };
beamHyperSprite.src=assetURL("beam_hyper.png");
const BEAM_CORE_FRAC=0.130, BEAM_HYPER_CORE_FRAC=0.250;

// ─── DRAW CONTINUOUS PLASMA LASER ─────────────────────────────
// Draws one pass of drawLaser per ray. Swapping laser.mouthY around the
// existing single-ray renderer keeps that renderer untouched — it is a
// hundred lines of carefully tuned bloom and sprite fitting.
function drawLaserAll(){
  if(!laser) return;
  const ys=laser.ys||[laser.mouthY];
  const saved=laser.mouthY;
  for(const ry of ys){ laser.mouthY=ry; drawLaser(); }
  laser.mouthY=saved;
}
function drawLaser(){
  if(!laser) return;
  const mx=laser.mouthX-camX;
  const tipX=mx+laser.dir*laser.len;
  const y=laser.mouthY;
  const half=laser.thickness/2;
  const x0=Math.min(mx,tipX), x1=Math.max(mx,tipX);

  // fever mode and the HYPER BEAM pickup both swap in the thick lightning
  // sprite (laser.fever is set from feverMode || hyperActive), and the
  // hitscan thickness they carry is likewise doubled
  const hyper=!!laser.fever;
  const sprite=hyper?beamHyperSprite:beamSprite;
  const spriteReady=hyper?beamHyperLoaded:beamLoaded;

  // additive blending gives the beam a real bloom where it overlaps sparks,
  // embers and itself, instead of just a flat translucent bar
  ctx.save();
  ctx.globalCompositeOperation="lighter";

  // ── the code-drawn core beam ALWAYS draws ──
  // beam.png is shaped like an impact flare — thin and very faint at its tail,
  // bright only at the head — so stretched across a long shot its first half
  // essentially vanishes. Drawing a solid molten core underneath guarantees a
  // readable beam whether or not the PNG has loaded (or is even present).
  ctx.lineCap="round";
  const coreW=laser.thickness*1.75;   // 8px hitscan -> 14px core, doubled in fever/hyper

  // wide outer glow
  ctx.strokeStyle=hyper?"rgba(255,60,140,0.30)":"rgba(255,120,0,0.30)";
  ctx.lineWidth=coreW*2.6;
  ctx.beginPath(); ctx.moveTo(mx,y); ctx.lineTo(tipX,y); ctx.stroke();

  // molten core
  ctx.shadowColor=hyper?"#ff2266":"#ff6600"; ctx.shadowBlur=18;
  ctx.strokeStyle=hyper?"#ff4488":"#ffaa00";
  ctx.lineWidth=coreW;
  ctx.beginPath(); ctx.moveTo(mx,y); ctx.lineTo(tipX,y); ctx.stroke();

  // white-hot centre line
  ctx.shadowColor="#ffffff"; ctx.shadowBlur=10;
  ctx.strokeStyle="rgba(255,250,220,0.95)";
  ctx.lineWidth=Math.max(2,coreW*0.34);
  ctx.beginPath(); ctx.moveTo(mx,y); ctx.lineTo(tipX,y); ctx.stroke();
  noGlow();

  // ── the sprite, blended on top of that core when it's available ──
  if(spriteReady){
    // draw height comes from the measured bright-core fraction, so the art's
    // core lines up with the hitscan thickness and the rest reads as flare
    const drawH=laser.thickness/(hyper?BEAM_HYPER_CORE_FRAC:BEAM_CORE_FRAC);
    ctx.save();
    ctx.translate(mx,y);
    if(laser.dir<0) ctx.scale(-1,1);  // art points right; mirror when firing left
    ctx.drawImage(sprite,0,-drawH/2,Math.max(1,laser.len),drawH);
    ctx.restore();
  }
  ctx.restore();

  // impact sparks + forking yellow lightning where it strikes an enemy
  if(laser.hitEnemy){
    ctx.strokeStyle="rgba(255,238,80,0.9)"; ctx.lineWidth=laser.fever?3:2;
    ctx.beginPath();
    ctx.moveTo(tipX,y);
    ctx.lineTo(tipX+laser.dir*14,y+rnd(-11,11));
    ctx.lineTo(tipX+laser.dir*26,y+rnd(-15,15));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tipX,y);
    ctx.lineTo(tipX+laser.dir*10,y+rnd(-16,16));
    ctx.stroke();
    glow("#ffee44",14);
    ctx.fillStyle="#fffde7";
    ctx.beginPath(); ctx.arc(tipX,y,4,0,Math.PI*2); ctx.fill();
    noGlow();
  }
}

// ─── DRAW ENEMY DROPS (piñata gems + coins) ───────────────────
function drawDrops(){
  for(const d of drops){
    const dx=d.x-camX, dy=d.y;
    if(d.kind==="bosscoin"){
      // the Alpha's bounty — a fat spinning coin worth 4x a normal one. The
      // horizontal squash is a fake 3D spin, so it reads even in a big pile.
      const spin=Math.abs(Math.cos(d.rot+t*4));
      glow("#ffcc00",20);
      ctx.fillStyle="#ffcc00";
      ctx.beginPath(); ctx.ellipse(dx,dy,4+10*spin,14,0,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle="#ff9900"; ctx.lineWidth=2;
      ctx.beginPath(); ctx.ellipse(dx,dy,4+10*spin,14,0,0,Math.PI*2); ctx.stroke();
      if(spin>0.45){
        ctx.fillStyle="#fff3a0";
        ctx.font="bold 13px 'Courier New',monospace";
        ctx.textAlign="center"; ctx.fillText("★",dx,dy+5); ctx.textAlign="left";
      }
    } else if(d.kind==="coin"){
      glow("#ffdd00",14);
      ctx.fillStyle="#ffdd00";
      ctx.beginPath(); ctx.arc(dx,dy,9,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle="#ffaa00"; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(dx,dy,9,0,Math.PI*2); ctx.stroke();
      ctx.fillStyle="rgba(255,255,220,0.7)";
      ctx.beginPath(); ctx.arc(dx-2,dy-2,2.5,0,Math.PI*2); ctx.fill();
    } else if(d.kind==="fuel"){
      glow("#44aaff",14);
      ctx.fillStyle="#2a3060"; ctx.fillRect(dx-5,dy-8,10,16);
      ctx.fillStyle="#44aaff"; ctx.fillRect(dx-5,dy-8,10,5);
      ctx.fillStyle="rgba(200,240,255,0.8)"; ctx.fillRect(dx-2,dy-1,4,6);
    } else {
      const cols=dropColors(d.kind);
      glow(cols[0],12);
      ctx.save();
      ctx.translate(dx,dy);
      ctx.rotate(d.rot+t*1.5);
      ctx.fillStyle=cols[0];
      ctx.fillRect(-6,-6,12,12);
      ctx.fillStyle=cols[1];
      ctx.fillRect(-3,-3,6,6);
      ctx.restore();
    }
    noGlow();
  }
}

// ─── DRAW POWER-UP BOXES ───────────────────────────────────────
function drawPowerUpBoxes(){
  for(const box of powerUpBoxes){
    if(!box.alive) continue;
    const bx=box.x-camX, by=box.y+Math.sin(t*1.6+box.bob)*6;
    glow("#ffdd44",18+6*Math.sin(t*4+box.bob));
    // golden crystal/egg shell
    const g=ctx.createLinearGradient(bx,by-14,bx,by+14);
    g.addColorStop(0,"#fff3b0"); g.addColorStop(0.5,"#ffcc33"); g.addColorStop(1,"#cc8800");
    ctx.fillStyle=g;
    ctx.beginPath();
    ctx.moveTo(bx,by-14);
    ctx.quadraticCurveTo(bx+12,by-6,bx+10,by+8);
    ctx.quadraticCurveTo(bx+6,by+16,bx,by+16);
    ctx.quadraticCurveTo(bx-6,by+16,bx-10,by+8);
    ctx.quadraticCurveTo(bx-12,by-6,bx,by-14);
    ctx.closePath(); ctx.fill();
    // inner facets
    ctx.strokeStyle="rgba(255,255,255,0.5)"; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(bx,by-14); ctx.lineTo(bx,by+16); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx-8,by); ctx.lineTo(bx+8,by); ctx.stroke();
    noGlow();
  }
}

// ─── DRAW WEAPON PICKUPS (Sulfur Essence / Magma Crystal) ──────
function drawWeaponPickups(){
  for(const wp of weaponPickups){
    if(!wp.alive) continue;
    const wx=wp.x-camX, wy=wp.y+Math.sin(t*1.6+wp.bob)*6;
    const w=WEAPONS[wp.kind]||WEAPONS.spread;
    const pulse=0.6+0.4*Math.sin(t*4+wp.bob);
    // the capsule spins, the letter does not — you have to be able to read it
    glow(w.color,14+8*pulse);
    ctx.save();
    ctx.translate(wx,wy);
    ctx.rotate(t*1.2+wp.bob);
    ctx.fillStyle="rgba(8,6,14,0.85)";
    ctx.fillRect(-13,-13,26,26);
    ctx.strokeStyle=w.color; ctx.lineWidth=2;
    ctx.strokeRect(-13,-13,26,26);
    ctx.restore();
    ctx.font="bold 17px 'Courier New',monospace";
    ctx.fillStyle=w.color;
    ctx.textAlign="center";
    ctx.fillText(w.letter,wx,wy+6);
    ctx.textAlign="left";
    noGlow();
  }
}

// ─── DRAW PLAYER LAVA BOMBS ─────────────────────────────────────
function drawPlayerBombs(){
  for(const b of playerBombs){
    const bx=b.x-camX;
    glow("#ff5500",16);
    ctx.fillStyle="#ff6600";
    ctx.beginPath(); ctx.arc(bx,b.y,8,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#ffdd44";
    ctx.beginPath(); ctx.arc(bx-2,b.y-2,3,0,Math.PI*2); ctx.fill();
    noGlow();
  }
}

// ─── DRAW CAPTIVE CAGES ─────────────────────────────────────────
function drawCages(){
  for(const cage of cages){
    if(!cage.alive) continue;
    const cx=cage.x-camX, cy=cage.y;
    // dark cell behind the captive so it reads as being inside something
    ctx.fillStyle="rgba(8,4,14,0.55)";
    ctx.fillRect(cx-15,cy-21,30,42);
    // the captive, looking out toward the player. A frozen one is drawn as
    // its ice block — that sheet IS the cage.
    if(cage.species==="frozen"){
      if(!drawSpeciesArt("frozen",cx,cy,44,44,player.x>cage.x?1:-1)){
        ctx.fillStyle="#9fd8f5"; ctx.fillRect(cx-18,cy-20,36,40);
      }
      const melt=1-clamp(cage.hp,0,1);
      if(melt>0.02){
        glow("#bae6fd",10);
        ctx.strokeStyle=`rgba(255,220,150,${0.3+0.6*melt})`; ctx.lineWidth=2;
        ctx.strokeRect(cx-20-melt*3,cy-22-melt*3,40+melt*6,44+melt*6);
        noGlow();
      }
      continue;
    }
    drawBaby(cx,cy+2,34,player.x>cage.x?1:-1,cage.species);
    // cage bars, drawn OVER the captive
    ctx.strokeStyle="#8a8a95"; ctx.lineWidth=3;
    for(let i=-12;i<=12;i+=8){
      ctx.beginPath(); ctx.moveTo(cx+i,cy-20); ctx.lineTo(cx+i,cy+20); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(cx-14,cy-20); ctx.lineTo(cx+14,cy-20); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx-14,cy+20); ctx.lineTo(cx+14,cy+20); ctx.stroke();
    // a hint that it needs to be shot, not walked into
    if(Math.sin(t*3)>0.3){
      ctx.fillStyle="rgba(255,255,255,0.7)"; ctx.font="9px 'Courier New',monospace";
      ctx.textAlign="center"; ctx.fillText("SHOOT ME",cx,cy-26); ctx.textAlign="left";
    }
  }
}

// ─── DRAW BABY DINOS (freed from cages, scampering off) ────────
function drawBabyDinos(){
  for(const bd of babyDinos){
    const bx=bd.x-camX;
    const bob=Math.abs(Math.sin(t*12))*4;   // a little scampering hop
    ctx.globalAlpha=clamp(bd.life,0,1);     // fades as it escapes off-screen
    drawBaby(bx,bd.y-bob,34,bd.vx>=0?1:-1);
    ctx.globalAlpha=1;
  }
}

// ─── DRAW MAGMA BURSTS (dynamic lava hazard) ───────────────────
function drawMagmaBursts(){
  const TH=themeOf();
  for(const m of magmaBursts){
    const mx=m.x-camX, my=m.y;
    glow(TH.glow,14);
    ctx.fillStyle=TH.liquid[0];
    ctx.beginPath(); ctx.arc(mx,my,6,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=TH.surface;
    ctx.beginPath(); ctx.arc(mx-1,my-1,2.5,0,Math.PI*2); ctx.fill();
    noGlow();
  }
}

// ─── STOMP SHOCKWAVES (the walker's signature) ───────────────
// A wave that runs along the ground line. It only hits a grounded player,
// so jumping over one is the answer — the walker punishes standing still,
// which is exactly the opposite of what the flyers punish.
function updateShockwaves(dt){
  for(let i=shockwaves.length-1;i>=0;i--){
    const sw=shockwaves[i];
    sw.x+=sw.dir*420*dt;
    sw.life+=dt;
    if(sw.life>3.2||sw.x<camX-120||sw.x>camX+W+120){ shockwaves.splice(i,1); continue; }
    if(player.invuln<=0 && player.onGround &&
       Math.abs((player.x+PLAYER_W/2)-sw.x)<26 &&
       Math.abs((player.y+PLAYER_H)-GROUND_Y)<50){
      takeDamage("enemy");
    }
    if(Math.random()<dt*30) spawnParticles(sw.x-camX,GROUND_Y-6,1,
      ["#ff8800","#ffcc44","#ffffff"],
      {minSpd:30,maxSpd:110,upBias:80,minLife:0.2,maxLife:0.5,type:"square",gravity:200,minSz:2,maxSz:5});
  }
}
function drawShockwaves(){
  for(const sw of shockwaves){
    const sx=sw.x-camX;
    if(sx<-40||sx>W+40) continue;
    const hgt=26+6*Math.sin(t*20+sw.life*8);
    ctx.save();
    ctx.globalCompositeOperation="lighter";
    glow("#ff6600",16);
    const g=ctx.createLinearGradient(0,GROUND_Y-hgt,0,GROUND_Y);
    g.addColorStop(0,"rgba(255,180,60,0)");
    g.addColorStop(1,"rgba(255,120,20,0.9)");
    ctx.fillStyle=g;
    ctx.beginPath();
    ctx.moveTo(sx-16,GROUND_Y);
    ctx.lineTo(sx,GROUND_Y-hgt);
    ctx.lineTo(sx+16,GROUND_Y);
    ctx.closePath(); ctx.fill();
    noGlow();
    ctx.restore();
  }
}

// ─── DRAW BOSS LAVA BALLS ───────────────────────────────────────
function drawLavaBalls(){
  for(const lb of lavaBalls){
    const lx=lb.x-camX, ly=lb.y;
    if(lb.acid){
      // spore ball / acid drip / chill round — themed ammunition
      const p=0.5+0.5*Math.sin(t*12);
      if(lb.chill){
        glow("#7dd3fc",16+6*p);
        ctx.fillStyle="#7dd3fc";
        ctx.beginPath(); ctx.arc(lx,ly,8,0,Math.PI*2); ctx.fill();
        ctx.fillStyle="#f0fbff";
        ctx.beginPath(); ctx.arc(lx-2,ly-2,3,0,Math.PI*2); ctx.fill();
        // a frost trail behind it
        if(Math.random()<0.5) spawnParticles(lx,ly,1,["#dff6ff","#7dd3fc"],
          {minSpd:5,maxSpd:20,minLife:0.2,maxLife:0.5,type:"square",gravity:10,minSz:1,maxSz:3});
        noGlow();
        continue;
      }
      glow("#10b981",14+6*p);
      ctx.fillStyle="#10b981";
      ctx.beginPath(); ctx.ellipse(lx,ly,8,9+2*p,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle="#a7f3d0";
      ctx.beginPath(); ctx.arc(lx-2,ly-3,3,0,Math.PI*2); ctx.fill();
      noGlow();
      if(Math.random()<0.3) spawnParticles(lx,ly+6,1,["#34d399","#a7f3d0"],
        {minSpd:5,maxSpd:25,minLife:0.15,maxLife:0.4,type:"circle",gravity:60,minSz:1,maxSz:2});
      continue;
    }
    if(lb.parry){
      // Cuphead's rule: if it is pink, you can hit it. A parryable shot
      // pulses magenta and wears a ring so it never reads as ordinary fire.
      const p=0.5+0.5*Math.sin(t*16);
      glow("#ff2fb0",18+10*p);
      ctx.fillStyle="#ff2fb0";
      ctx.beginPath(); ctx.arc(lx,ly,10,0,Math.PI*2); ctx.fill();
      ctx.fillStyle="#ffd6f2";
      ctx.beginPath(); ctx.arc(lx-2,ly-2,4,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle=`rgba(255,120,220,${0.5+0.5*p})`; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(lx,ly,14+3*p,0,Math.PI*2); ctx.stroke();
      noGlow();
      continue;
    }
    glow("#ff4400",16);
    ctx.fillStyle="#ff5500";
    ctx.beginPath(); ctx.arc(lx,ly,10,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#ffcc44";
    ctx.beginPath(); ctx.arc(lx-2,ly-2,4,0,Math.PI*2); ctx.fill();
    noGlow();
  }
}

// ─── DRAW BOSS FLAME BURSTS (attack 2 — vertical column) ───────
function drawBossFlameBursts(){
  for(const fb of bossFlameBursts){
    const fx=fb.x-camX;
    if(fb.life<=0.4){
      // telegraph: a thin pulsing warning line before the column ignites
      const warn=0.4+0.4*Math.sin(t*20);
      ctx.strokeStyle=`rgba(${themeOf().haze},${warn})`; ctx.lineWidth=3;
      ctx.beginPath(); ctx.moveTo(fx,fb.y); ctx.lineTo(fx,LAVA_Y); ctx.stroke();
    } else {
      ctx.save();
      ctx.globalCompositeOperation="lighter";
      const TH=themeOf();
      glow(TH.glow,22);
      const g=ctx.createLinearGradient(fx-14,0,fx+14,0);
      g.addColorStop(0,`rgba(${TH.haze},0)`);
      g.addColorStop(0.5,`rgba(${TH.haze},0.85)`);
      g.addColorStop(1,`rgba(${TH.haze},0)`);
      ctx.fillStyle=g;
      ctx.fillRect(fx-14,fb.y,28,LAVA_Y-fb.y);
      noGlow();
      ctx.restore();
    }
  }
}

// ─── BOSS SPRITE (enemyboss.png) ────────────────────────────────
const bossSprite=new Image();
let bossSpriteLoaded=false;
bossSprite.onload=()=>{ bossSpriteLoaded=true; };
bossSprite.src=assetURL("enemyboss.png");

// ─── DRAW BOSS ───────────────────────────────────────────────
// The general sprite registry: bosses, forest fauna, anything that names its
// own art. Sprites load lazily, are trimmed by computeSpriteBBox on arrival,
// and every caller has a fallback — a missing file costs a silhouette, not a
// crash.
//
// SPECIES holds which way each sheet was drawn, because they disagree: the
// dragonfly and the spitter face left, the crawler and the trike face right.
// Everything mirrors off that rather than off a guess.
const SPECIES={
  forest_flyer:   {art:"forest_flyer.png",   faces:-1, w:66, h:40},
  forest_crawler: {art:"forest_crawler.png", faces: 1, w:58, h:44},
  forest_plant:   {art:"forest_plant.png",   faces:-1, w:50, h:54},
  trike:          {art:"baby_trike.png",     faces: 1},
  ice_flyer:      {art:"ice_flyer.png",      faces:-1, w:62, h:42},
  ice_crusher:    {art:"ice_crusher.png",    faces:-1, w:66, h:52},
  frozen:         {art:"baby_frozen.png",    faces:-1},
};
// Draws a registry sprite fitted into w*h, mirrored to face a direction.
// one place to read a species' toughness from
const ENEMY_HP={forest_crawler:4, forest_plant:3, forest_flyer:2,
                ice_crusher:4, ice_flyer:2};
function drawSpeciesArt(species,cx,cy,w,h,dir){
  const sp=SPECIES[species]; if(!sp) return false;
  const a=artFor(sp.art);
  if(!a||!a.loaded) return false;
  const bb=a.bbox||{x:0,y:0,w:a.img.naturalWidth,h:a.img.naturalHeight};
  const scale=Math.min(w/bb.w,h/bb.h);
  const dw=bb.w*scale, dh=bb.h*scale;
  ctx.save();
  ctx.translate(cx,cy);
  if(dir*sp.faces<0) ctx.scale(-1,1);
  ctx.drawImage(a.img,bb.x,bb.y,bb.w,bb.h,-dw/2,-dh/2,dw,dh);
  ctx.restore();
  return true;
}
const SPRITE_ART={};
function artFor(srcName){
  if(!srcName) return null;
  let e=SPRITE_ART[srcName];
  if(!e){
    e=SPRITE_ART[srcName]={img:new Image(), loaded:false, bbox:null};
    e.img.onload=()=>{ e.bbox=computeSpriteBBox(e.img,false); e.loaded=true; };
    e.img.src=assetURL(srcName);
  }
  return e;
}

function drawBoss(){
  if(!boss||boss.dead) return;
  const bx=boss.x-camX, by=boss.y;
  ctx.save(); ctx.translate(bx,by);

  if(boss.dying){
    drawDeathFlash(boss.w,boss.h);
    ctx.restore();
    return;
  }

  if(boss.hitFlash>0){
    ctx.globalAlpha=0.5+0.5*Math.sin(boss.hitFlash*30);
  }

  const art=artFor(boss.art);
  if(art&&art.loaded){
    // fit the trimmed art into the hitbox without stretching it, and mirror
    // it when the player is behind — the source sheets all face left
    const bb=art.bbox||{x:0,y:0,w:art.img.naturalWidth,h:art.img.naturalHeight};
    const scale=Math.min(boss.w/bb.w,boss.h/bb.h);
    const dw=bb.w*scale, dh=bb.h*scale;
    const faceRight=(player.x+PLAYER_W/2)>boss.x;
    ctx.save();
    if(faceRight) ctx.scale(-1,1);
    ctx.drawImage(art.img,bb.x,bb.y,bb.w,bb.h,-dw/2,-dh/2,dw,dh);
    ctx.restore();
    if(boss.phase>=2){
      // an enraged wash over the art, additive so it glows rather than muddies
      ctx.save();
      ctx.globalCompositeOperation="lighter";
      ctx.globalAlpha=0.22+0.12*Math.sin(t*9);
      ctx.fillStyle=boss.kind==="titan"?"#7dd3fc":"#ff2244";
      ctx.fillRect(-boss.w/2,-boss.h/2,boss.w,boss.h);
      ctx.restore();
    }
  } else {
    ctx.fillStyle="#ff0000";
    ctx.fillRect(-boss.w/2,-boss.h/2,boss.w,boss.h);
  }
  // the freeze breath, drawn in the boss's own local space
  if(boss.breathState&&boss.breathState!=="none"){
    const dir=boss.breathDir||-1;
    const bx=dir*boss.w*0.45, by=-boss.h*0.18;
    const reach=BOSS_BREATH_REACH;
    ctx.save();
    // the sweep is a rotation about the muzzle, so the wedge below is still
    // authored flat along dir and never had to learn about the arc
    ctx.translate(bx,by);
    ctx.rotate(dir*(boss.breathAngle||0));
    ctx.translate(-bx,-by);
    if(boss.breathState==="wind"){
      const warn=0.4+0.4*Math.sin(t*26);
      ctx.strokeStyle=`rgba(190,230,255,${warn})`; ctx.lineWidth=3;
      ctx.beginPath(); ctx.moveTo(bx,by); ctx.lineTo(bx+dir*reach,by); ctx.stroke();
    } else {
      ctx.globalCompositeOperation="lighter";
      glow("#7dd3fc",22);
      const g=ctx.createLinearGradient(bx,0,bx+dir*reach,0);
      g.addColorStop(0,"rgba(223,246,255,0.95)");
      g.addColorStop(0.6,"rgba(125,211,252,0.55)");
      g.addColorStop(1,"rgba(125,211,252,0)");
      ctx.fillStyle=g;
      const hgt=30+6*Math.sin(t*22);
      ctx.beginPath();
      ctx.moveTo(bx,by-10); ctx.lineTo(bx+dir*reach,by-hgt);
      ctx.lineTo(bx+dir*reach,by+hgt); ctx.lineTo(bx,by+10);
      ctx.closePath(); ctx.fill();
      noGlow();
    }
    ctx.restore();
  }

  // a telegraph flash right before a diving swoop
  if(boss.diveState==="telegraph"){
    ctx.save();
    ctx.globalCompositeOperation="lighter";
    ctx.globalAlpha=0.3+0.3*Math.sin(t*26);
    ctx.fillStyle="#ffee66";
    ctx.fillRect(-boss.w/2,-boss.h/2,boss.w,boss.h);
    ctx.restore();
  }
  ctx.globalAlpha=1;

  // boss HP bar (8 segments)
  const hbW=boss.w*0.9, hbY=-boss.h/2-20;
  ctx.fillStyle="rgba(0,0,0,0.6)"; ctx.fillRect(-hbW/2,hbY,hbW,10);
  const segW=hbW/boss.maxHp;
  for(let i=0;i<boss.maxHp;i++){
    ctx.fillStyle= i<boss.hp ? "#ff3322" : "rgba(255,255,255,0.15)";
    ctx.fillRect(-hbW/2+i*segW+1,hbY+1,segW-2,8);
  }
  ctx.fillStyle=boss.phase>=2?"#ff6677":"#fff";
  ctx.font="10px 'Courier New',monospace"; ctx.textAlign="center";
  ctx.fillText(boss.name+(boss.phase>=2?"  ⚠ FAZ 2":""),0,hbY-6);
  ctx.textAlign="left";

  ctx.restore();
}
