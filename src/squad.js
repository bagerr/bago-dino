// The rescue train
// Part of NEON DINO-AGE: RESCUE PROTOCOL. Loaded as a classic
// script, in the order index2.html lists — these files share one
// global scope on purpose and are not modules.

// ─── RESCUE TRAIN ─────────────────────────────────────────────
// A freed hatchling no longer vanishes: it falls in behind the dino. Each
// link replays the player's OWN recorded path a fixed delay behind the link
// in front of it, so the line scampers and hovers exactly where you went
// (including up through a jetpack climb) instead of homing in a straight line.
//
// Everything here is world space — playerTrail stores world coordinates and
// camX is subtracted only inside drawFollowers().
const MAX_FOLLOWERS=3;      // at most three hatchlings in the chain
const FOLLOW_GAP=0.30;      // seconds of lag between consecutive links
const TRAIL_SECONDS=2.4;    // how much player history the trail keeps
const PANIC_SECONDS=5.0;    // window to grab a scared hatchling back
const REJOIN_GRACE=1.2;     // i-frames after joining, so one hit is not two
const CATCH_LOCK=0.4;       // it has to actually break away before you can grab it
let followers=[];
let playerTrail=[];         // {x,y,t,facing}, world space, oldest first
let scaredBabies=[];        // knocked off the train, running loose, losable
let babyShots=[];           // fireballs spat by a full escort
let rescuedThisLevel=0;
let lastLostName="";          // who did not make it, for the debrief
let lastEnrolled=[];          // who did, for the same card
let rescuedTotal=0;

// What the escort pays out. This is the whole point of the POW model: the
// hatchlings are not a score counter you fill in, they are equipment you can
// lose. Carrying more makes you stronger, so losing one is felt immediately.
//   1 → the beam ticks damage faster
//   2 → the jetpack refuels faster
//   3 → they start spitting fireballs at whatever is closest
//
// On top of that, the BROOD you have already delivered trains the ones you
// are carrying: each role's tier sharpens its own line. The reward for
// rescuing well is rescuing better, which keeps the progression inside the
// loop instead of beside it — and every brood bonus saturates, so a large
// brood cannot retire the escort mechanic.
function followerPower(){
  const n=followers.length;
  const gun=broodTier("gunner"), tech=broodTier("tech"), guard=broodTier("guard");
  // a guard brood lets the escort open fire one hatchling early
  const shootAt=guard>=1?2:3;
  return {
    beamMult: (n>=3 ? 0.62 : (n>=1 ? 0.78 : 1)) * (n>0 ? 1-0.05*gun : 1),
    fuelMult: (n>=2 ? 1.9 : 1) + (n>0 ? 0.2*tech : 0),
    shooting: n>=shootAt,
    tier: n,
    brood:{gunner:gun, tech:tech, guard:guard}
  };
}

function recordPlayerTrail(){
  playerTrail.push({x:player.x+PLAYER_W/2, y:player.y+PLAYER_H*0.55, t:t, facing:player.facing});
  while(playerTrail.length>2 && t-playerTrail[0].t>TRAIL_SECONDS) playerTrail.shift();
}
// the sample the player occupied `delay` seconds ago (newest-first scan)
function trailSampleAt(delay){
  const want=t-delay;
  for(let i=playerTrail.length-1;i>=0;i--){
    if(playerTrail[i].t<=want) return playerTrail[i];
  }
  return playerTrail[0]||null;
}
// called after a teleporting respawn — otherwise the chain would whip across
// the whole level chasing a trail that no longer connects to the player
function snapFollowersToPlayer(){
  playerTrail=[];
  recordPlayerTrail();
  for(const f of followers){
    f.x=player.x+PLAYER_W/2;
    f.y=player.y+PLAYER_H*0.55;
  }
}
// Anything that would hurt the player hurts the escort too. Enemy boxes are
// tested the same way the player's own collision tests them ({x,y,w,h} as
// drawn), so a hit that looks like a hit is one.
function followerHazardAt(f){
  const box={x:f.x-12,y:f.y-12,w:24,h:24};
  for(const e of enemies){
    if(e.dead||e.dying) continue;
    if(overlaps(box,{x:e.x,y:e.y,w:e.w,h:e.h})) return true;
  }
  for(const e of groundEnemies){
    if(e.dead||e.dying) continue;
    if(overlaps(box,{x:e.x,y:e.y,w:e.w,h:e.h})) return true;
  }
  if(boss&&!boss.dead&&boss.introState==="active" &&
     overlaps(box,{x:boss.x-boss.w/2,y:boss.y-boss.h/2,w:boss.w,h:boss.h})) return true;
  for(const lb of lavaBalls) if(Math.hypot(lb.x-f.x,lb.y-f.y)<22) return true;
  for(const m of magmaBursts) if(Math.hypot(m.x-f.x,m.y-f.y)<20) return true;
  for(const fb of bossFlameBursts){
    if(fb.life>0.4 && Math.abs(fb.x-f.x)<26 && f.y>fb.y) return true;
  }
  return false;
}
// knocked off the train: it bolts, and PANIC_SECONDS later it is gone
function panicFollower(idx){
  const f=followers[idx];
  followers.splice(idx,1);
  scaredBabies.push({
    species:f.species||"baby",
    rec:f.rec||null,
    x:f.x, y:f.y,
    vx:-player.facing*rnd(40,110)+rnd(-40,40), vy:-240,
    timer:PANIC_SECONDS, catchLock:CATCH_LOCK, bob:rnd(0,Math.PI*2), facing:f.facing
  });
  playBabyPanic();
  screenShake=Math.min(6,screenShake+3);
  hitStopTimer=Math.max(hitStopTimer,0.04);
  spawnFloatingText(f.x-camX,f.y-22,(f.rec?f.rec.name+" PANİKTE!":"YAVRU PANİKTE!"),"#ff5577",13);
  spawnParticles(f.x-camX,f.y,10,["#ffdd88","#ff5577","#ffffff"],
    {minSpd:60,maxSpd:180,minLife:0.2,maxLife:0.5,type:"circle",gravity:120});
  // null key = never deduped; this one has to be allowed to fire every time
  queueRadio(null,(f.rec?f.rec.name:"YAVRU DİNO"),
    ["Korktum, kaçıyorum!","Yakala beni!"],
    {color:"#ff5577",urgent:true,hold:2.2});
}
function recaptureBaby(b){
  if(followers.length>=MAX_FOLLOWERS){
    const oldest=followers.shift();
    babyDinos.push({x:oldest.x,y:oldest.y,vx:player.facing*110,life:1.6});
  }
  followers.push({x:b.x,y:b.y,bob:rnd(0,Math.PI*2),facing:player.facing,
                  grace:REJOIN_GRACE,species:b.species||"baby",rec:b.rec||null});
  playChime(chain);
  spawnFloatingText(b.x-camX,b.y-20,"YAKALANDI!","#8effc9",14);
  spawnParticles(b.x-camX,b.y,12,["#8effc9","#ffdd88","#ffffff"],
    {minSpd:50,maxSpd:170,minLife:0.2,maxLife:0.5,type:"circle",gravity:60});
}
// gone: the stage tally and the run tally both go down, which is what makes
// the debrief's "X / 3" an actual result instead of a receipt
function loseBaby(b,silent){
  rescuedThisLevel=Math.max(0,rescuedThisLevel-1);
  rescuedTotal=Math.max(0,rescuedTotal-1);
  // it never reaches base. The name is the whole point: a counter going down
  // is arithmetic, a name that does not arrive is a loss.
  if(b&&b.rec){ loseHatchling(b.rec); lastLostName=b.rec.name; }
  spawnParticles(b.x-camX,b.y,14,["#ff3355","#772233","#ffffff"],
    {minSpd:60,maxSpd:200,minLife:0.3,maxLife:0.7,type:"square",gravity:140});
  if(silent) return;
  playBabyLost();
  const who=(b&&b.rec)?b.rec.name:"BİR YAVRU";
  spawnFloatingText(b.x-camX,b.y-20,who+" KAYBEDİLDİ","#ff3355",15);
  queueRadio(null,"KOMUTA MERKEZİ",[who+" kayboldu.","Diğerlerini kaybetme!"],
    {color:"#ff3355",urgent:true,hold:2.6});
}
function updateScaredBabies(dt){
  for(let i=scaredBabies.length-1;i>=0;i--){
    const b=scaredBabies[i];
    b.timer-=dt;
    b.bob+=dt*14;
    b.vy+=900*dt;
    b.x+=b.vx*dt; b.y+=b.vy*dt;
    b.vx*=Math.pow(0.45,dt);
    b.facing=b.vx>=0?1:-1;
    // frightened hopping: it bounces along whatever it lands on instead of
    // standing still waiting to be collected
    for(const p of platforms){
      if(p.lavaPit) continue;
      if(b.x>p.x-6&&b.x<p.x+p.w+6&&b.y>=p.y-14&&b.y<=p.y+18&&b.vy>0){
        b.y=p.y-12; b.vy=-rnd(130,230); b.vx+=rnd(-50,50);
        break;
      }
    }
    // The train rides right on top of a standing player, so without this
    // lock the hatchling would be re-grabbed on the very frame it panics and
    // the whole mechanic would never fire. It has to break away first.
    if(b.catchLock>0) b.catchLock-=dt;
    else if(Math.hypot((player.x+PLAYER_W/2)-b.x,(player.y+PLAYER_H*0.55)-b.y)<38){
      recaptureBaby(b); scaredBabies.splice(i,1); continue;
    }
    if(b.y>LAVA_Y||b.timer<=0){ loseBaby(b,false); scaredBabies.splice(i,1); continue; }
  }
}
// the escort fights back once all three are aboard
function updateBabyShots(dt){
  for(let i=babyShots.length-1;i>=0;i--){
    const s=babyShots[i];
    s.x+=s.vx*dt; s.y+=s.vy*dt; s.life+=dt;
    if(s.life>1.8){ babyShots.splice(i,1); continue; }
    let hit=false;
    for(const e of [...enemies,...groundEnemies]){
      if(e.dead||e.dying) continue;
      if(overlaps({x:s.x-5,y:s.y-5,w:10,h:10},{x:e.x,y:e.y,w:e.w,h:e.h})){
        e.hp-=1; e.hitFlash=0.2;
        if(e.hp<=0&&!e.dying){ e.dying=true; e.deathTimer=0.07; }
        hit=true; break;
      }
    }
    if(hit){
      spawnParticles(s.x-camX,s.y,6,["#ffaa33","#ffdd88","#ffffff"],
        {minSpd:40,maxSpd:140,minLife:0.15,maxLife:0.35,type:"circle",gravity:80,minSz:1,maxSz:3});
      babyShots.splice(i,1);
    }
  }
}
function drawBabyShots(){
  for(const s of babyShots){
    const sx=s.x-camX;
    glow("#ff8800",12);
    ctx.fillStyle="#ffaa33";
    ctx.beginPath(); ctx.arc(sx,s.y,5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#fff3c4";
    ctx.beginPath(); ctx.arc(sx-1,s.y-1,2,0,Math.PI*2); ctx.fill();
    noGlow();
  }
}
function drawScaredBabies(){
  for(const b of scaredBabies){
    const bx=b.x-camX;
    if(bx<-40||bx>W+40) continue;
    // blinks faster and faster as the window runs out
    const urgency=1-clamp(b.timer/PANIC_SECONDS,0,1);
    if(Math.sin(t*(10+urgency*26))<-0.35) continue;
    glow("#ff5577",12);
    drawBaby(bx,b.y,26,b.facing,b.species);
    noGlow();
    // alarm bubble + a ring that drains with the timer
    ctx.textAlign="center";
    ctx.font="bold 14px 'Courier New',monospace";
    ctx.fillStyle="#ff5577";
    ctx.fillText("!",bx,b.y-22);
    ctx.textAlign="left";
    ctx.strokeStyle="rgba(255,85,119,0.85)"; ctx.lineWidth=2;
    ctx.beginPath();
    ctx.arc(bx,b.y,17,-Math.PI/2,-Math.PI/2+Math.PI*2*clamp(b.timer/PANIC_SECONDS,0,1));
    ctx.stroke();
  }
}

function updateFollowers(dt){
  recordPlayerTrail();
  // hazards first, and collected before the walk loop so splicing the array
  // mid-iteration can't skip a link
  const hit=[];
  for(let i=0;i<followers.length;i++){
    const f=followers[i];
    if(f.grace>0){ f.grace-=dt; continue; }
    if(followerHazardAt(f)) hit.push(i);
  }
  for(let k=hit.length-1;k>=0;k--) panicFollower(hit[k]);

  const pw=followerPower();
  for(let i=0;i<followers.length;i++){
    const f=followers[i];
    const s=trailSampleAt(FOLLOW_GAP*(i+1)+0.12);
    if(!s) continue;
    // ease toward the recorded point instead of snapping onto it, so the line
    // stays springy through turns and dashes
    const k=Math.min(1,dt*11);
    f.x+=(s.x-f.x)*k;
    f.y+=(s.y-f.y)*k;
    f.facing=s.facing;
    f.bob+=dt*(9+i*1.4);
    if(f.joy>0) f.joy=Math.max(0,f.joy-dt*0.6);

    // a full escort spits fireballs at whatever is closest
    if(pw.shooting){
      f.shootCd=(f.shootCd===undefined?rnd(0.5,1.5):f.shootCd)-dt;
      if(f.shootCd<=0){
        f.shootCd=rnd(1.1,1.9);
        let best=null,bestD=340;
        for(const e of [...enemies,...groundEnemies]){
          if(e.dead||e.dying) continue;
          const d=Math.hypot((e.x+e.w/2)-f.x,(e.y+e.h/2)-f.y);
          if(d<bestD){ bestD=d; best=e; }
        }
        if(best){
          const dx=(best.x+best.w/2)-f.x, dy=(best.y+best.h/2)-f.y;
          const dd=Math.hypot(dx,dy)||1;
          babyShots.push({x:f.x,y:f.y,vx:(dx/dd)*420,vy:(dy/dd)*420,life:0});
          playPew();
        }
      }
    }

    // faint rising sparks so three of them read as a chain, not a blob.
    // spawnParticles takes SCREEN space, hence the camX here.
    if(Math.random()<dt*6) spawnParticles(f.x-camX,f.y+8,1,["#ffdd88","#fff3c4"],
      {minSpd:8,maxSpd:30,minLife:0.2,maxLife:0.45,type:"circle",gravity:-20,minSz:1,maxSz:2});
  }
}
function drawFollowers(){
  for(let i=0;i<followers.length;i++){
    const f=followers[i];
    const fx=f.x-camX;
    if(fx<-40||fx>W+40) continue;
    // a freshly freed hostage bounces for a moment before settling in line
    const joy=f.joy>0?Math.abs(Math.sin(f.bob*1.6))*10*f.joy:0;
    const bob=Math.sin(f.bob)*4+joy;
    glow(f.species==="trike"?"#7dffcf":"#ffcc55",10);
    ctx.globalAlpha=0.32;
    ctx.fillStyle="#ffcc55";
    ctx.beginPath(); ctx.ellipse(fx,f.y+15,10,3,0,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha=1; noGlow();
    drawBaby(fx,f.y-bob,28,f.facing,f.species);
    // the name, small and in its role's colour. This is the whole change:
    // you cannot lose a number by accident, but you can lose ÇAKIL.
    if(f.rec){
      ctx.save();
      ctx.textAlign="center";
      ctx.font="bold 9px 'Courier New',monospace";
      ctx.globalAlpha=0.85;
      ctx.fillStyle=roleColor(f.rec.role);
      ctx.fillText(f.rec.name,fx,f.y-bob-26);
      ctx.restore();
      ctx.textAlign="left";
    }
  }
}

function breakCage(cage){
  cage.alive=false;
  playPowerUp();
  spawnParticles(cage.x-camX,cage.y,16,["#aaaaaa","#dddddd","#888888"],
    {minSpd:60,maxSpd:200,minLife:0.3,maxLife:0.6,type:"square",gravity:220});
  spawnFloatingText(cage.x-camX,cage.y-20,"KURTARILDI!","#ffdd44",14);
  rescuedThisLevel++; rescuedTotal++;
  // the hatchling joins the tail of the train; if the train is already full
  // the one at the front breaks away and runs for the portal on its own
  if(followers.length>=MAX_FOLLOWERS){
    const oldest=followers.shift();
    babyDinos.push({x:oldest.x,y:oldest.y,vx:player.facing*110,life:1.6});
  }
  // a thawed hostage runs as an ordinary hatchling — the frozen sheet is the
  // block it was trapped in, not a shape it keeps
  const carried=(cage.species==="frozen")?"baby":(cage.species||"baby");
  const rec=makeHatchling(carried);
  followers.push({x:cage.x,y:cage.y,bob:rnd(0,Math.PI*2),facing:player.facing,
                  grace:REJOIN_GRACE,species:carried,joy:0.9,rec:rec});
  const total=LEVELS[levelIndex].cages.length;
  if(rescuedThisLevel>=total){
    queueRadio("allsafe","KOMUTA MERKEZİ",
      ["Tüm soy kurtarıldı!","Tahliye portalına ilerle!"],{color:"#44ffcc",hold:3.2});
  } else {
    queueRadio("rescue"+rescuedThisLevel,rec.name,
      ["Kurtardın! Peşinden geliyorum!","Kalan kafes: "+(total-rescuedThisLevel)],
      {color:roleColor(rec.role),hold:2.2});
  }
  // leaves behind a scattering of gold + a couple of fuel canisters
  for(let i=0;i<5;i++) spawnDrop(cage.x+rnd(-20,20),cage.y-10,"coin");
  spawnDrop(cage.x-14,cage.y-16,"fuel");
  spawnDrop(cage.x+14,cage.y-16,"fuel");
}
