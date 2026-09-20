// Backdrop, terrain, lava, platforms
// Part of NEON DINO-AGE: RESCUE PROTOCOL. Loaded as a classic
// script, in the order index2.html lists — these files share one
// global scope on purpose and are not modules.


// ─── SCORE / COMBO ────────────────────────────────────────────
let score = 0;
let chain = 0;
let chainTimer = 0;
const CHAIN_WINDOW = 2.5;
const FEVER_THRESHOLD = 10;
let feverMode = false;
let feverFlash = 0;
let screenShake = 0;
let hitStopTimer = 0; // brief real-time freeze applied on impactful hits

// ─── GAME STATE ───────────────────────────────────────────────
let STATE = "map"; // map | playing | warp | report | continue | dead | win
let stateTimer = 0;
let goalReached = false;
let lavaSurface = [];
function genLavaSurface(){ lavaSurface=[]; for(let i=0;i<=60;i++) lavaSurface.push({t:rnd(0,Math.PI*2)}); }
genLavaSurface();
let t = 0;

// ─── FOREST BACKDROP ─────────────────────────────────────────
function drawBiomeBG(){
  const TH=themeOf();
  const tint=TH.bgTint||["rgba(2,12,8,0.45)","4,24,14","6,40,24","2,20,12"];
  ctx.fillStyle=isIce()?"#061224":"#04140c"; ctx.fillRect(0,0,W,H);
  const bgArt=artFor(TH.bg);
  const forestBgLoaded=!!(bgArt&&bgArt.loaded);
  const forestBgSprite=bgArt?bgArt.img:null;
  if(forestBgLoaded){
    const iw=forestBgSprite.naturalWidth, ih=forestBgSprite.naturalHeight;
    const dw=Math.max(1,iw*(H/ih));           // cover the canvas height
    // slow scroll — the backdrop drifts at a fifth of the level's speed
    const off=((-camX*0.2)%dw+dw)%dw;
    for(let i=-1;i*dw-off<W;i++){
      const dx=i*dw-off;
      ctx.save();
      // mirror every other copy so the corridor meets itself cleanly
      if(((i%2)+2)%2===1){ ctx.translate(dx+dw,0); ctx.scale(-1,1); }
      else ctx.translate(dx,0);
      ctx.drawImage(forestBgSprite,0,0,iw,ih,0,0,dw,H);
      ctx.restore();
    }
  }
  // depth: darken the whole plate, then a haze that thickens downward
  ctx.fillStyle=tint[0];
  ctx.fillRect(0,0,W,H);
  const g=ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,`rgba(${tint[1]},0.55)`);
  g.addColorStop(0.45,`rgba(${tint[2]},0.18)`);
  g.addColorStop(1,`rgba(${tint[3]},0.65)`);
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  if(TH.snow){
    // snowfall: slow, heavy flakes that drift sideways as they settle
    if(Math.random()<0.55) particles.push({
      x:rnd(-20,W+20), y:-8,
      vx:rnd(-16,10), vy:rnd(18,46),
      life:1, maxLife:rnd(2.4,4.4),
      color:Math.random()<0.6?"rgba(255,255,255,0.85)":"rgba(200,235,255,0.7)",
      size:rnd(1,3), type:"square", gravity:6
    });
  } else {
    // spore motes drifting through the canopy light
    if(Math.random()<0.25) particles.push({
      x:rnd(0,W), y:rnd(40,H-120),
      vx:rnd(-12,12), vy:-rnd(4,16),
      life:1, maxLife:rnd(1.6,3.2),
      color:Math.random()<0.5?"rgba(110,231,183,0.55)":"rgba(52,211,153,0.4)",
      size:rnd(1,3), type:"circle", gravity:-3
    });
  }
}

// ─── PARALLAX BG ─────────────────────────────────────────────
// Stars
const stars=[];
for(let i=0;i<80;i++) stars.push({x:rnd(0,1200),y:rnd(0,200),r:rnd(.5,2),twinkle:rnd(0,Math.PI*2)});

// ─── DRAW HELPERS ────────────────────────────────────────────
function glow(color, blur){
  ctx.shadowColor = color; ctx.shadowBlur = blur;
}
function noGlow(){ ctx.shadowBlur=0; }

// ─── DRAW BACKGROUND ─────────────────────────────────────────
function drawBG(){
  if(themeOf().bg){ drawBiomeBG(); return; }
  // deep cave gradient
  const bg = ctx.createLinearGradient(0,0,0,H);
  bg.addColorStop(0,"#0a0618");
  bg.addColorStop(0.45,"#12083a");
  bg.addColorStop(1,"#1a0808");
  ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);

  // far: stars
  for(const s of stars){
    const sx = ((s.x - camX*0.04)%W+W)%W;
    const a = 0.4+0.4*Math.sin(t*1.5+s.twinkle);
    ctx.globalAlpha=a; ctx.fillStyle="#b8d4ff";
    ctx.beginPath(); ctx.arc(sx,s.y,s.r,0,Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha=1;

  // parallax: distant dark volcano silhouette (layer 1 — very far) with crater glow
  const vx = ((-camX*0.08+600)%W+W)%W - 200;
  // crater light: a strong upward-rising beam + radial bloom, drawn BEHIND the silhouette
  const craterX=vx+130, craterY=180;
  const flick=0.75+0.25*Math.sin(t*3);
  const beamG=ctx.createLinearGradient(craterX,craterY-120,craterX,craterY+10);
  beamG.addColorStop(0,"rgba(255,120,0,0)");
  beamG.addColorStop(1,`rgba(255,90,0,${0.35*flick})`);
  ctx.fillStyle=beamG;
  ctx.beginPath();
  ctx.moveTo(craterX-46,craterY+6);
  ctx.lineTo(craterX-10,craterY-120);
  ctx.lineTo(craterX+10,craterY-120);
  ctx.lineTo(craterX+46,craterY+6);
  ctx.closePath(); ctx.fill();
  const bloomG=ctx.createRadialGradient(craterX,craterY,2,craterX,craterY,50);
  bloomG.addColorStop(0,`rgba(255,180,60,${0.9*flick})`);
  bloomG.addColorStop(0.4,`rgba(255,90,0,${0.5*flick})`);
  bloomG.addColorStop(1,"rgba(255,60,0,0)");
  ctx.fillStyle=bloomG;
  ctx.beginPath(); ctx.arc(craterX,craterY,50,0,Math.PI*2); ctx.fill();

  // volcano cone silhouette — drawn on top of the glow so the crater notch
  // shows light, and kept translucent so the whole backdrop stays airy
  ctx.globalAlpha=0.35;
  ctx.fillStyle="#150822";
  ctx.beginPath();
  ctx.moveTo(vx,H); ctx.lineTo(vx+80,250); ctx.lineTo(vx+120,190);
  ctx.lineTo(vx+130,204); ctx.lineTo(vx+140,190);
  ctx.lineTo(vx+180,250); ctx.lineTo(vx+260,H); ctx.closePath(); ctx.fill();
  ctx.globalAlpha=1;
  // bright molten crater core
  glow("#ff4400",18);
  ctx.fillStyle=`rgba(255,140,40,${0.85*flick})`;
  ctx.beginPath(); ctx.arc(craterX,craterY+2,7,0,Math.PI*2); ctx.fill();
  noGlow();

  // the volcano gently smokes — faint gray plumes drifting up from the crater
  if(Math.random()<0.12) spawnParticles(
    craterX+rnd(-6,6), craterY-6, 1,
    ["rgba(90,80,100,0.4)","rgba(70,65,85,0.35)"],
    {minSpd:6,maxSpd:16,upBias:26,minLife:1.5,maxLife:3,type:"circle",gravity:-6,minSz:4,maxSz:9}
  );

  // parallax: mountain silhouettes (layer 2), softened so they sit well back
  ctx.globalAlpha=0.35;
  const mx = ((-camX*0.14)%W+W)%W;
  ctx.fillStyle="#150a28";
  for(let i=-1;i<3;i++){
    const bx=mx+i*420;
    ctx.beginPath();
    ctx.moveTo(bx,H); ctx.lineTo(bx+60,310); ctx.lineTo(bx+110,260);
    ctx.lineTo(bx+160,330); ctx.lineTo(bx+260,H); ctx.closePath(); ctx.fill();
  }
  ctx.globalAlpha=1;

  // (the near-foreground obsidian outcrop layer that used to scroll at 0.92x
  // is gone. Scrolling almost in step with the platforms, it read as a dark
  // column hanging underneath every floating ledge rather than as background
  // depth — the ledges float in clean air now.)

  // cave ceiling rock edge
  ctx.fillStyle="#0d0820";
  ctx.beginPath();
  ctx.moveTo(0,0);
  const cPoints=[0,55,100,40,180,65,260,38,340,72,420,35,500,58,580,42,660,68,740,30,820,60,900,45];
  for(let i=0;i<cPoints.length;i+=2) ctx.lineTo(cPoints[i],cPoints[i+1]);
  ctx.lineTo(W,0); ctx.closePath(); ctx.fill();
}

// ─── FOREST BIOME ART ─────────────────────────────────────────
// forest_bg.png is a portrait corridor, so it is scaled to the canvas height
// and mirror-tiled sideways — the corridor is roughly symmetric, so flipped
// copies meet without a seam. It scrolls slower than the level for parallax.
// (the backdrop and the platform sheet are pulled from the shared sprite
// registry now, so a new biome is a THEMES entry rather than two more
// globals and another draw function)

// forest_ground.png is ONE mossy block, not a tileable strip. Three bands of
// it are used: the grass tufts that poke ABOVE the walk line, the body, and
// the vines that hang below into open air. Row 426 is where the art becomes
// a solid slab, and that row is drawn exactly at p.y — the same line the
// collision resolver stands the player on.

// Every block-sheet biome names its own bands in THEMES[x].cap. The rule is
// the same one ground.png follows: the row where the art first goes solid is
// blitted exactly at p.y, the collision line. Decoration rises above it and
// whatever hangs off the sheet hangs below a floating ledge.
const FG_X=150, FG_W=540;        // the block's clean middle, no ragged edges
const FG_TUFT_Y=348, FG_TOP=426; // tufts above the surface line / the surface
const FG_BODY_END=1065, FG_VINE_Y=1074, FG_VINE_END=1170;

// Bands are scaled independently: horizontally by a fixed tile width,
// vertically by the platform. Moss is noise and takes non-uniform scaling
// without complaint, which is what lets one block art serve every ledge.
function drawForestCap(px,worldX,y,w,capH,isFloat,bodyBottom){
  const c=capSpec();
  if(!c) return false;
  const a=artFor(c.art);
  if(!a||!a.loaded) return false;
  const img=a.img;
  const TW=c.tile, tuftH=c.tuftPx, hangH=c.hangPx;
  ctx.save();
  ctx.beginPath(); ctx.rect(px,y-tuftH,w,(bodyBottom-y)+hangH+tuftH); ctx.clip();
  const i0=Math.floor(worldX/TW), i1=Math.ceil((worldX+w)/TW);
  for(let i=i0;i<i1;i++){
    const tx=px+(i*TW-worldX);
    ctx.save();
    if(i%2!==0){ ctx.translate(tx+TW,0); ctx.scale(-1,1); }
    else ctx.translate(tx,0);
    // the decorative fringe, rising above the walk line
    ctx.drawImage(img,c.x,c.tuftY,c.w,c.top-c.tuftY, 0,y-tuftH,TW,tuftH);
    // the solid body
    ctx.drawImage(img,c.x,c.top,c.w,c.bodyEnd-c.top, 0,y,TW,bodyBottom-y);
    // whatever hangs off it, only where there is open air below
    if(isFloat){
      ctx.drawImage(img,c.x,c.hangY,c.w,c.hangEnd-c.hangY, 0,bodyBottom,TW,hangH);
    }
    ctx.restore();
  }
  ctx.restore();
  return true;
}

// ─── GROUND SURFACE TILE (ground.png) ─────────────────────────
// The walking surface of every solid platform, and of the cave floor, is one
// horizontal strip of ground.png mirror-tiled along the top.
//
// The source band starts at row 424 of the 1024px sheet, which is the first
// row where the art becomes fully opaque — so the strip has a clean,
// continuous top edge rather than the sheet's ragged spires. That edge is
// drawn at exactly p.y, which is the same y the collision resolver stands
// the player on, so the dino's feet land on the texture instead of hovering
// a few pixels above it.
//
// (The old left-edge lava_wall.png seam and the two procedural "lava falls"
// that used to hang off the walls are gone — they read as flat orange bars
// pasted over the scene. lava_wall.png and lava_ceiling.png are no longer
// loaded by this build at all; index.html still uses lava_wall.png.)
const groundSprite=new Image();
let groundLoaded=false;
groundSprite.onload=()=>{ groundLoaded=true; };
groundSprite.src=assetURL("ground.png");
const GROUND_SRC_Y=424, GROUND_SRC_W=1024, GROUND_SRC_H=100;

// px is the SCREEN x of the platform's left edge, worldX the same edge in
// world space. The tile phase is anchored to WORLD space so the texture stays
// nailed to the rock instead of swimming as the camera scrolls.
function drawGroundCap(px,worldX,y,w,capH){
  const tileW=GROUND_SRC_W*(capH/GROUND_SRC_H);
  ctx.save();
  ctx.beginPath(); ctx.rect(px,y,w,capH); ctx.clip();
  // every other tile is mirrored: two flipped copies share an identical edge,
  // so the strip repeats with no visible seam even though the source art is
  // not tileable
  const i0=Math.floor(worldX/tileW), i1=Math.ceil((worldX+w)/tileW);
  for(let i=i0;i<i1;i++){
    const tx=px+(i*tileW-worldX);
    if(i%2===0){
      ctx.drawImage(groundSprite,0,GROUND_SRC_Y,GROUND_SRC_W,GROUND_SRC_H,tx,y,tileW,capH);
    } else {
      ctx.save();
      ctx.translate(tx+tileW,y); ctx.scale(-1,1);
      ctx.drawImage(groundSprite,0,GROUND_SRC_Y,GROUND_SRC_W,GROUND_SRC_H,0,0,tileW,capH);
      ctx.restore();
    }
  }
  ctx.restore();
}

// ─── DRAW STALACTITES ────────────────────────────────────────
// Plain dark rock spikes along the very top edge (y 0..~25), drawn with paths
// rather than art. No lava, no glow — the ceiling stays simple and dark.
const HUD_CLEAR_X = W-286;   // nothing decorative is drawn right of this, so
                             // the neon CHAIN/SCORE panel sits on clean sky
function drawStalactites(){
  if(isForest()) return;   // no cave ceiling out under the canopy
  for(const s of stalactites){
    const sx = s.x - camX*0.96;
    if(sx<-40||sx>W+40) continue;
    if(sx>HUD_CLEAR_X) continue;   // keep the HUD panel's backdrop clear
    ctx.fillStyle=s.shade;
    ctx.beginPath();
    ctx.moveTo(sx-s.w/2,0);
    ctx.lineTo(sx+s.w/2,0);
    ctx.lineTo(sx,s.len);
    ctx.closePath();
    ctx.fill();
  }
}

// ─── DRAW PLATFORMS ──────────────────────────────────────────
function drawPlatforms(){
  for(const p of platforms){
    if(p.lavaPit) continue;
    let px = p.x - camX;
    if(px+p.w<0||px>W) continue;
    if(p.gone) continue;              // dropped away, nothing to draw
    if(p.crumble && p.crumbleT!==undefined){
      // the tell: it rattles harder the closer it is to letting go
      const urg=1-clamp(p.crumbleT/CRUMBLE_DELAY,0,1);
      px+=Math.sin(t*(28+urg*40))*(1+urg*2.5);
    }
    if(p.crack && p.crumbleT!==undefined) drawCracks(px,p,1-clamp(p.crumbleT/CRACK_DELAY,0,1));

    if(p.goal){
      const gx=px+p.w/2, gateW=100, gateH=140, gy=p.y;

      // The exit ledge is just a ledge: same dark body and same ground.png
      // surface as every other platform. It used to be a flat grey slab with
      // a lighter grey cap, which showed through the transparent rift sprite
      // as a panel sitting behind it.
      const capH=clamp(p.h*0.55,22,44);
      const gb=ctx.createLinearGradient(0,p.y,0,p.y+p.h);
      gb.addColorStop(0,"#241f2c");
      gb.addColorStop(0.45,"#16121c");
      gb.addColorStop(1,"#080609");
      ctx.fillStyle=gb; ctx.fillRect(px,p.y,p.w,p.h);
      if(groundLoaded) drawGroundCap(px,p.x,p.y,p.w,capH);

      // The procedural obsidian arch is a STAND-IN, not scenery: it marks the
      // exit while the gate is still sealed, and it covers for portal.png if
      // that sprite never loads. Once the real rift is on screen it must not
      // be drawn at all — portal.png has transparent gaps, so the arch showed
      // through the swirl as a door silhouette behind it.
      const showArch = !(gateOpen && portalArtNow());
      if(showArch){
        const portalColor= gateOpen ? "#00ff88" : "#442244";
        glow(portalColor, gateOpen?26:8);
        ctx.fillStyle="#2a2030";
        ctx.beginPath();
        ctx.moveTo(gx-gateW/2,gy); ctx.lineTo(gx-gateW/2,gy-gateH+30);
        ctx.quadraticCurveTo(gx-gateW/2,gy-gateH,gx,gy-gateH);
        ctx.quadraticCurveTo(gx+gateW/2,gy-gateH,gx+gateW/2,gy-gateH+30);
        ctx.lineTo(gx+gateW/2,gy);
        ctx.closePath(); ctx.fill();
        // inner portal glow (bright open / dim closed)
        ctx.fillStyle= gateOpen ? "rgba(0,255,150,0.55)" : "rgba(60,20,60,0.5)";
        ctx.beginPath();
        ctx.moveTo(gx-gateW/2+14,gy-6); ctx.lineTo(gx-gateW/2+14,gy-gateH+38);
        ctx.quadraticCurveTo(gx-gateW/2+14,gy-gateH+14,gx,gy-gateH+14);
        ctx.quadraticCurveTo(gx+gateW/2-14,gy-gateH+14,gx+gateW/2-14,gy-gateH+38);
        ctx.lineTo(gx+gateW/2-14,gy-6);
        ctx.closePath(); ctx.fill();
        noGlow();

        // obsidian shards flanking the arch — the capsule's outer shell
        ctx.fillStyle="#17131d";
        for(let s=-1;s<=1;s+=2){
          ctx.beginPath();
          ctx.moveTo(gx+s*(gateW/2+2),gy);
          ctx.lineTo(gx+s*(gateW/2+16),gy-44);
          ctx.lineTo(gx+s*(gateW/2-2),gy-96);
          ctx.closePath(); ctx.fill();
        }

        if(gateOpen){
          // rune rings, so the fallback still reads as an open rift
          const rcx=gx, rcy=gy-gateH*0.55;
          ctx.save();
          ctx.translate(rcx,rcy); ctx.rotate(t*0.6);
          glow("#00ffaa",14);
          ctx.strokeStyle="rgba(130,255,205,0.75)"; ctx.lineWidth=2;
          ctx.beginPath(); ctx.arc(0,0,30,0,Math.PI*1.5); ctx.stroke();
          ctx.beginPath(); ctx.arc(0,0,20,Math.PI*0.4,Math.PI*1.9); ctx.stroke();
          ctx.fillStyle="#aaffdd";
          for(let r=0;r<6;r++){
            const a=r/6*Math.PI*2;
            ctx.fillRect(Math.cos(a)*36-2,Math.sin(a)*36-2,4,4);
          }
          noGlow();
          ctx.restore();
        }
      }

      // the rift itself. (Its inward energy motes are spawned by update(),
      // which is why there is no mote emitter left in this draw pass.)
      drawEvacPortal(gx,gy);

      // sign board + live rescue tally, readable from across the stage.
      // The labels sit above whichever of the two is taller.
      const signY=(gateOpen&&portalArtNow())?gy-PORTAL_H-30:gy-gateH-8;
      ctx.textAlign="center";
      ctx.font="bold 10px 'Courier New',monospace";
      ctx.fillStyle="#ffdd66";
      ctx.fillText("YAVRU "+rescuedThisLevel+"/"+LEVELS[levelIndex].cages.length,gx,signY-16);
      ctx.font="bold 11px 'Courier New',monospace";
      ctx.fillStyle=gateOpen?"#8effc9":"#aa88bb";
      ctx.fillText(gateOpen?"TAHLİYE PORTALI":"MÜHÜRLÜ — ALFA'YI YOK ET",gx,signY);
      if(!gateOpen){
        // only ever shown over the arch, which is always up while sealed
        ctx.fillStyle="#aa88bb"; ctx.font="10px 'Courier New',monospace";
        ctx.fillText("SEALED",gx,gy-gateH/2);
      }
      ctx.textAlign="left";
    } else if(p.curtain){
      // a hanging curtain of thorned vines — a wall until it is burned
      const burn=p.burnT===undefined?1:clamp(p.burnT,0,1);
      ctx.save();
      ctx.globalAlpha=0.35+0.65*burn;
      for(let i=0;i<5;i++){
        const vx2=px+4+i*((p.w-8)/4);
        ctx.strokeStyle=i%2?"#2f6b3d":"#3f8a4c";
        ctx.lineWidth=5;
        ctx.beginPath();
        ctx.moveTo(vx2,p.y);
        for(let yy=0;yy<=p.h;yy+=14){
          ctx.lineTo(vx2+Math.sin(t*1.4+yy*0.05+i)*3,p.y+yy);
        }
        ctx.stroke();
      }
      ctx.fillStyle="#4ade80";
      for(let i=0;i<6;i++){
        const ly=p.y+((i*p.h/6)+((t*10)%(p.h/6)));
        ctx.beginPath(); ctx.ellipse(px+p.w/2+Math.sin(t+i)*6,ly,6,3,0.6,0,Math.PI*2); ctx.fill();
      }
      if(burn<1){
        // embers creeping up it while it burns
        glow("#ffaa22",14);
        ctx.strokeStyle="#ffaa22"; ctx.lineWidth=3;
        ctx.beginPath();
        ctx.moveTo(px,p.y+p.h*burn); ctx.lineTo(px+p.w,p.y+p.h*burn);
        ctx.stroke();
        noGlow();
      }
      ctx.restore();
    } else {
      // obsidian rock platform: a dark body with the ground.png surface laid
      // along its top. Identical treatment for the cave floor and the
      // floating ledges, so everything the player can stand on looks the same.
      const isFloat = p.y < GROUND_Y;
      const capH = clamp(p.h*0.55,22,44);
      const g=ctx.createLinearGradient(0,p.y,0,p.y+p.h);
      if(isIce()){
        g.addColorStop(0, isFloat?"#2b5f86":"#1e4a6b");
        g.addColorStop(0.45,"#123045");
        g.addColorStop(1, "#071825");
      } else if(isForest()){
        g.addColorStop(0, isFloat?"#1e3a2a":"#16301f");
        g.addColorStop(0.45,"#0f2318");
        g.addColorStop(1, "#06120c");
      } else {
        g.addColorStop(0, isFloat?"#241f2c":"#1c1822");
        g.addColorStop(0.45,isFloat?"#16121c":"#110e16");
        g.addColorStop(1, "#080609");
      }
      ctx.fillStyle=g;
      ctx.fillRect(px,p.y,p.w,p.h);

      // a biome with its own block sheet paints from that; the volcano keeps
      // the mirror-tiled ground.png strip
      const capped = capSpec() &&
        drawForestCap(px,p.x,p.y,p.w,capH,isFloat,isFloat?p.y+capH:p.y+p.h);
      if(capped){
        /* painted from the biome sheet */
      } else if(groundLoaded){
        // the texture's own top edge IS the collision line at p.y
        drawGroundCap(px,p.x,p.y,p.w,capH);
      } else {
        // fallback until (or unless) ground.png arrives — the original
        // procedural rim, so a platform is never an unmarked slab
        if(!p._edge || p._edgeW!==p.w){
          p._edgeW=p.w;
          p._edge=[];
          for(let ex=0; ex<=p.w; ex+=6) p._edge.push(rnd(0,4));
        }
        ctx.fillStyle= isFloat?"#4a4452":"#352f3c";
        ctx.beginPath();
        ctx.moveTo(px,p.y);
        for(let k=0;k<p._edge.length;k++) ctx.lineTo(px+k*6, p.y-p._edge[k]);
        ctx.lineTo(px+p.w,p.y);
        ctx.closePath(); ctx.fill();
      }
    }
  }
}

// ─── CHECKPOINT BEACON ───────────────────────────────────────
// A pylon standing on the ground line at the stage's checkpoint: dim and
// grey before it is passed, a lit neon column afterwards.
function drawCheckpoint(){
  if(!isFinite(checkpointX)) return;
  const cx=checkpointX-camX;
  if(cx<-60||cx>W+60) return;
  const baseY=GROUND_Y;
  const lit=checkpointUsed;
  const col=lit?"#7dffcf":"#4a4452";
  // post
  ctx.fillStyle="#1a1620";
  ctx.fillRect(cx-4,baseY-64,8,64);
  ctx.fillStyle=col;
  ctx.fillRect(cx-3,baseY-62,6,60);
  // lamp
  glow(col,lit?18:6);
  ctx.fillStyle=lit?"#aaffdd":"#5a5462";
  ctx.beginPath(); ctx.arc(cx,baseY-70,7,0,Math.PI*2); ctx.fill();
  noGlow();
  if(lit){
    // a soft column of light and a slow rising mote or two
    ctx.save();
    ctx.globalCompositeOperation="lighter";
    const lg=ctx.createLinearGradient(0,baseY-150,0,baseY);
    lg.addColorStop(0,"rgba(125,255,207,0)");
    lg.addColorStop(1,`rgba(125,255,207,${0.16+0.05*Math.sin(t*3)})`);
    ctx.fillStyle=lg;
    ctx.fillRect(cx-16,baseY-150,32,150);
    ctx.restore();
    if(Math.random()<0.25) particles.push({
      x:cx+rnd(-10,10), y:baseY-rnd(0,20),
      vx:rnd(-8,8), vy:-rnd(20,55),
      life:1, maxLife:rnd(0.6,1.2),
      color:"#7dffcf", size:rnd(1,3), type:"square", gravity:0
    });
  }
  ctx.textAlign="center";
  ctx.font="bold 9px 'Courier New',monospace";
  ctx.fillStyle=lit?"#7dffcf":"#6a6478";
  ctx.fillText(lit?"KAYDEDİLDİ":"KONTROL",cx,baseY-82);
  ctx.textAlign="left";
}

// ─── DRAW THE EVACUATION PORTAL ──────────────────────────────
// Takes SCREEN coordinates (gx = platform centre - camX, gy = platform top);
// the caller has already converted, so no camX in here.
// Resolves which rift art this biome uses: its own sheet if it names one and
// that sheet has arrived, otherwise the default vortex. Returns null when
// nothing has loaded, and the procedural arch keeps the screen honest.
function portalArtNow(){
  const TH=themeOf();
  if(TH.portalArt){
    const a=artFor(TH.portalArt);
    if(a&&a.loaded){
      const bb=a.bbox||{x:0,y:0,w:a.img.naturalWidth,h:a.img.naturalHeight};
      return {img:a.img, bb, spin:!!TH.portalSpin, theme:TH};
    }
    return null;   // a biome that names its own art does NOT fall back to the
                   // volcano vortex — a stone gate and a free vortex are not
                   // interchangeable, so show the arch until the sheet lands
  }
  if(!portalLoaded) return null;
  return {img:portalSprite, bb:portalBBox, spin:true, theme:TH};
}
function drawEvacPortal(gx,gy){
  if(!gateOpen||portalReveal<=0) return;
  const art=portalArtNow();
  if(!art) return;
  const rev=clamp(portalReveal,0,1);
  const bb=art.bb;
  const bloom=art.theme.portalBloom||["130,225,255","95,60,225"];
  // slow pulse on top of the materialise scale — the rift breathes
  const pulse=1+0.05*Math.sin(t*2.2);
  const h=PORTAL_H*pulse*(0.25+0.75*rev);
  const w=bb.w*(h/bb.h);
  const cy=gy+6-PORTAL_H/2;

  ctx.save();
  ctx.translate(gx,cy);
  // a free-floating vortex spins; a built gate stands still and only breathes
  if(art.spin) ctx.rotate(t*0.5);

  // additive neon bloom behind the rift
  ctx.save();
  ctx.globalCompositeOperation="lighter";
  const bg=ctx.createRadialGradient(0,0,h*0.10,0,0,h*0.80);
  bg.addColorStop(0,`rgba(${bloom[0]},${0.42*rev})`);
  bg.addColorStop(0.45,`rgba(${bloom[1]},${0.22*rev})`);
  bg.addColorStop(1,"rgba(0,0,0,0)");
  ctx.fillStyle=bg;
  ctx.beginPath(); ctx.arc(0,0,h*0.80,0,Math.PI*2); ctx.fill();
  // a blown-up ghost of the sprite so the bloom carries the rift's shape
  ctx.globalAlpha=0.30*rev;
  ctx.drawImage(art.img,bb.x,bb.y,bb.w,bb.h,-w*0.62,-h*0.62,w*1.24,h*1.24);
  ctx.restore();

  // the rift proper
  ctx.globalAlpha=rev;
  ctx.drawImage(art.img,bb.x,bb.y,bb.w,bb.h,-w/2,-h/2,w,h);
  ctx.restore();
}

// ─── DRAW LAVA ───────────────────────────────────────────────
function drawLava(){
  // strong upward-cast light bathing the walls/ceiling above the lava floor —
  // additive blending so it actually brightens the rock behind it (bloom)
  // rather than just laying flat translucent orange over it
  const TH=themeOf();
  ctx.globalCompositeOperation="lighter";
  ctx.shadowColor=TH.glow; ctx.shadowBlur=20;
  const upG=ctx.createLinearGradient(0,LAVA_Y-140,0,LAVA_Y);
  upG.addColorStop(0,`rgba(${TH.haze},0)`);
  upG.addColorStop(1,`rgba(${TH.haze},${0.22+0.06*Math.sin(t*2)})`);
  ctx.fillStyle=upG;
  ctx.fillRect(0,LAVA_Y-140,W,140);
  ctx.shadowBlur=0;
  ctx.globalCompositeOperation="source-over";

  // lava floor fill
  const lavaGrad = ctx.createLinearGradient(0,LAVA_Y,0,H);
  lavaGrad.addColorStop(0,TH.liquid[0]);
  lavaGrad.addColorStop(0.3,TH.liquid[1]);
  lavaGrad.addColorStop(1,TH.liquid[2]);
  ctx.fillStyle=lavaGrad;
  ctx.fillRect(0,LAVA_Y,W,H-LAVA_Y);

  // animated lava surface ripple
  glow(TH.glow,20);
  ctx.strokeStyle=TH.surface; ctx.lineWidth=2;
  ctx.beginPath();
  for(let i=0;i<=W;i+=12){
    const worldX = (camX+i)/20;
    const h2 = 5*Math.sin(t*2+worldX)+3*Math.sin(t*3.1+worldX*1.7);
    i===0 ? ctx.moveTo(i,LAVA_Y+h2) : ctx.lineTo(i,LAVA_Y+h2);
  }
  ctx.stroke(); noGlow();

  // rising ember/spark particles continuously drifting up off the whole lava
  // surface — denser during fever for extra atmosphere
  // volcano throws embers up; the swamp burps bubbles
  if(Math.random()<(feverMode?0.9:0.6)) spawnParticles(
    rnd(0,W), LAVA_Y+rnd(-2,4), 1, TH.spark,
    {minSpd:8,maxSpd:30,upBias:isForest()?40:70,minLife:0.6,maxLife:1.6,
     type:"circle",gravity:isForest()?-10:20,minSz:1,maxSz:isForest()?4:3}
  );

  // Lava pits (the gaps between platforms). The gap now simply shows the
  // molten floor dropping away below it, with a soft radial heat bloom
  // rising out of it. The old version stamped a translucent orange rectangle
  // from GROUND_Y-30 down — a hard-edged box floating ABOVE the walk line,
  // which read as a UI panel sitting on the level rather than as a hazard.
  for(const lp of lavaPits){
    const lpx = lp.x - camX;
    if(lpx+lp.w<0||lpx>W) continue;
    ctx.save();
    // molten fill falling away into the gap
    const pg=ctx.createLinearGradient(0,GROUND_Y,0,H);
    pg.addColorStop(0,TH.liquid[0]);
    pg.addColorStop(0.35,TH.liquid[1]);
    pg.addColorStop(1,TH.liquid[2]);
    ctx.fillStyle=pg;
    ctx.fillRect(lpx,GROUND_Y+2,lp.w,H-GROUND_Y);
    // rippling surface right at the lip, same wave maths as the main floor
    glow(TH.glow,14);
    ctx.strokeStyle=TH.surface; ctx.lineWidth=2;
    ctx.beginPath();
    for(let i=0;i<=lp.w;i+=8){
      const wx=(lp.x+i)/18;
      const hh=3*Math.sin(t*2.4+wx)+2*Math.sin(t*3.3+wx*1.6);
      i===0 ? ctx.moveTo(lpx+i,GROUND_Y+5+hh) : ctx.lineTo(lpx+i,GROUND_Y+5+hh);
    }
    ctx.stroke(); noGlow();
    if(TH.pitSpikes){
      // a cryo pit is not a pool you fall into, it is a mouth
      ctx.fillStyle="#cfeeff";
      for(let sx=lpx+8;sx<lpx+lp.w-4;sx+=17){
        ctx.beginPath();
        ctx.moveTo(sx-6,GROUND_Y+8); ctx.lineTo(sx+6,GROUND_Y+8);
        ctx.lineTo(sx,GROUND_Y-16-8*Math.abs(Math.sin(sx*0.7)));
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle="rgba(120,200,240,0.55)";
      for(let sx=lpx+14;sx<lpx+lp.w-4;sx+=23){
        ctx.beginPath();
        ctx.moveTo(sx-5,H); ctx.lineTo(sx+5,H); ctx.lineTo(sx,GROUND_Y+26);
        ctx.closePath(); ctx.fill();
      }
    }
    // heat bloom — radial, so it fades out in every direction and the pit
    // never picks up a straight edge of its own
    ctx.globalCompositeOperation="lighter";
    const cxp=lpx+lp.w/2, r=lp.w*0.95;
    const haze=ctx.createRadialGradient(cxp,GROUND_Y+6,4,cxp,GROUND_Y+6,r);
    haze.addColorStop(0,`rgba(${TH.haze},${0.30+0.06*Math.sin(t*2)})`);
    haze.addColorStop(0.5,`rgba(${TH.haze},0.10)`);
    haze.addColorStop(1,`rgba(${TH.haze},0)`);
    ctx.fillStyle=haze;
    ctx.fillRect(cxp-r,GROUND_Y+6-r,r*2,r*2);
    ctx.restore();
    // sparks lifting out of the gap
    // acid bubbles rise and hang; embers spit and fall
    if(Math.random()<0.3) spawnParticles(
      lpx+rnd(0,lp.w), GROUND_Y+2, 1, TH.spark,
      {minSpd:20,maxSpd:isForest()?50:80,upBias:isForest()?40:60,
       minLife:0.2,maxLife:isForest()?1.0:0.6,
       type:isForest()?"circle":"square",gravity:isForest()?-25:-50,
       minSz:1,maxSz:isForest()?4:3}
    );
  }
  // (the two procedural "lava falls" that used to hang at world x=0 and
  // x=1100 are gone: both were plain fillRect bars pinned to fixed world
  // coordinates, so they floated in mid-air with nothing behind them.)
}

// ─── DRAW CRYSTALS ───────────────────────────────────────────
function drawCrystals(){
  const colors=[["#a050ff","#d4aaff"],["#4488ff","#aaccff"],["#44ffaa","#aaffdd"]];
  crystals.forEach((cr,i)=>{
    const cx=cr.x-camX, cy=cr.y;
    const c=colors[i%colors.length];
    glow(c[0],16);
    ctx.fillStyle=c[0];
    ctx.beginPath();
    ctx.moveTo(cx,cy-28);ctx.lineTo(cx+10,cy);ctx.lineTo(cx+7,cy+16);
    ctx.lineTo(cx-7,cy+16);ctx.lineTo(cx-10,cy);ctx.closePath();ctx.fill();
    ctx.fillStyle=c[1];
    ctx.beginPath();
    ctx.moveTo(cx,cy-28);ctx.lineTo(cx+4,cy-10);ctx.lineTo(cx-4,cy-10);ctx.closePath();ctx.fill();
    noGlow();
  });
}

// ─── DRAW COINS ──────────────────────────────────────────────
function drawCoins(){
  for(const coin of coins){
    if(coin.collected) continue;
    const cx=coin.x-camX, cy=coin.popping?coin.y:coin.y+Math.sin(coin.bob)*4;
    if(coin.popping) ctx.globalAlpha=Math.max(0,1-coin.popT/0.35);
    glow("#ffdd00",14);
    // outer ring
    ctx.strokeStyle="#ffaa00"; ctx.lineWidth=3;
    ctx.beginPath(); ctx.arc(cx,cy,coin.r,0,Math.PI*2); ctx.stroke();
    // inner fill
    ctx.fillStyle="#ffdd00";
    ctx.beginPath(); ctx.arc(cx,cy,coin.r-2,0,Math.PI*2); ctx.fill();
    // shine
    ctx.fillStyle="rgba(255,255,200,0.7)";
    ctx.beginPath(); ctx.arc(cx-3,cy-3,3,0,Math.PI*2); ctx.fill();
    noGlow();
    ctx.globalAlpha=1;
  }
}
