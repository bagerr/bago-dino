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
// A build is a list of scripts, in document order, and each one is run on
// its own — which is what the browser does. Two shapes turn up here:
// inline blocks (the standalone bundle inlines its art and its code) and
// <script src> references (the folder build, split across src/*.js).
//
// They are NOT concatenated. Declarations hoist within a script and not
// across scripts, so a harness that joined them could not see the one class
// of bug splitting a file can introduce: a function used at load time by a
// file that runs before the file that declares it.
const SCRIPT_RE=/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g;
const scripts=[];
for(const m of html.matchAll(SCRIPT_RE)){
  const attrs=m[1]||'';
  const srcAttr=attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/);
  if(srcAttr){
    const p=path.resolve(path.dirname(TARGET),srcAttr[1]);
    if(!fs.existsSync(p)) throw new Error('missing script '+srcAttr[1]+' referenced by '+TARGET);
    scripts.push({name:srcAttr[1], code:fs.readFileSync(p,'utf8')});
  } else if(m[2].trim()){
    scripts.push({name:path.basename(TARGET)+' (inline)', code:m[2]});
  }
}
if(!scripts.length) throw new Error('no script in '+TARGET);

let FIRE_ONLOAD=true;      // flipped by the driver at the bottom
let failures=0, checks=0;
function check(name,cond,extra){
  checks++;
  if(cond) console.log('  PASS  '+name);
  else { failures++; console.log('  FAIL  '+name+(extra!==undefined?('  ['+extra+']'):'')); }
}

// ── stub canvas 2d context ────────────────────────────────────
const drawStats={quad:0, images:[], rotations:[]};
function makeCtx(){
  const grad={addColorStop(){}};
  // a translate/scale stack, so a recorded destination rect is where the art
  // actually landed on the canvas rather than where the call happened to say
  let tx=0, ty=0, kx=1, ky=1;
  const stack=[];
  const target={
    canvas:{width:900,height:506},
    save(){ stack.push([tx,ty,kx,ky]); },
    restore(){ const p=stack.pop(); if(p){ tx=p[0]; ty=p[1]; kx=p[2]; ky=p[3]; } },
    translate(x,y){ tx+=(x||0)*kx; ty+=(y||0)*ky; },
    rotate(a){ drawStats.rotations.push(a); },
    scale(a,b){ kx*=(a===undefined?1:a); ky*=(b===undefined?1:b); },
    setTransform(){ tx=0; ty=0; kx=1; ky=1; },
    beginPath(){},closePath(){},moveTo(){},lineTo(){},arc(){},ellipse(){},
    quadraticCurveTo(){ drawStats.quad++; },bezierCurveTo(){},rect(){},clip(){},
    fill(){},stroke(){},fillRect(){},strokeRect(){},clearRect(){},
    fillText(){},strokeText(){},setLineDash(){},
    drawImage(img,sx,sy,sw,sh,dx,dy,dw,dh){
      // only the 9-arg form carries a source rect, which is what the ground
      // strip uses; the 3-arg form is recorded as a plain blit
      // the SOURCE matters as much as the rect: 'the ice stage draws the
      // ice backdrop' cannot be asserted without knowing which sheet it was
      const src=(img&&img.src)||'';
      // destination in canvas space; a mirrored blit reports a negative width
      const P=(x,y,w,h)=>({dx:tx+(x||0)*kx, dy:ty+(y||0)*ky, dw:(w||0)*kx, dh:(h||0)*ky});
      if(arguments.length>=9){
        const p=P(dx,dy,dw,dh);
        drawStats.images.push({src,sx,sy,sw,sh,dx:p.dx,dy:p.dy,dw:p.dw,dh:p.dh});
      } else {
        const p=P(sx,sy,sw,sh);
        drawStats.images.push({src,dx:p.dx,dy:p.dy,dw:p.dw,dh:p.dh});
      }
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
    localStorage:{ _d:{}, getItem(k){return this._d[k]||null;}, setItem(k,v){this._d[k]=String(v);},
                   removeItem(k){ delete this._d[k]; } },
  };
  sandbox.window=sandbox;
  sandbox.globalThis=sandbox;
  sandbox.window.innerWidth=1280; sandbox.window.innerHeight=720;
  sandbox.window.addEventListener=(ev,fn)=>{ (listeners[ev]=listeners[ev]||[]).push(fn); };
  sandbox.window.removeEventListener=()=>{};
  sandbox.window.AudioContext=undefined;      // ensureAudio bails out cleanly
  sandbox.window.webkitAudioContext=undefined;
  sandbox.document={
    getElementById(){ return { width:0,height:0,style:{},
      getBoundingClientRect(){ return {left:0,top:0,width:900,height:506}; },
      getContext(){ return makeCtx(); } }; },
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
  get magmaBursts(){return magmaBursts;},
  get SPECIES(){return SPECIES;},
  get vines(){return vines;},
  get fogY(){return fogY;}, set fogY(v){fogY=v;},
  get icicles(){return icicles;},
  get ENEMY_HP(){return ENEMY_HP;},
  isIce:()=>isIce(),
  get touchMode(){return touchMode;}, set touchMode(v){touchMode=v;},
  keyDown:(code)=>!!K[code],
  touchButtons:()=>touchButtons(),
  touchButtonAt:(x,y)=>touchButtonAt(x,y),
  touchPressAt:(pid,p)=>touchPressAt(pid,p),
  touchRelease:(pid)=>touchRelease(pid),
  drawTouchPad:()=>drawTouchPad(),
  assetURL:(n)=>assetURL(n),
  dropAllIcicles:()=>dropAllIcicles(),
  frozenBlocks:()=>frozenBlocks(),
  freezeSolid:(e)=>freezeSolid(e),
  shatterFrozen:(e)=>shatterFrozen(e),
  get FROZEN_SECONDS(){return FROZEN_SECONDS;},
  get FREEZE_TO_SOLID(){return FREEZE_TO_SOLID;},
  drawIcicles:()=>drawIcicles(),
  drawFog:()=>drawFog(),
  drawWind:()=>drawWind(),
  drawGlaze:()=>drawGlaze(),
  drawLowBars:()=>drawLowBars(),
  get SLIDE_TIME(){return SLIDE_TIME;},
  get SLIDE_SPD(){return SLIDE_SPD;},
  get CRACK_DELAY(){return CRACK_DELAY;},
  get CRACK_RESPAWN(){return CRACK_RESPAWN;},
  get LAVA_Y(){return LAVA_Y;},
  titanSlick:()=>titanSlick(),
  breathRay:()=>breathRay(),
  enterBossPhase2:()=>enterBossPhase2(),
  get BREATH_ARC(){return BREATH_ARC;},
  get BREATH_HALF_W(){return BREATH_HALF_W;},
  get BOSS_BREATH_REACH(){return BOSS_BREATH_REACH;},
  get RADIO_H(){return RADIO_H;},
  get windState(){return windState;}, set windState(v){windState=v;},
  get windDir(){return windDir;},     set windDir(v){windDir=v;},
  get windTimer(){return windTimer;}, set windTimer(v){windTimer=v;},
  updateWind:(dt)=>updateWind(dt),
  get vineGrab(){return vineGrab;}, set vineGrab(v){vineGrab=v;},
  get levelTime(){return levelTime;}, set levelTime(v){levelTime=v;},
  vineTipOf:(v)=>vineTip(v),
  get camY(){return camY;},
  get CRUMBLE_DELAY(){return CRUMBLE_DELAY;},
  get BOUNCE_VY(){return BOUNCE_VY;}, get BOUNCE_FUEL(){return BOUNCE_FUEL;},
  portalArtNow:()=>portalArtNow(),
  get GRAV(){return GRAV;}, get JUMP_VY(){return JUMP_VY;},
  get MOVE_SPD(){return MOVE_SPD;}, get FALL_GRAV_MULT(){return FALL_GRAV_MULT;},
  vineTip:(v)=>vineTip(v),
  drawVines:()=>drawVines(),
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
  get rescuedThisLevel(){return rescuedThisLevel;}, set rescuedThisLevel(v){rescuedThisLevel=v;},
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
  drawEvacPortal:(x,y)=>drawEvacPortal(x,y),
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
  get PLAYER_W(){return PLAYER_W;},
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
  get coins(){return coins;},
  drawHUD:()=>drawHUD(),
  get bank(){return bank;},
  get roster(){return roster;},
  deedForDelivered:(r)=>deedForDelivered(r),
  deedForLost:(r)=>deedForLost(r),
  recordDeed:(r)=>recordDeed(r), recordFallen:(r)=>recordFallen(r),
  wrapText:(t,w,f)=>wrapText(t,w,f),
  get FALLEN_KEPT(){return FALLEN_KEPT;},
  get broodTab(){return broodTab;}, setBroodTab:(i)=>setBroodTab(i),
  broodPages:()=>broodPages(), broodTabButton:(i)=>broodTabButton(i),
  get hitsThisLevel(){return hitsThisLevel;}, set hitsThisLevel(v){hitsThisLevel=v;},
  get lastLostName(){return lastLostName;}, set lastLostName(v){lastLostName=v;},
  get arsenal(){return arsenal;},
  get MASTERY_STEPS(){return MASTERY_STEPS;},
  get LOADOUT_AMMO_FRAC(){return LOADOUT_AMMO_FRAC;},
  masteryLevel:(k)=>masteryLevel(k), masteryTime:(k)=>masteryTime(k),
  masteryAmmoMult:(k)=>masteryAmmoMult(k),
  isUnlocked:(k)=>isUnlocked(k), addMastery:(k,dt)=>addMastery(k,dt),
  ammoFor:(k)=>ammoFor(k), setLoadout:(k)=>setLoadout(k),
  applyLoadout:()=>applyLoadout(), arsenalList:()=>arsenalList(),
  arsenalKinds:()=>arsenalKinds(),
  openArsenal:()=>openArsenal(), closeArsenal:()=>closeArsenal(),
  updateArsenal:(dt)=>updateArsenal(dt), drawArsenal:()=>drawArsenal(),
  arsenalRowAt:(x,y)=>arsenalRowAt(x,y),
  arsenalBackButton:()=>arsenalBackButton(),
  mapArsenalButton:()=>mapArsenalButton(),
  get armSel(){return armSel;}, set armSel(v){armSel=v;},
  get weaponAmmo(){return weaponAmmo;}, set weaponAmmo(v){weaponAmmo=v;},
  get arcSeen(){return arcSeen;},
  get ARC_BRIEF(){return ARC_BRIEF;}, get ARC_STAGE(){return ARC_STAGE;},
  get ARC_LOG(){return ARC_LOG;}, get ARC_DEBRIEF(){return ARC_DEBRIEF;},
  get ARC_COMMAND(){return ARC_COMMAND;}, get ARC_ARCHIVE(){return ARC_ARCHIVE;},
  arcBrief:()=>arcBrief(), arcLog:()=>arcLog(), arcDebrief:()=>arcDebrief(),
  arcEnding:()=>arcEnding(), arcFragments:()=>arcFragments(),
  arcFragmentsEver:()=>arcFragmentsEver(),
  get arcOpened(){return arcOpened;},
  get resetPrompt(){return resetPrompt;}, set resetPrompt(v){resetPrompt=v;},
  resetAll:()=>resetAll(), openResetPrompt:()=>openResetPrompt(),
  closeResetPrompt:()=>closeResetPrompt(), updateReset:(dt)=>updateReset(dt),
  drawResetPrompt:()=>drawResetPrompt(), drawResetButton:()=>drawResetButton(),
  mapResetButton:()=>mapResetButton(), resetYesButton:()=>resetYesButton(),
  resetNoButton:()=>resetNoButton(),
  get RESET_STORES(){return RESET_STORES;},
  get worldProgress(){return worldProgress;},
  get bestGrades(){return bestGrades;},
  get hiScore(){return hiScore;}, set hiScore(v){hiScore=v;},
  arcFragmentsTotal:()=>arcFragmentsTotal(),
  drawArcEnding:(y)=>drawArcEnding(y),
  get secretKey(){return secretKey;},
  get secretChest(){return secretChest;},
  get secretSeals(){return secretSeals;},
  get keyNoticeTimer(){return keyNoticeTimer;},
  get SECRET_SCORE(){return SECRET_SCORE;},
  keyHeld:()=>keyHeld(),
  hasSeal:(i)=>hasSeal(i),
  worldHasSeal:(i)=>worldHasSeal(i),
  worldHasSecret:(i)=>worldHasSecret(i),
  drawSecretKey:()=>drawSecretKey(),
  drawSecretChest:()=>drawSecretChest(),
  drawKeyNotice:()=>drawKeyNotice(),
  get score(){return score;}, set score(v){score=v;},
  get THEMES(){return THEMES;},
  themeOf:()=>themeOf(),
  drawBiomeBG:()=>drawBiomeBG(),
  drawAtmosphere:(TH)=>drawAtmosphere(TH),
  get BG_PARALLAX(){return BG_PARALLAX;},
  get camX(){return camX;}, set camX(v){camX=v;},
  get particles(){return particles;},
  get ROLES(){return ROLES;}, get ROLE_IDS(){return ROLE_IDS;},
  get HATCH_NAMES(){return HATCH_NAMES;},
  makeHatchling:(sp)=>makeHatchling(sp),
  enrolHatchling:(r,l)=>enrolHatchling(r,l),
  loseHatchling:(r)=>loseHatchling(r),
  broodTier:(id)=>broodTier(id),
  broodWeight:(id)=>broodWeight(id),
  rankForGrade:(l)=>rankForGrade(l),
  followerPower:()=>followerPower(),
  get lastEnrolled(){return lastEnrolled;}, set lastEnrolled(v){lastEnrolled=v;},
  get lastLostName(){return lastLostName;}, set lastLostName(v){lastLostName=v;},
  openBrood:()=>openBrood(), closeBrood:()=>closeBrood(),
  updateBrood:(dt)=>updateBrood(dt), drawBrood:()=>drawBrood(),
  broodBackButton:()=>broodBackButton(), mapBroodButton:()=>mapBroodButton(),
  panicFollower:(i)=>panicFollower(i),
  recaptureBaby:(b)=>recaptureBaby(b),
  loseBaby:(b,si)=>loseBaby(b,si),
  get UPGRADES(){return UPGRADES;},
  upgradeLevel:(id)=>upgradeLevel(id),
  upgradeCost:(id)=>upgradeCost(id),
  upgradeMax:(id)=>upgradeMax(id),
  canAfford:(id)=>canAfford(id),
  buyUpgrade:(id)=>buyUpgrade(id),
  maxHearts:()=>maxHearts(),
  jetUseMult:()=>jetUseMult(),
  jetRegenMult:()=>jetRegenMult(),
  maxContinues:()=>maxContinues(),
  salvageFrac:()=>salvageFrac(),
  collectRadius:()=>collectRadius(),
  openHangar:()=>openHangar(),
  closeHangar:()=>closeHangar(),
  updateHangar:(dt)=>updateHangar(dt),
  drawHangar:()=>drawHangar(),
  get hangarSel(){return hangarSel;}, set hangarSel(v){hangarSel=v;},
  hangarRowAt:(x,y)=>hangarRowAt(x,y),
  hangarBackButton:()=>hangarBackButton(),
  mapHangarButton:()=>mapHangarButton(),
  get BASE_HEARTS(){return BASE_HEARTS;},
  get MOVE_SPD(){return MOVE_SPD;},
  get runCoins(){return runCoins;}, set runCoins(v){runCoins=v;},
  get lastPayout(){return lastPayout;},
  earnCoins:(n)=>earnCoins(n),
  computePayout:(l)=>computePayout(l),
  bankStageClear:(l)=>bankStageClear(l),
  bankSalvage:()=>bankSalvage(),
  spendCoins:(n)=>spendCoins(n),
  get FIRST_CLEAR_BONUS(){return FIRST_CLEAR_BONUS;},
  get SALVAGE_FRAC(){return SALVAGE_FRAC;},
  get RESCUE_VALUE(){return RESCUE_VALUE;},
  get BROOD_BONUS(){return BROOD_BONUS;},
  get GRADE_MULT(){return GRADE_MULT;},
  get COIN_VALUE(){return COIN_VALUE;},
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
  // one script at a time, in order, exactly as the page loads them
  for(const sc of scripts){
    try{ vm.runInContext(sc.code,ctxObj,{filename:sc.name}); }
    catch(e){ throw new Error(sc.name+': '+e.message); }
  }
  // the accessor block goes last and reaches the shared lexical scope the
  // scripts built up between them
  vm.runInContext(accessor,ctxObj,{filename:'__accessor'});

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
  // a pointerdown at canvas coordinates, for the mission-select map
  function click(x,y){
    for(const fn of (listeners['pointerdown']||[])) fn({clientX:x,clientY:y});
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
  return {g,step,keys,click,sandbox,loadedImages,rafQueue,drawStats,
          store:sandbox.localStorage, artLoads:FIRE_ONLOAD};
}

function runSuite(){

// ── scenario 1: boot + free run ───────────────────────────────
{
  const {g,step}=run();
  check('entering a world starts it playing', g.STATE==='playing', g.STATE);
  check('stage-open transmission is on the air', !!g.radio && g.radioFired.start===true);
  check('opening transmission is the volcano briefing',
        !!g.radio && g.radio.lines[0].indexOf('Volkan')>=0, g.radio&&g.radio.lines[0]);
  check('...and it comes from Command', !!g.radio && g.radio.title==='KOMUTA MERKEZİ',
        g.radio&&g.radio.title);
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
  // this scenario runs with invuln at zero, so every other hazard on the
  // stage is a false failure waiting to happen
  for(const e of g.enemies) e.dead=true;
  for(const e of g.groundEnemies) e.dead=true;
  const quiet=()=>{ g.magmaBursts.length=0; g.lavaBalls.length=0; };
  const putWave=()=>{
    quiet();
    g.shockwaves.length=0;
    g.shockwaves.push({x:g.player.x+53/2, dir:1, life:0});
  };
  // grounded: it connects
  g.player.invuln=0; g.player.y=g.GROUND_Y-g.PLAYER_H; g.player.vy=0;
  for(let i=0;i<8;i++){ step(1); }   // settle onto the floor
  const hp1=g.player.hp;
  g.player.invuln=0;
  // re-placed every frame: onGround is only true on every other one, so a
  // wave that travels past in four frames can miss for the wrong reason
  for(let i=0;i<10 && g.player.hp===hp1;i++){
    quiet(); putWave(); g.player.invuln=0; step(1);
  }
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
    quiet();
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

// ── scenario 43: the camera learns to look up ────────────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.player.hp=99; g.player.invuln=999;
  step(20);
  check('a flat stage never lifts the view', Math.abs(g.camY)<0.5, g.camY);

  g.loadLevel(4);
  step(3);
  check('the climb declares a rise', (g.LEVELS[4].camRise||0)>0, g.LEVELS[4].camRise);
  // stay low: no lift
  for(let i=0;i<40;i++){ g.player.invuln=999; g.player.y=380; g.player.vy=0; step(1); }
  check('standing on the floor keeps the view down', g.camY<1, g.camY);
  // climb: the view follows
  for(let i=0;i<80;i++){ g.player.invuln=999; g.player.y=90; g.player.vy=0; step(1); }
  check('climbing lifts the view', g.camY>150, g.camY);
  check('...but never past the declared rise', g.camY<=g.LEVELS[4].camRise+0.001, g.camY);
  // and it comes back down on a flat stage
  g.loadLevel(3);
  step(3);
  for(let i=0;i<60;i++){ g.player.invuln=999; step(1); }
  check('leaving the climb settles the view', Math.abs(g.camY)<1, g.camY);
}

// ── scenario 44: swinging on a vine ──────────────────────────
{
  const {g,step,keys}=run({map:true});
  g.startWorld(0);
  g.loadLevel(4);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  check('the climb hangs vines', g.vines.length>=2, g.vines.length);
  check('nothing is held to start with', g.vineGrab===null);

  // brush past a tip in mid-air
  const v=g.vines[0];
  for(let i=0;i<30 && !g.vineGrab;i++){
    const tip=g.vineTip(v);
    g.player.invuln=999; g.player.hp=99;
    g.player.x=tip.x-53/2; g.player.y=tip.y-60*0.35;
    g.player.vy=40; g.player.onGround=false;
    step(1);
  }
  check('touching a tip in mid-air grabs it', g.vineGrab===v, !!g.vineGrab);

  // It swings, and the dino rides it rather than falling. Start from a known
  // rest position: from a random angle the pendulum can swing out and back to
  // where it began inside the sample window, which read as "no movement".
  v.ang=0; v.angVel=0;
  const ang0=v.ang;
  keys({ArrowRight:true});
  for(let i=0;i<30;i++){ g.player.invuln=999; step(1); }
  keys({ArrowRight:false});
  check('pumping swings it the way you pushed', v.ang>ang0+0.05,
        ang0.toFixed(3)+' -> '+v.ang.toFixed(3));
  const tipNow=g.vineTip(v);
  check('the dino hangs on the tip',
        Math.abs((g.player.x+53/2)-tipNow.x)<1.5, g.player.x+53/2-tipNow.x);
  check('gravity is suspended while hanging', g.player.vy===0, g.player.vy);

  // Jump lets go, and the swing becomes real speed. Measure the TRANSFER,
  // not just "some velocity": an OR against the release boost passed even
  // with the horizontal tangent zeroed out.
  //
  // Move the vine over open air and give it a known swing first. Released
  // beside a shelf the dino lands in it on the same frame and the collision
  // resolver zeroes vx — which made this read 0 at random.
  v.x=200; v.y=120; v.len=150;
  step(1);
  v.ang=0.35; v.angVel=2.0;
  const expectVx=Math.cos(v.ang)*v.angVel*v.len;
  check('the swing had real speed to give', Math.abs(expectVx)>20,
        expectVx.toFixed(1));
  keys({Space:true});
  step(1);
  check('jump releases the vine', g.vineGrab===null);
  // the release happens after one more frame of pendulum integration, so the
  // tangent is a little damped by then — check direction and magnitude, not
  // an exact match
  check('...carrying the swing out as horizontal speed',
        Math.sign(g.player.vx)===Math.sign(expectVx) &&
        Math.abs(g.player.vx)>Math.abs(expectVx)*0.6,
        'got '+g.player.vx.toFixed(1)+' from '+expectVx.toFixed(1));
  check('...with a little lift on top', g.player.vy<0, g.player.vy.toFixed(1));
  // and you cannot instantly re-grab the one you just left
  const tip2=g.vineTip(v);
  g.player.x=tip2.x-26; g.player.y=tip2.y-21; g.player.onGround=false;
  step(1);
  check('there is a beat before you can grab again', g.vineGrab===null);
  keys({Space:false});
  g.drawVines();
  check('vines render', true);
}

// ── scenario 45: mushroom shelves give way ───────────────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.loadLevel(4);
  g.player.hp=99;
  step(3);
  const shelf=g.platforms.filter(p=>p.crumble)[0];
  check('the climb has crumbling shelves', !!shelf);
  check('a fresh shelf is solid', !shelf.gone && shelf.crumbleT===undefined);

  // stand on it
  g.player.invuln=999;
  g.player.x=shelf.x+shelf.w/2-26;
  g.player.y=shelf.y-g.PLAYER_H-6;
  g.player.vy=60;
  for(let i=0;i<10 && shelf.crumbleT===undefined;i++){ g.player.invuln=999; step(1); }
  check('standing on it starts the countdown', shelf.crumbleT!==undefined,
        shelf.crumbleT);
  for(let i=0;i<60 && !shelf.gone;i++){ g.player.invuln=999; step(1); }
  check('it gives way', shelf.gone===true);

  // while gone it is not there to stand on
  g.player.x=shelf.x+shelf.w/2-26;
  g.player.y=shelf.y-g.PLAYER_H-4;
  g.player.vy=120;
  for(let i=0;i<4;i++){ g.player.invuln=999; step(1); }
  check('a dropped shelf cannot be landed on', g.player.y>shelf.y-g.PLAYER_H,
        g.player.y+' vs '+(shelf.y-g.PLAYER_H));

  // ...and it grows back
  g.player.x=60; g.player.y=340;
  for(let i=0;i<260 && shelf.gone;i++){ g.player.invuln=999; g.player.x=60; step(1); }
  check('it grows back', shelf.gone===false);
}

// ── scenario 46: bouncy caps ─────────────────────────────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.loadLevel(4);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  const cap=g.platforms.filter(p=>p.bounce)[0];
  check('the climb has a bouncy cap', !!cap);
  g.player.x=cap.x+cap.w/2-26;
  g.player.y=cap.y-g.PLAYER_H-6;
  g.player.vy=200;
  let launched=false;
  for(let i=0;i<8 && !launched;i++){
    g.player.invuln=999; step(1);
    if(g.player.vy<-400) launched=true;
  }
  check('landing on it throws you back up', launched, g.player.vy.toFixed(0));
  check('...and you never stand on it', g.player.onGround===false);
}

// ── scenario 47: the canopy is two stages now ────────────────
{
  const {g,step}=run({map:true});
  check('the canopy runs three stages', g.WORLDS[1].levels.length===3,
        g.WORLDS[1].levels.join(','));
  check('the queen is saved for last',
        g.WORLDS[1].levels[g.WORLDS[1].levels.length-1]===4,
        g.WORLDS[1].levels.join(','));
  g.startWorld(0);
  g.loadLevel(4);
  step(3);
  check('the climb is a forest stage', g.isForest()===true);
  g.player.hp=99; g.player.invuln=999;
  for(let i=0;i<30;i++){ g.player.invuln=999; step(1); }
  g.drawBG(); g.drawPlatforms(); g.drawVines();
  check('the climb renders', true);
}

// ── scenario 48: the Canopy Queen ────────────────────────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.loadLevel(4);
  step(3);
  check('the climb is guarded', !!g.boss, !!g.boss);
  check('...by the Canopy Queen', g.boss.name==='KANOPİ KRALİÇESİ', g.boss&&g.boss.name);
  check('...with her own art', g.boss.art==='boss_forest.png', g.boss&&g.boss.art);
  check('she is the toughest of the four', g.boss.maxHp===14, g.boss.maxHp);
  check('the climb rift is sealed until she falls', g.gateOpen===false);
  check('she can call a swarm', g.boss.summons==='forest_flyer', g.boss.summons);
  g.drawBoss();
  check('the queen renders', true);
}

// ── scenario 49: she calls the swarm once ────────────────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.loadLevel(4);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  const before=g.enemies.length;
  g.boss.introState='active';
  g.boss.hp=Math.floor(g.boss.maxHp/2);
  for(let i=0;i<6;i++){ g.player.invuln=999; step(1); }
  check('half health flips her', g.boss.phase===2, g.boss.phase);
  check('...and brings friends', g.enemies.length>before,
        before+' -> '+g.enemies.length);
  check('the swarm is her own species',
        g.enemies.slice(before).every(e=>e.species==='forest_flyer'));
  // she does not keep calling them
  const after=g.enemies.length;
  for(let i=0;i<120;i++){ g.player.invuln=999; g.player.hp=99; step(1); }
  const stillAlive=g.enemies.length;
  check('the swarm is called once, not every frame', stillAlive===after,
        after+' -> '+stillAlive);
}

// ── scenario 50: the rising rot ──────────────────────────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.player.hp=99; g.player.invuln=999;
  step(10);
  check('an ordinary stage has no tide', !isFinite(g.fogY), g.fogY);

  g.loadLevel(5);
  step(3);
  check('rotwood declares a tide', isFinite(g.fogY), g.fogY);
  const start=g.fogY;
  for(let i=0;i<120;i++){ g.player.invuln=999; g.player.y=140; g.player.vy=0; step(1); }
  check('it climbs', g.fogY<start, start+' -> '+g.fogY.toFixed(0));
  g.drawFog();
  check('the tide renders', true);

  // It stops at the declared ceiling rather than swallowing the whole stage.
  // Waiting out the full rise would add forty seconds of simulation, so put
  // it just under the ceiling and check that it clamps instead of passing it.
  g.fogY=g.LEVELS[5].fog.topY+5;
  for(let i=0;i<60;i++){ g.player.invuln=999; g.player.y=100; g.player.vy=0; step(1); }
  check('it stops at the declared ceiling',
        Math.abs(g.fogY-g.LEVELS[5].fog.topY)<0.001, g.fogY);

  // standing in it burns
  g.player.invuln=0; g.player.hp=9;
  g.player.y=g.fogY+40; g.player.vy=0;
  const hp0=g.player.hp;
  for(let i=0;i<10 && g.player.hp===hp0;i++){
    g.player.invuln=0; g.player.y=g.fogY+40; step(1);
  }
  check('standing in the rot burns', g.player.hp<hp0, hp0+' -> '+g.player.hp);
}

// ── scenario 51: the vine curtain is a locked door ───────────
{
  const {g,step,keys}=run({map:true});
  g.startWorld(0);
  g.loadLevel(5);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  // Clear the stage's weapon capsules first: a beam COLLECTS a pickup it
  // sweeps, and the seed capsule sitting behind the curtain was quietly
  // swapping the weapon out from under this scenario.
  for(const wp of g.weaponPickups) wp.alive=false;
  const curtain=g.platforms.filter(p=>p.curtain)[0];
  check('rotwood hangs a curtain', !!curtain);
  check('it starts solid', curtain.gone!==true);

  // it is a wall: walking into it does not get you through
  g.player.x=curtain.x-53-4;
  g.player.y=curtain.y+curtain.h-60;
  keys({ArrowRight:true});
  for(let i=0;i<40;i++){ g.player.invuln=999; g.player.y=curtain.y+curtain.h-60; step(1); }
  keys({ArrowRight:false});
  check('a curtain blocks the way', g.player.x<curtain.x+1,
        g.player.x.toFixed(1)+' vs '+curtain.x);

  // the wrong weapon will not clear it
  g.equipWeapon('spread'); g.weaponAmmo=99;
  g.player.x=curtain.x-120; g.player.y=curtain.y+curtain.h/2; g.player.facing=1;
  keys({KeyF:true});
  for(let i=0;i<60;i++){
    g.player.invuln=999; g.player.facing=1;
    g.player.x=curtain.x-120; g.player.y=curtain.y+curtain.h/2-24;
    step(1);
  }
  check('the beam does not burn it', curtain.gone!==true, curtain.burnT);

  // FLAME does
  g.equipWeapon('flame'); g.weaponAmmo=99;
  for(let i=0;i<120 && !curtain.gone;i++){
    g.player.invuln=999; g.player.facing=1;
    g.player.x=curtain.x-110; g.player.y=curtain.y+curtain.h/2-24;
    g.weaponAmmo=99;
    step(1);
  }
  keys({KeyF:false});
  check('FLAME burns it away', curtain.gone===true, curtain.burnT);
  check('and a burned curtain stays burned', curtain.respawnT===Infinity,
        curtain.respawnT);
  g.drawPlatforms();
  check('curtains render', true);
}

// ── scenario 52: the seismic seed ────────────────────────────
{
  const {g,step,keys}=run({map:true});
  g.startWorld(0);
  g.loadLevel(5);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  check('the canopy stocks its own letter', !!g.WEAPONS.seed, Object.keys(g.WEAPONS).join(','));
  check('it is T for tohum', g.WEAPONS.seed.letter==='T', g.WEAPONS.seed.letter);
  g.equipWeapon('seed'); g.weaponAmmo=99;
  check('equipping it takes', g.weapon==='seed', g.weapon);
  g.playerBombs.length=0;
  keys({KeyF:true});
  for(let i=0;i<40 && g.playerBombs.length===0;i++){ g.player.invuln=999; step(1); }
  keys({KeyF:false});
  check('it lobs seeds', g.playerBombs.length>0, g.playerBombs.length);
  check('a seed arcs rather than flying flat',
        g.playerBombs.every(b=>b.seed===true && !b.straight));
  check('...and is thrown upward first', g.playerBombs[0].vy<0,
        g.playerBombs[0].vy);
  check('no beam while seeding', g.laser===null);
}

// ── scenario 53: a shelf takes its passengers down ───────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.loadLevel(5);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  const shelf=g.platforms.filter(p=>p.crumble)[0];
  const rider=g.groundEnemies.filter(e=>!e.turret&&!e.dead)[0];
  check('there is a shelf and something to stand on it', !!shelf && !!rider);
  // park the crawler on the shelf and drop it
  rider.x=shelf.x+10; rider.y=shelf.y-rider.h;
  rider.patrolMin=shelf.x; rider.patrolMax=shelf.x+shelf.w-rider.w;
  rider.vx=0;
  shelf.crumbleT=0.02;
  for(let i=0;i<12 && !shelf.gone;i++){
    rider.x=shelf.x+10; rider.y=shelf.y-rider.h;
    g.player.invuln=999; step(1);
  }
  check('the shelf drops', shelf.gone===true);
  check('its passenger goes down with it', rider.dying===true||rider.dead===true,
        'dying='+rider.dying+' dead='+rider.dead);
}

// ── scenario 54: every stage's geometry is reachable ─────────
{
  const {g,step}=run({map:true});
  const GRAV=g.GRAV, MOVE=g.MOVE_SPD, FALL=g.FALL_GRAV_MULT;
  const riseOf=v=>(v*v)/(2*GRAV);
  const jumpUp=riseOf(g.JUMP_VY);
  const bounceUp=riseOf(g.BOUNCE_VY);
  // how far a level jump carries you: up under gravity, down under the
  // heavier falling gravity, times the run speed
  const jumpAcross=(Math.abs(g.JUMP_VY)/GRAV+Math.sqrt(2*jumpUp/(GRAV*FALL)))*MOVE;
  check('a plain jump clears about a hundred pixels', jumpUp>80 && jumpUp<130,
        jumpUp.toFixed(0));
  check('a bounce clears far more than a jump', bounceUp>jumpUp*2,
        bounceUp.toFixed(0)+' vs '+jumpUp.toFixed(0));

  let caps=0, blind=0, pointless=0, blindWhere='', pointlessWhere='';
  for(let li=0;li<g.LEVELS.length;li++){
    const plats=g.LEVELS[li].platforms;
    for(const c of plats){
      if(!c.bounce) continue;
      caps++;
      const apex=c.y-bounceUp;
      // 1. clear sky: nothing may hang in the column the bounce rises through,
      //    or the dino cracks its head on the underside and goes nowhere
      const bonk=plats.filter(p=>p!==c && p.x<c.x+c.w && p.x+p.w>c.x &&
                                 p.y<c.y && p.y>apex);
      if(bonk.length){ blind++; blindWhere+=' L'+li+'@x'+c.x; }
      // 2. somewhere to land: a ledge inside the arc and within drift reach
      const land=plats.filter(p=>p!==c && !p.lavaPit && p.y<c.y-40 && p.y>=apex)
        .filter(p=>Math.max(0,Math.max(c.x-(p.x+p.w),p.x-(c.x+c.w)))<=200);
      if(!land.length){ pointless++; pointlessWhere+=' L'+li+'@x'+c.x; }
    }
  }
  check('the stages field bouncy caps', caps>0, caps);
  check('no cap fires into the underside of a shelf', blind===0, blindWhere||'clear');
  check('every cap has a ledge to land on', pointless===0, pointlessWhere||'ok');

  // Every stage, not just the climb: a ledge nobody can reach is a level
  // bug in any biome, and the check costs nothing to run across the table.
  const JETPACK_UP=300, JETPACK_ACROSS=260;
  const unreachable=[];
  for(let li=0;li<g.LEVELS.length;li++){
    const L=g.LEVELS[li];
    const vs=L.vines||[];
    const cs=L.platforms.filter(p=>p.bounce);
    for(const hi of L.platforms){
      if(hi.lavaPit||hi.bounce||hi.goal||hi.curtain) continue;
      if(hi.y>=g.GROUND_Y) continue;                 // the floor itself
      const below=L.platforms.filter(p=>p!==hi&&!p.lavaPit&&p.y>hi.y);
      const near=(p,q)=>Math.max(0,Math.max(q.x-(p.x+p.w),p.x-(q.x+q.w)));
      // The jetpack is always available and its fuel regenerates, so the
      // honest ceiling for "can you get there at all" is the pack's climb,
      // not a plain jump. Holding thrust rises at roughly 320px/s for about
      // 1.8s of fuel; 300px of lift is a conservative bound. Measuring
      // against the jump alone flagged eleven ledges across stages that have
      // always been perfectly playable.
      const byJump=below.some(p=>(p.y-hi.y)<=JETPACK_UP&&near(p,hi)<=JETPACK_ACROSS);
      const byBounce=cs.some(c=>c.y>hi.y&&c.y-bounceUp<=hi.y&&near(c,hi)<=200);
      const byVine=vs.some(v=>(v.y+(v.len||130))>hi.y&&
                              Math.abs(v.x-(hi.x+hi.w/2))<=160);
      if(!byJump&&!byBounce&&!byVine) unreachable.push('L'+li+' y'+hi.y+'@x'+hi.x);
    }
  }
  check('no stage hides an unreachable ledge', unreachable.length===0,
        unreachable.join(' ')||'all stages fine');

  // the climb's rungs have to be climbable without burning jetpack fuel on
  // every single one, and any gap wider than a jump must have a vine over it
  const climb=g.LEVELS[4];
  const rungs=climb.platforms
    .filter(p=>p.y<400 && !p.bounce && !p.lavaPit && !p.goal)
    .sort((a,b)=>b.y-a.y);
  check('the climb has a real staircase', rungs.length>=5, rungs.length);

  // For each rung, ask whether anything BELOW it could plausibly put you
  // there: a plain jump from a nearby ledge, a bounce cap whose arc clears
  // it, or a vine hanging close enough to swing onto it. Walking a y-sorted
  // list pairwise looked equivalent and was not — a rung moved to the far
  // side of the map still borrowed a vine from the pair it landed next to.
  const vines=climb.vines||[];
  const capList=climb.platforms.filter(p=>p.bounce);
  const apart=(p,q)=>Math.max(0,Math.max(q.x-(p.x+p.w),p.x-(q.x+q.w)));
  const stranded=[];
  for(const hi of rungs){
    const below=climb.platforms.filter(p=>p!==hi && !p.lavaPit && p.y>hi.y);
    const byJump=below.some(p=>(p.y-hi.y)<=jumpUp && apart(p,hi)<=jumpAcross);
    const byBounce=capList.some(c=>c.y>hi.y && c.y-bounceUp<=hi.y && apart(c,hi)<=200);
    // a swing lands within roughly half the screen of the vine it left
    const byVine=vines.some(v=>(v.y+(v.len||130))>hi.y &&
                               Math.abs(v.x-(hi.x+hi.w/2))<=160);
    if(!byJump&&!byBounce&&!byVine) stranded.push('y'+hi.y+'@x'+hi.x);
  }
  check('every rung can be arrived at from below',
        stranded.length===0, stranded.join(' ')||'all reachable');
}

// ── scenario 55: hanging on a vine refuels the pack ──────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.loadLevel(4);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  const v=g.vines[0];
  for(let i=0;i<30 && !g.vineGrab;i++){
    const tip=g.vineTip(v);
    g.player.invuln=999; g.player.hp=99;
    g.player.x=tip.x-53/2; g.player.y=tip.y-60*0.35;
    g.player.vy=40; g.player.onGround=false;
    step(1);
  }
  check('hanging on', g.vineGrab===v, !!g.vineGrab);
  // the pack is nearly dry
  g.player.jetFuel=0.05;
  const before=g.player.jetFuel;
  for(let i=0;i<60;i++){ g.player.invuln=999; step(1); }
  check('the pack refuels while you swing', g.player.jetFuel>before+0.2,
        before+' -> '+g.player.jetFuel.toFixed(2));
  check('...and never past full', g.player.jetFuel<=1.0001, g.player.jetFuel);
}

// ── scenario 56: a bounce tops the pack up ───────────────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.loadLevel(4);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  const cap=g.platforms.filter(p=>p.bounce)[0];
  g.player.jetFuel=0.05;
  const before=g.player.jetFuel;
  g.player.x=cap.x+cap.w/2-26;
  g.player.y=cap.y-g.PLAYER_H-6;
  g.player.vy=200;
  let launched=false;
  for(let i=0;i<8 && !launched;i++){
    g.player.invuln=999; step(1);
    if(g.player.vy<-400) launched=true;
  }
  check('the cap launched', launched, g.player.vy.toFixed(0));
  // a single frame of contact must hand over a real slug, not a dt trickle
  check('a bounce hands over a slug of fuel',
        g.player.jetFuel>before+g.BOUNCE_FUEL*0.8,
        before+' -> '+g.player.jetFuel.toFixed(2)+' (slug '+g.BOUNCE_FUEL+')');
  check('...and never past full', g.player.jetFuel<=1.0001, g.player.jetFuel);
}

// ── scenario 57: the canopy has its own rift ─────────────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  step(3);
  check('the volcano uses the default vortex', !g.themeOf().portalArt,
        String(g.themeOf().portalArt));
  const vArt=g.portalArtNow();
  if(FIRE_ONLOAD){
    check('...and it spins', vArt && vArt.spin===true, vArt&&vArt.spin);
  }

  g.loadLevel(3);
  step(3);
  check('the canopy names its own rift',
        g.themeOf().portalArt==='forest_portal.png', g.themeOf().portalArt);
  const fArt=g.portalArtNow();
  if(FIRE_ONLOAD){
    check('the canopy rift is loaded', !!fArt, !!fArt);
    check('a built gate is flagged not to spin', fArt && fArt.spin===false, fArt&&fArt.spin);
    check('the two biomes draw different art', fArt.img!==vArt.img);
    // ...and it really does stand still. The flag alone is data; the rotate
    // call is the behaviour, so watch the transform.
    g.gateOpen=true;
    for(let i=0;i<80;i++){ g.player.invuln=999; g.player.hp=99; step(1); }
    drawStats.rotations.length=0;
    g.drawEvacPortal(400,300);
    const forestSpin=drawStats.rotations.filter(a=>Math.abs(a)>0.001);
    check('the stone gate is never rotated', forestSpin.length===0,
          forestSpin.map(a=>a.toFixed(2)).join(','));
    g.loadLevel(2);
    for(let i=0;i<10;i++) step(1);
    g.gateOpen=true;
    for(let i=0;i<80;i++){ g.player.invuln=999; g.player.hp=99; step(1); }
    drawStats.rotations.length=0;
    g.drawEvacPortal(400,300);
    const lavaSpin=drawStats.rotations.filter(a=>Math.abs(a)>0.001);
    check('the free vortex still spins', lavaSpin.length>0,
          lavaSpin.map(a=>a.toFixed(2)).join(','));
  } else {
    // with no sheets at all the arch has to carry the screen
    check('a missing rift sheet falls back to the arch, not to the wrong one',
          fArt===null, String(fArt));
  }
  g.gateOpen=true;
  for(let i=0;i<80;i++){ g.player.invuln=999; g.player.hp=99; step(1); }
  g.camX=0;
  g.drawPlatforms();
  check('the canopy exit renders', true);
}

// ── scenario 58: Frozen Peaks joins the map ──────────────────
{
  const {g,step}=run({map:true});
  const peaks=g.WORLDS[2].levels;
  check('frozen peaks is three stages deep', peaks.length===3, peaks.join(','));
  check('...all of them ice',
        peaks.every(i=>g.LEVELS[i].theme==='ice'),
        peaks.map(i=>g.LEVELS[i].theme).join(','));
  check('...and the Titan is the LAST of them, not the first',
        g.LEVELS[peaks[peaks.length-1]].boss!==null &&
        peaks.slice(0,-1).every(i=>g.LEVELS[i].boss===null),
        peaks.map(i=>g.LEVELS[i].boss?'boss':'-').join(','));
  check('it is still locked at the start', g.worldState(2).unlocked===false);
  // clearing the canopy is what opens it
  g.startWorld(0); g.finishWorld();        // volcano
  g.startWorld(1); g.finishWorld();        // canopy
  check('clearing the canopy unlocks the peaks', g.worldState(2).playable===true);
  check('...and the final crater stays shut', g.worldState(3).unlocked===false);
  check('the unlock is persisted', (g.worldProgress.frozen||{}).unlocked===true,
        JSON.stringify(g.worldProgress.frozen));
  check('the peaks can be started', g.startWorld(2)===true);
  check('...which loads the ice stage first', g.isIce()===true && g.levelIndex===7,
        g.levelIndex);
}

// ── scenario 59: ice takes your grip away ────────────────────
{
  const {g,step}=run({map:true});
  // enter a world first — loadLevel alone leaves STATE on the map screen,
  // where update() returns early and nothing moves at all
  g.startWorld(0);
  const slideOn=(level)=>{
    g.loadLevel(level);
    g.player.hp=99; g.player.invuln=999;
    step(5);
    const floor=g.platforms.filter(p=>!p.lavaPit&&!p.goal&&p.y===g.GROUND_Y)[0];
    g.player.x=floor.x+200; g.player.y=floor.y-g.PLAYER_H; g.player.vy=0;
    for(let i=0;i<12;i++){ g.player.invuln=999; step(1); }   // settle
    g.player.vx=200;
    for(let i=0;i<14;i++){ g.player.invuln=999; step(1); }   // coast, no input
    return Math.abs(g.player.vx);
  };
  const rock=slideOn(0);
  const ice=slideOn(6);
  check('rock sheds most of your speed in a quarter second', rock<120, rock.toFixed(1));
  check('ice barely slows you at all', ice>160, ice.toFixed(1));
  check('ice is markedly slipperier than rock', ice>rock*1.5,
        'ice '+ice.toFixed(1)+' vs rock '+rock.toFixed(1));
}

// ── scenario 60: a chill round slows you ─────────────────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.loadLevel(6);
  g.player.hp=99;
  step(5);
  check('nothing is chilled to start with', g.player.chilled<=0, g.player.chilled);
  g.player.invuln=0;
  g.lavaBalls.length=0;
  g.lavaBalls.push({x:g.player.x+53/2, y:g.player.y+30, vx:0, vy:0,
                    life:0, acid:true, chill:true});
  for(let i=0;i<5 && g.player.chilled<=0;i++){ step(1); }
  check('a chill round freezes your footing', g.player.chilled>0, g.player.chilled);
  check('...and it wears off', true);
  const before=g.player.chilled;
  step(12);
  check('the chill counts down', g.player.chilled<before,
        before.toFixed(2)+' -> '+g.player.chilled.toFixed(2));
  g.drawLavaBalls();
  check('chill rounds render', true);
}

// ── scenario 61: the loaded ceiling ──────────────────────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.loadLevel(6);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  check('the summit hangs icicles', g.icicles.length>=4, g.icicles.length);
  check('they start hanging', g.icicles.every(i=>i.state==='hang'));
  const ic=g.icicles[0];
  // walk underneath it
  const seen={};
  for(let i=0;i<220 && ic.state!=='gone';i++){
    g.player.invuln=999; g.player.hp=99;
    g.player.x=ic.x-53/2; g.player.y=380; g.player.vy=0;
    step(1);
    seen[ic.state]=true;
  }
  check('walking under one warns you first', !!seen.shake, Object.keys(seen).join(','));
  check('...then it drops', !!seen.fall, Object.keys(seen).join(','));
  check('...and shatters', ic.state==='gone', ic.state);
  g.drawIcicles();
  check('icicles render', true);
  // and it grows back
  for(let i=0;i<500 && ic.state==='gone';i++){
    g.player.invuln=999; g.player.hp=99; g.player.x=60; step(1);
  }
  check('the ceiling reloads', ic.state==='hang', ic.state);
}

// ── scenario 62: the Titan brings the ceiling down ───────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.loadLevel(6);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  check('the summit is guarded', !!g.boss && g.boss.name==='BUZUL TİTANI',
        g.boss&&g.boss.name);
  check('the Titan is the toughest boss yet', g.boss.maxHp===15, g.boss.maxHp);
  check('it fights on the floor', g.boss.kind==='titan', g.boss.kind);

  const hanging=g.icicles.filter(i=>i.state==='hang').length;
  const dropped=g.dropAllIcicles();
  check('a slam arms every icicle at once', dropped===hanging && hanging>0,
        dropped+' of '+hanging);
  check('...and none are left hanging',
        g.icicles.filter(i=>i.state==='hang').length===0);

  // the breath cycles: wind up, blow, stop
  g.boss.introState='active';
  g.boss.breathCooldown=0.01;
  const phases={};
  for(let i=0;i<220;i++){
    g.player.invuln=999; g.player.hp=99;
    g.player.x=g.boss.x-200; g.player.y=380;
    step(1);
    phases[g.boss.breathState]=true;
  }
  check('the breath winds up before it blows', !!phases.wind, Object.keys(phases).join(','));
  check('...and then blows', !!phases.blow, Object.keys(phases).join(','));
  check('a titan stays on the floor',
        Math.abs(g.boss.y-(g.GROUND_Y-g.boss.h/2))<1, g.boss.y);
  g.drawBoss();
  check('the Titan renders', true);
}

// ── scenario 63: the ice roster ──────────────────────────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.loadLevel(6);
  step(3);
  check('sentries patrol the summit',
        g.enemies.length>0 && g.enemies.every(e=>e.species==='ice_flyer'),
        g.enemies.map(e=>e.species).join(','));
  check('a sentry dies in two hits', g.enemies.every(e=>e.maxHp===2),
        g.enemies.map(e=>e.maxHp).join(','));
  const crushers=g.groundEnemies.filter(e=>e.species==='ice_crusher');
  check('crushers hold the ledges', crushers.length>=2, crushers.length);
  check('a crusher takes four', crushers.every(e=>e.maxHp===4),
        crushers.map(e=>e.maxHp).join(','));
  check('and it is armoured from the front', crushers.every(e=>e.shield===true));
  g.drawPtero(g.enemies[0]);
  g.drawGroundEnemy(crushers[0]);
  check('the ice roster renders', true);
}

// ── scenario 64: the frozen hostage needs fire ───────────────
{
  const {g,step,keys}=run({map:true});
  g.startWorld(0);
  g.loadLevel(6);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  for(const wp of g.weaponPickups) wp.alive=false;
  check('the summit holds one hostage', g.cages.length===1, g.cages.length);
  check('...and it is frozen in', g.cages[0].species==='frozen', g.cages[0].species);
  const cage=g.cages[0];
  const aim=()=>{
    g.player.invuln=999; g.player.facing=1;
    g.player.x=cage.x-120; g.player.y=cage.y-24;
    g.player.vx=0; g.player.vy=0;
  };
  // the plasma beam is useless against a block of ice
  g.equipWeapon('spread'); g.weaponAmmo=99;
  keys({KeyF:true});
  for(let i=0;i<80;i++){ aim(); g.weaponAmmo=99; step(1); }
  check('a beam will not melt it', cage.alive===true && g.followers.length===0,
        'hp='+cage.hp.toFixed(2));
  // FLAME does
  g.equipWeapon('flame'); g.weaponAmmo=99;
  for(let i=0;i<200 && cage.alive;i++){ aim(); g.weaponAmmo=99; step(1); }
  keys({KeyF:false});
  check('FLAME melts it out', cage.alive===false, cage.alive);
  check('the hostage joins the train', g.followers.length===1, g.followers.length);
  check('a thawed hatchling runs as an ordinary baby',
        g.followers[0].species==='baby', g.followers[0].species);
  check('the stage tally reads one of one',
        g.rescuedThisLevel===1 && g.LEVELS[6].cages.length===1,
        g.rescuedThisLevel+'/'+g.LEVELS[6].cages.length);
}

// ── scenario 65: picking a destination with the mouse ────────
{
  const {g,step,click}=run({map:true});
  check('on the map', g.STATE==='map', g.STATE);
  // A locked node that DOES own stages is the real test: clicking the empty
  // crater proves nothing, because startWorld refuses a world with no levels
  // whether or not the lock is checked.
  const lockedWithStages=g.WORLDS[2];
  check('the peaks are locked but do own a stage',
        !g.worldState(2).unlocked && lockedWithStages.levels.length>0);
  click(lockedWithStages.mx*900, lockedWithStages.my*506);
  check('clicking a locked node does nothing', g.STATE==='map', g.STATE);
  const empty=g.WORLDS[3];
  click(empty.mx*900, empty.my*506);
  check('clicking a node with no stages does nothing', g.STATE==='map', g.STATE);
  // empty space does nothing either
  click(10,10);
  check('clicking empty space does nothing', g.STATE==='map', g.STATE);
  // the open one starts
  const open=g.WORLDS[0];
  click(open.mx*900, open.my*506);
  check('clicking an open node starts it', g.STATE==='playing', g.STATE);
  check('...and it is the one that was clicked', g.worldIndex===0, g.worldIndex);
}

// ── scenario 66: the on-screen pad ───────────────────────────
{
  const {g,step}=run({map:true});
  g.touchMode=true;
  g.startWorld(0);
  step(3);
  const btns=g.touchButtons();
  check('the pad has a full set of controls', btns.length===6, btns.length);
  const ids=btns.map(b=>b.id).sort().join(',');
  check('...left, right, jump, fire, dash and slide',
        ids==='DASH,FIRE,JUMP,LEFT,RIGHT,SLIDE', ids);
  check('every button sits inside the canvas',
        btns.every(b=>b.x-b.r>=0&&b.x+b.r<=900&&b.y-b.r>=0&&b.y+b.r<=506));
  // no two buttons may overlap, or a thumb lands on both
  let overlap='';
  for(let i=0;i<btns.length;i++) for(let j=i+1;j<btns.length;j++){
    const a=btns[i],b=btns[j];
    if(Math.hypot(a.x-b.x,a.y-b.y) < a.r+b.r) overlap+=' '+a.id+'/'+b.id;
  }
  check('no two buttons overlap', overlap==='', overlap);

  // pressing one sets the very same key the keyboard would
  const right=btns.find(b=>b.id==='RIGHT');
  check('a press lands on the right button',
        g.touchButtonAt(right.x,right.y).id==='RIGHT');
  check('empty space is not a button', g.touchButtonAt(450,40)===null);
  g.touchPressAt(1,{x:right.x,y:right.y});
  check('holding RIGHT is holding the arrow key', g.keyDown('ArrowRight')===true);
  // and it actually moves the dino
  const x0=g.player.x;
  for(let i=0;i<20;i++){ g.player.invuln=999; step(1); }
  check('...and the dino runs', g.player.x>x0+5, (g.player.x-x0).toFixed(1));
  g.touchRelease(1);
  check('letting go releases the key', g.keyDown('ArrowRight')===false);

  // two thumbs at once: run and jump
  const jump=btns.find(b=>b.id==='JUMP');
  g.touchPressAt(1,{x:right.x,y:right.y});
  g.touchPressAt(2,{x:jump.x,y:jump.y});
  check('two fingers hold two keys',
        g.keyDown('ArrowRight')&&g.keyDown('Space'));
  g.touchRelease(2);
  check('releasing one leaves the other held',
        g.keyDown('ArrowRight')&&!g.keyDown('Space'));
  // sliding a thumb from one button to another hands the key over
  g.touchPressAt(1,{x:jump.x,y:jump.y});
  check('sliding between buttons swaps the key',
        !g.keyDown('ArrowRight')&&g.keyDown('Space'));
  g.touchRelease(1);

  g.drawTouchPad();
  check('the pad renders', true);
}

// ── scenario 67: the pad knows when to stay out of the way ───
{
  const {g,step,drawStats}=run({map:true});
  g.touchMode=true;
  // on the map the pad must not be drawn over the destinations
  drawStats.images.length=0;
  const btns=g.touchButtons();
  g.drawTouchPad();
  check('no pad on the mission select screen', g.STATE==='map');
  // (drawTouchPad returns early off-stage; if it did not, a thumb resting on
  // a button would sit on top of a map node)
  g.startWorld(0);
  step(2);
  check('the pad is for stages', g.STATE==='playing');
  g.drawTouchPad();
  check('it renders in a stage', true);

  // with touch off entirely, nothing is drawn and nothing is pressed
  g.touchMode=false;
  g.touchPressAt(7,{x:btns[0].x,y:btns[0].y});
  g.drawTouchPad();
  check('a keyboard player gets no pad', true);
}

// ── scenario 68: the game can be bundled into one file ───────
{
  const {g,sandbox}=run({map:true});
  const inlined=sandbox.window.__ASSETS;
  if(inlined){
    // running against the standalone build
    check('the bundle carries its art', Object.keys(inlined).length>10,
          Object.keys(inlined).length);
    check('every entry is a data URI',
          Object.values(inlined).every(v=>/^data:image\//.test(v)));
    check('a sprite request resolves to inlined art',
          /^data:image\//.test(g.assetURL('baby.png')), g.assetURL('baby.png').slice(0,24));
  } else {
    // running against the source, which loads from sibling files
    check('the source build asks for files by name',
          g.assetURL('baby.png')==='baby.png', g.assetURL('baby.png'));
    check('an unknown name is passed through untouched',
          g.assetURL('nope.png')==='nope.png', g.assetURL('nope.png'));
  }
}

// ── scenario 69: D — DONDURUCU ───────────────────────────────
{
  const {g,step,keys}=run({map:true});
  g.startWorld(0);
  g.loadLevel(6);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  for(const wp of g.weaponPickups) wp.alive=false;
  check('the ice world stocks its own letter', !!g.WEAPONS.freeze,
        Object.keys(g.WEAPONS).join(','));
  check('it is D for dondurucu', g.WEAPONS.freeze.letter==='D', g.WEAPONS.freeze.letter);

  // pick one target and silence the rest
  const target=g.enemies[0];
  for(let i=1;i<g.enemies.length;i++) g.enemies[i].dead=true;
  for(const e of g.groundEnemies) e.dead=true;
  target.dead=false; target.dying=false; target.hp=99;
  const hp0=target.hp;

  g.equipWeapon('freeze'); g.weaponAmmo=99;
  keys({KeyF:true});
  const hold=()=>{
    g.player.invuln=999; g.player.facing=1;
    g.player.x=400; g.player.y=300; g.player.vx=0; g.player.vy=0;
    target.x=g.player.x+150; target.y=g.player.y; target.baseY=target.y;
    g.weaponAmmo=99;
  };
  for(let i=0;i<90 && !(target.frozen>0);i++){ hold(); step(1); }
  keys({KeyF:false});
  check('the beam locks an enemy solid', target.frozen>0, target.frozen);
  check('...without damaging it', target.hp===hp0, hp0+' -> '+target.hp);
  check('a frozen enemy stops moving', target.vx===0, target.vx);
  check('it counts as a block', g.frozenBlocks().length===1, g.frozenBlocks().length);
  g.drawPtero(target);
  check('the ice shell renders', true);
}

// ── scenario 70: standing on what you froze ─────────────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.loadLevel(6);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  const block=g.enemies[0];
  for(let i=1;i<g.enemies.length;i++) g.enemies[i].dead=true;
  for(const e of g.groundEnemies) e.dead=true;
  block.dead=false; block.dying=false;
  // open air: no stage platform at this x and height, so the only thing
  // that can hold the dino up here is the frozen enemy itself
  block.x=350; block.y=300; block.baseY=300;
  g.freezeSolid(block);
  check('frozen', block.frozen>0);
  check('nothing else is up here to stand on',
        !g.platforms.some(p=>!p.lavaPit&&Math.abs(p.y-block.y)<6&&
                             p.x<block.x+block.w&&p.x+p.w>block.x));
  // drop onto it
  g.player.x=block.x+block.w/2-26;
  g.player.y=block.y-g.PLAYER_H-30;
  g.player.vx=0; g.player.vy=120;
  let landed=false;
  for(let i=0;i<20 && !landed;i++){
    g.player.invuln=999;
    block.x=350; block.y=300; block.baseY=300; block.frozen=9;
    step(1);
    if(g.player.onGround && Math.abs((g.player.y+g.PLAYER_H)-block.y)<2) landed=true;
  }
  check('a frozen enemy holds your weight', landed,
        (g.player.y+g.PLAYER_H).toFixed(1)+' vs '+block.y);
  check('...and does not hurt you standing on it', g.player.hp===99, g.player.hp);
}

// ── scenario 71: shattering one ─────────────────────────────
{
  const {g,step,keys}=run({map:true});
  g.startWorld(0);
  g.loadLevel(6);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  const block=g.enemies[0], bystander=g.enemies[1];
  for(const e of g.groundEnemies) e.dead=true;
  for(let i=2;i<g.enemies.length;i++) g.enemies[i].dead=true;
  block.dead=false; block.dying=false; block.hp=99;
  bystander.dead=false; bystander.dying=false; bystander.hp=99;
  // 1. a beam hit shatters it. The bystander is parked far away for this
  //    half, because a piercing beam would otherwise answer for the shards.
  block.x=500; block.y=300; block.baseY=300;
  bystander.x=1400; bystander.y=180; bystander.baseY=180;
  g.freezeSolid(block);
  g.equipWeapon('spread'); g.weaponAmmo=99;
  keys({KeyF:true});
  for(let i=0;i<40 && !block.dying;i++){
    g.player.invuln=999; g.player.facing=1;
    g.player.x=330; g.player.y=block.y; g.player.vx=0; g.player.vy=0;
    block.x=500; block.y=300; block.baseY=300; block.frozen=9;
    g.weaponAmmo=99;
    step(1);
  }
  keys({KeyF:false});
  check('one hit shatters a frozen enemy', block.dying===true||block.dead===true,
        'dying='+block.dying);

  // 2. the blast itself, with no beam in the picture at all
  const b2=g.enemies[1];
  b2.dead=false; b2.dying=false; b2.hp=99;
  block.dying=false; block.dead=false; block.hp=99;
  block.x=500; block.y=300; block.baseY=300;
  b2.x=530; b2.y=330; b2.baseY=330;
  g.freezeSolid(block);
  const nearHp=b2.hp;
  g.shatterFrozen(block);
  check('the shards cut down what stood beside it', b2.hp<nearHp,
        nearHp+' -> '+b2.hp);
  check('...and the block itself is gone', block.dying===true||block.dead===true);

  // something far away is untouched, so the radius is a radius
  // this scenario killed every grounder up front, so bring one back rather
  // than filtering for a survivor and silently skipping the check
  const far=g.groundEnemies[0];
  if(far){
    far.dead=false; far.dying=false; far.hp=4;
    far.x=1500; far.y=g.GROUND_Y-far.h;
    const farHp=far.hp;
    block.dying=false; block.dead=false; block.hp=99;
    g.freezeSolid(block);
    g.shatterFrozen(block);
    check('a shatter does not reach across the stage', far.hp===farHp,
          farHp+' -> '+far.hp);
  }
}

// ── scenario 72: shooting the ceiling down on them ──────────
{
  const {g,step,keys}=run({map:true});
  g.startWorld(0);
  g.loadLevel(6);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  for(const wp of g.weaponPickups) wp.alive=false;
  for(const e of g.enemies) e.dead=true;
  for(const e of g.groundEnemies) e.dead=true;
  const ic=g.icicles[0];
  check('it is hanging', ic.state==='hang', ic.state);

  // stand well clear of it and shoot it
  g.equipWeapon('spread'); g.weaponAmmo=99;
  keys({KeyF:true});
  for(let i=0;i<40 && ic.state==='hang';i++){
    g.player.invuln=999; g.player.facing=1;
    g.player.x=ic.x-260; g.player.y=ic.y-24;
    g.player.vx=0; g.player.vy=0;
    g.weaponAmmo=99;
    step(1);
  }
  keys({KeyF:false});
  check('a hanging icicle can be shot down', ic.state!=='hang', ic.state);
  check('...and it drops without the warning shake', ic.state!=='shake', ic.state);

  // and a falling one lands on an enemy — on its TOP, where armour is not
  const victim=g.groundEnemies.filter(e=>e.species==='ice_crusher')[0];
  victim.dead=false; victim.dying=false; victim.hp=4;
  const ic2=g.icicles.find(i=>i.state==='hang');
  // Stand it on the first surface under that icicle, not on the distant
  // floor: a spike shatters on the first solid thing it meets, so a ledge in
  // between means it never reaches the ground at all.
  let deck=g.GROUND_Y;
  for(const p of g.platforms){
    if(p.lavaPit||p.gone) continue;
    if(ic2.x>p.x && ic2.x<p.x+p.w && p.y<deck && p.y>ic2.y) deck=p.y;
  }
  const place=()=>{
    victim.x=ic2.x-victim.w/2; victim.y=deck-victim.h;
    victim.patrolMin=victim.x; victim.patrolMax=victim.x; victim.vx=0;
  };
  place();
  ic2.state='fall'; ic2.vy=200;
  for(let i=0;i<60 && victim.hp===4;i++){
    g.player.invuln=999; g.player.x=60;
    place();
    step(1);
  }
  check('a dropped icicle hits the armoured crusher on top', victim.hp<4, victim.hp);
}

// ── scenario 73: the blizzard cycle ─────────────────────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.loadLevel(7);
  check('the ridge is an ice stage', g.isIce()===true && g.LEVELS[7].theme==='ice');
  check('it declares wind', !!g.LEVELS[7].wind);
  check('it starts calm', g.windState==='calm', g.windState);

  // the cycle: calm -> warn -> blow -> calm, and it never skips the warning
  const seen=[];
  let prev=g.windState;
  for(let i=0;i<4000;i++){
    g.updateWind(1/60);
    if(g.windState!==prev){ seen.push(prev+'>'+g.windState); prev=g.windState; }
    if(seen.length>=6) break;
  }
  check('it cycles through all three phases', seen.length>=4, seen.join(' '));
  check('a gust is ALWAYS announced first',
        seen.every(tr=>tr!=='calm>blow'), seen.join(' '));
  check('...and every warning is followed by a gust',
        seen.filter(tr=>tr.startsWith('warn>')).every(tr=>tr==='warn>blow'),
        seen.join(' '));

  // the warning has to be long enough to react to
  g.windState='calm'; g.windTimer=0;
  g.updateWind(1/60);
  check('the warning is on the air before the gust', g.windState==='warn', g.windState);
  check('...for a readable stretch of time', g.windTimer>=0.5, g.windTimer);
  const dirAtWarn=g.windDir;
  while(g.windState==='warn') g.updateWind(1/60);
  check('the gust blows the way the arrow pointed', g.windDir===dirAtWarn,
        dirAtWarn+' -> '+g.windDir);

  g.windState='blow'; g.drawWind();
  g.windState='warn'; g.drawWind();
  g.windState='calm';
  check('the storm overlay renders in both phases', true);
}

// ── scenario 73b: the storm announces itself, once ──────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.loadLevel(7);
  g.radio=null; g.radioQueue.length=0;
  check('no storm call before the first gust', !g.radioFired['storm']);

  // run the cycle up to the first warning
  g.windState='calm'; g.windTimer=0;
  g.updateWind(1/60);
  const call=g.radio||g.radioQueue[0];
  check('the first warning opens a transmission', !!call && g.radioFired['storm']);
  check('...and it is the storm that is calling', !!call && call.title==='TİPİ ALARMI',
        call&&call.title);
  // there is no runtime text measuring in the radio window, so every line is
  // hand-wrapped and has to fit
  check('every line fits the comms window',
        !!call && call.lines.every(l=>l.length<=40),
        call && call.lines.map(l=>l.length).join(','));
  check('...and the window is tall enough for them',
        !!call && 36+call.lines.length*16<=g.RADIO_H+12,
        call && call.lines.length);

  // a later gust does not repeat it
  g.radio=null; g.radioQueue.length=0;
  for(let i=0;i<3000 && !g.radio && !g.radioQueue.length;i++){
    g.windState==='blow'; g.updateWind(1/60);
  }
  check('it never calls twice in one stage', !g.radio && !g.radioQueue.length);

  // ...but the next stage hears it fresh
  g.loadLevel(7);
  check('a fresh run hears it again', !g.radioFired['storm']);
  g.windState='calm';
}

// ── scenario 74: what a gust actually does to you ───────────
{
  const {g,step,keys}=run({map:true});
  g.startWorld(0);
  g.loadLevel(7);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  for(const e of g.enemies) e.dead=true;
  for(const e of g.groundEnemies) e.dead=true;
  for(const ic of g.icicles) ic.state='gone';

  const park=()=>{
    g.player.invuln=999; g.player.hp=99;
    g.player.x=200; g.player.y=g.GROUND_Y-g.PLAYER_H; g.player.vx=0; g.player.vy=0;
  };

  // calm: standing still stays standing still
  g.windState='calm'; g.windTimer=99;
  park(); step(1);
  for(let i=0;i<30;i++){ g.player.invuln=999; step(1); }
  const calmDrift=g.player.x-200;
  check('no wind, no drift', Math.abs(calmDrift)<2, calmDrift.toFixed(2));

  // a gust from the left pushes you right, and only while it blows
  park();
  g.windState='blow'; g.windDir=1; g.windTimer=99;
  for(let i=0;i<60;i++){ g.player.invuln=999; g.windTimer=99; step(1); }
  const pushed=g.player.x-200;
  check('a gust carries a standing dino downwind', pushed>40, pushed.toFixed(1));
  check('...and only downwind', pushed>0 && g.player.vx>0, g.player.vx.toFixed(1));

  // the other way, which is what catches a hardcoded direction
  park();
  g.windDir=-1;
  for(let i=0;i<60;i++){ g.player.invuln=999; g.windTimer=99; step(1); }
  const pushedL=g.player.x-200;
  check('it blows both ways', pushedL<-40, pushedL.toFixed(1));

  // it is drag, not a rocket: the drift settles at the wind speed
  const capped=Math.abs(g.player.vx);
  check('the shove is bounded by the wind speed',
        capped<=g.LEVELS[7].wind.speed+4, capped.toFixed(1)+' vs '+g.LEVELS[7].wind.speed);

  // and it never brakes someone already running downwind faster than it.
  // One identical frame, run with the gust and then without it: if the wind
  // is honest the two come out the same, and any braking shows up as a gap.
  const sprintFrame=(blowing)=>{
    park();
    g.player.groundT=0; g.player.facing=1; g.player.x=200;
    g.windState=blowing?'blow':'calm'; g.windDir=1; g.windTimer=99;
    keys({ArrowRight:true});
    g.player.vx=400;
    step(1);
    keys({ArrowRight:false});
    return g.player.vx;
  };
  const gusting=sprintFrame(true), still=sprintFrame(false);
  check('running with the wind is never slowed by it', gusting>=still-0.01,
        still.toFixed(3)+' (calm) vs '+gusting.toFixed(3)+' (gust)');

  // you can still fight it: holding upwind moves you upwind
  park();
  g.windState='blow'; g.windDir=1;
  keys({ArrowLeft:true});
  for(let i=0;i<70;i++){ g.player.invuln=999; g.windTimer=99; step(1); }
  keys({ArrowLeft:false});
  check('you can walk into the storm', g.player.x<200, g.player.x.toFixed(1));
  check('...but it costs you ground', g.player.x>200-260, g.player.x.toFixed(1));

  g.windState='calm';
}

// ── scenario 75: the wind is the ridge's alone ──────────────
{
  const {g,step}=run();       // world 0, stage 1 — a volcano stage
  g.player.hp=99; g.player.invuln=999;
  step(3);
  check('a stage with no wind declares none', !g.LEVELS[g.levelIndex].wind);
  check('...so the blizzard is switched off', g.windState==='off', g.windState);
  const x0=g.player.x;
  g.player.vx=0; g.player.vy=0;
  for(let i=0;i<40;i++){ g.player.invuln=999; step(1); }
  check('nothing pushes you on a windless stage',
        Math.abs(g.player.x-x0)<3, (g.player.x-x0).toFixed(2));
  g.drawWind();
  check('and the overlay draws nothing', true);

  // loading the ridge arms it, loading back out disarms it
  g.loadLevel(7);
  check('entering the ridge arms the storm', g.windState==='calm', g.windState);
  g.loadLevel(0);
  step(1);
  check('leaving it disarms the storm', g.windState==='off', g.windState);
}

// ── scenario 76: the ridge is playable ──────────────────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.loadLevel(7);
  const L=g.LEVELS[7];
  check('the ridge has an exit', g.platforms.some(p=>p.goal));
  check('...and no boss sealing it', L.boss===null && g.gateOpen===true);
  check('its checkpoint stands on solid ground',
        g.platforms.some(p=>!p.lavaPit && p.y===g.GROUND_Y &&
                            p.x<=L.checkpoint && p.x+p.w>=L.checkpoint),
        L.checkpoint);
  check('the frozen hostage has a flame to thaw it',
        L.cages.every(c=>c.species!=='frozen' ||
          L.weapons.some(w=>w.kind==='flame' && w.x<c.x)),
        JSON.stringify(L.weapons.map(w=>w.kind+'@'+w.x)));
  // ...and the flame is the LAST letter before it, or picking up anything
  // later would disarm the player in front of the block
  for(const c of L.cages.filter(c=>c.species==='frozen')){
    const lastBefore=L.weapons.filter(w=>w.x<c.x).sort((a,b)=>a.x-b.x).slice(-1)[0];
    check('the flame is the last letter before the ice block',
          lastBefore && lastBefore.kind==='flame',
          lastBefore && lastBefore.kind);
  }

  // every ledge is reachable, same audit the other stages get
  const jump=300;
  const stand=g.platforms.filter(p=>!p.lavaPit).map(p=>({x:p.x,y:p.y,w:p.w}));
  const bad=stand.filter(p=>{
    if(p.y>=g.GROUND_Y) return false;
    return !stand.some(q=>q!==p && q.y>p.y && q.y-p.y<=jump &&
                          q.x<p.x+p.w+170 && q.x+q.w>p.x-170);
  });
  check('every ledge on the ridge can be reached', bad.length===0,
        JSON.stringify(bad));

  // and it survives a real run
  g.player.hp=99; g.player.invuln=999;
  for(let i=0;i<240;i++){
    g.player.invuln=999; g.player.hp=Math.max(g.player.hp,3);
    step(1);
  }
  check('the ridge simulates without blowing up', g.STATE==='playing', g.STATE);
}

// ── scenario 77: the Titan breaks its own armour ────────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.loadLevel(6);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  g.boss.introState='active';
  check('it starts in phase 1', g.boss.phase===1, g.boss.phase);
  check('...and the floor is merely icy', g.titanSlick()===false);

  // measure the coast before and after the turn, on the SAME frame, because
  // an absolute number here would only be a guess at what the engine does
  const coast=()=>{
    g.player.x=200; g.player.y=g.GROUND_Y-g.PLAYER_H;
    g.player.vy=0; g.player.groundT=0; g.player.invuln=999;
    g.player.vx=300;
    step(1);
    return g.player.vx;
  };
  const before=coast();

  // A clean ceiling to measure against. The coast frames above walk the dino
  // under the spike at x=250, and one stray warning shake is enough to make
  // "fewer hanging than before" true with the whole blast deleted.
  for(const ic of g.icicles) ic.state='hang';
  const hanging=g.icicles.length;
  check('the ceiling is loaded before the turn', hanging>0, hanging);

  // half health is the trigger, and nothing else
  g.player.hp=99; g.player.invuln=999;
  g.boss.hp=g.boss.maxHp/2;
  g.player.x=g.boss.x-500;          // clear of the shell blast
  g.player.y=g.GROUND_Y-g.PLAYER_H;
  step(1);
  check('half health turns the fight over', g.boss.phase===2, g.boss.phase);
  // the ice fight must not flash red and tell the player to parry shots the
  // Titan never fires
  const turn=g.radio||g.radioQueue[0];
  check('the turn speaks in the ice biome voice',
        !!turn && turn.color==='#7dd3fc', turn && turn.color);
  check('...and every line still fits the window',
        !!turn && turn.lines.every(l=>l.length<=40),
        turn && turn.lines.map(l=>l.length).join(','));
  check('the shell comes off and takes the whole ceiling with it',
        g.icicles.filter(i=>i.state==='hang').length===0,
        hanging+' -> '+g.icicles.filter(i=>i.state==='hang').length);
  check('...and it calls sentries in', g.boss.summons==='ice_flyer', g.boss.summons);
  check('the sentries are really there',
        g.enemies.filter(e=>!e.dead&&e.species==='ice_flyer').length>=2,
        g.enemies.filter(e=>!e.dead).length);

  // burn off the hit-stop the flip triggers, or the next frames simulate nothing
  for(let i=0;i<20;i++){ g.player.invuln=999; g.player.hp=99; step(1); }

  check('the floor freezes over', g.titanSlick()===true);
  const after=coast();
  check('...and you keep sliding longer on it', after>before+1,
        before.toFixed(1)+' -> '+after.toFixed(1));

  g.drawGlaze(); g.drawBoss(); g.drawBossRage();
  check('the glaze and the icy rage banner render', true);
}

// ── scenario 77b: standing in the shell when it goes ────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.loadLevel(6);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  g.boss.introState='active';
  for(let i=0;i<6;i++){ g.player.invuln=999; g.player.hp=99; step(1); }
  for(const e of g.enemies) e.dead=true;
  for(const e of g.groundEnemies) e.dead=true;
  for(const ic of g.icicles) ic.state='gone';   // nothing overhead to blame

  // right beside it, with no i-frames
  g.player.x=g.boss.x-40; g.player.y=g.GROUND_Y-g.PLAYER_H;
  g.player.vx=0; g.player.vy=0; g.player.invuln=0;
  const hp0=g.player.hp=6;
  g.boss.hp=g.boss.maxHp/2;
  step(1);
  check('the shell is a real hit if you are inside it', g.player.hp<hp0,
        hp0+' -> '+g.player.hp);
  check('...and it chills you too', g.player.chilled>0, g.player.chilled);
}

// ── scenario 77c: ...but only if you are inside it ──────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.loadLevel(6);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  g.boss.introState='active';
  for(let i=0;i<6;i++){ g.player.invuln=999; g.player.hp=99; step(1); }
  for(const e of g.enemies) e.dead=true;
  for(const e of g.groundEnemies) e.dead=true;
  for(const ic of g.icicles) ic.state='gone';

  g.player.x=g.boss.x-520; g.player.y=g.GROUND_Y-g.PLAYER_H;
  g.player.vx=0; g.player.vy=0; g.player.invuln=0;
  const hp0=g.player.hp=6;
  g.boss.hp=g.boss.maxHp/2;
  step(1);
  check('the shell does not reach across the arena', g.player.hp===hp0,
        hp0+' -> '+g.player.hp);
  check('the turn still happened', g.boss.phase===2, g.boss.phase);
}

// ── scenario 78: the breath stops being a line ──────────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.loadLevel(6);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  g.boss.introState='active';
  for(const e of g.enemies) e.dead=true;
  for(const e of g.groundEnemies) e.dead=true;
  for(const ic of g.icicles) ic.state='gone';

  // phase 1: the beam never leaves level
  const seen1=new Set();
  g.boss.breathCooldown=0.01;
  for(let i=0;i<200;i++){
    g.player.invuln=999; g.player.hp=99;
    g.player.x=g.boss.x-240; g.player.y=140; g.player.vy=0;
    step(1);
    if(g.boss.breathState==='blow') seen1.add(g.boss.breathAngle);
  }
  check('phase 1 blows a straight beam', seen1.size===1 && seen1.has(0),
        [...seen1].join(','));

  // phase 2: it sweeps, and the arc covers the whole declared range
  g.boss.hp=g.boss.maxHp/2;
  g.player.x=g.boss.x-500; g.player.y=g.GROUND_Y-g.PLAYER_H;
  step(1);
  for(let i=0;i<20;i++){ g.player.invuln=999; g.player.hp=99; step(1); }
  check('it is enraged', g.boss.phase===2);

  let lo=99, hi=-99, sawBlow=false;
  g.boss.breathState='none'; g.boss.breathCooldown=0.01;
  for(let i=0;i<260;i++){
    g.player.invuln=999; g.player.hp=99;
    g.player.x=g.boss.x-240; g.player.y=140; g.player.vy=0;
    step(1);
    if(g.boss.breathState==='blow'){
      sawBlow=true;
      lo=Math.min(lo,g.boss.breathAngle); hi=Math.max(hi,g.boss.breathAngle);
    }
  }
  check('phase 2 sweeps the beam through an arc', sawBlow && hi-lo>0.6,
        lo.toFixed(2)+' .. '+hi.toFixed(2));
  check('...starting above and ending below',
        lo<-g.BREATH_ARC*0.8 && hi>g.BREATH_ARC*0.8,
        lo.toFixed(2)+' .. '+hi.toFixed(2)+' arc='+g.BREATH_ARC);
  check('...and it resets to level between breaths',
        g.boss.breathState!=='blow' ? g.boss.breathAngle===0 : true,
        g.boss.breathAngle);
  g.drawBoss();
  check('the swept beam renders', true);
}

// ── scenario 79: the sweep reaches where the line could not ─
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.loadLevel(6);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  g.boss.introState='active';
  for(const e of g.enemies) e.dead=true;
  for(const e of g.groundEnemies) e.dead=true;
  for(const ic of g.icicles) ic.state='gone';

  const segDist=(px,py,ax,ay,bx,by)=>{
    const dx=bx-ax, dy=by-ay, l2=dx*dx+dy*dy;
    const u=l2>0?Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/l2)):0;
    return Math.hypot(px-(ax+u*dx),py-(ay+u*dy));
  };

  // The titan only pins itself to the floor once it is actually running:
  // forcing introState does not move it, so a ray measured before the first
  // update is taken off a boss still parked off-screen above the stage.
  for(let i=0;i<6;i++){ g.player.invuln=999; g.player.hp=99; step(1); }
  check('the Titan has taken the floor',
        Math.abs(g.boss.y-(g.GROUND_Y-g.boss.h/2))<1, g.boss.y);

  // A spot above the muzzle line. The angle is taken from the ray's OWN
  // origin, not the boss centre — the muzzle sits 0.45*w out to the side,
  // so measuring from the middle misses by 77px and lands the probe at the
  // one angle the sweep only touches on its opening instant.
  g.boss.breathDir=-1; g.boss.breathAngle=0;
  const flat=g.breathRay();
  const probeX=g.boss.x-300, probeY=flat.ay-90;
  const wantAng=Math.atan2(probeY-flat.ay,Math.abs(probeX-flat.ax));
  check('the probe sits inside the arc the sweep covers',
        Math.abs(wantAng)<g.BREATH_ARC*0.95,
        wantAng.toFixed(3)+' vs '+g.BREATH_ARC);
  check('a straight beam cannot reach above itself',
        segDist(probeX,probeY,flat.ax,flat.ay,flat.bx,flat.by)>g.BREATH_HALF_W,
        segDist(probeX,probeY,flat.ax,flat.ay,flat.bx,flat.by).toFixed(1));

  // aimed up, the same spot is inside the beam
  g.boss.breathAngle=wantAng;
  const tilted=g.breathRay();
  check('...but the swept one does',
        segDist(probeX,probeY,tilted.ax,tilted.ay,tilted.bx,tilted.by)<g.BREATH_HALF_W,
        segDist(probeX,probeY,tilted.ax,tilted.ay,tilted.bx,tilted.by).toFixed(1));

  // and it really damages there, through the live update path
  g.boss.phase=2;
  g.boss.breathState='blow'; g.boss.breathDir=-1;
  g.boss.breathDur=1.8; g.boss.breathTimer=1.8; g.boss.breathAngle=-g.BREATH_ARC;
  const hp0=g.player.hp;
  let hurt=false, sweptPast=false;
  for(let i=0;i<140 && !hurt;i++){
    g.player.x=probeX-g.PLAYER_W/2; g.player.y=probeY-g.PLAYER_H/2;
    g.player.vx=0; g.player.vy=0; g.player.invuln=0;
    step(1);
    if(g.boss.breathAngle>wantAng) sweptPast=true;
    if(g.player.hp<hp0) hurt=true;
  }
  check('the arc really swept past the probe', sweptPast||hurt,
        g.boss.breathAngle.toFixed(3)+' vs '+wantAng.toFixed(3));
  check('the sweep burns what it passes through', hurt, g.player.hp+'/'+hp0);
  check('...and chills it', g.player.chilled>0, g.player.chilled);
}

// ── scenario 80: the other bosses are untouched ─────────────
{
  const {g,step}=run();          // volcano stage 1
  g.player.hp=99; g.player.invuln=999;
  step(3);
  check('a flyer boss is not a titan', g.boss.kind!=='titan', g.boss.kind);
  check('its floor never glazes', g.titanSlick()===false);
  g.boss.introState='active';
  g.boss.hp=g.boss.maxHp/2;
  g.player.x=g.boss.x-600;
  step(1);
  check('it still turns at half health', g.boss.phase===2, g.boss.phase);
  check('...and still keeps its own floor', g.titanSlick()===false);
  g.drawBossRage();
  check('the red banner still renders for it', true);
}

// ── scenario 81: the slide ──────────────────────────────────
{
  const {g,step,keys}=run({map:true});
  g.startWorld(0);
  g.loadLevel(7);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  for(const e of g.enemies) e.dead=true;
  for(const e of g.groundEnemies) e.dead=true;
  for(const ic of g.icicles) ic.state='gone';
  g.windState='calm'; g.windTimer=999;

  const stand=(x)=>{
    g.player.x=x; g.player.y=g.GROUND_Y-g.PLAYER_H;
    g.player.vx=0; g.player.vy=0; g.player.groundT=0;
    g.player.invuln=999; g.player.hp=99;
    g.player.slideT=0; g.player.slideCooldown=0; g.player.slideKeyWasDown=false;
    g.player.facing=1;
  };

  stand(600);
  check('it starts on its feet', g.player.slideT===0);
  keys({ArrowDown:true});
  step(1);
  keys({ArrowDown:false});
  check('down drops the dino into a slide', g.player.slideT>0, g.player.slideT);
  check('...with a kick of its own', Math.abs(g.player.vx)>=g.SLIDE_SPD*0.9,
        g.player.vx);
  check('...in the direction it was facing', g.player.vx>0, g.player.vx);

  // it commits. The same slide, run twice for the same number of frames,
  // once fighting it and once not: if the input reached the slide at all the
  // two would drift apart.
  const slideRun=(steer)=>{
    stand(600);
    keys({ArrowDown:true});
    step(1);
    keys({ArrowDown:false});
    if(steer) keys({ArrowLeft:true});
    for(let i=0;i<8;i++){ g.player.invuln=999; step(1); }
    if(steer) keys({ArrowLeft:false});
    return {vx:g.player.vx, x:g.player.x};
  };
  const fought=slideRun(true), free=slideRun(false);
  check('a slide cannot be steered out of',
        Math.abs(fought.vx-free.vx)<0.01, free.vx.toFixed(2)+' vs '+fought.vx.toFixed(2));
  check('...and it still carries you the same distance',
        Math.abs(fought.x-free.x)<0.01, free.x.toFixed(2)+' vs '+fought.x.toFixed(2));
  check('...forward', free.vx>0, free.vx);

  // it ends by itself
  let frames=0;
  while(g.player.slideT>0 && frames<120){ g.player.invuln=999; step(1); frames++; }
  check('it ends on its own', g.player.slideT===0, frames);

  // ...and it lasts what it says it lasts. Timed from a FRESH slide: the one
  // above had already burned seven frames of steering before the count began.
  stand(600);
  keys({ArrowDown:true});
  step(1);
  keys({ArrowDown:false});
  let lived=1;
  while(g.player.slideT>0 && lived<200){ g.player.invuln=999; step(1); lived++; }
  check('...for about as long as it says it does',
        lived>=g.SLIDE_TIME*56 && lived<=g.SLIDE_TIME*64,
        lived+' frames for '+g.SLIDE_TIME+'s');

  // and it cannot simply be held down as a way to travel
  g.player.groundT=0; g.player.slideKeyWasDown=false;
  keys({ArrowDown:true});
  step(1);
  keys({ArrowDown:false});
  check('there is a cooldown before the next one', g.player.slideT===0,
        g.player.slideCooldown);
}

// ── scenario 82: when a slide is not allowed ────────────────
{
  const {g,step,keys}=run({map:true});
  g.startWorld(0);
  g.loadLevel(7);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  for(const e of g.enemies) e.dead=true;
  for(const e of g.groundEnemies) e.dead=true;
  for(const ic of g.icicles) ic.state='gone';
  g.windState='calm'; g.windTimer=999;

  // in the air
  g.player.x=600; g.player.y=200; g.player.vx=0; g.player.vy=0;
  g.player.groundT=0.5; g.player.slideT=0; g.player.slideCooldown=0;
  g.player.slideKeyWasDown=false; g.player.invuln=999;
  keys({ArrowDown:true});
  step(1);
  keys({ArrowDown:false});
  check('you cannot slide in mid-air', g.player.slideT===0, g.player.slideT);

  // a jump cancels one in progress
  g.player.x=600; g.player.y=g.GROUND_Y-g.PLAYER_H;
  g.player.vx=0; g.player.vy=0; g.player.groundT=0;
  g.player.slideT=0; g.player.slideCooldown=0; g.player.slideKeyWasDown=false;
  g.player.invuln=999;
  keys({ArrowDown:true});
  step(1);
  keys({ArrowDown:false});
  check('sliding', g.player.slideT>0);
  keys({Space:true});
  step(1);
  keys({Space:false});
  check('a jump cancels the slide', g.player.slideT===0, g.player.slideT);
}

// ── scenario 83: the low shelf ──────────────────────────────
{
  const {g,step,keys}=run({map:true});
  g.startWorld(0);
  g.loadLevel(7);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  for(const e of g.enemies) e.dead=true;
  for(const e of g.groundEnemies) e.dead=true;
  for(const ic of g.icicles) ic.state='gone';
  g.windState='calm'; g.windTimer=999;

  const bar=g.platforms.find(p=>p.lowBar);
  check('the ridge hangs a low shelf', !!bar, bar&&bar.x);
  check('...and it runs to the ceiling, so there is no way over',
        bar.y<100 && bar.y+bar.h>g.GROUND_Y-60, bar.y+'..'+(bar.y+bar.h));

  // walking into it gets you nowhere
  g.player.x=bar.x-90; g.player.y=g.GROUND_Y-g.PLAYER_H;
  g.player.vx=0; g.player.vy=0; g.player.groundT=0; g.player.facing=1;
  g.player.slideT=0; g.player.slideCooldown=0;
  keys({ArrowRight:true});
  for(let i=0;i<70;i++){ g.player.invuln=999; g.player.hp=99; step(1); }
  keys({ArrowRight:false});
  check('you cannot walk through it', g.player.x+g.PLAYER_W<=bar.x+2,
        (g.player.x+g.PLAYER_W).toFixed(1)+' vs '+bar.x);

  // sliding does
  g.player.x=bar.x-120; g.player.y=g.GROUND_Y-g.PLAYER_H;
  g.player.vx=0; g.player.vy=0; g.player.groundT=0; g.player.facing=1;
  g.player.slideT=0; g.player.slideCooldown=0; g.player.slideKeyWasDown=false;
  keys({ArrowDown:true});
  step(1);
  keys({ArrowDown:false});
  check('the dino goes flat', g.player.slideT>0);
  keys({ArrowRight:true});
  for(let i=0;i<50;i++){ g.player.invuln=999; g.player.hp=99; step(1); }
  keys({ArrowRight:false});
  check('...and slides clean under it', g.player.x>bar.x+bar.w,
        g.player.x.toFixed(1)+' vs '+(bar.x+bar.w));

  g.drawLowBars();
  check('the shelf renders its teeth', true);
}

// ── scenario 84: the frozen pond ────────────────────────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.loadLevel(7);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  for(const e of g.enemies) e.dead=true;
  for(const e of g.groundEnemies) e.dead=true;
  for(const ic of g.icicles) ic.state='gone';
  g.windState='calm'; g.windTimer=999;

  const pond=g.platforms.find(p=>p.crack);
  check('the ridge lays a pond over a pit', !!pond, pond&&pond.x);
  check('...and there is a real pit under it',
        g.lavaPits().some(lp=>lp.x<=pond.x&&lp.x+lp.w>=pond.x+pond.w),
        JSON.stringify(g.lavaPits()));
  check('a pond holds longer than a mushroom shelf',
        g.CRACK_DELAY>g.CRUMBLE_DELAY, g.CRACK_DELAY+' vs '+g.CRUMBLE_DELAY);

  // stand on it
  const hold=()=>{
    g.player.x=pond.x+pond.w/2-g.PLAYER_W/2;
    g.player.y=pond.y-g.PLAYER_H;
    g.player.vx=0; g.player.invuln=999; g.player.hp=99;
  };
  hold(); step(1); hold(); step(1);
  check('standing on it starts the fracture', pond.crumbleT!==undefined,
        pond.crumbleT);

  let frames=0;
  while(!pond.gone && frames<200){ hold(); step(1); frames++; }
  check('it gives way', pond.gone===true, frames);
  check('...but not instantly — you get a crossing out of it',
        frames>=g.CRACK_DELAY*50, frames+' frames');

  // with it gone, the pit underneath is what is left
  g.player.x=pond.x+pond.w/2-g.PLAYER_W/2;
  g.player.y=pond.y-g.PLAYER_H;
  g.player.vx=0; g.player.vy=0; g.player.invuln=0; g.player.hp=3;
  const hp0=g.player.hp;
  let fell=false;
  for(let i=0;i<90 && !fell;i++){
    step(1);
    if(g.player.hp<hp0) fell=true;
  }
  check('and what is under it is the pit', fell, g.player.hp+'/'+hp0);

  // it freezes back over
  let back=0;
  while(pond.gone && back<400){
    g.player.invuln=999; g.player.hp=99; g.player.x=60;
    g.player.y=g.GROUND_Y-g.PLAYER_H;
    step(1); back++;
  }
  check('the pond freezes back over', pond.gone===false, back);
}

// ── scenario 85: Crevasse Run ───────────────────────────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.loadLevel(8);
  const L=g.LEVELS[8];
  check('the peaks gained a middle stage', L.name==='CREVASSE RUN', L.name);
  check('...on ice, with no boss', L.theme==='ice' && L.boss===null);
  check('...and its own weather', !!L.wind, JSON.stringify(L.wind||null));
  check('the wind here is gentler than the ridge that taught it',
        L.wind.speed<g.LEVELS[7].wind.speed,
        L.wind.speed+' vs '+g.LEVELS[7].wind.speed);

  // The whole point of the stage: the long pit is floored by nothing but
  // ponds, and they have to meet edge to edge or there is a hole you cannot
  // see coming.
  const crevasse=L.lavaPits.reduce((a,b)=>a.w>b.w?a:b);
  const ponds=L.platforms.filter(p=>p.crack).sort((a,b)=>a.x-b.x);
  check('the crevasse is bridged by ponds alone', ponds.length>=3, ponds.length);
  check('...starting exactly at its near edge', ponds[0].x===crevasse.x,
        ponds[0].x+' vs '+crevasse.x);
  check('...ending exactly at its far edge',
        ponds[ponds.length-1].x+ponds[ponds.length-1].w===crevasse.x+crevasse.w,
        (ponds[ponds.length-1].x+ponds[ponds.length-1].w)+' vs '+(crevasse.x+crevasse.w));
  let gap='';
  for(let i=1;i<ponds.length;i++){
    if(ponds[i].x!==ponds[i-1].x+ponds[i-1].w)
      gap+=' '+(ponds[i-1].x+ponds[i-1].w)+'->'+ponds[i].x;
  }
  check('...with no hole between them', gap==='', gap||'flush');
  check('and nothing else is holding you up out there',
        !L.platforms.some(p=>!p.crack && !p.lavaPit && p.y>=g.GROUND_Y &&
                             p.x<crevasse.x+crevasse.w && p.x+p.w>crevasse.x),
        'clear');

  // each pond keeps its own fuse — crossing one must not doom the next
  g.player.hp=99; g.player.invuln=999;
  step(3);
  for(const e of g.enemies) e.dead=true;
  for(const e of g.groundEnemies) e.dead=true;
  for(const ic of g.icicles) ic.state='gone';
  g.windState='calm'; g.windTimer=999;
  const live=g.platforms.filter(p=>p.crack).sort((a,b)=>a.x-b.x);
  for(let i=0;i<3;i++){
    g.player.x=live[0].x+live[0].w/2-g.PLAYER_W/2;
    g.player.y=live[0].y-g.PLAYER_H;
    g.player.vx=0; g.player.invuln=999; g.player.hp=99;
    step(1);
  }
  check('standing on one pond cracks that pond', live[0].crumbleT!==undefined,
        live[0].crumbleT);
  check('...and leaves the next ones alone',
        live.slice(1).every(p=>p.crumbleT===undefined),
        live.map(p=>p.crumbleT===undefined?'-':'armed').join(','));
}

// ── scenario 86: the two shelves and the letter order ───────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.loadLevel(8);
  const L=g.LEVELS[8];
  const bars=L.platforms.filter(p=>p.lowBar).sort((a,b)=>a.x-b.x);
  check('the stage hangs two shelves', bars.length===2, bars.length);

  // one is a choice, one is a gate
  const gate=bars.filter(b=>b.y<100);
  const choice=bars.filter(b=>b.y>=100);
  check('one runs to the ceiling — a gate', gate.length===1,
        bars.map(b=>b.y).join(','));
  check('...and the other can be gone over instead', choice.length===1);
  // a step beside it, not the floor it is standing on: the floor is where
  // you are when the shelf stops you, so counting it makes this unfailable
  const JUMP_UP=99, JUMP_ACROSS=166;
  const step_=L.platforms.filter(p=>p!==choice[0] && !p.lavaPit && !p.crack &&
                                    p.y<g.GROUND_Y &&
                                    p.y>choice[0].y && p.y-choice[0].y<=JUMP_UP)
    .filter(p=>Math.max(0,Math.max(choice[0].x-(p.x+p.w),
                                   p.x-(choice[0].x+choice[0].w)))<=JUMP_ACROSS);
  check('the shelf you can go over has a ledge to jump it from',
        step_.length>0,
        L.platforms.filter(p=>p.y<g.GROUND_Y&&!p.goal).map(p=>p.x+'@'+p.y).join(' '));

  // nothing may be parked inside a gate, or the stage is impassable on foot
  check('nothing is buried inside the gate',
        !L.platforms.some(p=>p!==gate[0] && !p.lavaPit &&
                             p.x<gate[0].x+gate[0].w && p.x+p.w>gate[0].x &&
                             p.y>gate[0].y && p.y<gate[0].y+gate[0].h),
        'clear');

  // the flame is the last letter before the block of ice, as everywhere else
  for(const c of L.cages.filter(c=>c.species==='frozen')){
    const before=L.weapons.filter(w=>w.x<c.x).sort((a,b)=>a.x-b.x);
    check('the flame is the last letter before the ice block',
          before.length>0 && before[before.length-1].kind==='flame',
          before.map(w=>w.kind+'@'+w.x).join(' '));
  }

  // the wave, and a checkpoint past it
  check('the run ends in an arena band', !!L.arena, JSON.stringify(L.arena||null));
  check('...with a checkpoint past it, not inside it',
        L.checkpoint>L.arena.end, L.checkpoint+' vs '+L.arena.end);
  check('...and the checkpoint stands on solid ground',
        L.platforms.some(p=>!p.lavaPit && !p.crack && p.y===g.GROUND_Y &&
                            p.x<=L.checkpoint && p.x+p.w>=L.checkpoint),
        L.checkpoint);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  check('the band really spawns a wave',
        [...g.enemies,...g.groundEnemies].some(e=>e.arenaEnemy),
        [...g.enemies,...g.groundEnemies].filter(e=>e.arenaEnemy).length);

  // and it survives a real run
  for(let i=0;i<240;i++){
    g.player.invuln=999; g.player.hp=Math.max(g.player.hp,3);
    step(1);
  }
  check('the crevasse simulates without blowing up', g.STATE==='playing', g.STATE);
}

// ── scenario 87: the pouch is not the bank ──────────────────
{
  const {g,step,store}=run({map:true});
  g.startWorld(0);
  check('a new player has an empty bank', g.bank.coins===0, g.bank.coins);
  check('...and an empty pouch', g.runCoins===0, g.runCoins);
  check('nothing has been written to the store yet',
        store.getItem('neonDinoBank')===null, store.getItem('neonDinoBank'));

  g.player.hp=99; g.player.invuln=999;
  step(3);
  // walk the dino onto the coins the stage laid out
  const before=g.runCoins;
  let picked=0;
  for(let i=0;i<260 && picked<3;i++){
    const c=g.coins.filter(c=>!c.collected)[0];
    if(!c) break;
    g.player.x=c.x-g.PLAYER_W/2; g.player.y=c.y-g.PLAYER_H/2;
    g.player.vx=0; g.player.vy=0; g.player.invuln=999; g.player.hp=99;
    step(1);
    if(g.runCoins>before+picked) picked++;
  }
  check('collecting a coin fills the pouch', g.runCoins>before, before+' -> '+g.runCoins);
  check('...and NOT the bank', g.bank.coins===0, g.bank.coins);
  check('...and nothing is persisted mid-stage',
        store.getItem('neonDinoBank')===null, store.getItem('neonDinoBank'));
  g.drawHUD();
  check('the HUD renders the pouch', true);
}

// ── scenario 88: the rift pays, and the payment is kept ─────
{
  const {g,step,store}=run({map:true});
  g.startWorld(0);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  g.runCoins=40;
  const parts=g.computePayout('A');
  check('the payout is built from parts that add up',
        parts.total===parts.scaled+parts.first,
        parts.scaled+'+'+parts.first+' vs '+parts.total);
  check('...the pouch is in it', parts.coins===40, parts.coins);
  check('...and the grade multiplies it', parts.mult===g.GRADE_MULT['A'], parts.mult);

  const got=g.bankStageClear('A');
  check('reaching the rift banks the payout', g.bank.coins===got.total,
        g.bank.coins+' vs '+got.total);
  check('...and empties the pouch', g.runCoins===0, g.runCoins);
  // asserting on the in-memory object would pass with the setItem deleted
  check('...and writes it to the store', !!store.getItem('neonDinoBank'), store.getItem('neonDinoBank'));
  const saved=JSON.parse(store.getItem('neonDinoBank'));
  check('...with the same figure in it', saved.coins===g.bank.coins,
        saved.coins+' vs '+g.bank.coins);
  check('...and the stage marked as cleared', saved.firstClear[g.levelIndex]===true,
        JSON.stringify(saved.firstClear));
}

// ── scenario 89: a replay does not pay like a first clear ───
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.player.hp=99; g.player.invuln=999;
  step(3);

  g.runCoins=40;
  const first=g.bankStageClear('A');
  check('the first clear pays its bonus', first.first===g.FIRST_CLEAR_BONUS,
        first.first);
  check('...and says so', first.firstTime===true);

  // the identical run, a second time
  g.runCoins=40;
  const again=g.bankStageClear('A');
  check('a replay pays no first-clear bonus', again.first===0, again.first);
  check('...and is therefore worth less', again.total<first.total,
        first.total+' -> '+again.total);
  check('...but is still worth something', again.total>0, again.total);
  check('the difference is exactly the bonus',
        first.total-again.total===g.FIRST_CLEAR_BONUS,
        (first.total-again.total)+' vs '+g.FIRST_CLEAR_BONUS);
}

// ── scenario 90: the grade is what you are paid for ─────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  // hold everything else still and vary ONLY the letter
  const at=(letter)=>{ g.runCoins=40; return g.computePayout(letter); };
  const S=at('S'), D=at('D');
  check('an S pays more than a D', S.total>D.total, D.total+' -> '+S.total);
  check('...and the gap is the multiplier, not a fudge',
        S.scaled===Math.round((40+D.rescue)*g.GRADE_MULT['S']),
        S.scaled+' vs '+Math.round((40+D.rescue)*g.GRADE_MULT['S']));
  // and the ladder is monotonic, which one pair cannot show
  const letters=['D','C','B','A','S'];
  let rising=true, seen=[];
  let prev=-1;
  for(const l of letters){ const v=at(l).total; seen.push(l+':'+v); if(v<=prev) rising=false; prev=v; }
  check('every grade step pays more than the one below', rising, seen.join(' '));
}

// ── scenario 91: failing still pays, but not like winning ───
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  g.runCoins=40;
  const winning=g.computePayout('A').total;

  g.runCoins=40;
  const salvage=g.bankSalvage();
  check('a lost run still pays something', salvage>0, salvage);
  check('...but far less than finishing', salvage<winning,
        salvage+' vs '+winning);
  // a literal expectation, not the constant read back: salvage must be a
  // minority of what was in the pouch, whatever the rate is set to
  check('...and only a minority of the pouch', salvage<40*0.5,
        salvage+' of 40');
  check('the salvage rate is a real fraction, not a full refund',
        g.SALVAGE_FRAC>0 && g.SALVAGE_FRAC<0.5, g.SALVAGE_FRAC);
  check('...and salvage pays exactly that rate',
        salvage===Math.floor(40*g.SALVAGE_FRAC),
        salvage+' vs '+Math.floor(40*g.SALVAGE_FRAC));
  check('...and the pouch is gone either way', g.runCoins===0, g.runCoins);
  check('the bank has it', g.bank.coins===salvage, g.bank.coins);
  // and a run that collected nothing cannot conjure credits
  g.runCoins=0;
  const nothing=g.bankSalvage();
  check('an empty pouch salvages nothing', nothing===0, nothing);
}

// ── scenario 92: a continue costs you the pouch ─────────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  g.runCoins=55;
  g.loadLevel(g.levelIndex);
  check('reloading the stage empties the pouch', g.runCoins===0, g.runCoins);
  check('...and does not bank it', g.bank.coins===0, g.bank.coins);
  check('...and the coins are back on the floor to collect again',
        g.coins.filter(c=>!c.collected).length>0,
        g.coins.length);
}

// ── scenario 93: spending ───────────────────────────────────
{
  const {g,step,store}=run({map:true});
  g.startWorld(0);
  step(3);
  g.runCoins=100;
  g.bankStageClear('D');
  const have=g.bank.coins;
  check('there is money to spend', have>0, have);
  check('you cannot spend what you do not have',
        g.spendCoins(have+1)===false && g.bank.coins===have, g.bank.coins);
  check('you can spend what you do', g.spendCoins(have)===true, g.bank.coins);
  check('...and it comes off the balance', g.bank.coins===0, g.bank.coins);
  check('...and the store agrees',
        JSON.parse(store.getItem('neonDinoBank')).coins===0,
        store.getItem('neonDinoBank'));
  check('...but the lifetime total is not rewritten', g.bank.earned===have,
        g.bank.earned+' vs '+have);
}

// ── scenario 94: the hangar sells things ────────────────────
{
  const {g,step,store}=run({map:true});
  check('there is a catalogue', g.UPGRADES.length>=5, g.UPGRADES.length);
  check('nothing is owned to begin with',
        g.UPGRADES.every(u=>g.upgradeLevel(u.id)===0),
        g.UPGRADES.map(u=>u.id+':'+g.upgradeLevel(u.id)).join(' '));
  check('everything has a price', g.UPGRADES.every(u=>g.upgradeCost(u.id)>0));
  check('...and nothing is free later either: prices climb',
        g.UPGRADES.every(u=>u.costs.every((c,i)=>i===0||c>u.costs[i-1])),
        g.UPGRADES.map(u=>u.id+':'+u.costs.join('/')).join(' '));

  check('a broke player can afford nothing',
        g.UPGRADES.every(u=>g.canAfford(u.id)===false), g.bank.coins);
  const id=g.UPGRADES[0].id;
  check('...and buying is refused', g.buyUpgrade(id)===false);
  check('...leaving the level alone', g.upgradeLevel(id)===0);
  check('...and the balance alone', g.bank.coins===0, g.bank.coins);

  // give it money the way the game does
  g.runCoins=4000; g.bankStageClear('D');
  const before=g.bank.coins;
  const cost=g.upgradeCost(id);
  check('now it can be afforded', g.canAfford(id)===true, before+' vs '+cost);
  check('buying works', g.buyUpgrade(id)===true);
  check('...the level went up', g.upgradeLevel(id)===1, g.upgradeLevel(id));
  check('...the money came off', g.bank.coins===before-cost,
        g.bank.coins+' vs '+(before-cost));
  // and it is kept: asserting on the object alone would pass with the save deleted
  const saved=JSON.parse(store.getItem('neonDinoBank'));
  check('...and the purchase is written to the store', (saved.up||{})[id]===1,
        JSON.stringify(saved.up));
}

// ── scenario 95: a level cap that means it ──────────────────
{
  const {g}=run({map:true});
  g.runCoins=40000; g.bankStageClear('D');
  const u=g.UPGRADES[0];
  let bought=0;
  for(let i=0;i<20;i++) if(g.buyUpgrade(u.id)) bought++;
  check('you can buy every level it has', bought===u.costs.length,
        bought+' of '+u.costs.length);
  check('...and then it is maxed', g.upgradeLevel(u.id)===g.upgradeMax(u.id),
        g.upgradeLevel(u.id));
  check('a maxed upgrade has no price', g.upgradeCost(u.id)===null,
        g.upgradeCost(u.id));
  check('...and refuses to be bought again', g.buyUpgrade(u.id)===false);
  check('...even with money to burn', g.bank.coins>0, g.bank.coins);
  check('...and the level did not creep past the cap',
        g.upgradeLevel(u.id)===u.costs.length, g.upgradeLevel(u.id));
}

// ── scenario 96: every upgrade actually does something ──────
{
  const {g}=run({map:true});
  g.runCoins=40000; g.bankStageClear('D');
  // measure each effect before and after maxing its own upgrade
  const probes={
    hearts:   ()=>g.maxHearts(),
    tank:     ()=>g.jetUseMult(),
    regen:    ()=>g.jetRegenMult(),
    credits:  ()=>g.maxContinues(),
    insurance:()=>g.salvageFrac(),
    magnet:   ()=>g.collectRadius(),
  };
  const moved=[];
  for(const u of g.UPGRADES){
    const probe=probes[u.id];
    if(!probe){ moved.push(u.id+':NO PROBE'); continue; }
    const was=probe();
    for(let i=0;i<u.costs.length;i++) g.buyUpgrade(u.id);
    const now=probe();
    if(now===was) moved.push(u.id+':'+was+'->'+now);
  }
  check('buying an upgrade changes what it claims to change',
        moved.length===0, moved.join(' '));

  // and the direction is the helpful one
  check('more hearts is more', g.maxHearts()>g.BASE_HEARTS, g.maxHearts());
  check('a bigger tank burns slower', g.jetUseMult()<1, g.jetUseMult());
  check('faster refill is faster', g.jetRegenMult()>1, g.jetRegenMult());
  check('more credits is more', g.maxContinues()>g.MAX_CONTINUES, g.maxContinues());
  check('insurance pays better', g.salvageFrac()>g.SALVAGE_FRAC, g.salvageFrac());
  check('...but never the whole pouch', g.salvageFrac()<1, g.salvageFrac());
  check('the magnet reaches further', g.collectRadius()>50, g.collectRadius());
}

// ── scenario 97: capability, not power ──────────────────────
{
  const {g,step}=run({map:true});
  g.runCoins=40000; g.bankStageClear('D');
  for(const u of g.UPGRADES) for(let i=0;i<u.costs.length;i++) g.buyUpgrade(u.id);

  // The rule the whole layer rests on. If a damage or speed upgrade is ever
  // added, this is where the decision has to be made consciously instead of
  // by accident.
  const ALLOWED=['hearts','tank','regen','credits','insurance','magnet','squad'];
  const stray=g.UPGRADES.filter(u=>!ALLOWED.includes(u.id)).map(u=>u.id);
  check('the catalogue sells only capability', stray.length===0, stray.join(' '));

  check('nothing bought made the dino faster', g.MOVE_SPD===200, g.MOVE_SPD);
  const beforeAmmo=Object.entries(g.WEAPONS).map(([k,v])=>k+':'+v.ammo).join(' ');
  check('nothing bought rewrote the arsenal',
        beforeAmmo===Object.entries(g.WEAPONS).map(([k,v])=>k+':'+v.ammo).join(' '));
}

// ── scenario 98: the upgrades reach the actual game ─────────
{
  const {g,step}=run({map:true});
  g.runCoins=40000; g.bankStageClear('D');
  const plainHearts=g.maxHearts(), plainCredits=g.maxContinues();
  g.startWorld(0); step(2);
  check('a fresh mission starts on the stock heart count',
        g.player.maxHp===plainHearts, g.player.maxHp+' vs '+plainHearts);
  check('...and the stock credits', g.continuesLeft===plainCredits,
        g.continuesLeft+' vs '+plainCredits);

  // buy the armour and the spare credits, then start again
  for(let i=0;i<3;i++) g.buyUpgrade('hearts');
  g.buyUpgrade('credits');
  g.startWorld(0); step(2);
  check('the armour plating is on the dino', g.player.maxHp===g.maxHearts(),
        g.player.maxHp+' vs '+g.maxHearts());
  check('...and it is more than stock', g.player.maxHp>plainHearts,
        plainHearts+' -> '+g.player.maxHp);
  check('the spare credit is in the rack', g.continuesLeft===g.maxContinues(),
        g.continuesLeft+' vs '+g.maxContinues());
  check('...and it is more than stock', g.continuesLeft>plainCredits,
        plainCredits+' -> '+g.continuesLeft);

  // ── the magnet has to reach the COINS, not just the getter ──
  // A coin parked further than the stock radius and nearer than the upgraded
  // one: whether it is collected is the whole question.
  const reachTest=(dist)=>{
    g.loadLevel(g.levelIndex);
    g.player.hp=99; g.player.invuln=999; g.player.activePower=null;
    step(2);
    const c=g.coins.filter(c=>!c.collected)[0];
    // park it in open air with the dino beside it, and hold both still
    c.x=600; c.y=200; c.bob=0;
    for(let i=0;i<4;i++){
      g.player.x=c.x-dist-g.PLAYER_W/2;
      g.player.y=c.y-g.PLAYER_H/2;
      g.player.vx=0; g.player.vy=0;
      g.player.invuln=999; g.player.activePower=null;
      c.x=600; c.y=200; c.bob=0;
      step(1);
      // collection sets popping first; collected only lands 0.35s later
      if(c.popping||c.collected) return true;
    }
    return !!(c.popping||c.collected);
  };
  check('a coin inside the stock radius is picked up', reachTest(30)===true);
  const far=Math.round((50+g.collectRadius())/2);   // between the two radii
  check('...and one beyond it is not, while the magnet is unbought',
        reachTest(far)===false, far+'px vs stock 50');
  g.buyUpgrade('magnet'); g.buyUpgrade('magnet');
  check('the magnet upgrade widens the reach', g.collectRadius()>far,
        g.collectRadius()+' vs '+far);
  check('...and the game actually collects at the wider reach',
        reachTest(far)===true, far+'px vs '+g.collectRadius());

  // insurance reaches the salvage too
  g.runCoins=100;
  const insured=g.bankSalvage();
  check('insurance is not bought yet, so salvage is the base rate',
        insured===Math.floor(100*g.SALVAGE_FRAC), insured);
  g.buyUpgrade('insurance');
  g.runCoins=100;
  const better=g.bankSalvage();
  check('buying insurance pays back more on the next loss', better>insured,
        insured+' -> '+better);
}

// ── scenario 99: the screen ─────────────────────────────────
{
  const {g,step,keys,click}=run({map:true});
  check('the game opens on the map', g.STATE==='map', g.STATE);
  g.drawWorldMap();
  check('the map draws its way in', true);

  // H opens it
  keys({KeyH:true});
  step(30);
  keys({KeyH:false});
  check('H opens the hangar', g.STATE==='hangar', g.STATE);
  g.drawHangar();
  check('the hangar renders', true);

  // the cursor moves and wraps
  const first=g.hangarSel;
  // a press is an EDGE: the key has to be seen released on a frame before
  // the next press counts, which is automatic in the game and manual here
  const tapDown=()=>{ keys({ArrowDown:true}); g.updateHangar(0.016);
                      keys({ArrowDown:false}); g.updateHangar(0.016); };
  tapDown();
  check('down moves the cursor', g.hangarSel!==first, g.hangarSel);
  g.hangarSel=g.UPGRADES.length-1;
  tapDown();
  check('...and wraps at the bottom', g.hangarSel===0, g.hangarSel);

  // escape goes back
  keys({Escape:true}); g.updateHangar(0.016); keys({Escape:false});
  check('escape returns to the map', g.STATE==='map', g.STATE);
}

// ── scenario 100: tapping it, on a tablet ───────────────────
{
  const {g,step,click}=run({map:true});
  g.touchMode=true;
  g.runCoins=4000; g.bankStageClear('D');
  const money=g.bank.coins;

  // the map's hangar button
  const hb=g.mapHangarButton();
  click(hb.x+hb.w/2,hb.y+hb.h/2);
  check('tapping HANGAR on the map opens it', g.STATE==='hangar', g.STATE);

  // a row is where it is drawn: same geometry for both
  const row=2;
  const rowY=112+row*44+10;
  check('the tap geometry agrees with the drawn rows',
        g.hangarRowAt(70+10,rowY)===row, g.hangarRowAt(70+10,rowY));
  check('...and a tap outside the panel hits nothing',
        g.hangarRowAt(5,rowY)===-1 && g.hangarRowAt(70+10,20)===-1);

  const id=g.UPGRADES[row].id;
  const cost=g.upgradeCost(id);
  click(70+10,rowY);
  check('tapping a row buys it', g.upgradeLevel(id)===1, g.upgradeLevel(id));
  check('...and charges for it', g.bank.coins===money-cost,
        g.bank.coins+' vs '+(money-cost));
  check('...and leaves that row selected', g.hangarSel===row, g.hangarSel);

  // the way out
  const b=g.hangarBackButton();
  click(b.x+b.w/2,b.y+b.h/2);
  check('tapping HARİTA leaves the hangar', g.STATE==='map', g.STATE);
}

// ── scenario 101: the economy stays in its band ─────────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.player.hp=99; g.player.invuln=999;
  step(3);

  const cheapest=Math.min(...g.UPGRADES.map(u=>u.costs[0]));
  const catalogue=g.UPGRADES.reduce((s,u)=>s+u.costs.reduce((a,b)=>a+b,0),0);

  // a good first clear: a full pouch, the whole brood out, an A
  g.rescuedThisLevel=g.LEVELS[g.levelIndex].cages.length;
  g.runCoins=40;
  const good=g.computePayout('A').total;

  check('a good stage is worth having', good>=cheapest*0.6,
        good+' vs cheapest '+cheapest);
  check('...but one stage does not buy the shop out', good<catalogue/6,
        good+' vs catalogue '+catalogue);
  check('...and it takes more than one run to afford the dearest thing',
        good<Math.max(...g.UPGRADES.map(u=>u.costs[u.costs.length-1])),
        good+' vs dearest '+Math.max(...g.UPGRADES.map(u=>u.costs[u.costs.length-1])));

  // a bad run must not pay like a good one, or the grade stops meaning
  // anything the moment the numbers are tuned
  g.rescuedThisLevel=0; g.runCoins=40;
  const bad=g.computePayout('D').total;
  check('a bad clear pays much less than a good one', bad<good*0.6,
        bad+' vs '+good);

  // and a replay of a cleared stage has to stay the weakest option
  g.bank.firstClear[g.levelIndex]=true;
  g.rescuedThisLevel=g.LEVELS[g.levelIndex].cages.length;
  g.runCoins=40;
  const replay=g.computePayout('A').total;
  check('a replay pays less than a first clear', replay<good, replay+' vs '+good);

  // the floor coin is the farmable part: it must stay the cheapest credit in
  // the game, or grinding the easiest stage becomes the best-paying play
  check('a floor coin is worth less than a kill drop',
        1<Math.min(...Object.values(g.COIN_VALUE)),
        JSON.stringify(g.COIN_VALUE));
  check('...and far less than delivering a hatchling', g.RESCUE_VALUE>=10,
        g.RESCUE_VALUE);
}

// ── scenario 102: every cage holds somebody ─────────────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  check('the brood starts empty', g.roster.members.length===0, g.roster.members.length);

  const rec=g.makeHatchling('baby');
  check('a hatchling has a name', typeof rec.name==='string' && rec.name.length>0, rec.name);
  check('...a role from the roster', g.ROLE_IDS.includes(rec.role), rec.role);
  check('...and is not home yet', rec.home===false);
  check('...nor counted before it arrives', g.roster.members.length===0);

  // names must not repeat, or losing one of two PATİs means nothing
  const many=[];
  for(let i=0;i<12;i++){ const r=g.makeHatchling('baby'); g.enrolHatchling(r,'D'); many.push(r.name); }
  check('names do not repeat inside the brood',
        new Set(many).size===many.length, many.join(' '));
  check('ids do not repeat either',
        new Set(g.roster.members.map(m=>m.id)).size===g.roster.members.length);
}

// ── scenario 103: freeing a cage names the occupant ─────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  const cage=g.cages[0];
  check('there is a cage', !!cage);
  g.breakCage(cage);
  check('the train gained a hatchling', g.followers.length===1, g.followers.length);
  const f=g.followers[0];
  check('...and it is somebody', !!f.rec && !!f.rec.name, f.rec&&f.rec.name);
  check('...who is not home yet', f.rec.home===false);
  check('...and the brood has not grown', g.roster.members.length===0);
  g.drawFollowers();
  check('the train draws its name tags', true);
}

// ── scenario 104: the rift is what makes it permanent ───────
{
  const {g,step,store}=run({map:true});
  g.startWorld(0);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  const rec=g.makeHatchling('baby');
  check('nothing is stored yet', store.getItem('neonDinoRoster')===null);

  g.enrolHatchling(rec,'A');
  check('delivering enrols it', g.roster.members.length===1, g.roster.members.length);
  check('...and it knows it is home', rec.home===true);
  // asserting on the array alone would pass with the save deleted
  const saved=JSON.parse(store.getItem('neonDinoRoster'));
  check('...and it is written to the store', saved.members.length===1,
        store.getItem('neonDinoRoster'));
  check('...with the name intact', saved.members[0].name===rec.name,
        saved.members[0].name+' vs '+rec.name);

  // enrolling the same individual twice must not clone it
  g.enrolHatchling(rec,'A');
  check('the same hatchling cannot arrive twice', g.roster.members.length===1,
        g.roster.members.length);
}

// ── scenario 105: seniority comes from the grade ────────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  step(3);
  const rankOf=(letter)=>{ const r=g.makeHatchling('baby'); g.enrolHatchling(r,letter); return r.rank; };
  const s_=rankOf('S'), a_=rankOf('A'), b_=rankOf('B'), c_=rankOf('C'), d_=rankOf('D');
  check('an S delivers a seasoned hatchling', s_>d_, 'S:'+s_+' D:'+d_);
  check('...and a B beats a D too', b_>d_, 'B:'+b_+' D:'+d_);
  check('the ladder never goes backwards',
        s_>=a_ && a_>=b_ && b_>=c_ && c_>=d_,
        [s_,a_,b_,c_,d_].join(','));
  check('every rank is a real one', [s_,a_,b_,c_,d_].every(r=>r>=1&&r<=3),
        [s_,a_,b_,c_,d_].join(','));
}

// ── scenario 106: a loss is a name that never arrives ───────
{
  const {g,step,store}=run({map:true});
  g.startWorld(0);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  const cage=g.cages[0];
  g.breakCage(cage);
  const f=g.followers[0];
  const name=f.rec.name;

  // scare it off and let the window run out
  g.panicFollower(0);
  check('it broke away', g.scaredBabies.length===1, g.scaredBabies.length);
  check('...still carrying its name', g.scaredBabies[0].rec &&
        g.scaredBabies[0].rec.name===name, name);
  const before=g.roster.lost;
  g.loseBaby(g.scaredBabies[0],false);
  check('losing it is counted', g.roster.lost===before+1, g.roster.lost);
  check('...it never reaches the brood', g.roster.members.length===0);
  check('...and the debrief is told who', g.lastLostName===name,
        g.lastLostName+' vs '+name);
  check('...the loss is persisted', JSON.parse(store.getItem('neonDinoRoster')).lost===before+1);
}

// ── scenario 107: catching it back keeps who it was ─────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  g.breakCage(g.cages[0]);
  const name=g.followers[0].rec.name;
  g.panicFollower(0);
  const stray=g.scaredBabies[0];
  g.recaptureBaby(stray);
  check('it is back on the train', g.followers.length===1, g.followers.length);
  check('...and it is the same hatchling', g.followers[0].rec &&
        g.followers[0].rec.name===name,
        (g.followers[0].rec||{}).name+' vs '+name);
}

// ── scenario 108: the brood trains the escort ───────────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.player.hp=99; g.player.invuln=999;
  step(3);

  // with an empty brood the escort must behave exactly as it always did
  const stock=(n)=>{
    g.roster.members.length=0;
    g.followers.length=0;
    for(let i=0;i<n;i++) g.followers.push({x:0,y:0,bob:0,facing:1,species:'baby'});
    return g.followerPower();
  };
  check('no brood, no escort, no bonus', stock(0).beamMult===1, stock(0).beamMult);
  check('one hatchling still ticks the beam faster', stock(1).beamMult===0.78,
        stock(1).beamMult);
  check('two still refuel', stock(2).fuelMult===1.9, stock(2).fuelMult);
  check('three still open fire', stock(3).shooting===true);
  check('...and two do not, with no brood behind them', stock(2).shooting===false);

  // a gunner brood sharpens the beam line
  const beam2=stock(2).beamMult;
  g.roster.members.length=0;
  for(let i=0;i<4;i++) g.roster.members.push({id:i,name:'G'+i,role:'gunner',rank:3});
  g.followers.length=0;
  for(let i=0;i<2;i++) g.followers.push({x:0,y:0,bob:0,facing:1,species:'baby'});
  check('a gunner brood is a tier', g.broodTier('gunner')>0, g.broodTier('gunner'));
  check('...and it sharpens the beam', g.followerPower().beamMult<beam2,
        beam2+' -> '+g.followerPower().beamMult);

  // a guard brood lets two open fire
  g.roster.members.length=0;
  for(let i=0;i<4;i++) g.roster.members.push({id:i,name:'K'+i,role:'guard',rank:3});
  check('a guard brood opens fire one hatchling early',
        g.followerPower().shooting===true, g.followerPower().shooting);

  // a tech brood refuels harder
  g.roster.members.length=0;
  for(let i=0;i<4;i++) g.roster.members.push({id:i,name:'T'+i,role:'tech',rank:3});
  check('a tech brood refuels harder', g.followerPower().fuelMult>1.9,
        g.followerPower().fuelMult);

  // none of it works with nobody in the train: the brood trains an escort,
  // it does not replace one
  g.followers.length=0;
  const empty=g.followerPower();
  check('an empty train gets nothing from the brood',
        empty.beamMult===1 && empty.fuelMult===1 && empty.shooting===false,
        JSON.stringify(empty));
}

// ── scenario 109: the brood bonus saturates ─────────────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  step(3);
  g.followers.length=0;
  for(let i=0;i<3;i++) g.followers.push({x:0,y:0,bob:0,facing:1,species:'baby'});

  const withBrood=(n)=>{
    g.roster.members.length=0;
    for(let i=0;i<n;i++) g.roster.members.push({id:i,name:'X'+i,role:'gunner',rank:3});
    return g.followerPower();
  };
  const small=withBrood(5), huge=withBrood(400);
  check('a huge brood is not a huge bonus', huge.beamMult===small.beamMult,
        small.beamMult+' vs '+huge.beamMult);
  check('the tier is capped', g.broodTier('gunner')<=3, g.broodTier('gunner'));
  check('...and the beam never turns into an instant kill',
        huge.beamMult>0.4, huge.beamMult);
  check('the fuel bonus is bounded too', withBrood(400).fuelMult<4,
        withBrood(400).fuelMult);
}

// ── scenario 110: the wall of names ─────────────────────────
{
  const {g,step,keys,click}=run({map:true});
  check('the map is where it starts', g.STATE==='map');
  g.drawWorldMap();
  check('the map draws the way to the brood', true);

  keys({KeyB:true});
  step(30);
  keys({KeyB:false});
  check('B opens the brood screen', g.STATE==='brood', g.STATE);
  g.drawBrood();
  check('an empty brood still renders', true);

  // fill it and draw again
  for(let i=0;i<25;i++)
    g.roster.members.push({id:100+i,name:'AD'+i,role:g.ROLE_IDS[i%3],rank:(i%3)+1});
  g.drawBrood();
  check('a full brood renders', true);
  keys({ArrowDown:true}); g.updateBrood(0.5); keys({ArrowDown:false});
  g.drawBrood();
  check('...and scrolls', true);

  keys({Escape:true}); g.updateBrood(0.016); keys({Escape:false});
  check('escape goes back to the map', g.STATE==='map', g.STATE);

  // and the tablet way in and out
  g.touchMode=true;
  const bb=g.mapBroodButton();
  click(bb.x+bb.w/2,bb.y+bb.h/2);
  check('tapping SOY opens it', g.STATE==='brood', g.STATE);
  const back=g.broodBackButton();
  click(back.x+back.w/2,back.y+back.h/2);
  check('tapping HARİTA leaves it', g.STATE==='map', g.STATE);
}

// ── scenario 111: every biome has its own sky ───────────────
{
  const {g,step}=run({map:true});
  const seen={};
  for(const [name,th] of Object.entries(g.THEMES)){
    if(!th.bg) continue;
    check(name+' names a backdrop of its own', typeof th.bg==='string', th.bg);
    check('...and nobody else uses it', !seen[th.bg], th.bg+' also on '+seen[th.bg]);
    seen[th.bg]=name;
  }
  check('all three playable biomes have one',
        ['volcano','forest','ice'].every(k=>!!g.THEMES[k].bg),
        ['volcano','forest','ice'].map(k=>k+':'+(g.THEMES[k].bg||'-')).join(' '));
  check('each names its own atmosphere too',
        ['volcano','forest','ice'].every(k=>!!g.THEMES[k].atmos),
        ['volcano','forest','ice'].map(k=>k+':'+(g.THEMES[k].atmos||'-')).join(' '));
  check('...and the three are different',
        new Set(['volcano','forest','ice'].map(k=>g.THEMES[k].atmos)).size===3,
        ['volcano','forest','ice'].map(k=>g.THEMES[k].atmos).join(','));
}

// ── scenario 112: the stage draws the backdrop it asked for ─
{
  const {g,step,drawStats,artLoads}=run({map:true});
  // one stage per biome: volcano 0, forest 3, ice 6
  for(const [li,want] of [[0,'volcano_bg.png'],[3,'forest_bg.png'],[6,'ice_bg.png']]){
    g.startWorld(0);
    g.loadLevel(li);
    g.player.hp=99; g.player.invuln=999;
    step(2);
    drawStats.images.length=0;
    drawStats.quad=0;
    g.drawBiomeBG();
    const srcs=drawStats.images.map(im=>String(im.src||''));
    // resolve through assetURL: a filename in the folder build, a data: URI
    // in the bundle, and the comparison works in both
    const url=(n)=>String(g.assetURL(n));
    if(artLoads){
      check('stage '+li+' draws '+want,
            srcs.some(sname=>sname===url(want)),
            srcs.map(x=>x.slice(0,42)).join(',')||'(nothing drawn)');
      // and only its own: a biome borrowing another's sky is the bug here
      const others=['volcano_bg.png','forest_bg.png','ice_bg.png'].filter(o=>o!==want);
      check('...and none of the others',
            !srcs.some(sname=>others.some(o=>sname===url(o))),
            srcs.map(x=>x.slice(0,42)).join(','));
    } else {
      check('stage '+li+' blits no backdrop when the sheet never arrives',
            srcs.length===0, srcs.join(','));
      check('...and still paints the plate behind it', true);
    }
  }
}

// ── scenario 113: it tiles forever, at a quarter speed ──────
{
  const {g,step,drawStats,artLoads}=run({map:true});
  g.startWorld(0);
  g.loadLevel(0);
  g.player.hp=99; g.player.invuln=999;
  step(2);

  check('the backdrop drifts slower than the world', g.BG_PARALLAX<1, g.BG_PARALLAX);
  check('...but it does drift', g.BG_PARALLAX>0, g.BG_PARALLAX);

  // the strip has to cover the canvas at any camera position, including
  // absurd ones — a gap here is a tear in the sky
  const coverAt=(cx)=>{
    g.camX=cx;
    drawStats.images.length=0;
    g.drawBiomeBG();
    const vurl=String(g.assetURL('volcano_bg.png'));
    const tiles=drawStats.images.filter(im=>String(im.src||'')===vurl);
    if(!tiles.length) return null;
    // sort by destination x and look for a hole between consecutive tiles
    const spans=tiles.map(im=>[Math.min(im.dx,im.dx+im.dw),Math.max(im.dx,im.dx+im.dw)])
                     .sort((a,b)=>a[0]-b[0]);
    let covered=spans[0][0]<=0, edge=spans[0][1];
    for(let i=1;i<spans.length;i++){
      if(spans[i][0]>edge+0.5){ covered=false; break; }
      edge=Math.max(edge,spans[i][1]);
    }
    return covered && edge>=900;
  };
  if(artLoads){
    const probes=[0,137,900,5000,-800,123456];
    const holes=probes.filter(cx=>coverAt(cx)!==true);
    check('the sky has no seam at any camera position', holes.length===0,
          'gaps at camX '+holes.join(','));

    // and it really is scrolling: the same tile lands somewhere else
    g.camX=0;  drawStats.images.length=0; g.drawBiomeBG();
    const vu=String(g.assetURL('volcano_bg.png'));
    const lead=(arr)=>{
      const t=arr.filter(im=>String(im.src||'')===vu)
                 .map(im=>Math.min(im.dx,im.dx+im.dw)).sort((p,q)=>p-q);
      return t.length?t[0]:null;
    };
    const a={dx:lead(drawStats.images)};
    // a SMALL move: shift the camera far enough and the tile set wraps, so
    // the leftmost tile becomes a different tile and the measurement stops
    // being about parallax at all
    g.camX=40; drawStats.images.length=0; g.drawBiomeBG();
    const b={dx:lead(drawStats.images)};
    check('the backdrop moves with the camera', a && b && a.dx!==b.dx,
          (a&&a.dx)+' -> '+(b&&b.dx));
    // ...and slower than the world does, which is the whole point of parallax
    // The strip repeats every tile width, so its position is only meaningful
    // MODULO one tile: a shift of one whole tile is the same picture. Measure
    // the circular distance, which is what the eye actually sees move.
    const tileW=Math.abs((drawStats.images.filter(im=>String(im.src||'')===vu)[0]||{}).dw||0);
    let shift=null;
    if(a.dx!==null && b.dx!==null && tileW>0){
      const d=Math.abs(b.dx-a.dx)%tileW;
      shift=Math.min(d,tileW-d);
    }
    check('...but slower than the world', shift!==null && shift>0 && shift<40,
          'camera 40 -> backdrop '+(shift===null?'?':shift.toFixed(1))+' (tile '+tileW.toFixed(0)+')');
  }
}

// ── scenario 114: each biome breathes its own air ───────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  step(2);
  // drive the atmosphere pass hard and see what colour comes out
  const sample=(kind)=>{
    g.particles.length=0;
    for(let i=0;i<600;i++) g.drawAtmosphere({atmos:kind});
    return g.particles.slice();
  };
  const ash=sample('ash'), spore=sample('spore'), snow=sample('snow');
  check('the volcano puts ash in the air', ash.length>0, ash.length);
  check('the canopy puts spores in it', spore.length>0, spore.length);
  check('the peaks put snow in it', snow.length>0, snow.length);

  // ash rises, snow falls. That is the whole difference and it is testable.
  check('ash drifts upward', ash.every(p=>p.vy<0), ash.filter(p=>p.vy>=0).length+' fell');
  check('snow drifts downward', snow.every(p=>p.vy>0), snow.filter(p=>p.vy<=0).length+' rose');
  check('ash is warm-coloured',
        ash.every(p=>/255,(1[0-9]|[2-9][0-9])|120,60,40/.test(p.color)),
        ash.slice(0,3).map(p=>p.color).join(' '));
  check('spores are green',
        spore.every(p=>/110,231,183|52,211,153/.test(p.color)),
        spore.slice(0,3).map(p=>p.color).join(' '));

  // and an unnamed biome gets nothing rather than somebody else's weather
  g.particles.length=0;
  for(let i=0;i<600;i++) g.drawAtmosphere({});
  check('a biome with no atmosphere gets none', g.particles.length===0,
        g.particles.length);
}

// ── scenario 115: a key on a perch, off the route ───────────
{
  const {g,step}=run({map:true});
  const withKey=g.LEVELS.map((L,i)=>L.secretKey?i:-1).filter(i=>i>=0);
  check('three stages hide a key', withKey.length===3, withKey.join(','));
  check('...one per biome',
        new Set(withKey.map(i=>g.LEVELS[i].theme)).size===3,
        withKey.map(i=>g.LEVELS[i].theme).join(','));

  for(const li of withKey){
    const L=g.LEVELS[li];
    const k=L.secretKey;
    // it has to STAND on something, or it is floating in the sky
    const perch=L.platforms.find(p=>!p.lavaPit && Math.abs(p.y-k.y)<4 &&
                                    p.x<=k.x && p.x+p.w>=k.x);
    check('stage '+li+' key stands on a ledge', !!perch,
          JSON.stringify(k)+' -> '+(perch?perch.x+'@'+perch.y:'nothing'));
    // ...and that ledge has to be ABOVE everything on the ordinary route.
    // A lowBar or a curtain hangs from the ceiling and is a blocker rather
    // than somewhere to stand, so neither counts as a higher ledge — the
    // reachability audit excludes curtains for the same reason.
    const standable=(p)=>!p.lavaPit && !p.lowBar && !p.curtain;
    const higher=L.platforms.filter(p=>standable(p) && !p.goal && p!==perch && p.y<perch.y);
    check('...and it is the highest ledge in the stage', higher.length===0,
          higher.map(p=>p.x+'@'+p.y).join(' '));
    // the route's own ledges are well below it, so it is a detour
    const route=L.platforms.filter(p=>standable(p)&&p!==perch&&p.y<g.GROUND_Y);
    const nearest=Math.min(...route.map(p=>p.y-perch.y));
    check('...a real climb above the route', nearest>=80, nearest);
  }
}

// ── scenario 116: picking it up ─────────────────────────────
{
  const {g,step,store}=run({map:true});
  g.startWorld(0);
  g.loadLevel(0);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  check('the stage laid out its key', !!g.secretKey, g.secretKey);
  check('...and it is not held yet', g.keyHeld()===false);
  check('...and nothing is sealed yet', store.getItem('neonDinoSecrets')===null);
  g.drawSecretKey();
  check('the key renders', true);

  const k=g.secretKey;
  const before=g.score;
  for(let i=0;i<8 && !g.keyHeld();i++){
    g.player.x=k.x-g.PLAYER_W/2; g.player.y=k.y-g.PLAYER_H;
    g.player.vx=0; g.player.vy=0; g.player.invuln=999; g.player.hp=99;
    step(1);
  }
  check('touching it takes it', g.keyHeld()===true);
  check('...and says so on screen', g.keyNoticeTimer>0, g.keyNoticeTimer);
  g.drawKeyNotice();
  check('...the KEY COLLECTED notice renders', true);
  check('the key alone is worth no score', g.score===before, before+' -> '+g.score);
  check('the stage is sealed', g.hasSeal(0)===true);
  // asserting the in-memory object would pass with the setItem deleted
  const saved=JSON.parse(store.getItem('neonDinoSecrets'));
  check('...and the seal is written to the store', saved['stage0_key']===true,
        store.getItem('neonDinoSecrets'));
}

// ── scenario 117: the chest wants the key ───────────────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.loadLevel(0);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  check('there is a chest', !!g.secretChest, g.secretChest);
  const goal=g.platforms.find(p=>p.goal);
  check('...and it sits on the goal ledge',
        g.secretChest.x>=goal.x && g.secretChest.x<=goal.x+goal.w,
        g.secretChest.x+' vs '+goal.x+'..'+(goal.x+goal.w));
  g.drawSecretChest();
  check('the chest renders', true);

  // walk into it with no key: nothing happens. The goal ledge has coins on
  // it, and a dino standing there collects them — so the floor is cleared
  // before the score is used as evidence of anything.
  const c=g.secretChest;
  g.coins.length=0; g.drops.length=0;
  for(const e of g.enemies) e.dead=true;
  for(const e of g.groundEnemies) e.dead=true;
  const before=g.score;
  for(let i=0;i<6;i++){
    g.player.x=c.x; g.player.y=c.y-g.PLAYER_H+20;
    g.player.vx=0; g.player.vy=0; g.player.invuln=999; g.player.hp=99;
    step(1);
  }
  check('a locked chest stays locked', g.secretChest.open===false);
  check('...and pays nothing', g.score===before, before+' -> '+g.score);
  check('...and grants no shield', !g.player.activePower, g.player.activePower);
}

// ── scenario 118: opening it ────────────────────────────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.loadLevel(0);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  // take the key first
  const k=g.secretKey;
  for(let i=0;i<8 && !g.keyHeld();i++){
    g.player.x=k.x-g.PLAYER_W/2; g.player.y=k.y-g.PLAYER_H;
    g.player.vx=0; g.player.vy=0; g.player.invuln=999;
    step(1);
  }
  check('key in hand', g.keyHeld()===true);

  const c=g.secretChest;
  g.coins.length=0; g.drops.length=0;
  for(const e of g.enemies) e.dead=true;
  for(const e of g.groundEnemies) e.dead=true;
  const before=g.score;
  for(let i=0;i<20 && !g.secretChest.open;i++){
    g.player.x=c.x; g.player.y=c.y-g.PLAYER_H+20;
    g.player.vx=0; g.player.vy=0; g.player.invuln=999; g.player.hp=99;
    step(1);
  }
  check('the key opens the chest', g.secretChest.open===true);
  check('...and it pays ten thousand', g.score-before>=g.SECRET_SCORE,
        (g.score-before)+' vs '+g.SECRET_SCORE);
  check('...and hands over a shield',
        !!g.player.activePower && g.player.activePower.kind==='shield',
        g.player.activePower && g.player.activePower.kind);
  check('...for ten seconds', !!g.player.activePower &&
        Math.abs(g.player.activePower.maxTimer-10)<0.01,
        g.player.activePower && g.player.activePower.maxTimer);
  g.drawSecretChest();
  check('an opened chest renders', true);

  // it pays once
  g.coins.length=0; g.drops.length=0;
  const after=g.score;
  for(let i=0;i<6;i++){
    g.player.x=c.x; g.player.y=c.y-g.PLAYER_H+20;
    g.player.invuln=999; step(1);
  }
  check('a chest cannot be opened twice', g.score===after, after+' -> '+g.score);
}

// ── scenario 119: the seal is a record, not an inventory ────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.loadLevel(0);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  const k=g.secretKey;
  for(let i=0;i<8 && !g.keyHeld();i++){
    g.player.x=k.x-g.PLAYER_W/2; g.player.y=k.y-g.PLAYER_H;
    g.player.vx=0; g.player.vy=0; g.player.invuln=999;
    step(1);
  }
  check('found once', g.hasSeal(0)===true);

  // replaying the stage puts the key back: the seal remembers, the run does not
  g.loadLevel(0);
  step(2);
  check('the seal survives a reload', g.hasSeal(0)===true);
  check('...but the key is back on its perch', g.keyHeld()===false);
  check('...and the chest is shut again', !!g.secretChest && g.secretChest.open===false);
}

// ── scenario 120: the map shows which keys are found ────────
{
  const {g,step}=run({map:true});
  const secretWorlds=g.WORLDS.map((w,i)=>g.worldHasSecret(i)?i:-1).filter(i=>i>=0);
  check('three worlds hide a key', secretWorlds.length===3, secretWorlds.join(','));
  check('none are found at the start',
        secretWorlds.every(i=>g.worldHasSeal(i)===false),
        secretWorlds.map(i=>i+':'+g.worldHasSeal(i)).join(' '));
  g.drawWorldMap();
  check('the map renders with the keys dim', true);

  // seal the volcano's and the map should know
  g.secretSeals['stage0_key']=true;
  check('the volcano key now reads as found', g.worldHasSeal(0)===true);
  check('...and the others still do not',
        secretWorlds.filter(i=>i!==0).every(i=>g.worldHasSeal(i)===false),
        secretWorlds.map(i=>i+':'+g.worldHasSeal(i)).join(' '));
  g.drawWorldMap();
  check('the map renders with one key lit', true);

  // a world that hides nothing gets no glyph at all
  const none=g.WORLDS.map((w,i)=>i).filter(i=>!g.worldHasSecret(i));
  check('a world with no secret shows no key', none.length>0, none.join(','));
}

// ── scenario 121: the world keeps running on a vine ─────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.loadLevel(5);              // ROTWOOD RISE: vines AND the rising fog
  g.player.hp=99; g.player.invuln=999;
  step(3);
  check('the stage hangs a vine', g.vines.length>=1, g.vines.length);

  // hang the dino on it directly: the grab itself is covered elsewhere and
  // this scenario is about what happens WHILE it hangs
  const v=g.vines[0];
  const tip=g.vineTipOf(v);
  g.player.x=tip.x-g.PLAYER_W/2; g.player.y=tip.y-g.PLAYER_H*0.35;
  g.player.vy=40; g.player.onGround=false;
  for(let i=0;i<30 && !g.vineGrab;i++){
    const tp=g.vineTipOf(v);
    g.player.invuln=999; g.player.hp=99;
    g.player.x=tp.x-g.PLAYER_W/2; g.player.y=tp.y-g.PLAYER_H*0.35;
    g.player.vy=40; g.player.onGround=false;
    step(1);
  }
  check('the dino is hanging', !!g.vineGrab);

  // ── everything below is what should keep happening while it hangs ──
  const enemy=g.enemies.filter(e=>!e.dead)[0];
  const ex0=enemy?enemy.x:null, ey0=enemy?enemy.y:null;
  const fog0=g.fogY;
  const time0=g.levelTime;
  const py0=g.player.y;

  for(let i=0;i<40;i++){ g.player.invuln=999; g.player.hp=99; step(1); }

  check('the pendulum still owns the dino', !!g.vineGrab);
  check('enemies keep moving while you hang',
        enemy ? (enemy.x!==ex0 || enemy.y!==ey0) : true,
        enemy ? (ex0+','+ey0+' -> '+enemy.x+','+enemy.y) : 'no enemy');
  check('the rising fog keeps rising', g.fogY<fog0, fog0+' -> '+g.fogY);
  check('the stage clock keeps running', g.levelTime>time0,
        time0+' -> '+g.levelTime);
  check('...and the dino did not simply fall', Math.abs(g.player.y-py0)<200,
        py0+' -> '+g.player.y);
}

// ── scenario 122: a vine is not a safe room ─────────────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.loadLevel(5);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  const v=g.vines[0];
  for(let i=0;i<30 && !g.vineGrab;i++){
    const tp=g.vineTipOf(v);
    g.player.invuln=999; g.player.hp=99;
    g.player.x=tp.x-g.PLAYER_W/2; g.player.y=tp.y-g.PLAYER_H*0.35;
    g.player.vy=40; g.player.onGround=false;
    step(1);
  }
  check('hanging', !!g.vineGrab);

  // the fog is the stage's whole pressure: if it can be waited out from a
  // vine, the climb has an exploit rather than a timer
  g.fogY=g.player.y+40;        // right under the dino's feet
  g.player.invuln=0; g.player.hp=3;
  const hp0=g.player.hp;
  let burned=false;
  for(let i=0;i<120 && !burned;i++){
    g.fogY=Math.min(g.fogY,g.player.y+40);
    step(1);
    if(g.player.hp<hp0) burned=true;
  }
  check('the rot still burns you on a vine', burned, g.player.hp+'/'+hp0);
}

// ── scenario 123: and the pendulum is still in charge ───────
{
  const {g,step,keys}=run({map:true});
  g.startWorld(0);
  g.loadLevel(4);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  const v=g.vines[0];
  for(let i=0;i<30 && !g.vineGrab;i++){
    const tp=g.vineTipOf(v);
    g.player.invuln=999; g.player.hp=99;
    g.player.x=tp.x-g.PLAYER_W/2; g.player.y=tp.y-g.PLAYER_H*0.35;
    g.player.vy=40; g.player.onGround=false;
    step(1);
  }
  check('hanging on the climb', !!g.vineGrab);

  // the dino must not be dragged down by its own gravity: on a vine the
  // pendulum decides where it is, which is exactly what the early return
  // was there to protect
  const held=[];
  for(let i=0;i<50;i++){ g.player.invuln=999; step(1); held.push(g.player.y); }
  const drop=Math.max(...held)-Math.min(...held);
  check('the dino swings rather than falls', drop<220, drop.toFixed(0));
  check('...and is still on the vine after fifty frames', !!g.vineGrab);

  // and letting go still works
  keys({Space:true});
  for(let i=0;i<4 && g.vineGrab;i++) step(1);
  keys({Space:false});
  check('jump still releases it', g.vineGrab===null);
}

// ── scenario 124: two voices, and only one of them lies ─────
{
  const {g}=run({map:true});
  check('Command has a name', g.ARC_COMMAND==='KOMUTA MERKEZİ', g.ARC_COMMAND);
  check('...and so does the archive', !!g.ARC_ARCHIVE && g.ARC_ARCHIVE!==g.ARC_COMMAND,
        g.ARC_ARCHIVE);

  // every line in the arc is hand-wrapped: the radio window does no text
  // measuring, so a long line simply runs out of it
  const every=[];
  for(const tbl of [g.ARC_BRIEF,g.ARC_STAGE,g.ARC_LOG,g.ARC_DEBRIEF])
    for(const k of Object.keys(tbl)) every.push([k,tbl[k]]);
  check('the arc has something to say', every.length>=10, every.length);
  const tooLong=every.filter(([k,ls])=>ls.some(l=>l.length>40))
                     .map(([k,ls])=>k+':'+Math.max(...ls.map(l=>l.length)));
  check('every arc line fits the comms window', tooLong.length===0,
        tooLong.join(' '));
  const tooMany=every.filter(([k,ls])=>ls.length>3).map(([k])=>k);
  check('...and no beat is taller than the window', tooMany.length===0,
        tooMany.join(' '));

  // each playable biome gets its own words, not a shared one
  for(const id of ['volcano','forest','frozen']){
    check(id+' has a briefing of its own', !!g.ARC_BRIEF[id], id);
    check(id+' has a log of its own', !!g.ARC_LOG[id], id);
  }
  const briefs=['volcano','forest','frozen'].map(i=>g.ARC_BRIEF[i].join('|'));
  check('the three briefings are different', new Set(briefs).size===3,
        briefs.join(' // '));
}

// ── scenario 125: the briefing lands on the right stage ─────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  step(2);
  check('the first stage of a world is briefed',
        !!g.radio && g.radio.lines[0]===g.ARC_BRIEF.volcano[0],
        g.radio&&g.radio.lines[0]);

  // the SECOND stage gets the filler line, not the briefing again
  g.radio=null; g.radioQueue.length=0;
  g.loadLevel(g.WORLDS[0].levels[1]);
  step(2);
  check('a later stage still opens with a transmission', !!g.radio, g.radio);
  check('...but not the briefing twice',
        !!g.radio && g.radio.lines[0]!==g.ARC_BRIEF.volcano[0],
        g.radio&&g.radio.lines[0]);
  check('...it is the filler line', !!g.radio && g.radio.lines[0]===g.ARC_STAGE.volcano[0],
        g.radio&&g.radio.lines[0]);
}

// ── scenario 126: the archive only speaks from a chest ──────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.loadLevel(0);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  g.radio=null; g.radioQueue.length=0;

  // play the whole stage without touching the chest: the archive stays shut
  for(let i=0;i<120;i++){ g.player.invuln=999; g.player.hp=99; step(1); }
  const heard=[g.radio].concat(g.radioQueue).filter(Boolean).map(r=>r.title);
  check('the archive says nothing on its own',
        !heard.includes(g.ARC_ARCHIVE), heard.join(','));

  // now open it
  g.radio=null; g.radioQueue.length=0;
  const k=g.secretKey;
  for(let i=0;i<8 && !g.keyHeld();i++){
    g.player.x=k.x-g.PLAYER_W/2; g.player.y=k.y-g.PLAYER_H;
    g.player.vx=0; g.player.vy=0; g.player.invuln=999;
    step(1);
  }
  const c=g.secretChest;
  for(let i=0;i<20 && !g.secretChest.open;i++){
    g.player.x=c.x; g.player.y=c.y-g.PLAYER_H+20;
    g.player.vx=0; g.player.vy=0; g.player.invuln=999; g.player.hp=99;
    step(1);
  }
  check('the chest was opened', g.secretChest.open===true);
  const after=[g.radio].concat(g.radioQueue).filter(Boolean);
  check('the archive speaks from inside the chest',
        after.some(r=>r.title===g.ARC_ARCHIVE),
        after.map(r=>r.title).join(','));
  const log=after.filter(r=>r.title===g.ARC_ARCHIVE)[0];
  check('...and it is the volcano record',
        !!log && log.lines[0]===g.ARC_LOG.volcano[0],
        log&&log.lines[0]);
  check('...and it contradicts nobody out loud',
        !!log && log.title!==g.ARC_COMMAND);
}

// ── scenario 127: the ending is what you did ────────────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  step(2);
  const total=g.arcFragmentsTotal();
  check('there are three records to find', total===3, total);
  check('none are found yet', g.arcFragments()===0, g.arcFragments());

  const cold=g.arcEnding();
  check('finding nothing ends it coldly', cold.id==='protocol', cold.id);

  // one record: doubt. Opened THIS run, not stamped into the permanent seal
  g.arcOpened[0]=true;
  const doubt=g.arcEnding();
  check('one record is enough to doubt', doubt.id==='doubt', doubt.id);
  check('...and it reads differently', doubt.title!==cold.title,
        cold.title+' vs '+doubt.title);

  // all of them: the way out
  g.arcOpened[3]=true;
  g.arcOpened[7]=true;
  check('all three found', g.arcFragments()===total, g.arcFragments());
  const out=g.arcEnding();
  check('the whole archive changes the ending', out.id==='escape', out.id);
  check('...and the three endings are three different endings',
        new Set([cold.id,doubt.id,out.id]).size===3,
        [cold.id,doubt.id,out.id].join(','));

  // the ending text has to fit the screen it is drawn on
  for(const e of [cold,doubt,out]){
    check(e.id+' fits on the victory screen',
          e.lines.length<=6 && e.lines.every(l=>l.length<=46),
          e.lines.length+' lines, longest '+Math.max(...e.lines.map(l=>l.length)));
  }
  g.drawArcEnding(300);
  check('the ending renders', true);
  g.drawWin();
  check('the victory screen renders with it', true);
}

// ── scenario 128: nothing is mastered to begin with ─────────
{
  const {g,step,store}=run({map:true});
  const kinds=g.arsenalKinds();
  check('there are letters to master', kinds.length>=5, kinds.join(','));
  check('the base beam is not one of them', !kinds.includes('beam'), kinds.join(','));
  check('nothing is practised yet',
        kinds.every(k=>g.masteryLevel(k)===0),
        kinds.map(k=>k+':'+g.masteryLevel(k)).join(' '));
  check('...so nothing is unlocked', kinds.every(k=>g.isUnlocked(k)===false));
  check('...but the beam always is', g.isUnlocked('beam')===true);
  check('and the loadout starts on the beam', g.arsenal.loadout==='beam',
        g.arsenal.loadout);
  check('nothing is stored yet', store.getItem('neonDinoArsenal')===null);
}

// ── scenario 129: mastery is time on the trigger ────────────
{
  const {g,step,store}=run({map:true});
  const kind=g.arsenalKinds()[0];
  check('unlock takes real practice', g.MASTERY_STEPS[0]>=5, g.MASTERY_STEPS[0]);

  // just under the first threshold
  g.addMastery(kind,g.MASTERY_STEPS[0]-0.5);
  check('nearly there is not there', g.masteryLevel(kind)===0, g.masteryLevel(kind));
  check('...and it still cannot be equipped', g.setLoadout(kind)===false);

  g.addMastery(kind,1);
  check('crossing the line unlocks it', g.masteryLevel(kind)===1, g.masteryLevel(kind));
  check('...and it is written down', !!store.getItem('neonDinoArsenal'));
  const saved=JSON.parse(store.getItem('neonDinoArsenal'));
  check('...with the practice in it', (saved.mastery||{})[kind]>0,
        JSON.stringify(saved.mastery));

  // the ladder keeps going, and stops
  g.addMastery(kind,g.MASTERY_STEPS[2]);
  check('mastery tops out', g.masteryLevel(kind)===g.MASTERY_STEPS.length,
        g.masteryLevel(kind));
  g.addMastery(kind,10000);
  check('...and stays topped out', g.masteryLevel(kind)===g.MASTERY_STEPS.length,
        g.masteryLevel(kind));
}

// ── scenario 130: mastery buys magazine, never damage ───────
{
  const {g,step}=run({map:true});
  const kind=g.arsenalKinds()[0];
  const base=g.ammoFor(kind);
  check('a fresh letter carries its table magazine',
        Math.abs(base-g.WEAPONS[kind].ammo)<0.001, base+' vs '+g.WEAPONS[kind].ammo);

  g.addMastery(kind,g.MASTERY_STEPS[1]);
  const better=g.ammoFor(kind);
  check('mastery makes the magazine bigger', better>base, base+' -> '+better);
  check('...but not endless', better<base*2, better+' vs '+base);

  // the rule the hangar established and this has to keep: capability, not
  // power. Nothing in the arsenal may touch what a shot DOES.
  const before=JSON.stringify(Object.entries(g.WEAPONS).map(([k,w])=>[k,w.letter,w.color]));
  g.addMastery(kind,g.MASTERY_STEPS[2]*2);
  const after=JSON.stringify(Object.entries(g.WEAPONS).map(([k,w])=>[k,w.letter,w.color]));
  check('mastery rewrites nothing about the weapon itself', before===after);
  check('and the dino is no faster for it', g.MOVE_SPD===200, g.MOVE_SPD);
}

// ── scenario 131: a requisitioned letter is half a magazine ─
{
  const {g,step}=run({map:true});
  const kind=g.arsenalKinds()[0];
  g.addMastery(kind,g.MASTERY_STEPS[0]+1);
  check('unlocked', g.isUnlocked(kind));
  check('equipping works', g.setLoadout(kind)===true);
  check('...and is remembered', g.arsenal.loadout===kind, g.arsenal.loadout);

  g.startWorld(0);
  step(2);
  check('the mission starts with it', g.weapon===kind, g.weapon);
  const full=g.ammoFor(kind);
  check('...on a partial magazine', g.weaponAmmo<full,
        g.weaponAmmo.toFixed(2)+' vs full '+full.toFixed(2));
  check('...but enough to be worth bringing', g.weaponAmmo>full*0.3,
        g.weaponAmmo.toFixed(2));

  // the floor capsule is still the full one, which is what keeps pickups
  // worth crossing a stage for
  g.equipWeapon(kind);
  check('a floor capsule is the full magazine',
        Math.abs(g.weaponAmmo-full)<0.001, g.weaponAmmo+' vs '+full);
}

// ── scenario 132: a locked letter cannot be smuggled in ─────
{
  const {g,step}=run({map:true});
  const kind=g.arsenalKinds()[1];
  check('it is locked', g.isUnlocked(kind)===false);
  check('equipping it is refused', g.setLoadout(kind)===false);
  check('...and the loadout is untouched', g.arsenal.loadout==='beam', g.arsenal.loadout);

  // even if the stored value is tampered with, the mission falls back
  g.arsenal.loadout=kind;
  g.startWorld(0);
  step(2);
  check('a mission will not start with a letter you never learned',
        g.weapon==='beam', g.weapon);
  check('...and the beam is endless as always', g.weaponAmmo===Infinity, g.weaponAmmo);
}

// ── scenario 133: practising happens by playing ─────────────
{
  const {g,step,keys}=run({map:true});
  g.startWorld(0);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  for(const wp of g.weaponPickups) wp.alive=false;
  const kind='spread';
  g.equipWeapon(kind);
  const t0=g.masteryTime(kind);

  keys({KeyF:true});
  for(let i=0;i<40;i++){
    g.player.invuln=999; g.player.hp=99; g.weaponAmmo=99;
    step(1);
  }
  keys({KeyF:false});
  check('firing a letter practises it', g.masteryTime(kind)>t0,
        t0+' -> '+g.masteryTime(kind));

  // and the beam, which costs nothing, teaches nothing
  g.equipWeapon('beam');
  const b0=g.masteryTime('beam');
  keys({KeyF:true});
  for(let i=0;i<30;i++){ g.player.invuln=999; step(1); }
  keys({KeyF:false});
  check('the free beam earns no mastery', g.masteryTime('beam')===b0,
        b0+' -> '+g.masteryTime('beam'));
}

// ── scenario 134: the armoury screen ────────────────────────
{
  const {g,step,keys,click}=run({map:true});
  keys({KeyC:true}); step(30); keys({KeyC:false});
  check('C opens the armoury', g.STATE==='arsenal', g.STATE);
  g.drawArsenal();
  check('it renders with everything locked', true);

  const list=g.arsenalList();
  check('the beam heads the list', list[0]==='beam', list.join(','));
  check('...and every letter is on it', list.length===1+g.arsenalKinds().length,
        list.length);

  // the cursor moves and wraps
  const tapDown=()=>{ keys({ArrowDown:true}); g.updateArsenal(0.016);
                      keys({ArrowDown:false}); g.updateArsenal(0.016); };
  const first=g.armSel;
  tapDown();
  check('down moves the cursor', g.armSel!==first, g.armSel);
  g.armSel=list.length-1;
  tapDown();
  check('...and wraps', g.armSel===0, g.armSel);

  // tapping a row equips it, when it is allowed to be
  g.touchMode=true;
  const kind=g.arsenalKinds()[0];
  g.addMastery(kind,g.MASTERY_STEPS[0]+1);
  const row=list.indexOf(kind);
  const rowY=118+row*46+12;
  check('the tap geometry agrees with the drawn rows',
        g.arsenalRowAt(64+10,rowY)===row, g.arsenalRowAt(64+10,rowY));
  click(64+10,rowY);
  check('tapping an unlocked row equips it', g.arsenal.loadout===kind,
        g.arsenal.loadout);
  g.drawArsenal();
  check('it renders with one equipped', true);

  // ...and a locked one is refused, not equipped
  const locked=g.arsenalKinds().find(k=>!g.isUnlocked(k));
  const lrow=list.indexOf(locked);
  click(64+10,118+lrow*46+12);
  check('tapping a locked row changes nothing', g.arsenal.loadout===kind,
        g.arsenal.loadout);

  const b=g.arsenalBackButton();
  click(b.x+b.w/2,b.y+b.h/2);
  check('tapping HARİTA leaves', g.STATE==='map', g.STATE);
}

// ── scenario 135: the seal remembers, the run decides ───────
{
  const {g,step}=run({map:true});
  // everything ever found, and nothing found this run
  g.secretSeals['stage0_key']=true;
  g.secretSeals['stage3_key']=true;
  g.secretSeals['stage7_key']=true;
  check('the map knows all three have been found',
        g.arcFragmentsEver()===3, g.arcFragmentsEver());
  check('...and every glyph lights up',
        [0,1,2].every(i=>!g.worldHasSecret(i)||g.worldHasSeal(i)),
        [0,1,2].map(i=>i+':'+g.worldHasSeal(i)).join(' '));

  // ...but this run is carrying nothing, so the ending is the cold one
  check('this run is carrying nothing', g.arcFragments()===0, g.arcFragments());
  check('a veteran still gets the cold ending on a fresh run',
        g.arcEnding().id==='protocol', g.arcEnding().id);

  // find one THIS run and it moves
  g.arcOpened[0]=true;
  check('reading a record this run changes it', g.arcEnding().id==='doubt',
        g.arcEnding().id);
  check('...without touching what the map knows', g.arcFragmentsEver()===3,
        g.arcFragmentsEver());
}

// ── scenario 136: opening a chest records the run ───────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.loadLevel(0);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  check('nothing read yet', g.arcFragments()===0, g.arcFragments());

  const k=g.secretKey;
  for(let i=0;i<8 && !g.keyHeld();i++){
    g.player.x=k.x-g.PLAYER_W/2; g.player.y=k.y-g.PLAYER_H;
    g.player.vx=0; g.player.vy=0; g.player.invuln=999;
    step(1);
  }
  const c=g.secretChest;
  for(let i=0;i<20 && !g.secretChest.open;i++){
    g.player.x=c.x; g.player.y=c.y-g.PLAYER_H+20;
    g.player.vx=0; g.player.vy=0; g.player.invuln=999; g.player.hp=99;
    step(1);
  }
  check('the chest was opened', g.secretChest.open===true);
  check('the run recorded it', g.arcFragments()===1, g.arcFragments());
  check('...and so did the permanent seal', g.arcFragmentsEver()===1,
        g.arcFragmentsEver());
}

// ── scenario 137: a new game asks first ─────────────────────
{
  const {g,step,keys,store}=run({map:true});
  // give it something to lose
  g.runCoins=500; g.bankStageClear('A');
  const rec=g.makeHatchling('baby'); g.enrolHatchling(rec,'S');
  g.secretSeals['stage0_key']=true; g.hiScore=12345;
  g.addMastery('spread',999);
  check('there is progress to lose', g.bank.coins>0 && g.roster.members.length>0,
        g.bank.coins+' / '+g.roster.members.length);
  check('...and it is on disk', !!store.getItem('neonDinoBank'));

  check('no prompt to start with', g.resetPrompt===false);
  // the key is gated on stateTimer, so that the ENTER which just opened the
  // map cannot trip something on the same frame — let a few frames pass
  step(20);
  keys({KeyN:true}); g.updateReset(0.016); keys({KeyN:false});
  check('N raises the prompt', g.resetPrompt===true);
  g.drawResetPrompt();
  check('the prompt renders', true);
  check('...and nothing is gone yet', g.bank.coins>0, g.bank.coins);

  // backing out leaves everything alone
  keys({Escape:true}); g.updateReset(0.016); keys({Escape:false});
  check('escape backs out', g.resetPrompt===false);
  check('...with the money still there', g.bank.coins>0, g.bank.coins);

  // the prompt swallows ENTER, so a world cannot be started behind it
  g.openResetPrompt();
  check('the prompt owns the input', g.updateReset(0.016)===true);
  g.closeResetPrompt();
  check('and gives it back', g.updateReset(0.016)===false);
}

// ── scenario 138: and then it really wipes ──────────────────
{
  const {g,step,store}=run({map:true});
  g.runCoins=800; g.bankStageClear('A');
  g.buyUpgrade('hearts');
  const rec=g.makeHatchling('baby'); g.enrolHatchling(rec,'S');
  g.loseHatchling(g.makeHatchling('baby'));
  g.secretSeals['stage0_key']=true; g.saveSeals ? g.saveSeals() : null;
  g.addMastery('spread',999);
  g.setLoadout('spread');
  g.hiScore=4242;
  g.arcOpened[0]=true;
  g.arcSeen['brief_volcano']=true;
  // and actually clear a world, or there is no map progress to wipe and the
  // 'locked down again' check passes because it was never unlocked
  g.startWorld(0); g.finishWorld();
  check('a world was cleared', Object.keys(g.worldProgress).length>0,
        JSON.stringify(g.worldProgress));

  const before=g.RESET_STORES.filter(k=>store.getItem(k)!==null);
  check('several stores are written', before.length>=3, before.join(','));

  g.resetAll();

  check('the bank is empty', g.bank.coins===0 && g.roster.delivered===0,
        g.bank.coins);
  check('the upgrades are gone', g.upgradeLevel('hearts')===0, g.upgradeLevel('hearts'));
  check('the brood is gone', g.roster.members.length===0 && g.roster.lost===0,
        g.roster.members.length+'/'+g.roster.lost);
  check('the seals are gone', g.arcFragmentsEver()===0, g.arcFragmentsEver());
  check('the mastery is gone', g.masteryLevel('spread')===0, g.masteryLevel('spread'));
  check('...and the loadout is back on the beam', g.arsenal.loadout==='beam',
        g.arsenal.loadout);
  check('the record is gone', g.hiScore===0, g.hiScore);
  check('the story is rewound', Object.keys(g.arcSeen).length===0 &&
        g.arcFragments()===0, Object.keys(g.arcSeen).join(','));
  check('the map is locked down again',
        Object.keys(g.worldProgress).length===0, JSON.stringify(g.worldProgress));
  check('the prompt closed itself', g.resetPrompt===false);

  // the stores, not just the objects in memory
  const left=g.RESET_STORES.filter(k=>{
    const v=store.getItem(k);
    return v!==null && v!=='' && v!=='{}' && v!=='0';
  });
  check('every store is cleared on disk', left.length===0, left.join(','));

  // and the game still runs afterwards
  check('the volcano is playable again', g.worldState(0).playable===true);
  g.startWorld(0);
  step(5);
  check('a fresh campaign starts', g.STATE==='playing', g.STATE);
  check('...on the base weapon', g.weapon==='beam', g.weapon);
  check('...with the stock heart count', g.player.maxHp===g.BASE_HEARTS,
        g.player.maxHp);
}

// ── scenario 139: wiping by thumb ───────────────────────────
{
  const {g,step,click}=run({map:true});
  g.touchMode=true;
  g.runCoins=400; g.bankStageClear('A');
  check('there is money', g.bank.coins>0, g.bank.coins);

  const b=g.mapResetButton();
  click(b.x+b.w/2,b.y+b.h/2);
  check('tapping YENİ OYUN raises the prompt', g.resetPrompt===true);
  check('...and takes nothing yet', g.bank.coins>0, g.bank.coins);

  // a tap anywhere else while the prompt is up must not start a world
  click(g.WORLDS[0].mx*900,g.WORLDS[0].my*506);
  check('the prompt swallows a tap on a map node', g.STATE==='map', g.STATE);
  check('...and stays up', g.resetPrompt===true);

  const no=g.resetNoButton();
  click(no.x+no.w/2,no.y+no.h/2);
  check('VAZGEÇ backs out', g.resetPrompt===false);
  check('...with everything intact', g.bank.coins>0, g.bank.coins);

  click(b.x+b.w/2,b.y+b.h/2);
  const yes=g.resetYesButton();
  click(yes.x+yes.w/2,yes.y+yes.h/2);
  check('SİL goes through with it', g.bank.coins===0, g.bank.coins);
  check('...and closes', g.resetPrompt===false);
  g.drawWorldMap();
  check('the map renders after a wipe', true);
}

// ── scenario 140: every arrival carries its own sentence ────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.loadLevel(0);
  g.player.hp=99; g.player.invuln=999;
  step(3);

  const rec=g.makeHatchling('baby');
  g.enrolHatchling(rec,'A');
  const m=g.roster.members[0];
  check('an arrival is written down', !!m, g.roster.members.length);
  check('...with a sentence of its own', typeof m.deed==='string' && m.deed.length>0,
        m.deed);
  check('...and where it happened', typeof m.where==='string' && m.where.length>0,
        m.where);
  check('the place is a real stage', m.where===g.LEVELS[0].name,
        m.where+' vs '+g.LEVELS[0].name);
}

// ── scenario 141: the sentence is TRUE, not decoration ──────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.loadLevel(0);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  g.lastLostName=''; g.hitsThisLevel=3;
  g.fogY=Infinity; g.windState='calm';
  const fresh=()=>g.makeHatchling('baby');

  // the priority order is the whole design: the most dramatic TRUE thing
  // wins, and a fact that is not true must never be claimed
  g.player.hp=1;
  check('one heart left is what gets said',
        g.deedForDelivered(fresh()).indexOf('Son kalbinle')>=0,
        g.deedForDelivered(fresh()));

  g.player.hp=99;
  const panicky=fresh(); panicky.panicked=true;
  check('a hatchling that bolted is remembered for it',
        g.deedForDelivered(panicky).indexOf('Panikledi')>=0,
        g.deedForDelivered(panicky));

  const calm=fresh();
  check('...and one that never bolted is not',
        g.deedForDelivered(calm).indexOf('Panikledi')<0,
        g.deedForDelivered(calm));

  g.lastLostName='ÇAKIL';
  check('somebody else being lost outranks the quiet lines',
        g.deedForDelivered(fresh()).indexOf('ÇAKIL')>=0,
        g.deedForDelivered(fresh()));
  g.lastLostName='';

  // untouched runs say so, and only when true
  g.hitsThisLevel=0; g.rescuedThisLevel=0;
  check('a clean run is remembered as one',
        g.deedForDelivered(fresh()).indexOf('Tek çizik')>=0,
        g.deedForDelivered(fresh()));
  g.hitsThisLevel=4;
  check('...and a bloody one is not',
        g.deedForDelivered(fresh()).indexOf('Tek çizik')<0,
        g.deedForDelivered(fresh()));

  // there is always something to say
  check('a quiet rescue still gets a sentence',
        g.deedForDelivered(fresh()).length>0, g.deedForDelivered(fresh()));
}

// ── scenario 142: the weather gets into it ──────────────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.loadLevel(5);              // ROTWOOD RISE: the rot rises here
  g.player.hp=99; g.player.invuln=999;
  step(3);
  g.lastLostName=''; g.hitsThisLevel=2;

  g.fogY=Infinity;
  const dry=g.deedForDelivered(g.makeHatchling('baby'));
  check('no rot, no mention of rot', dry.indexOf('Çürüme')<0, dry);

  g.fogY=g.player.y+40;        // right at the dino's heels
  const wet=g.deedForDelivered(g.makeHatchling('baby'));
  check('the rot at your heels is what gets said',
        wet.indexOf('Çürüme')>=0, wet);
  check('...and it is a different sentence', wet!==dry, dry+' / '+wet);
}

// ── scenario 143: the ones who did not arrive ───────────────
{
  const {g,step}=run({map:true});
  g.startWorld(0);
  g.loadLevel(5);
  g.player.hp=99; g.player.invuln=999;
  step(3);
  check('the memorial starts empty', (g.roster.fallen||[]).length===0);

  g.breakCage(g.cages[0]);
  const f=g.followers[0];
  const name=f.rec.name;
  g.panicFollower(0);
  check('it carries the panic on its record', g.scaredBabies[0].rec.panicked===true);
  g.fogY=g.player.y+40;
  g.loseBaby(g.scaredBabies[0],false);

  const fallen=g.roster.fallen[0];
  check('the lost one has a page', !!fallen, (g.roster.fallen||[]).length);
  check('...with its name', fallen.name===name, fallen.name+' vs '+name);
  check('...where it happened', fallen.where===g.LEVELS[5].name, fallen.where);
  check('...and what happened', typeof fallen.deed==='string' && fallen.deed.length>0,
        fallen.deed);
  check('the rot took it, and the page says so',
        fallen.deed.indexOf('Çürüme')>=0, fallen.deed);
  check('it never joined the living', g.roster.members.length===0,
        g.roster.members.length);

  // the memorial is long, not infinite
  for(let i=0;i<g.FALLEN_KEPT+15;i++) g.recordFallen(g.makeHatchling('baby'));
  check('the memorial has a limit', g.roster.fallen.length===g.FALLEN_KEPT,
        g.roster.fallen.length);
  check('...and it keeps the most recent', g.roster.fallen[0].name!==name,
        g.roster.fallen[0].name);
}

// ── scenario 144: the book, and its two tabs ────────────────
{
  const {g,step,keys,click}=run({map:true});
  g.openBrood();
  check('it opens on the living', g.broodTab===0, g.broodTab);
  check('...which is empty to start', g.broodPages().length===0);
  g.drawBrood();
  check('an empty book renders', true);

  // fill both sides
  for(let i=0;i<9;i++){
    const r=g.makeHatchling('baby');
    g.enrolHatchling(r,'B');
  }
  for(let i=0;i<5;i++) g.recordFallen(g.makeHatchling('baby'));
  check('the living page has the living', g.broodPages().length===9,
        g.broodPages().length);
  g.drawBrood();
  check('a full page renders', true);

  g.setBroodTab(1);
  check('the second tab is the fallen', g.broodTab===1, g.broodTab);
  check('...and shows them', g.broodPages().length===5, g.broodPages().length);
  check('...which is a different list', g.broodPages()!==g.roster.members);
  g.drawBrood();
  check('the memorial renders', true);

  // arrows switch tabs
  keys({ArrowLeft:true}); g.updateBrood(0.016); keys({ArrowLeft:false}); g.updateBrood(0.016);
  check('left goes back to the living', g.broodTab===0, g.broodTab);
  keys({ArrowRight:true}); g.updateBrood(0.016); keys({ArrowRight:false}); g.updateBrood(0.016);
  check('right goes to the fallen', g.broodTab===1, g.broodTab);

  // switching resets the scroll, or page two of a short list shows nothing
  keys({ArrowDown:true}); g.updateBrood(0.5); keys({ArrowDown:false});
  g.setBroodTab(0);
  check('switching tabs rewinds the scroll', true);

  // and a thumb can do it
  g.touchMode=true;
  const tb=g.broodTabButton(1);
  click(tb.x+tb.w/2,tb.y+tb.h/2);
  check('tapping a tab switches it', g.broodTab===1, g.broodTab);
  const back=g.broodBackButton();
  click(back.x+back.w/2,back.y+back.h/2);
  check('the way out still works', g.STATE==='map', g.STATE);
}

// ── scenario 145: a generated line has to be wrapped ────────
{
  const {g}=run({map:true});
  const short=g.wrapText("Kısa.",300,"11px 'Courier New',monospace");
  check('a short line stays one line', short.length===1, short.join('|'));

  const long=g.wrapText(
    "Çürüme suyu yükselirken kopmuştu ve sen onu bir daha göremedin.",
    200,"11px 'Courier New',monospace");
  check('a long one is broken up', long.length>1, long.length);
  check('...without losing any words',
        long.join(' ').split(' ').length===
        "Çürüme suyu yükselirken kopmuştu ve sen onu bir daha göremedin.".split(' ').length,
        long.join(' '));
  check('...and nothing is empty', long.every(l=>l.length>0), long.join('|'));

  // every sentence the game can generate has to fit a card
  const {g:g2,step}=run({map:true});
  g2.startWorld(0); step(2);
  const seen=[];
  for(const hp of [1,99]) for(const panic of [true,false]){
    g2.player.hp=hp;
    const r=g2.makeHatchling('baby'); r.panicked=panic;
    seen.push(g2.deedForDelivered(r), g2.deedForLost(r));
  }
  const tooWide=seen.filter(d=>
    g2.wrapText(d,366,"11px 'Courier New',monospace").length>2);
  check('every sentence fits two lines on a card', tooWide.length===0,
        tooWide.join(' / '));
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
