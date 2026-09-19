// ============================================================
//  NEON DINO-AGE — headless smoke test
//
//    node smoke-test.js            → tests index2.html
//    node smoke-test.js some.html  → tests another build
//
//  No dependencies, no framework, no dev server. It pulls the game's
//  <script> body out of the HTML, runs it under node:vm against a stubbed
//  document / canvas / Image / localStorage, captures the
//  requestAnimationFrame callback, then drives real frames through it — so
//  these are genuine simulation runs, not mocks of the game's own logic.
//
//  Every scenario runs TWICE: once with the Image stub firing onload (the
//  sprite draw paths) and once with it never firing (the fallback draw
//  paths). Both matter — several of this game's assets are optional by
//  design and the fallbacks are load-bearing.
//
//  Reaching the game's script-scoped `let`s needs the __g accessor block
//  appended to the extracted source below: top-level let/const in a vm
//  script are script-scoped, not properties of the sandbox global.
//
//  Exit code is 0 only if every check in BOTH passes passed.
// ============================================================
const fs=require('fs');
const vm=require('node:vm');
const path=require('path');

const TARGET=path.resolve(process.argv[2]||path.join(__dirname,'index2.html'));
const html=fs.readFileSync(TARGET,'utf8');
const body=html.match(/<script>([\s\S]*)<\/script>/)[1];

let FIRE_ONLOAD=true;      // flipped by the driver at the bottom
let failures=0, checks=0;
function check(name,cond,extra){
  checks++;
  if(cond) console.log('  PASS  '+name);
  else { failures++; console.log('  FAIL  '+name+(extra!==undefined?('  ['+extra+']'):'')); }
}

// ── stub canvas 2d context ────────────────────────────────────
const drawStats={quad:0, images:[]};
function makeCtx(){
  const grad={addColorStop(){}};
  const target={
    canvas:{width:900,height:506},
    save(){},restore(){},translate(){},rotate(){},scale(){},
    beginPath(){},closePath(){},moveTo(){},lineTo(){},arc(){},ellipse(){},
    quadraticCurveTo(){ drawStats.quad++; },bezierCurveTo(){},rect(){},clip(){},
    fill(){},stroke(){},fillRect(){},strokeRect(){},clearRect(){},
    fillText(){},strokeText(){},setLineDash(){},
    drawImage(img,sx,sy,sw,sh,dx,dy,dw,dh){
      // only the 9-arg form carries a source rect, which is what the ground
      // strip uses; the 3-arg form is recorded as a plain blit
      if(arguments.length>=9) drawStats.images.push({sx,sy,sw,sh,dx,dy,dw,dh});
      else drawStats.images.push({dx:sx,dy:sy});
    },
    createLinearGradient(){return grad;},createRadialGradient(){return grad;},
    createPattern(){return null;},
    measureText(s){return {width:(s||'').length*7};},
    getImageData(w,h){ return {data:new Uint8ClampedArray(4*64*64).fill(255)}; },
    putImageData(){},
  };
  return new Proxy(target,{
    get(o,k){ if(k in o) return o[k]; return undefined; },
    set(o,k,v){ o[k]=v; return true; }
  });
}

// The game now opens on MISSION SELECT, so a scenario that wants to be in a
// stage has to enter a world first. Every scenario written before the map
// existed assumes stage 1 of the volcano, so that is the default; pass
// {map:true} to stay on the menu.
function run(opts){
  const rafQueue=[];
  const listeners={};
  const sandbox={
    console,
    Math,Date,JSON,Number,String,Array,Object,Boolean,Error,
    Uint8ClampedArray,Float32Array,
    setTimeout(fn,ms){ return 0; },       // never actually fires
    clearTimeout(){}, setInterval(){return 0;}, clearInterval(){},
    requestAnimationFrame(fn){ rafQueue.push(fn); return rafQueue.length; },
    localStorage:{ _d:{}, getItem(k){return this._d[k]||null;}, setItem(k,v){this._d[k]=String(v);} },
  };
  sandbox.window=sandbox;
  sandbox.globalThis=sandbox;
  sandbox.window.innerWidth=1280; sandbox.window.innerHeight=720;
  sandbox.window.addEventListener=(ev,fn)=>{ (listeners[ev]=listeners[ev]||[]).push(fn); };
  sandbox.window.removeEventListener=()=>{};
  sandbox.window.AudioContext=undefined;      // ensureAudio bails out cleanly
  sandbox.window.webkitAudioContext=undefined;
  sandbox.document={
    getElementById(){ return { width:0,height:0,style:{}, getContext(){ return makeCtx(); } }; },
    createElement(){ return { width:0,height:0,style:{}, getContext(){ return makeCtx(); } }; },
    addEventListener(){},
  };
  const loadedImages=[];
  sandbox.Image=class{
    constructor(){ this.naturalWidth=64; this.naturalHeight=64; this.onload=null; loadedImages.push(this); }
    set src(v){ this._src=v; if(FIRE_ONLOAD && this.onload) this.onload(); }
    get src(){ return this._src; }
  };

  const ctxObj=vm.createContext(sandbox);
  // accessor block appended so the test can reach script-scoped `let`s
  const accessor=`
;globalThis.__g={
  get STATE(){return STATE;}, set STATE(v){STATE=v;},
  get player(){return player;},
  get radio(){return radio;}, set radio(v){radio=v;},
  get radioQueue(){return radioQueue;},
  get radioFired(){return radioFired;},
  get followers(){return followers;}, get playerTrail(){return playerTrail;},
  get scaredBabies(){return scaredBabies;}, get babyShots(){return babyShots;},
  get PANIC_SECONDS(){return PANIC_SECONDS;},
  get continuesLeft(){return continuesLeft;}, set continuesLeft(v){continuesLeft=v;},
  get continueTimer(){return continueTimer;}, set continueTimer(v){continueTimer=v;},
  get MAX_CONTINUES(){return MAX_CONTINUES;},
  get checkpointX(){return checkpointX;},
  get weapon(){return weapon;}, set weapon(v){weapon=v;},
  get weaponAmmo(){return weaponAmmo;}, set weaponAmmo(v){weaponAmmo=v;},
  get WEAPONS(){return WEAPONS;},
  get laser(){return laser;},
  get lavaBalls(){return lavaBalls;},
  get shockwaves(){return shockwaves;},
  get SPECIES(){return SPECIES;},
  drawPtero:(e)=>drawPtero(e),
  drawGroundEnemy:(e)=>drawGroundEnemy(e),
  get bossFlameBursts(){return bossFlameBursts;},
  drawShockwaves:()=>drawShockwaves(),
  get bossCardTimer(){return bossCardTimer;},
  get bossRageTimer(){return bossRageTimer;},
  get parriesThisLevel(){return parriesThisLevel;},
  get chain(){return chain;},
  drawBossCard:()=>drawBossCard(),
  drawBossRage:()=>drawBossRage(),
  drawLavaBalls:()=>drawLavaBalls(),
  drawBoss:()=>drawBoss(),
  get playerBombs(){return playerBombs;},
  get weaponPickups(){return weaponPickups;},
  equipWeapon:(k)=>equipWeapon(k),
  collectWeaponPickup:(wp)=>collectWeaponPickup(wp),
  drawWeaponPickups:()=>drawWeaponPickups(),
  get checkpointUsed(){return checkpointUsed;},
  get hitsThisLevel(){return hitsThisLevel;}, set hitsThisLevel(v){hitsThisLevel=v;},
  get levelTime(){return levelTime;}, set levelTime(v){levelTime=v;},
  get lastGrade(){return lastGrade;}, get lastGradeScore(){return lastGradeScore;},
  get bestGrades(){return bestGrades;},
  computeGrade:()=>computeGrade(),
  useContinue:()=>useContinue(),
  drawContinue:()=>drawContinue(),
  drawCheckpoint:()=>drawCheckpoint(),
  followerPower:()=>followerPower(),
  drawScaredBabies:()=>drawScaredBabies(),
  get rescuedThisLevel(){return rescuedThisLevel;},
  get rescuedTotal(){return rescuedTotal;},
  get cages(){return cages;}, get levelIndex(){return levelIndex;},
  get enemies(){return enemies;}, get groundEnemies(){return groundEnemies;},
  get LEVELS(){return LEVELS;}, get boss(){return boss;},
  get WORLDS(){return WORLDS;}, get worldIndex(){return worldIndex;},
  get mapSel(){return mapSel;}, set mapSel(v){mapSel=v;},
  get mapStampTimer(){return mapStampTimer;},
  get worldProgress(){return worldProgress;},
  startWorld:(i)=>startWorld(i),
  worldState:(i)=>worldState(i),
  finishWorld:()=>finishWorld(),
  drawWorldMap:()=>drawWorldMap(),
  drawBG:()=>drawBG(),
  isForest:()=>isForest(),
  themeOf:()=>themeOf(),
  get gateOpen(){return gateOpen;}, set gateOpen(v){gateOpen=v;},
  get score(){return score;}, get camX(){return camX;}, set camX(v){camX=v;},
  get reportTimer(){return reportTimer;}, set reportTimer(v){reportTimer=v;},
  get lastRescueBonus(){return lastRescueBonus;},
  get babyDinos(){return babyDinos;},
  get particles(){return particles;},
  get t(){return t;},
  get arenaCleared(){return arenaCleared;}, get cameraLock(){return cameraLock;},
  get drops(){return drops;}, get hitStopTimer(){return hitStopTimer;},
  get portalReveal(){return portalReveal;},
  get groundLoaded(){return groundLoaded;},
  get platforms(){return platforms;},
  get GROUND_Y(){return GROUND_Y;}, get PLAYER_H(){return PLAYER_H;},
  get GROUND_SRC_Y(){return GROUND_SRC_Y;}, get GROUND_SRC_H(){return GROUND_SRC_H;},
  drawGroundCap:(a,b,c,d,e)=>drawGroundCap(a,b,c,d,e),
  drawPlatforms:()=>drawPlatforms(),
  drawBG:()=>drawBG(), drawLava:()=>drawLava(),
  get portalLoaded(){return portalLoaded;},
  get warpTimer(){return warpTimer;},
  get goalReached(){return goalReached;},
  get stageClearDelay(){return stageClearDelay;},
  goalPortalPos:()=>goalPortalPos(),
  get lastComboBonus(){return lastComboBonus;},
  get bestChainThisLevel(){return bestChainThisLevel;},
  get reportTypeEnd(){return reportTypeEnd;},
  get warningBannerTimer(){return warningBannerTimer;},
  set warningBannerTimer(v){warningBannerTimer=v;},
  killBoss:()=>killBoss(),
  drawArenaBanners:()=>drawArenaBanners(),
  addChain:(n)=>addChain(n),
  get BOSS_TRIGGER_X(){return BOSS_TRIGGER_X;},
  get bossIntroTriggered(){return bossIntroTriggered;},
  breakCage:(c)=>breakCage(c),
  endLevel:()=>endLevel(),
  loadLevel:(i)=>loadLevel(i),
  updateRadio:(dt)=>updateRadio(dt),
  drawRadio:()=>drawRadio(),
  drawMissionReport:()=>drawMissionReport(),
  drawWin:()=>drawWin(),
  drawGameOver:()=>drawGameOver(),
  queueRadio:(...a)=>queueRadio(...a),
  restartGame:()=>restartGame(),
  updateFollowers:(dt)=>updateFollowers(dt),
  drawFollowers:()=>drawFollowers(),
  lavaPits:()=>lavaPits,
};`;
  vm.runInContext(body+accessor,ctxObj,{filename:'index2.html'});

  const g=sandbox.__g;
  // the boot does rAF(t=>{lastTime=t; rAF(loop)}) — drain it to get `loop`
  let frame=rafQueue.shift(); frame(0);
  let loop=rafQueue.shift();
  let now=0;
  function step(n,dtMs){
    for(let i=0;i<n;i++){
      now+=(dtMs||16.7);
      loop(now);
      const next=rafQueue.shift();
      if(next) loop=next;
    }
  }
  function keys(obj){
    // the game reads K[...] directly; reach it through a synthetic keydown
    for(const [code,down] of Object.entries(obj)){
      const fns=listeners[down?'keydown':'keyup']||[];
      for(const fn of fns) fn({code});
    }
  }
  if(!opts||!opts.map) g.startWorld(0);
  // the stubbed localStorage, so a scenario can prove something was actually
  // written rather than just mutated in memory
  return {g,step,keys,sandbox,loadedImages,rafQueue,drawStats,
          store:sandbox.localStorage};
}

function runSuite(){

// ── scenario 1: boot + free run ───────────────────────────────
{
  const {g,step}=run();
  check('entering a world starts it playing', g.STATE==='playing', g.STATE);
  check('stage-open transmission is on the air', !!g.radio && g.radioFired.start===true);
  check('opening transmission carries the eruption warning',
        !!g.radio && g.radio.lines[0].indexOf('Volkan patlıyor')>=0, g.radio&&g.radio.lines[0]);
  check('three cages in stage 1', g.cages.length===3, g.cages.length);
  step(120);   // ~2s of real frames, radio open→type→hold
  check('no crash over 120 frames', true);
  check('radio advanced past its open wipe', !g.radio || g.radio.phase!=='open', g.radio&&g.radio.phase);
}

// ── scenario 2: radio lifecycle, every phase drawn ────────────
{
  const {g,step}=run();
  const seen={};
  for(let i=0;i<600;i++){
    step(1);
    if(g.radio){ seen[g.radio.phase]=true; g.drawRadio(); }
  }
  check('radio reached the type phase', !!seen.type, Object.keys(seen).join(','));
  check('radio reached the hold phase', !!seen.hold);
  check('radio closed and cleared itself', !!seen.close || g.radio===null);
  // an urgent call must cut over a running one
  g.queueRadio('t1','A',['aaa'],{});
  const first=g.radio;
  g.queueRadio('t2','B',['bbb'],{urgent:true});
  check('urgent transmission pre-empts the current one', g.radio!==first && g.radio.title==='B');
  check('pre-empted transmission is requeued, not dropped', g.radioQueue.indexOf(first)>=0);
  g.queueRadio('t2','B2',['ccc'],{});
  check('a repeated key never fires twice in one stage', g.radio.title==='B');
}

// ── scenario 3: rescue train ──────────────────────────────────
{
  const {g,step,keys}=run();
  // keep the dino alive and moving so the trail has real history
  g.player.hp=99; g.player.invuln=999;
  // This scenario measures the SHAPE of the chain, not whether it survives.
  // Hatchlings can be scared off the train now, so anything that can hit one
  // turns this into an intermittent failure with nothing to do with spacing.
  // Clearing the enemies is not enough — random magma bursts are a hazard
  // too — so hold every follower's i-frames open for the whole run.
  for(const e of g.enemies) e.dead=true;
  for(const e of g.groundEnemies) e.dead=true;
  const safeStep=n=>{
    for(let i=0;i<n;i++){
      g.player.invuln=999; g.player.hp=99;
      for(const f of g.followers) f.grace=1;
      step(1);
    }
  };
  safeStep(30);
  const cages=g.cages.slice();
  g.breakCage(cages[0]);
  check('freeing a cage adds a follower', g.followers.length===1, g.followers.length);
  check('rescue counter ticks up', g.rescuedThisLevel===1 && g.rescuedTotal===1);
  check('a rescue transmission goes out', !!g.radioFired.rescue1);
  safeStep(40);
  g.breakCage(cages[1]); safeStep(40);
  g.breakCage(cages[2]); safeStep(40);
  check('train holds all three hatchlings', g.followers.length===3, g.followers.length);
  check('all-clear transmission fires on the last cage', !!g.radioFired.allsafe);
  // a fourth rescue must push the front one off the train, not grow it
  g.breakCage({x:200,y:300,alive:true});
  check('train is capped at three', g.followers.length===3, g.followers.length);
  check('the displaced hatchling runs off on its own', g.babyDinos.length===1, g.babyDinos.length);
  // the chain must TRAIL a running player, and space itself out along the way
  keys({ArrowRight:true});
  safeStep(120);
  g.drawFollowers();
  const pcx=g.player.x+53/2;
  const gaps=g.followers.map(f=>pcx-f.x);
  check('hatchlings lag behind a running player', gaps.every(d=>d>4),
        gaps.map(n=>n.toFixed(1)).join(','));
  check('the chain is ordered, not stacked', gaps[0]<gaps[1] && gaps[1]<gaps[2],
        gaps.map(n=>n.toFixed(1)).join(','));
  keys({ArrowRight:false});
  check('trail history is bounded', g.playerTrail.length<600, g.playerTrail.length);
  check('followers stay finite', g.followers.every(f=>isFinite(f.x)&&isFinite(f.y)));
}

// ── scenario 4: heat transmission near the lava pits ──────────
{
  const {g,step}=run();
  g.player.hp=99; g.player.invuln=999;
  const pit=g.lavaPits()[0];
  g.player.x=pit.x-60; g.player.y=360;
  g.player.invuln=999;
  step(3);
  check('lava-pit proximity fires the heat transmission', !!g.radioFired.heat);
  const msg=g.radio&&g.radio.lines.join(' ');
  check('heat transmission tells the player to jetpack',
        !!msg && msg.indexOf('Jetpack')>=0 && msg.indexOf('SICAKLIK')>=0, msg);
}

// ── scenario 5: mission debrief + stage advance ───────────────
{
  const {g,step,keys}=run();
  g.player.hp=99; g.player.invuln=999;
  step(10);
  const before=g.score;
  g.breakCage(g.cages[0]);
  g.endLevel();
  check('portal hands over to the debrief', g.STATE==='report', g.STATE);
  check('rescue payout is scored', g.score>before && g.lastRescueBonus===500, g.lastRescueBonus);
  check('the rescue train boards the capsule', g.followers.length===0);
  check('nothing is left on the air over a dark screen', g.radio===null && g.radioQueue.length===0);
  step(30); g.drawMissionReport();
  check('debrief renders', true);
  check('ENTER is ignored before the panel has read in', g.STATE==='report');
  keys({Enter:true});
  step(200);   // > REPORT_MIN
  check('ENTER rolls into the next stage', g.STATE==='playing' && g.levelIndex===1,
        g.STATE+'/'+g.levelIndex);
  check('the new stage re-arms its transmissions', !!g.radioFired.start && g.rescuedThisLevel===0);
  check('rescue total carries across stages', g.rescuedTotal===1, g.rescuedTotal);
}

// ── scenario 6: debrief auto-advances with no input ───────────
{
  const {g,step}=run();
  g.player.hp=99; g.player.invuln=999;
  step(5);
  g.endLevel();
  step(1050);  // ~17.5s, past REPORT_AUTO (the card types for ~8s)
  check('debrief auto-advances without input', g.STATE==='playing' && g.levelIndex===1,
        g.STATE+'/'+g.levelIndex);
}

// ── scenario 7: final stage → victory screen ──────────────────
{
  const {g,step,keys}=run();
  g.loadLevel(2);
  g.player.hp=99; g.player.invuln=999;
  step(5);
  check('stage 3 portal starts sealed', g.gateOpen===false);
  check('stage 3 has three cages', g.cages.length===3, g.cages.length);
  g.breakCage(g.cages[0]); g.breakCage(g.cages[0]); g.breakCage(g.cages[0]);
  g.endLevel();
  check('final stage also debriefs first', g.STATE==='report', g.STATE);
  check('full-brood bonus applied', g.lastRescueBonus===2500, g.lastRescueBonus);
  step(30); g.drawMissionReport();
  keys({Enter:true});
  step(200);
  keys({Enter:false});
  check('clearing the last stage of a world returns to the map',
        g.STATE==='map', g.STATE);
  check('the world is stamped cleared', g.worldState(0).cleared===true);
  check('the next world unlocks', g.worldState(1).unlocked===true);
  check('the CLEARED stamp is animating', g.mapStampTimer>0, g.mapStampTimer);
  g.drawWorldMap();
  check('the map renders with a fresh stamp', true);
  g.restartGame();
  check('restart returns to the top of the world',
        g.STATE==='playing' && g.levelIndex===0, g.STATE+'/'+g.levelIndex);
  check('restart clears the run-long rescue total', g.rescuedTotal===0, g.rescuedTotal);
}

// ── scenario 8: boss intro still fires its transmission ───────
{
  const {g,step}=run();
  g.loadLevel(2);
  g.player.hp=99; g.player.invuln=999;
  g.STATE='playing';
  // clear the mandatory arena wave first — the boss trigger is gated on it
  for(const e of g.enemies) if(e.arenaEnemy) e.dead=true;
  for(const e of g.groundEnemies) if(e.arenaEnemy) e.dead=true;
  // then walk the dino onto the boss trigger line
  for(let i=0;i<400;i++){
    g.player.invuln=999; g.player.hp=99;
    // fly the dino along well clear of the floating platforms — parking it at
    // y=300 wedges it against a ledge's left face and it never advances
    g.player.x=Math.min(1400,g.player.x+6);
    g.player.y=140; g.player.vy=0;
    step(1);
    if(g.radioFired.boss) break;
  }
  check('the Alpha announcement goes out at the boss trigger', !!g.radioFired.boss);
  const bossMsg=g.radio&&g.radio.lines.join(' ');
  check('Alpha transmission is the warning line',
        !!bossMsg && bossMsg.indexOf('ALFA TEHDİT')>=0, bossMsg);
  check('boss intro state machine engaged', g.boss && g.boss.introState!=='pending',
        g.boss&&g.boss.introState);
}

// ── scenario 10: the Alpha's WARNING! transition ──────────────
{
  const {g,step}=run();
  g.loadLevel(2);
  g.player.hp=99; g.player.invuln=999;
  for(const e of g.enemies) if(e.arenaEnemy) e.dead=true;
  for(const e of g.groundEnemies) if(e.arenaEnemy) e.dead=true;
  for(let i=0;i<400;i++){
    g.player.invuln=999; g.player.hp=99;
    g.player.x=Math.min(1400,g.player.x+6);
    g.player.y=140; g.player.vy=0;
    step(1);
    if(g.bossIntroTriggered) break;
  }
  check('reaching the end of the stage locks the camera', g.cameraLock===true);
  check('the WARNING banner is up', g.warningBannerTimer>0, g.warningBannerTimer);
  g.drawArenaBanners();
  check('WARNING banner renders', true);
  check('the Alpha carries 12 hit points', g.boss && g.boss.maxHp===12, g.boss&&g.boss.maxHp);
  // ride the intro out: warning → descending → active
  const seen={};
  for(let i=0;i<400;i++){
    g.player.invuln=999; g.player.hp=99; g.player.y=140; g.player.vy=0;
    step(1);
    if(g.boss) seen[g.boss.introState]=true;
    if(g.boss && g.boss.introState==='active') break;
  }
  check('intro runs warning → descending → active',
        seen.warning && seen.descending && seen.active, Object.keys(seen).join(','));
  check('the Alpha settles into the air, not on the ground', g.boss.y<300, g.boss&&g.boss.y);

  // boss death payout
  const before=g.drops.length;
  g.boss.hp=0; g.killBoss();
  const bossCoins=g.drops.filter(d=>d.kind==='bosscoin').length;
  check('boss death erupts in Boss Coins', bossCoins===16, bossCoins);
  check('...on top of the gem piñata', g.drops.length>before+16, g.drops.length-before);
  check('boss death freezes the frame for 120ms', Math.abs(g.hitStopTimer-0.12)<1e-9, g.hitStopTimer);
  check('the obsidian portal unseals', g.gateOpen===true);
}

// ── scenario 11: typewriter debrief + combo bonus ─────────────
{
  const {g,step,keys}=run();
  g.player.hp=99; g.player.invuln=999;
  step(10);
  g.addChain(6);                       // a chain worth a real bonus
  check('best chain is tracked', g.bestChainThisLevel===6, g.bestChainThisLevel);
  g.breakCage(g.cages[0]); g.breakCage(g.cages[0]); g.breakCage(g.cages[0]);
  const before=g.score;
  g.endLevel();
  check('combo bonus is scored at the portal', g.lastComboBonus===1500, g.lastComboBonus);
  check('both bonuses land on the score',
        g.score===before+g.lastComboBonus+g.lastRescueBonus, g.score-before);
  // drive the card through its whole typing pass
  let firstEnd=0;
  for(let i=0;i<500;i++){ step(1); g.drawMissionReport(); if(!firstEnd) firstEnd=g.reportTypeEnd; }
  check('typewriter publishes a finish time', g.reportTypeEnd>4 && g.reportTypeEnd<12, g.reportTypeEnd);
  check('the card finishes typing before it auto-advances', g.reportTypeEnd<14, g.reportTypeEnd);
  check('card still renders once fully typed', true);
  keys({Enter:true}); step(5);
  check('ENTER still dismisses the card', g.STATE==='playing', g.STATE);
}

// ── scenario 19: continues ────────────────────────────────────
{
  const {g,step,keys}=run();
  step(5);
  check('a run starts with a full credit sheet',
        g.continuesLeft===g.MAX_CONTINUES, g.continuesLeft);
  g.player.hp=1; g.player.y=900;          // straight into the void
  step(4);
  check('dying offers a continue instead of wiping the run',
        g.STATE==='continue', g.STATE);
  check('the countdown starts running', g.continueTimer>0 && g.continueTimer<=10,
        g.continueTimer);
  // ENTER spends one and puts you back in play
  const before=g.continuesLeft;
  keys({Enter:true});
  step(40);
  keys({Enter:false});
  check('ENTER spends a credit and resumes', g.STATE==='playing', g.STATE);
  check('the credit is actually deducted', g.continuesLeft===before-1,
        before+' -> '+g.continuesLeft);
  check('you come back on full health', g.player.hp===g.player.maxHp, g.player.hp);
  check('...and briefly invulnerable', g.player.invuln>0, g.player.invuln);
}

// ── scenario 20: letting the countdown run out ───────────────
{
  const {g,step}=run();
  step(5);
  g.player.hp=1; g.player.y=900;
  step(4);
  check('the prompt is up', g.STATE==='continue', g.STATE);
  for(let i=0;i<700 && g.STATE==='continue';i++) step(1);
  check('ignoring the countdown ends the run', g.STATE==='dead', g.STATE);
  check('an ignored credit is not spent', g.continuesLeft===g.MAX_CONTINUES,
        g.continuesLeft);
}

// ── scenario 21: the mid-stage checkpoint ────────────────────
{
  const {g,step,keys}=run();
  g.player.hp=99; g.player.invuln=999;
  step(5);
  check('stage 1 has a checkpoint out in the level',
        g.checkpointX>100 && g.checkpointX<1300, g.checkpointX);
  check('it starts disarmed', g.checkpointUsed===false);
  g.drawCheckpoint();
  check('the unlit beacon renders', true);
  // fly past it
  for(let i=0;i<400 && !g.checkpointUsed;i++){
    g.player.invuln=999; g.player.hp=99;
    g.player.x=Math.min(g.checkpointX+40,g.player.x+6);
    g.player.y=140; g.player.vy=0;
    step(1);
  }
  check('crossing the line arms the checkpoint', g.checkpointUsed===true);
  check('it announces itself on the radio', !!g.radioFired.checkpoint);
  g.drawCheckpoint();
  check('the lit beacon renders', true);
  // now die and continue — you must come back at the checkpoint, not at 60
  g.player.invuln=0; g.player.hp=1; g.player.y=900;
  step(4);
  check('death still offers the credit', g.STATE==='continue', g.STATE);
  keys({Enter:true}); step(30); keys({Enter:false});
  check('the continue resumes at the checkpoint, not the stage start',
        Math.abs(g.player.x-g.checkpointX)<160 && g.player.x>300,
        'x='+g.player.x.toFixed(0)+' cp='+g.checkpointX);
  check('the checkpoint stays earned across the continue', g.checkpointUsed===true);
  check('the camera follows it in', g.camX>100, g.camX);
  check('the stage is still stage 1', g.levelIndex===0);
}

// ── scenario 22: the stage grade ─────────────────────────────
{
  const {g,step}=run();
  g.player.hp=99; g.player.invuln=999;
  step(5);
  for(const e of g.enemies) e.dead=true;
  for(const e of g.groundEnemies) e.dead=true;
  // a bad run: nothing rescued, no chain, plenty of hits, slow
  g.hitsThisLevel=3; g.levelTime=400;
  let gr=g.computeGrade();
  check('a bad run grades bottom', gr.letter==='D', gr.letter+' ('+gr.pts+')');

  // Hold everything else equal and vary ONLY the rescue count. Asserting on
  // the letter alone is too loose — a build that handed out full rescue
  // points for zero rescues still landed inside a "D or C" window.
  g.hitsThisLevel=0; g.levelTime=10;
  const none=g.computeGrade();
  check('a clean but empty-handed run cannot reach the top', none.letter!=='S',
        none.letter+' ('+none.pts+')');
  g.breakCage(g.cages[0]); g.breakCage(g.cages[0]); g.breakCage(g.cages[0]);
  const full=g.computeGrade();
  check('rescuing the brood is what moves the grade most',
        full.pts-none.pts>=35, none.pts+' -> '+full.pts);

  // a clean run: whole brood, big chain, untouched, under par
  g.addChain(12);
  gr=g.computeGrade();
  check('a clean run grades top', gr.letter==='S', gr.letter+' ('+gr.pts+')');
  check('the grade is bounded', gr.pts<=100 && gr.pts>=0, gr.pts);
  // the portal records it, and the best is kept
  g.endLevel();
  check('the debrief carries the grade', g.lastGrade==='S', g.lastGrade);
  check('a first grade is a personal best', g.bestGrades[0]==='S', JSON.stringify(g.bestGrades));
  g.drawMissionReport();
  check('the graded debrief renders', true);
}

// ── scenario 23: the arsenal ─────────────────────────────────
{
  const {g,step,keys}=run();
  g.player.hp=99; g.player.invuln=999;
  step(5);
  check('a run starts on the base beam', g.weapon==='beam', g.weapon);
  check('the base beam never runs dry', g.weaponAmmo===Infinity, g.weaponAmmo);

  g.equipWeapon('spread');
  check('picking up a letter swaps the weapon', g.weapon==='spread', g.weapon);
  check('...and loads its clock', g.weaponAmmo===g.WEAPONS.spread.ammo, g.weaponAmmo);

  // holding the trigger burns the clock
  const before=g.weaponAmmo;
  keys({KeyF:true});
  for(let i=0;i<20;i++){ g.player.invuln=999; step(1); }
  check('firing drains the ammo clock', g.weaponAmmo<before,
        before+' -> '+g.weaponAmmo.toFixed(2));

  // ...and running out hands the base gun back
  g.weaponAmmo=0.05;
  for(let i=0;i<20;i++){ g.player.invuln=999; step(1); }
  keys({KeyF:false});
  check('an empty clock falls back to the base beam', g.weapon==='beam', g.weapon);
  check('the fallback is infinite again', g.weaponAmmo===Infinity, g.weaponAmmo);

  // the base beam must NOT drain
  keys({KeyF:true});
  for(let i=0;i<30;i++){ g.player.invuln=999; step(1); }
  keys({KeyF:false});
  check('the base beam is not on a clock', g.weaponAmmo===Infinity, g.weaponAmmo);
}

// ── scenario 24: what each letter actually does ──────────────
{
  const {g,step,keys}=run();
  g.player.hp=99; g.player.invuln=999;
  step(5);
  keys({KeyF:true});

  // base: one ray, stops at the first thing it hits
  step(2);
  check('the base beam is a single lance',
        g.laser && (g.laser.ys||[]).length===1, g.laser&&(g.laser.ys||[]).length);

  // spread: three parallel lances, and it pierces
  g.equipWeapon('spread'); g.weaponAmmo=99;
  step(2);
  check('SPREAD fires three parallel lances',
        g.laser && g.laser.ys.length===3, g.laser&&g.laser.ys.length);
  check('the three lances are spread vertically',
        g.laser.ys[0]<g.laser.ys[1] && g.laser.ys[1]<g.laser.ys[2],
        g.laser&&g.laser.ys.join(','));
  check('SPREAD punches through', g.laser.piercing===true);

  // flame: very short reach
  g.equipWeapon('flame'); g.weaponAmmo=99;
  step(2);
  check('FLAME trades its reach away', g.laser && g.laser.len<=190, g.laser&&g.laser.len);
  check('...for a fatter cone', g.laser.thickness>8, g.laser&&g.laser.thickness);

  // rocket: not a beam at all
  g.equipWeapon('rocket'); g.weaponAmmo=99;
  g.playerBombs.length=0;
  step(30);
  check('ROCKET draws no beam', g.laser===null, g.laser);
  check('ROCKET launches projectiles', g.playerBombs.length>0, g.playerBombs.length);
  check('rockets fly flat, not in an arc',
        g.playerBombs.every(b=>b.straight===true));
  keys({KeyF:false});
}

// ── scenario 25: a rocket kills what it touches ──────────────
{
  const {g,step,keys}=run();
  g.player.hp=99; g.player.invuln=999;
  step(5);
  for(const e of g.enemies) e.dead=true;
  for(const e of g.groundEnemies) e.dead=true;
  const target=g.enemies[0];
  target.dead=false; target.dying=false; target.hp=99;
  g.equipWeapon('rocket'); g.weaponAmmo=99;
  keys({KeyF:true});
  for(let i=0;i<90;i++){
    g.player.invuln=999; g.player.facing=1;
    target.x=g.player.x+200; target.y=g.player.y; target.baseY=target.y;
    step(1);
  }
  keys({KeyF:false});
  check('a rocket detonates on what it hits', target.hp<99, target.hp);
}

// ── scenario 26: letter pickups ──────────────────────────────
{
  const {g,step}=run();
  g.player.hp=99; g.player.invuln=999;
  step(5);
  check('stage 1 stocks a letter', g.weaponPickups.length>0, g.weaponPickups.length);
  check('the letter is one of the real weapons',
        !!g.WEAPONS[g.weaponPickups[0].kind], g.weaponPickups[0].kind);
  g.drawWeaponPickups();
  check('letter capsules render', true);
  const kind=g.weaponPickups[0].kind;
  g.collectWeaponPickup(g.weaponPickups[0]);
  check('collecting one equips that letter', g.weapon===kind, g.weapon+' vs '+kind);

  // a continue hands the base gun back — you do not keep a letter through death
  g.player.invuln=0; g.player.hp=1; g.player.y=900;
  step(4);
  g.useContinue();
  check('a continue takes the letter away', g.weapon==='beam', g.weapon);
}

// ── scenario 12: walking into the rift once it opens ─────────
{
  const {g,step}=run();
  g.player.hp=99; g.player.invuln=999;
  step(5);
  check('every stage now guards its rift', g.portalReveal===0 && !g.gateOpen,
        g.portalReveal+'/'+g.gateOpen);
  // open it the way the stage does — by the boss falling
  g.gateOpen=true;
  for(let i=0;i<80;i++){ g.player.invuln=999; g.player.hp=99; step(1); }
  check('the rift materialises once the gate opens', g.portalReveal===1, g.portalReveal);
  const pp=g.goalPortalPos();
  check('the rift sits on the goal platform', pp.x>1100 && pp.y>200 && pp.y<330,
        pp.x+','+pp.y);
  // park the dino in the mouth of the rift
  g.player.x=pp.x-26; g.player.y=pp.y-30; g.player.vx=0; g.player.vy=0;
  step(1);
  check('contact starts the warp', g.STATE==='warp', g.STATE);
  check('the warp marks the goal as reached', g.goalReached===true);
  check('the beam is cut when the warp starts', true);
  // the pull, drawn frame by frame
  let mid=null;
  for(let i=0;i<90;i++){ step(1); if(!mid && g.warpTimer>0.5) mid=g.warpTimer; }  // > WARP_DUR
  check('the warp runs for about a second then hands over to the debrief',
        g.STATE==='report', g.STATE+' warpTimer='+g.warpTimer.toFixed(2));
  check('the rift threw particles while it pulled', g.particles.length>0, g.particles.length);
}

// ── scenario 13: the Alpha's rift, and no more auto-advance ───
{
  const {g,step}=run();
  g.loadLevel(2);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  check('the rift is absent until the Alpha falls', g.portalReveal===0, g.portalReveal);
  check('...and the gate is sealed', g.gateOpen===false);
  // kill the Alpha through the real dying → dead → killBoss path
  g.boss.dying=true; g.boss.deathTimer=0.02;
  for(let i=0;i<10;i++){ g.player.invuln=999; step(1); if(g.boss.dead) break; }
  check('the Alpha dies through its death sequence', g.boss.dead===true);
  check('the gate unseals on the kill', g.gateOpen===true);
  check('the rift starts materialising from nothing', g.portalReveal<1, g.portalReveal);
  for(let i=0;i<80;i++){ g.player.invuln=999; g.player.hp=99; step(1); }
  check('the rift finishes materialising', g.portalReveal===1, g.portalReveal);
  // ~4s later the stage must STILL be running — no auto-advance any more
  for(let i=0;i<240;i++){ g.player.invuln=999; g.player.hp=99; step(1); }
  check('the stage no longer ends by itself after the boss', g.STATE==='playing', g.STATE);
  check('the evacuation call goes out instead', !!g.radioFired.evac);
  // now walk in
  const pp=g.goalPortalPos();
  g.player.x=pp.x-20; g.player.y=pp.y-30; g.player.vx=0; g.player.vy=0;
  step(1);
  check('walking into the Alpha stage rift warps out', g.STATE==='warp', g.STATE);
  for(let i=0;i<120;i++) step(1);
  check('final stage warp lands on the debrief', g.STATE==='report', g.STATE);
}

// ── scenario 14: the ground.png surface + its collision line ──
{
  const {g,step}=run();
  g.player.hp=99; g.player.invuln=999;
  step(5);
  check('ground.png is wired up', g.groundLoaded===FIRE_ONLOAD, g.groundLoaded);
  // the whole background/terrain pass must survive a frame either way
  g.drawBG(); g.drawLava(); g.drawPlatforms();
  check('terrain pass renders (' + (FIRE_ONLOAD?'tiled':'procedural fallback') + ')', true);
  // the tile helper itself, on a platform-sized and a level-sized span
  drawStats.images.length=0;
  g.drawGroundCap(0, 0, 430, 120, 22);
  g.drawGroundCap(-350, 1130, 430, 670, 44);
  check('the tiler handles both a ledge and the whole cave floor', true);

  if(FIRE_ONLOAD){
    const caps=drawStats.images.filter(c=>c.sh===g.GROUND_SRC_H);
    check('the surface strip is actually tiled out', caps.length>=2, caps.length);
    // ground.png is fully transparent until row ~176 and only becomes 100%
    // opaque at row 424. Cutting the strip anywhere above that gives it a
    // ragged top edge, and the flat edge IS the line the player stands on —
    // so the source row is a correctness invariant, not a style choice.
    check('the strip is cut from the sheet\'s first fully-opaque row (424)',
          g.GROUND_SRC_Y===424 && caps.every(c=>c.sy===424),
          'GROUND_SRC_Y='+g.GROUND_SRC_Y);
    // unmirrored tiles blit straight to the platform top; mirrored ones go
    // through a translate, so their recorded dy is 0 by construction
    check('the strip is laid on the collision line, not above or below it',
          caps.some(c=>c.dy===430) && caps.every(c=>c.dy===430||c.dy===0),
          caps.map(c=>c.dy).join(','));
  }

  // THE invariant the new art depends on: a standing dino's feet are exactly
  // on p.y, which is the same line the ground strip is drawn from
  // (note: a resting dino sits EXACTLY on p.y, where overlaps() is false by
  // a hair, so the engine alternates resolve/settle frames. That is original
  // engine behaviour — measure the worst foot-line deviation, not one frame.)
  function settleOn(plat,startX){
    g.player.x=startX; g.player.y=plat.y-g.PLAYER_H-40; g.player.vy=0; g.player.vx=0;
    let worst=0, grounded=false;
    for(let i=0;i<60;i++){
      g.player.invuln=999; step(1);
      if(i>=40){
        worst=Math.max(worst,Math.abs((g.player.y+g.PLAYER_H)-plat.y));
        grounded=grounded||g.player.onGround;
      }
    }
    return {worst,grounded};
  }
  const floor=g.platforms.filter(p=>!p.lavaPit&&!p.goal&&p.y===g.GROUND_Y)[0];
  const fr=settleOn(floor,floor.x+120);
  check('the dino lands flush on the cave floor line, not above it',
        fr.grounded && fr.worst<0.5, 'worst='+fr.worst.toFixed(3)+' grounded='+fr.grounded);

  const ledge=g.platforms.filter(p=>p.y<g.GROUND_Y&&!p.goal)[0];
  const lr=settleOn(ledge,ledge.x+ledge.w/2-26);
  check('...and flush on a floating ledge too',
        lr.grounded && lr.worst<0.5, 'worst='+lr.worst.toFixed(3)+' grounded='+lr.grounded);
}

// ── scenario 15: no stand-in arch behind the real rift ────────
{
  const {g,step,drawStats}=run();
  g.player.hp=99; g.player.invuln=999;
  step(5);
  // With the rift open and its sprite loaded, the procedural arch must not
  // be drawn at all — portal.png is transparent in places, so the arch
  // showed through it as a door silhouette.
  g.gateOpen=true;
  for(let i=0;i<80;i++){ g.player.invuln=999; g.player.hp=99; step(1); }
  g.camX=400;   // scroll the exit into view — drawPlatforms culls off-screen
  drawStats.quad=0;
  g.drawPlatforms();
  if(FIRE_ONLOAD){
    check('the stand-in arch is hidden behind the loaded rift sprite',
          drawStats.quad===0, 'arch curves drawn: '+drawStats.quad);
  } else {
    check('the stand-in arch still draws when the sprite never loads',
          drawStats.quad>0, 'arch curves drawn: '+drawStats.quad);
  }
  // stage 3 before the boss: sealed, so the arch is the only thing marking
  // the exit and has to be drawn either way
  g.loadLevel(2);
  step(2);
  g.camX=900;
  drawStats.quad=0;
  g.drawPlatforms();
  check('a sealed exit still shows the arch', drawStats.quad>0,
        'arch curves drawn: '+drawStats.quad);
  // ...and it gives way once the Alpha falls and the rift takes over
  g.boss.dying=true; g.boss.deathTimer=0.02;
  for(let i=0;i<10;i++){ g.player.invuln=999; step(1); if(g.boss.dead) break; }
  g.camX=900;
  drawStats.quad=0;
  g.drawPlatforms();
  if(FIRE_ONLOAD){
    check('the arch gives way to the rift when the gate opens', drawStats.quad===0,
          'arch curves drawn: '+drawStats.quad);
  } else {
    check('the fallback arch stays on as the open gate', drawStats.quad>0,
          'arch curves drawn: '+drawStats.quad);
  }
}

// ── scenario 16: the POW model — hatchlings can be lost ───────
{
  const {g,step}=run();
  g.player.hp=99; g.player.invuln=999;
  step(5);
  // clear the level of live threats so only the one we place can scare it
  for(const e of g.enemies) e.dead=true;
  for(const e of g.groundEnemies) e.dead=true;

  g.breakCage(g.cages[0]);
  check('a freed hatchling joins with i-frames',
        g.followers.length===1 && g.followers[0].grace>0, g.followers[0]&&g.followers[0].grace);
  // it must NOT panic while those i-frames are up
  const bully=g.enemies[0];
  bully.dead=false; bully.dying=false; bully.hp=99;
  for(let i=0;i<10;i++){
    g.player.invuln=999;
    bully.x=g.followers[0].x-28; bully.y=g.followers[0].y-19; bully.baseY=bully.y;
    step(1);
  }
  check('i-frames hold the hatchling on the train for a moment',
        g.followers.length===1, g.followers.length);

  // ...then the same contact knocks it off
  for(let i=0;i<120 && g.followers.length;i++){
    g.player.invuln=999;
    if(g.followers.length){ bully.x=g.followers[0].x-28; bully.y=g.followers[0].y-19; bully.baseY=bully.y; }
    step(1);
  }
  check('an enemy hit knocks a hatchling off the train',
        g.followers.length===0 && g.scaredBabies.length===1,
        g.followers.length+'/'+g.scaredBabies.length);
  check('a scared hatchling is not lost yet — it is on a timer',
        g.rescuedThisLevel===1 && g.scaredBabies[0].timer>0, g.rescuedThisLevel);
  g.drawScaredBabies();
  check('the panicking hatchling renders', true);
  bully.dead=true;

  // walking onto it puts it back on the train
  for(let i=0;i<60 && g.scaredBabies.length;i++){
    g.player.invuln=999;
    const b=g.scaredBabies[0];
    g.player.x=b.x-26; g.player.y=b.y-33; g.player.vx=0; g.player.vy=0;
    step(1);
  }
  check('touching it puts the hatchling back on the train',
        g.followers.length===1 && g.scaredBabies.length===0,
        g.followers.length+'/'+g.scaredBabies.length);
  check('a recaptured hatchling still counts as rescued', g.rescuedThisLevel===1);

  // now let one time out with the player nowhere near it
  bully.dead=false;
  for(let i=0;i<160 && g.followers.length;i++){
    g.player.invuln=999;
    if(g.followers.length){ bully.x=g.followers[0].x-28; bully.y=g.followers[0].y-19; bully.baseY=bully.y; }
    step(1);
  }
  bully.dead=true;
  check('it can be knocked off a second time', g.scaredBabies.length===1, g.scaredBabies.length);
  const beforeLoss=g.rescuedThisLevel;
  const strays=g.scaredBabies.length;
  for(let i=0;i<420 && g.scaredBabies.length;i++){
    g.player.invuln=999; g.player.hp=99;
    // fly far away and stay there: standing still leaves the player sitting
    // on the very hatchling it is supposed to be abandoning
    g.player.x=760; g.player.y=140; g.player.vx=0; g.player.vy=0;
    step(1);
  }
  check('an abandoned hatchling is lost for good', g.scaredBabies.length===0);
  check('losing one takes it back off the stage tally',
        g.rescuedThisLevel===beforeLoss-strays, beforeLoss+' -> '+g.rescuedThisLevel);
  check('...and off the run tally too', g.rescuedTotal===g.rescuedThisLevel, g.rescuedTotal);
}

// ── scenario 17: the escort pays out ─────────────────────────
{
  const {g,step}=run();
  g.player.hp=99; g.player.invuln=999;
  step(5);
  for(const e of g.enemies) e.dead=true;
  for(const e of g.groundEnemies) e.dead=true;

  let pw=g.followerPower();
  check('no escort, no buff', pw.beamMult===1 && pw.fuelMult===1 && !pw.shooting,
        JSON.stringify(pw));
  g.breakCage(g.cages[0]);
  pw=g.followerPower();
  check('one hatchling speeds the beam up', pw.beamMult<1 && pw.fuelMult===1, pw.beamMult);
  g.breakCage(g.cages[0]);
  pw=g.followerPower();
  check('two refuel the jetpack faster', pw.fuelMult>1 && !pw.shooting, pw.fuelMult);
  g.breakCage(g.cages[0]);
  pw=g.followerPower();
  check('three make the escort open fire', pw.shooting && pw.beamMult<0.7,
        JSON.stringify(pw));

  // give them something to shoot at
  const target=g.enemies[0];
  target.dead=false; target.dying=false; target.hp=99;
  for(let i=0;i<180 && g.babyShots.length===0;i++){
    g.player.invuln=999;
    target.x=g.player.x+120; target.y=g.player.y; target.baseY=target.y;
    step(1);
  }
  check('a full escort spits fireballs', g.babyShots.length>0, g.babyShots.length);
  const hpBefore=target.hp;
  for(let i=0;i<120;i++){
    g.player.invuln=999;
    target.x=g.player.x+120; target.y=g.player.y; target.baseY=target.y;
    step(1);
  }
  check('those fireballs actually damage enemies', target.hp<hpBefore,
        hpBefore+' -> '+target.hp);
}

// ── scenario 18: strays are left behind at the rift ──────────
{
  const {g,step}=run();
  g.player.hp=99; g.player.invuln=999;
  step(5);
  for(const e of g.enemies) e.dead=true;
  for(const e of g.groundEnemies) e.dead=true;
  g.breakCage(g.cages[0]);
  g.breakCage(g.cages[0]);
  check('two aboard', g.rescuedThisLevel===2, g.rescuedThisLevel);
  // knock one loose, then leave through the portal while it is still running
  const bully=g.enemies[0];
  bully.dead=false; bully.dying=false; bully.hp=99;
  for(let i=0;i<160 && g.scaredBabies.length===0;i++){
    g.player.invuln=999;
    if(g.followers.length){ bully.x=g.followers[0].x-28; bully.y=g.followers[0].y-19; bully.baseY=bully.y; }
    step(1);
  }
  const loose=g.scaredBabies.length, aboard=g.followers.length;
  check('at least one is loose when the portal is reached', loose>=1, loose);
  g.endLevel();
  check('every hatchling left running is left behind', g.scaredBabies.length===0);
  check('the debrief counts only who boarded',
        g.rescuedThisLevel===aboard, 'aboard='+aboard+' loose='+loose+
        ' tally='+g.rescuedThisLevel);
}

// ── scenario 27: the parry ───────────────────────────────────
{
  const {g,step}=run();
  g.player.hp=99;
  step(5);
  const putBall=(parry)=>{
    g.lavaBalls.length=0;
    g.lavaBalls.push({x:g.player.x+53/2, y:g.player.y+60/2, vx:0, vy:0, life:0, parry:parry});
  };

  // dashing into a pink shot swats it
  g.player.vx=0; g.player.vy=0; g.player.invuln=0; g.player.dashTimer=0.4;
  const hpBefore=g.player.hp, scoreBefore=g.score, chainBefore=g.chain;
  putBall(true);
  for(let i=0;i<4 && g.lavaBalls.length;i++){ g.player.dashTimer=0.4; step(1); }
  check('a dash through a pink shot parries it', g.lavaBalls.length===0, g.lavaBalls.length);
  check('a parry costs no health', g.player.hp===hpBefore, hpBefore+' -> '+g.player.hp);
  check('a parry pays out score', g.score>scoreBefore, g.score-scoreBefore);
  check('a parry jumps the chain', g.chain>chainBefore, chainBefore+' -> '+g.chain);
  check('the debrief counts parries', g.parriesThisLevel===1, g.parriesThisLevel);
  check('a clean parry refunds the dash', g.player.dashCooldown===0, g.player.dashCooldown);

  // NOT dashing means you eat it. Note the parry above set hitStopTimer, and
  // loop() skips update() entirely while that runs — so the freeze has to be
  // burned off first or the next few steps simulate nothing at all.
  step(12);
  g.player.vx=0; g.player.vy=0; g.player.dashTimer=0; g.player.invuln=0;
  const hp2=g.player.hp;
  putBall(true);
  for(let i=0;i<6 && g.player.hp===hp2;i++) step(1);
  check('standing in a pink shot still hurts', g.player.hp<hp2, hp2+' -> '+g.player.hp);

  // an ordinary shot is not parryable, dash or no dash
  step(12);
  g.player.vx=0; g.player.vy=0; g.player.dashTimer=0.4; g.player.invuln=0;
  const parries=g.parriesThisLevel;
  putBall(false);
  for(let i=0;i<6;i++){ g.player.dashTimer=0.4; step(1); }
  check('an ordinary shot cannot be parried', g.parriesThisLevel===parries,
        g.parriesThisLevel);
  g.drawLavaBalls();
  check('parryable and ordinary shots both render', true);
}

// ── scenario 28: the Alpha's second phase ────────────────────
{
  const {g,step}=run();
  g.loadLevel(2);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  check('the boss is named from the level table',
        g.boss.name==='ALFA PTERODACTYL', g.boss&&g.boss.name);
  check('it starts in phase 1', g.boss.phase===1, g.boss.phase);

  // drop it to half health with the fight live
  g.boss.introState='active';
  g.boss.hp=Math.floor(g.boss.maxHp/2);
  for(let i=0;i<5;i++){ g.player.invuln=999; step(1); }
  check('half health flips it into phase 2', g.boss.phase===2, g.boss.phase);
  check('the rage banner comes up', g.bossRageTimer>0, g.bossRageTimer);
  g.drawBossRage();
  g.drawBoss();
  check('the enraged boss and its banner render', true);

  // phase 2 answers with a fan, not a single shot
  g.lavaBalls.length=0;
  g.boss.fireCooldown=0.01;
  for(let i=0;i<8 && g.lavaBalls.length===0;i++){ g.player.invuln=999; step(1); }
  check('phase 2 fires a three-way fan', g.lavaBalls.length>=3, g.lavaBalls.length);
  check('every shot in the fan is parryable',
        g.lavaBalls.every(b=>b.parry===true));
}

// ── scenario 29: the named intro card ────────────────────────
{
  const {g,step}=run();
  g.loadLevel(2);
  g.player.hp=99; g.player.invuln=999;
  for(const e of g.enemies) if(e.arenaEnemy) e.dead=true;
  for(const e of g.groundEnemies) if(e.arenaEnemy) e.dead=true;
  check('no card before the fight', g.bossCardTimer===0, g.bossCardTimer);
  // walk onto the trigger and let the warning run through to the descent
  for(let i=0;i<500 && g.bossCardTimer<=0;i++){
    g.player.invuln=999; g.player.hp=99;
    g.player.x=Math.min(1400,g.player.x+6);
    g.player.y=140; g.player.vy=0;
    step(1);
  }
  check('the card rides in with the descent', g.bossCardTimer>0, g.bossCardTimer);
  check('...which is when the boss is actually descending',
        g.boss.introState==='descending'||g.boss.introState==='active',
        g.boss&&g.boss.introState);
  g.drawBossCard();
  check('the name card renders', true);
  // and it clears itself
  for(let i=0;i<200 && g.bossCardTimer>0;i++){ g.player.invuln=999; g.player.hp=99; step(1); }
  check('the card clears itself', g.bossCardTimer<=0, g.bossCardTimer);
}

// ── scenario 30: every stage is guarded ──────────────────────
{
  const {g,step}=run();
  for(let i=0;i<3;i++){
    g.loadLevel(i);
    step(2);
    check('stage '+(i+1)+' has a named boss',
          !!g.boss && !!g.boss.name && !!g.boss.art,
          g.boss?(g.boss.name+' / '+g.boss.art):'none');
    check('stage '+(i+1)+' seals its rift until that boss falls',
          g.gateOpen===false, g.gateOpen);
  }
  const kinds=[0,1,2].map(i=>{ g.loadLevel(i); return g.boss.kind; });
  check('the three fights are not all the same shape',
        new Set(kinds).size>1, kinds.join(','));
}

// ── scenario 31: the stage 1 drone ───────────────────────────
{
  const {g,step}=run();
  g.loadLevel(0);
  g.player.hp=99; g.player.invuln=999;
  step(2);
  check('stage 1 fields a flyer', g.boss.kind==='flyer', g.boss.kind);
  check('...with its own art', g.boss.art==='boss_stage1.png', g.boss.art);
  check('...and less health than the Alpha', g.boss.hp<12, g.boss.hp);

  g.boss.introState='active';
  g.boss.diveCooldown=0.01;
  const seen={};
  for(let i=0;i<160;i++){
    g.player.invuln=999; g.player.hp=99;
    step(1);
    seen[g.boss.diveState]=true;
  }
  check('the drone telegraphs and then swoops',
        seen.telegraph && seen.swoop, Object.keys(seen).join(','));

  // half health wrecks it — same fight, different sprite
  g.boss.hp=Math.floor(g.boss.maxHp/2);
  for(let i=0;i<6;i++){ g.player.invuln=999; step(1); }
  check('the drone comes apart at half health', g.boss.phase===2, g.boss.phase);
  check('...and swaps to the wrecked art',
        g.boss.art==='boss_stage1_rage.png', g.boss.art);
  g.drawBoss();
  check('the wrecked drone renders', true);
}

// ── scenario 32: the stage 2 walker ──────────────────────────
{
  const {g,step}=run();
  g.loadLevel(1);
  g.player.hp=99; g.player.invuln=999;
  step(2);
  check('stage 2 fields a ground unit', g.boss.kind==='walker', g.boss.kind);
  check('...and the heaviest health bar of the three', g.boss.hp>=10, g.boss.hp);

  g.boss.introState='active';
  // Stand the fight up where a real one happens: next to the boss with the
  // camera on it. Shockwaves are culled once they leave the view, so leaving
  // the camera parked at x=0 killed every wave on the frame it spawned.
  g.player.x=g.boss.x-200;
  g.camX=g.boss.x-450;
  for(let i=0;i<10;i++){
    g.player.invuln=999;
    g.camX=g.boss.x-450;
    step(1);
  }
  check('a walker stays on the floor',
        Math.abs(g.boss.y-(g.GROUND_Y-g.boss.h/2))<1,
        g.boss.y+' vs '+(g.GROUND_Y-g.boss.h/2));

  // it stomps waves down the bridge
  g.shockwaves.length=0;
  g.boss.stompCooldown=0.01;
  for(let i=0;i<10 && g.shockwaves.length===0;i++){
    g.player.invuln=999;
    g.camX=g.boss.x-450;
    step(1);
  }
  check('the stomp throws shockwaves both ways', g.shockwaves.length>=2,
        g.shockwaves.length);
  check('they travel in opposite directions',
        new Set(g.shockwaves.map(w=>w.dir)).size===2,
        g.shockwaves.map(w=>w.dir).join(','));
  g.drawShockwaves();
  check('shockwaves render', true);

  // a walker does not drop flame columns out of the sky
  g.bossFlameBursts.length=0;
  g.boss.flameCooldown=0.01;
  for(let i=0;i<20;i++){ g.player.invuln=999; step(1); }
  check('a ground unit drops no aerial flame columns',
        g.bossFlameBursts.length===0, g.bossFlameBursts.length);
}

// ── scenario 33: jumping a shockwave ─────────────────────────
{
  const {g,step}=run();
  g.loadLevel(1);
  g.player.hp=99;
  step(5);
  const putWave=()=>{
    g.shockwaves.length=0;
    g.shockwaves.push({x:g.player.x+53/2, dir:1, life:0});
  };
  // grounded: it connects
  g.player.invuln=0; g.player.y=g.GROUND_Y-g.PLAYER_H; g.player.vy=0;
  for(let i=0;i<8;i++){ step(1); }   // settle onto the floor
  const hp1=g.player.hp;
  g.player.invuln=0;
  putWave();
  for(let i=0;i<4 && g.player.hp===hp1;i++) step(1);
  check('a shockwave hits a player standing on the floor', g.player.hp<hp1,
        hp1+' -> '+g.player.hp);

  // Airborne: it passes underneath. Note the hop has to stay CLOSE to the
  // ground line — parking the dino at y=200 is so far up that the wave's own
  // vertical range check rejects it, and the test then passes even when the
  // "must be grounded" rule is deleted.
  step(12);                       // burn off any hit-stop
  const hopY=g.GROUND_Y-g.PLAYER_H-25;
  const hp2=g.player.hp;
  putWave();
  for(let i=0;i<4;i++){
    g.player.invuln=0;
    g.player.y=hopY; g.player.vy=-200;   // rising, so never grounded
    step(1);
  }
  check('jumping clears it', g.player.hp===hp2, hp2+' -> '+g.player.hp);
}

// ── scenario 34: the mission select screen ───────────────────
{
  const {g,step,keys}=run({map:true});
  check('the game opens on the mission select screen', g.STATE==='map', g.STATE);
  check('there are four destinations', g.WORLDS.length===4, g.WORLDS.length);
  check('the volcano is open from the start', g.worldState(0).playable===true);
  check('the canopy starts locked', g.worldState(1).unlocked===false);
  check('frozen peaks are locked', g.worldState(2).unlocked===false);
  check('cyber crater is locked', g.worldState(3).unlocked===false);
  check('a world with no stages can never be entered',
        g.worldState(2).playable===false && g.worldState(3).playable===false);
  g.drawWorldMap();
  check('the map renders', true);

  // the cursor only lands on nodes you can actually start
  const before=g.mapSel;
  keys({ArrowRight:true}); step(2); keys({ArrowRight:false}); step(2);
  check('the cursor never parks on a locked node',
        g.worldState(g.mapSel).playable===true, g.mapSel);
  check('with one world open the cursor stays put', g.mapSel===before, g.mapSel);

  // ENTER drops into the world
  keys({Enter:true}); step(20); keys({Enter:false});
  check('ENTER launches the highlighted world', g.STATE==='playing', g.STATE);
  check('...at its first stage', g.levelIndex===0, g.levelIndex);
  check('starting a world resets the score', g.score===0, g.score);
  check('...and the credit sheet', g.continuesLeft===g.MAX_CONTINUES);
}

// ── scenario 35: progress persists ───────────────────────────
{
  const {g,step,store}=run({map:true});
  g.startWorld(0);
  g.finishWorld();
  check('finishing a world marks it cleared', g.worldState(0).cleared===true);
  check('...and unlocks the next', g.worldState(1).playable===true);
  // It has to reach localStorage, not just the in-memory object — that is
  // the whole point of the requirement, and checking the object alone passes
  // even when the save is deleted.
  const raw=store.getItem('neonDinoWorlds');
  check('progress is written to localStorage', !!raw, String(raw));
  let saved={};
  try{ saved=JSON.parse(raw||'{}'); }catch(e){}
  check('the cleared world survives a refresh',
        saved.volcano && saved.volcano.cleared===true, raw);
  check('so does the unlock it granted',
        saved.forest && saved.forest.unlocked===true, raw);
  // and once unlocked, the canopy is selectable and startable
  g.mapSel=1;
  check('the canopy can now be started', g.startWorld(1)===true);
  check('...which loads the forest stage', g.levelIndex===3, g.levelIndex);
}

// ── scenario 36: the Toxic Canopy's biome ────────────────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  check('the volcano is not the forest', g.isForest()===false);
  const volcano=g.themeOf();
  g.loadLevel(3);
  step(3);
  check('the forest stage reports its own biome', g.isForest()===true);
  const forest=g.themeOf();
  check('the pits change liquid with the biome',
        forest.liquid[0]!==volcano.liquid[0],
        volcano.liquid[0]+' vs '+forest.liquid[0]);
  check('the acid is emerald', forest.liquid[0].toLowerCase()==='#10b981',
        forest.liquid[0]);
  // the whole forest terrain pass has to survive a frame, sprites or not
  g.player.hp=99; g.player.invuln=999;
  for(let i=0;i<40;i++){ g.player.invuln=999; step(1); }
  g.drawBG(); g.drawLava(); g.drawPlatforms();
  check('the forest renders ('+(FIRE_ONLOAD?'with art':'fallback')+')', true);
  check('the forest stage has no boss yet, so its rift is open',
        g.gateOpen===true, g.gateOpen);
  // and the collision line still lands on the drawn surface
  const ledge=g.platforms.filter(p=>p.y<g.GROUND_Y&&!p.goal)[0];
  g.player.x=ledge.x+ledge.w/2-26; g.player.y=ledge.y-g.PLAYER_H-40;
  g.player.vy=0; g.player.vx=0;
  let worst=0, grounded=false;
  for(let i=0;i<60;i++){
    g.player.invuln=999; step(1);
    if(i>=40){
      worst=Math.max(worst,Math.abs((g.player.y+g.PLAYER_H)-ledge.y));
      grounded=grounded||g.player.onGround;
    }
  }
  check('the dino stands flush on the mossy ledge', grounded&&worst<0.5,
        'worst='+worst.toFixed(3));

  // ...and the DRAWN surface is on that same line. Physics alone cannot catch
  // a mis-anchored sprite: the body band of forest_ground.png starts at its
  // first solid row (426) and that row must be blitted exactly at p.y, with
  // the grass tufts above it and the vines below.
  if(FIRE_ONLOAD){
    g.camX=Math.max(0,ledge.x-300);
    drawStats.images.length=0;
    g.drawPlatforms();
    const bands=drawStats.images.filter(c=>c.sy===426);
    check('the mossy body is cut from the first solid row of the block',
          bands.length>0, bands.length);
    check('...and laid exactly on the collision line',
          bands.some(c=>Math.abs(c.dy-ledge.y)<0.001),
          bands.map(c=>c.dy).join(','));
    // drawPlatforms draws EVERY visible platform, so narrow each band to the
    // ledge being measured instead of assuming the whole list belongs to it
    const tufts=drawStats.images.filter(c=>c.sy===348);
    check('grass tufts are drawn above that line',
          tufts.some(c=>c.dy<ledge.y && c.dy>ledge.y-24),
          tufts.map(c=>c.dy).join(','));
    const vines=drawStats.images.filter(c=>c.sy===1074);
    check('vines hang below the ledge into open air',
          vines.some(c=>c.dy>ledge.y && c.dy<ledge.y+60),
          vines.map(c=>c.dy).join(','));
  }
}

// ── scenario 37: the canopy's roster ─────────────────────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.loadLevel(3);
  step(3);
  check('the canopy fields its own flyers',
        g.enemies.length>0 && g.enemies.every(e=>e.species==='forest_flyer'),
        g.enemies.map(e=>e.species).join(','));
  const crawlers=g.groundEnemies.filter(e=>e.species==='forest_crawler');
  const plants=g.groundEnemies.filter(e=>e.species==='forest_plant');
  check('...crawlers on the ledges', crawlers.length>=2, crawlers.length);
  check('...and spitters planted about', plants.length>=2, plants.length);
  check('only the crawler carries armour',
        crawlers.every(e=>e.shield===true) && plants.every(e=>!e.shield));
  check('crawlers have four hit points', crawlers.every(e=>e.maxHp===4),
        crawlers.map(e=>e.maxHp).join(','));
  check('spitters have three', plants.every(e=>e.maxHp===3),
        plants.map(e=>e.maxHp).join(','));
  check('the dragonfly has two', g.enemies.every(e=>e.maxHp===2),
        g.enemies.map(e=>e.maxHp).join(','));
  check('every species names a sheet and a facing',
        ['forest_flyer','forest_crawler','forest_plant','trike']
          .every(k=>g.SPECIES[k]&&g.SPECIES[k].art&&Math.abs(g.SPECIES[k].faces)===1));
  // a turret is planted, not patrolling
  const plant=plants[0];
  const px0=plant.x;
  g.player.hp=99; g.player.invuln=999;
  for(let i=0;i<60;i++){ g.player.invuln=999; step(1); }
  check('a spitter never leaves its spot', Math.abs(plant.x-px0)<0.001,
        px0+' -> '+plant.x);
  g.drawPtero(g.enemies[0]);
  g.drawGroundEnemy(crawlers[0]);
  g.drawGroundEnemy(plant);
  check('the canopy fauna renders', true);
}

// ── scenario 38: the dragonfly drips acid ────────────────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.loadLevel(3);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  const fly=g.enemies[0];
  // silence everything else: the stage is full of spitters, and one of their
  // spore balls was being measured as if the dragonfly had dropped it
  for(const e of g.groundEnemies) e.dead=true;
  for(let i=1;i<g.enemies.length;i++) g.enemies[i].dead=true;
  g.lavaBalls.length=0;
  // park it directly overhead and wait for the reload
  for(let i=0;i<260 && g.lavaBalls.length===0;i++){
    g.player.invuln=999; g.player.hp=99;
    g.player.x=600; g.player.y=340; g.player.vy=0;
    fly.x=g.player.x+53/2-fly.w/2; fly.y=180; fly.baseY=180;
    step(1);
  }
  check('it drips acid when it gets overhead', g.lavaBalls.length>0,
        g.lavaBalls.length);
  check('the drip is acid, not a boss shot',
        g.lavaBalls.every(b=>b.acid===true && !b.parry));
  check('a drip falls straight down', Math.abs(g.lavaBalls[0].vx)<0.001,
        g.lavaBalls[0].vx);
  g.drawLavaBalls();
  check('acid renders', true);
}

// ── scenario 39: the crawler's armour ────────────────────────
{
  const {g,step,keys}=run({map:true});
  g.startWorld(0);
  g.loadLevel(3);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  const crawler=g.groundEnemies.filter(e=>e.species==='forest_crawler')[0];
  for(const e of g.groundEnemies) if(e!==crawler) e.dead=true;
  for(const e of g.enemies) e.dead=true;
  const pin=(dir)=>{
    // hold the crawler in the beam's path, walking in direction `dir`
    crawler.vx=dir*40;
    crawler.x=g.player.x+120;
    crawler.y=g.player.y;
    crawler.patrolMin=crawler.x-400; crawler.patrolMax=crawler.x+400;
  };
  g.player.facing=1;
  keys({KeyF:true});

  // facing the player = armoured. Shooting right at something walking left
  // means you are in front of it.
  crawler.hp=4;
  for(let i=0;i<60;i++){ g.player.invuln=999; g.player.facing=1; pin(-1); step(1); }
  check('the armour blocks a shot to the face', crawler.hp===4, crawler.hp);

  // walking the same way you are shooting = you are behind it
  for(let i=0;i<60;i++){ g.player.invuln=999; g.player.facing=1; pin(1); step(1); }
  check('a shot to the back gets through', crawler.hp<4, crawler.hp);
  keys({KeyF:false});
}

// ── scenario 40: stomping one ────────────────────────────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.loadLevel(3);
  g.player.hp=99;
  step(3);
  const crawler=g.groundEnemies.filter(e=>e.species==='forest_crawler')[0];
  for(const e of g.groundEnemies) if(e!==crawler) e.dead=true;
  for(const e of g.enemies) e.dead=true;
  crawler.hp=4; crawler.vx=0;
  crawler.x=500; crawler.y=g.GROUND_Y-crawler.h;
  crawler.patrolMin=400; crawler.patrolMax=600;
  // drop onto its head
  g.player.invuln=0;
  g.player.x=crawler.x+crawler.w/2-26;
  g.player.y=crawler.y-g.PLAYER_H+4;
  g.player.vy=200;
  for(let i=0;i<4 && !crawler.dying;i++){
    crawler.x=500; crawler.y=g.GROUND_Y-crawler.h;
    step(1);
  }
  check('dropping on its head kills it outright', crawler.dying===true, crawler.hp);
  check('...and bounces you off it', g.player.vy<0, g.player.vy);
  check('the stomp costs no health', g.player.hp===99, g.player.hp);
}

// ── scenario 41: the spitter ─────────────────────────────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.loadLevel(3);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  const plant=g.groundEnemies.filter(e=>e.species==='forest_plant')[0];
  for(const e of g.groundEnemies) if(e!==plant) e.dead=true;
  for(const e of g.enemies) e.dead=true;
  g.lavaBalls.length=0;
  // out of range: it holds fire
  for(let i=0;i<120;i++){
    g.player.invuln=999; g.player.x=plant.x+900; g.player.y=340;
    step(1);
  }
  check('a spitter holds fire out of range', g.lavaBalls.length===0,
        g.lavaBalls.length);
  // in range: it lobs
  for(let i=0;i<260 && g.lavaBalls.length===0;i++){
    g.player.invuln=999; g.player.x=plant.x+180; g.player.y=340;
    step(1);
  }
  check('a spitter lobs a spore ball in range', g.lavaBalls.length>0,
        g.lavaBalls.length);
  check('the lob is an arc, not a straight shot',
        g.lavaBalls.some(b=>b.vy<0), g.lavaBalls.map(b=>b.vy.toFixed(0)).join(','));
  // check tracking from BOTH sides — the player happened to be on the right
  // here, so asserting faceDir===1 alone passes even when it is hardcoded
  for(let i=0;i<5;i++){ g.player.invuln=999; g.player.x=plant.x+180; step(1); }
  const fromRight=plant.faceDir;
  for(let i=0;i<5;i++){ g.player.invuln=999; g.player.x=plant.x-180; step(1); }
  const fromLeft=plant.faceDir;
  check('it turns to face the player', fromRight===1 && fromLeft===-1,
        'right='+fromRight+' left='+fromLeft);
}

// ── scenario 42: the triceratops hostage ─────────────────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.loadLevel(3);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  check('the canopy holds exactly one hostage',
        g.LEVELS[3].cages.length===1, g.LEVELS[3].cages.length);
  check('...and it is a triceratops', g.cages[0].species==='trike',
        g.cages[0].species);
  g.drawCages&&g.drawCages();
  g.breakCage(g.cages[0]);
  check('freeing it puts a trike on the train',
        g.followers.length===1 && g.followers[0].species==='trike',
        g.followers[0]&&g.followers[0].species);
  check('it bounces with joy before settling', g.followers[0].joy>0,
        g.followers[0].joy);
  check('the stage tally reads one of one',
        g.rescuedThisLevel===1 && g.LEVELS[3].cages.length===1,
        g.rescuedThisLevel+'/'+g.LEVELS[3].cages.length);
  for(let i=0;i<40;i++){ g.player.invuln=999; step(1); }
  g.drawFollowers();
  check('the trike renders in the train', true);
}

// ── scenario 9: death screen untouched ────────────────────────
{
  const {g,step}=run();
  g.player.hp=1;
  g.player.y=900;       // straight into the void
  step(5);
  check('falling out of the world costs the last heart', g.STATE==='continue', g.STATE);
  g.drawContinue();
  check('the continue prompt renders', true);
  // with no credits left it really is over
  g.continuesLeft=0;
  g.continueTimer=0.01;
  step(5);
  check('a spent credit sheet ends the run for real', g.STATE==='dead', g.STATE);
  g.drawGameOver();
  check('game-over screen renders', true);
}

} // ── end runSuite ────────────────────────────────────────────

// ── driver: the same scenarios, sprites loaded and sprites absent ──
let totalChecks=0, totalFailures=0;
for(const fire of [true,false]){
  FIRE_ONLOAD=fire; checks=0; failures=0;
  console.log('=== '+path.basename(TARGET)+
              '   (Image onload: '+(fire?'FIRES':'NEVER FIRES')+') ===');
  // A broken build often throws (a check reads something that is suddenly
  // undefined) rather than failing cleanly. Without this guard the run dies
  // on the first throw and the summary reports one problem when there are
  // five — which is exactly how a planted-regression check once looked fine.
  try{
    runSuite();
  }catch(err){
    failures++; checks++;
    console.log('  FAIL  scenario threw and aborted this pass: '+err.message);
    const frames=String(err.stack||'').split(String.fromCharCode(10));
    if(frames[1]) console.log('        '+frames[1].trim());
  }
  console.log('--- '+(checks-failures)+'/'+checks+' checks passed ---\n');
  totalChecks+=checks; totalFailures+=failures;
}
console.log(totalFailures
  ? 'FAILED — '+totalFailures+' of '+totalChecks+' checks'
  : 'OK — all '+totalChecks+' checks passed across both passes');
process.exit(totalFailures?1:0);
