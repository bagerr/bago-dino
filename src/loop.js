// The frame loop, and the first stage load
// Part of NEON DINO-AGE: RESCUE PROTOCOL. Loaded as a classic
// script, in the order index2.html lists — these files share one
// global scope on purpose and are not modules.

// ─── MAIN LOOP ───────────────────────────────────────────────
let lastTime=0;
function loop(now){
  const dt=Math.min((now-lastTime)/1000,0.05);
  lastTime=now;

  // hit-stop: briefly freeze simulation on impactful hits, purely on real elapsed time,
  // so a laser landing feels like it actually thumps something instead of just tickling it
  if(hitStopTimer>0){
    hitStopTimer=Math.max(0,hitStopTimer-dt);
  } else {
    update(dt);
  }
  // the radio is presentation, not simulation: it keeps ticking through a
  // hit-stop freeze and stops dead the moment the stage does
  if(STATE==="playing") updateRadio(dt);
  updateTouchConfirm(dt);

  // The backdrop is screen space — it must NOT ride the vertical camera, or
  // climbing would drag a hole up from under it.
  drawBG();

  // apply screen shake, and the vertical camera lift with it
  ctx.save();
  ctx.translate(Math.round(shakeX),Math.round(shakeY)+Math.round(camY));

  drawStalactites();
  drawLava();
  drawMagmaBursts();
  drawPlatforms();
  drawVines();
  drawLowBars();
  drawGlaze();
  drawIcicles();
  drawFog();
  drawSecretChest();
  drawSecretKey();
  drawCheckpoint();
  drawCrystals();
  drawPowerUpBoxes();
  drawWeaponPickups();
  drawCages();
  drawCoins();
  drawDrops();

  // draw living enemies + boss
  for(const e of groundEnemies) if(!e.dead) drawGroundEnemy(e);
  for(const e of enemies) if(!e.dead) drawPtero(e);
  drawBoss();
  drawShockwaves();
  drawLavaBalls();
  drawBossFlameBursts();
  drawPlayerBombs();
  drawBabyDinos();
  drawWarped(drawFollowers);   // the rescue train, drawn behind the player
  drawScaredBabies();          // ...and the ones that bolted, which do NOT warp
  drawBabyShots();

  drawLaserAll();
  drawParticles();
  drawWarped(drawPlayer);
  drawFloatingTexts();

  ctx.restore();
  drawWind();           // screen space: the gust blows across the VIEW
  drawFeverOverlay();   // full-screen, so outside the world transform

  drawHUD();
  drawKeyNotice();
  drawTouchPad();
  drawArenaBanners();
  drawBossCard();
  drawBossRage();
  if(STATE==="playing") drawRadio();

  if(STATE==="map"){ drawWorldMap(); drawResetPrompt(); }
  if(STATE==="hangar") drawHangar();
  if(STATE==="brood") drawBrood();
  if(STATE==="arsenal") drawArsenal();
  if(STATE==="continue") drawContinue();
  if(STATE==="report") drawMissionReport();
  if(STATE==="dead") drawGameOver();
  if(STATE==="win")  drawWin();

  requestAnimationFrame(loop);
}

// Build a valid stage so every draw path has something to read, then open on
// the mission select screen. loadLevel() has to run down here, after every
// `let` it touches has been initialised (coins/enemies/drops/etc.), otherwise
// it would hit the temporal dead zone.
loadLevel(0);
worldIndex=0;
for(let i=0;i<WORLDS.length;i++){
  const st=worldState(i);
  if(st.playable&&!st.cleared){ mapSel=i; break; }
}
STATE="map";
requestAnimationFrame(t=>{lastTime=t;requestAnimationFrame(loop);});
