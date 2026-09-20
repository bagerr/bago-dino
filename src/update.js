// The simulation
// Part of NEON DINO-AGE: RESCUE PROTOCOL. Loaded as a classic
// script, in the order index2.html lists — these files share one
// global scope on purpose and are not modules.

// ─── UPDATE ──────────────────────────────────────────────────
function update(dt){
  t+=dt;
  if(STATE==="dead"||STATE==="win"){
    stateTimer+=dt;
    if(K["KeyR"]&&stateTimer>0.5){
      // a cleared run goes back to the map; a death restarts the world
      if(STATE==="win"){ STATE="map"; stateTimer=0; mapSel=worldIndex; }
      else restartGame();
    }
    return;
  }
  // MISSION SELECT — nothing simulates here, it is a menu
  if(STATE==="map"){
    stateTimer+=dt;
    updateParticles(dt);
    if(mapStampTimer>0){
      mapStampTimer-=dt;
      if(mapStampTimer<=0){
        // once the stamp lands, move the cursor onto whatever just unlocked
        for(let i=0;i<WORLDS.length;i++){
          const st=worldState(i);
          if(st.playable&&!st.cleared){ mapSel=i; break; }
        }
      }
    }
    const left=K["ArrowLeft"]||K["KeyA"], right=K["ArrowRight"]||K["KeyD"];
    const anyDir=left||right;
    if(anyDir&&!mapKeyWasDown&&mapStampTimer<=0){
      const dir=right?1:-1;
      // step to the next selectable node, wrapping
      for(let n=1;n<=WORLDS.length;n++){
        const cand=((mapSel+dir*n)%WORLDS.length+WORLDS.length)%WORLDS.length;
        if(worldState(cand).playable){ mapSel=cand; playPew(); break; }
      }
    }
    mapKeyWasDown=anyDir;
    if(K["KeyH"]&&stateTimer>0.25&&mapStampTimer<=0){ K["KeyH"]=false; openHangar(); return; }
    if(K["Enter"]&&stateTimer>0.25&&mapStampTimer<=0){
      if(startWorld(mapSel)) return;
    }
    return;
  }

  // between missions: spending what the last one paid
  if(STATE==="hangar"){ updateHangar(dt); return; }

  // credit clock: ENTER spends one, R gives up, zero means it is really over
  if(STATE==="continue"){
    stateTimer+=dt;
    continueTimer-=dt;
    updateParticles(dt);
    updateFloatingTexts(dt);
    const secs=Math.ceil(Math.max(0,continueTimer));
    if(secs<continueTickAt){ continueTickAt=secs; playContinueTick(secs<=3); }
    if(K["Enter"] && stateTimer>0.3){ useContinue(); return; }
    if(K["KeyR"] && stateTimer>0.5){ restartGame(); return; }
    if(continueTimer<=0){
      STATE="dead"; stateTimer=0;
      bankSalvage();
      newRecord=saveHiScoreIfNeeded();
    }
    return;
  }
  // being drunk by the rift: gameplay is over, but the scene keeps animating
  // for a beat while the squad is pulled in and shrunk away
  if(STATE==="warp"){
    stateTimer+=dt;
    warpTimer+=dt;
    updateParticles(dt);
    updateFloatingTexts(dt);
    applyShake(dt);
    // the rift drinks harder the closer they get
    const swirl=1+warpTimer/WARP_DUR*3;
    for(let i=0;i<2;i++){
      if(Math.random()>dt*40*swirl) continue;
      const a=rnd(0,Math.PI*2), rr=rnd(40,160);
      particles.push({
        x:warpX-camX+Math.cos(a)*rr, y:warpY+Math.sin(a)*rr,
        vx:-Math.cos(a)*rnd(160,340), vy:-Math.sin(a)*rnd(160,340),
        life:1, maxLife:rnd(0.3,0.6),
        color:Math.random()<0.5?"#7dffcf":"#aad4ff", size:rnd(2,5), type:"square", gravity:0
      });
    }
    if(warpTimer>=WARP_DUR) endLevel();
    return;
  }

  // end-of-stage debrief: the screen is dark, the sim is parked, and the
  // panel reads itself in. ENTER (after REPORT_MIN) or REPORT_AUTO moves on.
  if(STATE==="report"){
    stateTimer+=dt;
    reportTimer+=dt;
    updateFloatingTexts(dt);
    updateParticles(dt);
    // retro typewriter clacks, one per few characters, while the card prints.
    // reportTypeEnd is published by drawMissionReport() so the two can never
    // drift apart as lines are added or reworded.
    if(reportTimer<reportTypeEnd){
      reportTypeTick-=dt;
      if(reportTypeTick<=0){ playRadioType(); reportTypeTick=0.055; }
    }
    if(reportTimer>REPORT_MIN && (K["Enter"]||reportTimer>REPORT_AUTO)){
      const lv=WORLDS[worldIndex].levels;
      const pos=lv.indexOf(levelIndex);
      if(pos>=0 && pos<lv.length-1){
        loadLevel(lv[pos+1]);
        STATE="playing"; stateTimer=0;
      } else {
        // world cleared — newRecord was already resolved by endLevel()
        finishWorld();
      }
    }
    return;
  }

  // -- player movement --
  const left  = K["ArrowLeft"]||K["KeyA"];
  const right = K["ArrowRight"]||K["KeyD"];
  const jump  = K["Space"]||K["KeyW"]||K["ArrowUp"];
  const fire  = K["KeyF"]||K["KeyJ"];
  const dashKey = K["ShiftLeft"]||K["ShiftRight"];
  const downKey = K["ArrowDown"]||K["KeyS"];

  updateCrumbles(dt);
  updateIcicles(dt);
  updateFog(dt);
  updateWind(dt);
  updateVines(dt,left,right,jump);
  // hanging from a vine suspends the dino's own physics entirely — the
  // pendulum owns its position until it lets go
  if(vineGrab){
    if(player.invuln>0) player.invuln-=dt;
    // Hanging is a rest: the pack refuels while you swing. The early return
    // below skips the ordinary regen entirely (that only runs on the ground,
    // and a vine forces onGround false), so it has to happen here.
    player.jetFuel=Math.min(1,player.jetFuel+JET_REGEN*1.6*jetRegenMult()*followerPower().fuelMult*dt);
    updateParticles(dt);
    updateFloatingTexts(dt);
    updateFollowers(dt);
    updateScaredBabies(dt);
    applyShake(dt);
    const camRiseV=LEVELS[levelIndex].camRise||0;
    const wantYV=camRiseV>0?clamp(CAM_LIFT_ANCHOR-player.y,0,camRiseV):0;
    camY=lerp(camY,wantYV,dt*(camRiseV>0?3.4:5));
    if(!cameraLock){
      const tX=player.x+PLAYER_W/2-W*0.33;
      camX=clamp(lerp(camX,tX,dt*3.2),0,Math.max(0,levelWidth-W));
    }
    return;
  }

  // Ice takes the grip away: you accelerate slowly and you cannot stop dead,
  // so a run has to be planned a platform ahead. A chill shot from an ice
  // sentry halves the top speed for a second on top of that.
  // onGround flickers frame to frame on a resting player — the engine
  // alternates a settle frame and a resolve frame — so reading it directly
  // gave ice back half its grip. Use a short coyote window instead.
  updateSlide(dt,downKey,jump);

  const onIce=isIce()&&player.groundT<0.12;
  // the Titan's phase 2 glazes the floor: less bite and a much longer coast,
  // so the arena it dragged you into stops being footing at all
  const slick=onIce&&titanSlick();
  const grip=onIce?(slick?1.9:3.2):10;
  const slide=onIce?(slick?0.88:0.72):0.05;
  if(player.chilled>0) player.chilled-=dt;
  const topSpd=MOVE_SPD*(player.chilled>0?0.45:1);
  if(player.slideT>0){
    // steering out of a slide would make it a faster walk; it commits
  } else if(left) { player.vx+= (-topSpd-player.vx)*Math.min(1,dt*grip); player.facing=-1; }
  else if(right){ player.vx+= (topSpd-player.vx)*Math.min(1,dt*grip); player.facing=1; }
  else { player.vx*=Math.pow(slide,dt); }

  // -- air-dash (Shift): instant blue flame burst that punches the dino
  // forward, clears wide lava gaps, and grants brief i-frames --
  if(dashKey && !player.dashKeyWasDown && player.dashCooldown<=0){
    player.dashTimer=DASH_DURATION;
    player.dashCooldown=DASH_COOLDOWN;
    player.invuln=Math.max(player.invuln,DASH_DURATION+0.15);
    player.vy=Math.min(player.vy,-30); // flatten out the arc for a clean horizontal punch
    screenShake=Math.min(6,screenShake+3);
    playPowerUp();
    // burst fires from the same backpack nozzle the jetpack flame uses
    const md=playerSpriteMetrics();
    spawnParticles(md.nozzleX-camX,md.nozzleY,16,
      ["#00e5ff","#44aaff","#ffffff"],
      {minSpd:90,maxSpd:260,minLife:0.2,maxLife:0.4,type:"circle",gravity:40,minSz:3,maxSz:7});
  }
  player.dashKeyWasDown=dashKey;
  if(player.dashCooldown>0) player.dashCooldown-=dt;
  if(player.dashTimer>0){
    player.dashTimer-=dt;
    player.vx=player.facing*DASH_SPEED; // overrides normal accel for the dash's short duration
  }

  // jetpack — a smooth, accelerating rocket thrust instead of an instant hover speed
  let useJet=false;
  if(jump && player.onGround){
    // ground jump kick-off (free, doesn't touch fuel)
    player.vy=JUMP_VY;
    player.onGround=false;
  } else if(jump && !player.onGround && (player.jetFuel>0||(player.activePower&&player.activePower.kind==="hyper"))){
    // Thrust is a real force: it accelerates upward EVERY frame the button is
    // held, and gravity (applied further below) fights it, so the climb has
    // actual weight to it. Two earlier versions of this were buggy — a hard
    // clamp snapped vy to the cap the instant you held jump after a jump kick,
    // and the "only thrust while below the cap" guard that replaced it created
    // a dead zone where fuel burned with zero thrust for the whole first ~0.12s
    // of every jump, which read as the jetpack simply not responding.
    player.vy-=JET_THRUST*dt;
    // soft terminal rise speed: bleed the excess off exponentially instead of
    // clamping, so a fast jump decays smoothly into the cap with no snap
    if(player.vy<JET_MAX_RISE){
      const excess=JET_MAX_RISE-player.vy;
      player.vy+=Math.min(excess,excess*8*dt);
    }
    // HYPER BEAM makes the jetpack fuel unlimited for its duration
    if(!(player.activePower&&player.activePower.kind==="hyper")){
      player.jetFuel=Math.max(0,player.jetFuel-JET_FUEL_USE*jetUseMult()*dt);
    }
    useJet=true;
    player.jetPhase+=dt*18;

    // nozzle anchored to the backpack on the DRAWN sprite (see
    // playerSpriteMetrics) — the old hitbox-relative offsets put the flame
    // roughly 10px too far forward and 15px too low, so it sprayed out of the
    // dino's hip instead of the jetpack itself
    const m=playerSpriteMetrics();
    const nozzleX=m.nozzleX-camX; // world → screen (drawParticles renders unshifted)
    const nozzleY=m.nozzleY;

    // bright neon blue / bright orange flame particles firing back and down
    // out of the nozzle, then falling under gravity and shrinking with life
    for(let i=0;i<3;i++){
      particles.push({
        x:nozzleX, y:nozzleY,
        vx:-player.facing*rnd(70,150)+rnd(-15,15),
        vy:rnd(200,340),
        life:1, maxLife:rnd(0.18,0.32),
        color: Math.random()<0.55
          ? ["#00e5ff","#44aaff","#88ccff"][Math.floor(Math.random()*3)]
          : ["#ff8800","#ffaa33","#ffcc66"][Math.floor(Math.random()*3)],
        size:rnd(3,6),
        type:"square",
        gravity:320
      });
    }
    // faint trailing smoke puffs for a lingering thrust wake
    if(Math.random()<0.35){
      particles.push({
        x:nozzleX+rnd(-3,3), y:nozzleY+rnd(0,6),
        vx:-player.facing*rnd(10,30),
        vy:rnd(40,90),
        life:1, maxLife:rnd(0.4,0.7),
        color:"rgba(150,170,200,0.5)",
        size:rnd(5,9),
        type:"circle",
        gravity:40
      });
    }
  }
  player.jetpack=useJet;

  // fuel regen when on ground + not jetting
  if(player.onGround&&!useJet) player.jetFuel=Math.min(1,player.jetFuel+JET_REGEN*jetRegenMult()*followerPower().fuelMult*dt);

  // gravity — releasing the thrust drops the dino into a heavier, snappier fall
  // instead of a floaty one
  if(!player.onGround){
    const g=(!useJet && player.vy>0) ? GRAV*FALL_GRAV_MULT : GRAV;
    player.vy=Math.min(player.vy+g*dt, 640);
  }

  // anim
  if(Math.abs(player.vx)>10&&player.onGround) player.legPhase+=dt*8;
  player.idlePhase+=dt*2.5;

  // the gust, applied after the dino's own acceleration so it is weather
  // acting ON the player rather than something the input silently overrides
  applyWind(dt);

  // move x
  player.x+=player.vx*dt;

  // bounds
  player.x=Math.max(-20,player.x);

  // while the camera is locked (arena wave or boss intro), an invisible wall
  // at the right edge of the visible screen keeps the player from just
  // running past the fight instead of clearing it
  if(cameraLock){
    const wallX=camX+W-PLAYER_W-24;
    if(player.x>wallX){ player.x=wallX; if(player.vx>0) player.vx=0; }
  }

  // platform collision x (simple aabb)
  let onAnyGround=false;
  player.y+=player.vy*dt;

  for(const p of platforms){
    if(p.lavaPit||p.gone) continue;
    // a low shelf is an ordinary solid ledge that simply is not there while
    // the dino is flat on its belly. The gap is read as a rule rather than
    // measured, so the hitbox never has to change size mid-frame.
    if(p.lowBar && player.slideT>0) continue;
    const prev_y=player.y-player.vy*dt;
    const pr={x:player.x,y:player.y,w:PLAYER_W,h:PLAYER_H};
    if(overlaps(pr,p)){
      // resolve y — the tolerance scales with how far the dino actually
      // moved this frame, so a fast dash/jetpack burst still lands cleanly
      // on top of a platform instead of "snagging" on its edge like a fixed
      // small tolerance would at high speed
      const tol=Math.max(8,Math.abs(player.vy*dt)+2);
      if(player.vy>0 && prev_y+PLAYER_H<=p.y+tol){
        player.y=p.y-PLAYER_H;
        player.vy=0;
        onAnyGround=true;
        // a bouncy cap never lets you stand: it throws you straight back up
        if(p.bounce){
          player.vy=BOUNCE_VY;
          onAnyGround=false;
          // Contact lasts a single frame, so a dt-scaled trickle gives the
          // player nothing at all. The cap hands over a fixed slug of fuel
          // instead — that is what makes it worth bouncing off.
          const fuelBefore=player.jetFuel;
          player.jetFuel=Math.min(1,player.jetFuel+BOUNCE_FUEL*followerPower().fuelMult);
          if(player.jetFuel>fuelBefore+0.01){
            spawnFloatingText(player.x+PLAYER_W/2-camX,p.y-16,"YAKIT+","#a7f3d0",13);
          }
          screenShake=Math.min(6,screenShake+3);
          playPowerUp();
          spawnParticles(player.x+PLAYER_W/2-camX,p.y,14,["#a7f3d0","#34d399","#ffffff"],
            {minSpd:70,maxSpd:220,upBias:60,minLife:0.2,maxLife:0.5,type:"circle",gravity:200});
        }
        // a crumbling shelf starts counting the moment you touch it
        if((p.crumble||p.crack) && p.crumbleT===undefined && !p.gone)
          p.crumbleT=fuseFor(p);
        if(player.jetFuel<1) player.jetFuel=Math.min(1,player.jetFuel+JET_REGEN*jetRegenMult()*followerPower().fuelMult*dt);
      } else if(player.vy<0 && prev_y>=p.y+p.h-tol){
        player.y=p.y+p.h; player.vy=0;
      } else {
        // resolve x
        const cx=player.x+PLAYER_W/2, pcx=p.x+p.w/2;
        if(cx<pcx) player.x=p.x-PLAYER_W;
        else player.x=p.x+p.w;
        player.vx=0;
      }
      // goal — while the rift is sealed, nudge the player toward the boss.
      // Walking in is handled by the contact test further down, against the
      // portal itself rather than against this platform.
      if(p.goal&&!goalReached&&!gateOpen&&Math.random()<0.02){
        spawnFloatingText(player.x+PLAYER_W/2-camX,player.y-20,"DEFEAT THE BOSS!","#ff4466",13);
      }
    }
  }
  // a frozen enemy is solid ground while it lasts
  for(const b of frozenBlocks()){
    const prev_y=player.y-player.vy*dt;
    if(!overlaps({x:player.x,y:player.y,w:PLAYER_W,h:PLAYER_H},
                 {x:b.x,y:b.y,w:b.w,h:b.h})) continue;
    const tol=Math.max(8,Math.abs(player.vy*dt)+2);
    if(player.vy>0 && prev_y+PLAYER_H<=b.y+tol){
      player.y=b.y-PLAYER_H;
      player.vy=0;
      onAnyGround=true;
    }
  }
  player.onGround=onAnyGround;
  player.groundT=onAnyGround?0:player.groundT+dt;

  // lava death
  if(player.y+PLAYER_H>LAVA_Y+10){
    takeDamage("lava");
  } else if(player.y+PLAYER_H>LAVA_Y-30){
    // rumble gently when hovering right over the lava, even before it's fatal
    screenShake=Math.max(screenShake,3);
  }
  // fall off world
  if(player.y>H+60) takeDamage("fall");

  // invuln
  if(player.invuln>0) player.invuln-=dt;

  // ── continuous plasma laser ──
  // holding fire keeps a single hitscan ray alive every frame instead of
  // spawning discrete projectile shots
  const hyperActive=player.activePower&&player.activePower.kind==="hyper";
  const isSpread=weapon==="spread", isFlame=weapon==="flame", isRocket=weapon==="rocket";
  const isSeed=weapon==="seed", isFreeze=weapon==="freeze";
  // SPREAD and FLAME are wide by nature, so they punch through everything
  // they touch the same way the PLASMA PIERCE buff does
  const piercing=(player.activePower&&player.activePower.kind==="pierce")||isSpread||isFlame;
  // holding the trigger burns the clock on anything but the base beam
  if(fire && weapon!=="beam"){
    weaponAmmo-=dt;
    if(weaponAmmo<=0) dropToBaseWeapon();
  }
  if(fire){
    if(!player.wasFiring){
      // recoil kicks once on the rising edge of the trigger, not every frame
      player.vx-=player.facing*RECOIL_FORCE;
    }
    startLaserSound();
    updateLaserSound(feverMode||hyperActive);

    // muzzle sits at the dino's jaw: +55 ahead when facing right, -10 behind
    // the origin when facing left, 24px down from the hitbox top
    const mouthWorldX=player.x+(player.facing>0?55:-10);
    const mouthWorldY=player.y+24;
    // fever doubles beam thickness; HYPER BEAM doubles it again on top of that
    let thickness=feverMode?16:8;
    if(hyperActive) thickness*=2;
    if(isFlame) thickness*=2.2;      // a fat, close-range cone
    if(isFreeze) thickness*=1.4;
    if(isSpread) thickness*=0.8;     // three thinner lances instead of one bar
    // FEVER MODE turns the laser into a screen-spanning Hyper-Beam instead of
    // the normal ~520px reach; FLAME trades nearly all of it away
    const maxRange=isFlame?190:(isFreeze?300:(feverMode?2000:520));
    // SPREAD fires three parallel lances, so a flyer overhead and a grounder
    // below die to the same trigger pull
    const rayOffsets=isSpread?[-34,0,34]:[0];

    // raycast against every living enemy (plus the active boss, if present)
    const targets=[...enemies,...groundEnemies];
    if(boss&&!boss.dead&&boss.introState==="active") targets.push(boss);
    let bestDist=maxRange, bestEnemy=null;
    const pierced=[]; // every enemy the beam passes through, when PLASMA PIERCE is active
    for(const rayOff of rayOffsets){
    const rayY=mouthWorldY+rayOff;
    for(const e of targets){
      if(e.dead||e.dying) continue;
      const ex=e.type==="ground" ? e.x : e.x-e.w/2;
      const ey=e.type==="ground" ? e.y : e.y-e.h/2;
      if(rayY<ey-thickness/2||rayY>ey+e.h+thickness/2) continue;
      const edgeX=player.facing>0 ? ex : ex+e.w;
      const dist=(edgeX-mouthWorldX)*player.facing;
      if(dist<0||dist>maxRange) continue;
      if(piercing){
        if(!pierced.some(p=>p.e===e)) pierced.push({e,dist});
      } else if(dist<bestDist){
        bestDist=dist; bestEnemy=e;
      }
    }
    }

    laser={
      mouthX:mouthWorldX, mouthY:mouthWorldY, dir:player.facing,
      // a piercing beam always draws out to full range, punching through
      // everything, instead of stopping at the first thing it touches
      len:piercing?maxRange:bestDist, thickness,
      fever:!!(feverMode||hyperActive), piercing,
      // every ray this shot is drawn from, so drawLaserAll and inLaserSweep
      // both see the full spread rather than just the middle lance
      ys:rayOffsets.map(o=>mouthWorldY+o),
      hitEnemy:piercing?(pierced[0]&&pierced[0].e):bestEnemy
    };

    // continuous muzzle glow at the mouth
    if(Math.random()<0.6) spawnParticles(mouthWorldX-camX,mouthWorldY,1,
      feverMode||hyperActive?["#ff2266","#ff8800","#ffffff"]:["#ff8800","#ffcc44","#fffbe8"],
      {minSpd:40,maxSpd:110,minLife:0.05,maxLife:0.15,type:"circle",gravity:0,minSz:1,maxSz:feverMode?4:3}
    );

    // A shielded crawler eats anything that hits the armour it is walking
    // behind. Shooting in the SAME direction it walks means you are behind
    // it, which is the opening — that, or dropping on its head.
    // Read the heading off the velocity rather than off e.faceDir: faceDir is
    // refreshed later in the frame by the ground-enemy pass, so using it here
    // let one tick through on the frame a crawler turned around.
    const headingOf=(e)=>Math.sign(e.vx)||e.faceDir||1;
    const shieldBlocks=(e)=>
      !!e.shield && !e.dying && !e.dead && player.facing!==headingOf(e);

    const applyBeamDamage=(e)=>{
      // A frozen target is glass: any hit at all shatters it, and the shards
      // take out whatever is standing nearby. That is the payoff for
      // spending the ammo to freeze something in the first place.
      if(e.frozen>0){ shatterFrozen(e); return; }
      if(shieldBlocks(e)){
        // ricochet: emerald sparks off the spines, no damage
        e.beamTick=(e.beamTick||0)-dt;
        if(e.beamTick<=0){
          e.beamTick=0.12;
          playRicochet();
          spawnParticles(e.x+e.w/2-camX,e.y+e.h*0.35,4,
            ["#34d399","#a7f3d0","#ffffff"],
            {minSpd:90,maxSpd:240,minLife:0.1,maxLife:0.3,type:"square",gravity:120,minSz:1,maxSz:3});
        }
        return;
      }
      const impactWorldX=mouthWorldX+player.facing*Math.max(0,Math.min(e._laserDist,maxRange));
      // sparks at the point of impact every frame the beam is touching
      if(Math.random()<0.7) spawnParticles(impactWorldX-camX,mouthWorldY,2,
        ["#ffee44","#ff8800","#ffffff"],
        {minSpd:80,maxSpd:220,minLife:0.1,maxLife:0.25,type:"circle",gravity:60,minSz:1,maxSz:3}
      );
      // damage ticks on an interval rather than instantly deleting the enemy —
      // fever halves the interval and doubles damage; HYPER BEAM maxes it out
      // DONDURUCU does not damage: it builds up until the thing locks solid
      if(isFreeze){
        e.freeze=(e.freeze||0)+dt;
        if(Math.random()<0.5) spawnParticles(
          e.x+e.w/2-camX, e.y+rnd(0,e.h), 1, ["#dff6ff","#7dd3fc","#ffffff"],
          {minSpd:20,maxSpd:80,minLife:0.15,maxLife:0.4,type:"square",gravity:60,minSz:1,maxSz:3});
        if(e.freeze>=FREEZE_TO_SOLID) freezeSolid(e);
        return;
      }
      e.beamTick=(e.beamTick||0)-dt;
      if(e.beamTick<=0){
        if(hyperActive){
          e.beamTick=0.05;
          e.hp-=5; // maximum power — shreds almost anything in one or two ticks
        } else {
          // a bigger escort shortens the interval; FLAME shortens it hard,
          // which is what pays for its 190px reach
          let iv=(feverMode?0.09:0.18)*followerPower().beamMult;
          if(isFlame) iv*=0.45;
          e.beamTick=iv;
          e.hp-=feverMode?2:1;
        }
        e.hitFlash=0.2;
        screenShake=Math.min(6,screenShake+(feverMode?4:2));
        hitStopTimer=Math.max(hitStopTimer,0.03);
        playPew();
        if(e.hp<=0){
          e.dying=true;
          e.deathTimer=0.07;
        }
      }
    };

    if(isSeed){
      // same trigger discipline as the pod, slower cadence, no beam
      laser=null;
      stopLaserSound();
      rocketCd-=dt;
      if(rocketCd<=0){ rocketCd=0.55; firePlayerSeed(); }
    } else if(isRocket){
      // the pod is not a beam at all: it auto-fires splash rockets while the
      // trigger is held, so no ray is drawn and no beam damage is applied
      laser=null;
      stopLaserSound();
      rocketCd-=dt;
      if(rocketCd<=0){ rocketCd=0.22; firePlayerRocket(); }
    } else if(piercing){
      for(const hit of pierced){ hit.e._laserDist=hit.dist; applyBeamDamage(hit.e); }
    } else if(bestEnemy){
      bestEnemy._laserDist=bestDist; applyBeamDamage(bestEnemy);
    }
  } else {
    if(player.wasFiring) stopLaserSound();
    laser=null;
  }
  player.wasFiring=fire;

  // ── update coins bob ──
  for(const c of coins){
    c.bob+=dt*c.bobSpd;
  }

  // ── update enemies ──
  for(const e of enemies){
    if(e.dead) continue;

    if(e.frozen>0){
      // inert: no AI, no contact damage, just a block on a timer
      e.frozen-=dt;
      if(e.frozen<=0){ e.frozen=0; e.vx=e.frozenVx||e.vx; }
      continue;
    }

    // dying enemies freeze in place for one bright flash frame before the real kill fires
    if(e.dying){
      e.deathTimer-=dt;
      if(e.deathTimer<=0){
        e.dead=true;
        killEnemy(e);
      }
      continue;
    }

    e.wingPhase+=dt*6;
    e.glowPhase+=dt*3;
    if(e.hitFlash>0) e.hitFlash=Math.max(0,e.hitFlash-dt);

    // patrol
    e.x+=e.vx*dt;

    // dive-bomb: once close enough, angle sharply toward the player's exact
    // height (and nudge horizontally toward them) instead of just drifting
    // to a fixed idle altitude
    const toPlayerX=(player.x+PLAYER_W/2)-e.x;
    const toPlayerY=(player.y+PLAYER_H/2)-e.baseY;
    const diving=Math.abs(toPlayerX)<220 && Math.abs(toPlayerY)>20;
    if(diving){
      e.baseY+=Math.sign(toPlayerY)*220*dt;
      e.x+=Math.sign(toPlayerX)*40*dt;
    } else {
      e.baseY+=(120-e.baseY)*dt*0.8;
    }
    e.baseY=clamp(e.baseY,60,GROUND_Y-40);

    // lazy vertical bobbing wave, independent of the dive/patrol AI, so the
    // pterodactyl never hangs dead-still on a single point.
    // The dragonfly weaves harder and holds its altitude instead of diving —
    // it wants to be ABOVE you, because that is where its attack works from.
    e.y=e.baseY+Math.sin(Date.now()/200+e.wavePhase)*(e.species==="forest_flyer"?22:10);
    if(e.species==="ice_flyer"){
      // holds a lane and snipes: a chill shot does not hurt much on its own,
      // it takes your footing away on a floor that is already slippery
      e.baseY+=((150-e.baseY))*dt*0.4;
      e.dripCooldown-=dt;
      const dxP=(player.x+PLAYER_W/2)-(e.x+e.w/2);
      if(e.dripCooldown<=0 && Math.abs(dxP)<420){
        e.dripCooldown=rnd(1.8,3.2);
        const dyP=(player.y+PLAYER_H/2)-(e.y+e.h/2);
        const dd=Math.hypot(dxP,dyP)||1;
        lavaBalls.push({x:e.x+e.w/2, y:e.y+e.h*0.5,
                        vx:(dxP/dd)*260, vy:(dyP/dd)*260-40,
                        life:0, acid:true, chill:true});
        playPew();
      }
    }
    if(e.species==="forest_flyer"){
      e.baseY+=((120-e.baseY))*dt*0.5;
      e.dripCooldown-=dt;
      // lined up overhead and reloaded: let one fall
      if(e.dripCooldown<=0 && Math.abs((player.x+PLAYER_W/2)-(e.x+e.w/2))<38 &&
         e.y<player.y-20){
        e.dripCooldown=rnd(1.6,3.0);
        lavaBalls.push({x:e.x+e.w/2,y:e.y+e.h*0.6,vx:0,vy:40,life:0,acid:true});
        playPew();
      }
    }

    // patrol bounce
    if(e.x<e.patrolMin||(e.x+e.w)>e.patrolMax) e.vx*=-1;

    // beam damage is now applied directly against the nearest hit enemy in the
    // continuous-laser raycast above, not via a per-beam-object collision loop

    // player collision — both e.x/e.y and player.x/player.y are world-space, so
    // compare them directly with no camX in the mix (see the coin-collection note below)
    if(player.invuln<=0 && overlaps({x:e.x,y:e.y,w:e.w,h:e.h},{x:player.x,y:player.y,w:PLAYER_W,h:PLAYER_H})){
      takeDamage("enemy");
    }
  }

  // ── update ground patrollers ──
  for(const e of groundEnemies){
    if(e.dead) continue;

    if(e.frozen>0){
      e.frozen-=dt;
      if(e.frozen<=0){ e.frozen=0; e.vx=e.frozenVx||e.vx; }
      continue;
    }

    if(e.dying){
      e.deathTimer-=dt;
      if(e.deathTimer<=0){
        e.dead=true;
        killEnemy(e);
      }
      continue;
    }

    if(e.hitFlash>0) e.hitFlash=Math.max(0,e.hitFlash-dt);

    if(e.turret){
      // a living turret: never moves, faces the player, lobs a spore ball on
      // a parabola once you are in range
      const toP=(player.x+PLAYER_W/2)-(e.x+e.w/2);
      e.faceDir=Math.sign(toP)||1;
      e.spitCooldown-=dt;
      if(e.spitCooldown<=0 && Math.abs(toP)<360 &&
         Math.abs((player.y+PLAYER_H/2)-(e.y+e.h/2))<220){
        e.spitCooldown=rnd(1.8,3.2);
        // aim high so the arc drops onto the player rather than at them
        const dy=(player.y+PLAYER_H/2)-(e.y+e.h*0.25);
        lavaBalls.push({
          x:e.x+e.w/2, y:e.y+e.h*0.25,
          vx:clamp(toP*1.15,-320,320), vy:-190+Math.min(0,dy*0.4),
          life:0, acid:true
        });
        playPew();
      }
    } else {
      e.x+=e.vx*dt;
      // turn around at the platform's own edge — for the mid platforms flanked
      // by lava pits this IS the lava's edge, so no separate lava check needed
      if(e.x<e.patrolMin){ e.x=e.patrolMin; e.vx=Math.abs(e.vx); }
      else if(e.x>e.patrolMax){ e.x=e.patrolMax; e.vx=-Math.abs(e.vx); }
      e.faceDir=Math.sign(e.vx)||e.faceDir;
      if(e.species==="ice_crusher"){
        // it is a tank: every footfall shakes the screen a little
        e.stepPhase=(e.stepPhase||0)+dt*Math.abs(e.vx)*0.05;
        if(e.stepPhase>1){
          e.stepPhase=0;
          screenShake=Math.min(6,screenShake+1.4);
          spawnParticles(e.x+e.w/2-camX,e.y+e.h,4,["#dff6ff","#bae6fd"],
            {minSpd:20,maxSpd:70,upBias:40,minLife:0.15,maxLife:0.4,type:"square",gravity:200,minSz:1,maxSz:3});
        }
      }
    }

    // STOMP — dropping onto a shielded crawler is the other way through its
    // armour. Checked before contact damage, and only while actually falling
    // onto its top edge, so walking into it still hurts.
    const pbox={x:player.x,y:player.y,w:PLAYER_W,h:PLAYER_H};
    if(e.shield && player.vy>0 && !e.dying &&
       overlaps(pbox,{x:e.x,y:e.y,w:e.w,h:e.h}) &&
       (player.y+PLAYER_H)-e.y < e.h*0.7){
      e.hp=0; e.dying=true; e.deathTimer=0.07;
      player.vy=JUMP_VY*0.8;              // bounce off it
      player.invuln=Math.max(player.invuln,0.35);
      hitStopTimer=Math.max(hitStopTimer,0.06);
      screenShake=Math.min(6,screenShake+4);
      spawnFloatingText(e.x+e.w/2-camX,e.y-12,"STOMP!","#a7f3d0",15);
      playExplosion();
      continue;
    }

    // player collision
    if(player.invuln<=0 && overlaps({x:e.x,y:e.y,w:e.w,h:e.h},pbox)){
      takeDamage("enemy");
    }
  }

  // ── update enemy drops (piñata gems + coins) ──
  const pDropCx=player.x+PLAYER_W/2, pDropCy=player.y+PLAYER_H/2;
  for(let i=drops.length-1;i>=0;i--){
    const d=drops[i];
    if(!d.landed){
      d.vy+=420*dt;
      d.x+=d.vx*dt; d.y+=d.vy*dt;
      // settle onto whatever platform is directly beneath it
      for(const pf of platforms){
        if(pf.lavaPit) continue;
        if(d.x>=pf.x&&d.x<=pf.x+pf.w&&d.y>=pf.y&&d.y<=pf.y+16&&d.vy>0){
          d.y=pf.y; d.vy=0; d.vx=0; d.landed=true;
          break;
        }
      }
      // lost to the lava
      if(d.y>LAVA_Y){ drops.splice(i,1); continue; }
    }
    d.life+=dt;
    if(d.life>8){ drops.splice(i,1); continue; }

    // catch check — works whether it's still falling or already landed;
    // catching it BEFORE it lands doubles the payout
    const ddx=pDropCx-d.x, ddy=pDropCy-d.y;
    if(Math.hypot(ddx,ddy)<34){
      if(d.kind==="fuel"){
        player.jetFuel=Math.min(1,player.jetFuel+0.5);
        spawnParticles(d.x-camX,d.y,6,dropColors(d.kind),
          {minSpd:40,maxSpd:120,minLife:0.2,maxLife:0.5,type:"circle",gravity:80});
        spawnFloatingText(d.x-camX,d.y-10,"FUEL+","#44aaff",13);
        playChime(chain);
      } else {
        const base=d.kind==="bosscoin"?320:(d.kind==="coin"?80:30);
        const pts=base*(d.landed?1:2);
        score+=pts;
        earnCoins(COIN_VALUE[d.kind]||1);
        chain++; addChain(0);
        playChime(chain);
        spawnParticles(d.x-camX,d.y,6,dropColors(d.kind),
          {minSpd:40,maxSpd:120,minLife:0.2,maxLife:0.5,type:"circle",gravity:80});
        spawnFloatingText(d.x-camX,d.y-10,`+${pts}`,d.kind==="coin"?"#ffdd44":dropColors(d.kind)[0],14);
      }
      drops.splice(i,1);
    }
  }

  // ── coin collection ──
  // IMPORTANT: player.x/player.y and coin.x/coin.y are BOTH already world-space
  // coordinates (camX is a render-only offset subtracted at draw time in drawCoins/
  // drawPlayer). Adding camX here a second time was the root cause of coins getting
  // missed — it desynced the collision math from the world the coins actually live in.
  const pcx=player.x+PLAYER_W/2, pcy=player.y+PLAYER_H/2;
  // FEVER MODE auto-pulls every gold/gem on screen, same as the MAGNET power-up
  const magnetActive=(player.activePower&&player.activePower.kind==="magnet")||feverMode;
  const COLLECT_R=collectRadius(), MAGNET_R=magnetActive?260:80;
  // reverse iteration so collecting/removing a coin can never cause a neighboring
  // coin to be skipped over in the same pass
  for(let i=coins.length-1;i>=0;i--){
    const c=coins[i];
    if(c.collected) continue;
    if(c.popping){
      // pop-out: float up and fade before finally disappearing
      c.popT+=dt;
      c.y-=90*dt;
      if(c.popT>=0.35) c.collected=true;
      continue;
    }
    const coinCy=c.y+Math.sin(c.bob)*4;
    const dx=pcx-c.x, dy=pcy-coinCy;
    const dist=Math.hypot(dx,dy);

    if(dist<COLLECT_R){
      c.popping=true; c.popT=0;
      score+=50;
      earnCoins(1);
      chain++;
      addChain(0); // refresh combo timer / fever state without double-incrementing chain
      playChime(chain);
      spawnParticles(c.x-camX,c.y,5,["#ffdd00","#ffaa00","#fff"],
        {minSpd:30,maxSpd:100,minLife:0.2,maxLife:0.5,type:"circle",gravity:80});
      spawnFloatingText(c.x-camX,c.y-10,"+50","#ffdd44",13);
    } else if(dist<MAGNET_R){
      // soft magnet pull toward the dino once it's close — arcade-style attraction,
      // greatly extended range while the MAGNET power-up is active
      const pull=(1-dist/MAGNET_R)*(magnetActive?420:260)*dt;
      c.x+=(dx/dist)*pull;
      c.y+=(dy/dist)*pull;
    }
  }
  coins=coins.filter(c=>!c.collected);

  // the MAGNET power-up also pulls enemy drops (gems/coins) toward the dino
  if(magnetActive){
    for(const d of drops){
      const dx=pcx-d.x, dy=pcy-d.y;
      const dist=Math.hypot(dx,dy)||1;
      if(dist<260){
        const pull=(1-dist/260)*420*dt;
        d.x+=(dx/dist)*pull; d.y+=(dy/dist)*pull;
        d.landed=false; // being pulled counts as still "in the air" for the 2x bonus
      }
    }
  }

  // chain decay
  if(chain>0){
    chainTimer-=dt;
    if(chainTimer<=0){ chain=0; feverMode=false; }
  }

  // ── active power-up countdown ──
  if(player.activePower){
    player.activePower.timer-=dt;
    if(player.activePower.timer<=0){
      player.activePower=null;
      player.shieldCharge=false;
    }
  }

  // laser-beam-vs-point helper shared by every shootable pickup below
  const inLaserSweep=(x,y,tolerance)=>{
    if(!laser) return false;
    const reach=laser.mouthX+laser.dir*laser.len;
    const withinX = laser.dir>0 ? (x>=laser.mouthX&&x<=reach) : (x<=laser.mouthX&&x>=reach);
    if(!withinX) return false;
    // SPREAD has three lances; a cage under the low one has to break too
    const ys=laser.ys||[laser.mouthY];
    return ys.some(ly=>Math.abs(y-ly)<tolerance);
  };

  // ── power-up boxes: break on touch or when the laser sweeps over one ──
  for(const box of powerUpBoxes){
    if(!box.alive) continue;
    const boxCy=box.y+Math.sin(t*1.6+box.bob)*6;
    const touchDist=Math.hypot((player.x+PLAYER_W/2)-box.x,(player.y+PLAYER_H/2)-boxCy);
    if(touchDist<32||inLaserSweep(box.x,boxCy,20)) breakPowerUpBox(box);
  }
  powerUpBoxes=powerUpBoxes.filter(b=>b.alive);

  // ── weapon pickups (Sulfur Essence / Magma Crystal): touch or laser ──
  for(const wp of weaponPickups){
    if(!wp.alive) continue;
    const wpCy=wp.y+Math.sin(t*1.6+wp.bob)*6;
    const touchDist=Math.hypot((player.x+PLAYER_W/2)-wp.x,(player.y+PLAYER_H/2)-wpCy);
    if(touchDist<30||inLaserSweep(wp.x,wpCy,18)) collectWeaponPickup(wp);
  }
  weaponPickups=weaponPickups.filter(w=>w.alive);

  // ── vine curtains: solid until something burns them away ──
  // Only FLAME clears one. It is the first thing in the game that makes a
  // weapon letter a key rather than a damage number.
  for(const p of platforms){
    if(!p.curtain||p.gone) continue;
    if(isFlame && fire && inLaserSweep(p.x+p.w/2,p.y+p.h/2,p.h/2)){
      p.burnT=(p.burnT===undefined?1:p.burnT)-dt*2.4;
      spawnParticles(p.x+p.w/2-camX,p.y+rnd(0,p.h),2,["#ffaa22","#ff6600","#2f6b3d"],
        {minSpd:30,maxSpd:120,upBias:60,minLife:0.2,maxLife:0.5,type:"square",gravity:60});
      if(p.burnT<=0){
        p.gone=true; p.respawnT=Infinity;   // burned curtains stay burned
        playExplosion();
        screenShake=Math.min(6,screenShake+4);
        spawnFloatingText(p.x+p.w/2-camX,p.y+p.h/2,"YOL AÇILDI","#ffaa22",15);
        spawnParticles(p.x+p.w/2-camX,p.y+p.h/2,22,["#ffaa22","#ff6600","#2f6b3d","#4ade80"],
          {minSpd:60,maxSpd:220,minLife:0.3,maxLife:0.8,type:"square",gravity:200});
      }
    }
  }

  // ── captive cages: ONLY break by being shot (laser or lava bomb), never
  // by simply walking into them — freeing the baby dino takes a real hit ──
  for(const cage of cages){
    if(!cage.alive) continue;
    if(!inLaserSweep(cage.x,cage.y,18)) continue;
    if(cage.species==="frozen" && !isFlame){
      // a block of ice does not care about a plasma beam. Say so, once in a
      // while, rather than letting the player wonder why nothing happens.
      if(Math.random()<dt*3){
        spawnFloatingText(cage.x-camX,cage.y-24,"BUZ ERİMİYOR","#7dd3fc",12);
        spawnParticles(cage.x-camX,cage.y,2,["#dff6ff","#7dd3fc"],
          {minSpd:40,maxSpd:120,minLife:0.1,maxLife:0.3,type:"square",gravity:120,minSz:1,maxSz:3});
      }
      continue;
    }
    cage.hp-=(hyperActive?4:1)*dt*(cage.species==="frozen"?6:10);
    if(cage.species==="frozen"&&Math.random()<dt*20){
      spawnParticles(cage.x-camX,cage.y+rnd(-16,16),1,["#dff6ff","#bae6fd","#ffffff"],
        {minSpd:20,maxSpd:70,minLife:0.2,maxLife:0.5,type:"circle",gravity:180,minSz:1,maxSz:3});
    }
    if(cage.hp<=0) breakCage(cage);
  }
  cages=cages.filter(c=>c.alive);

  // (the ceiling no longer drips — it's plain dark rock now, so the lava-drip
  // emitters that belonged to the old lava_ceiling band are gone with it)

  // ── mid-stage checkpoint ──
  levelTime+=dt;
  if(!checkpointUsed && player.x+PLAYER_W/2>=checkpointX){
    checkpointUsed=true;
    playPowerUp();
    screenShake=Math.min(6,screenShake+3);
    spawnFloatingText(player.x+PLAYER_W/2-camX,player.y-26,"KONTROL NOKTASI","#7dffcf",15);
    spawnParticles(player.x+PLAYER_W/2-camX,player.y+PLAYER_H/2,18,
      ["#7dffcf","#aaffdd","#ffffff"],
      {minSpd:60,maxSpd:220,upBias:60,minLife:0.3,maxLife:0.8,type:"square",gravity:-20});
    queueRadio("checkpoint","KOMUTA MERKEZİ",
      ["Konumun kaydedildi.","Düşersen buradan devam edersin."],
      {color:"#7dffcf",hold:3.0});
  }

  // ── the evacuation portal ──
  if(gateOpen && portalReveal<1) portalReveal=Math.min(1,portalReveal+dt/0.9);
  if(gateOpen && !goalReached){
    const pp=goalPortalPos();
    // motes drawn into the open rift (screen space — drawParticles applies no
    // further camX shift)
    if(portalReveal>=1 && Math.random()<dt*26){
      const a=rnd(0,Math.PI*2), rr=rnd(60,130);
      particles.push({
        x:pp.x-camX+Math.cos(a)*rr, y:pp.y+Math.sin(a)*rr,
        vx:-Math.cos(a)*rnd(70,150), vy:-Math.sin(a)*rnd(70,150),
        life:1, maxLife:rnd(0.5,0.9),
        color:Math.random()<0.5?(themeOf().portalMote||"#7dffcf"):"#7aa8ff", size:rnd(2,4), type:"square", gravity:0
      });
    }
    // contact — walking into the rift starts the warp
    if(Math.abs((player.x+PLAYER_W/2)-pp.x)<52 &&
       Math.abs((player.y+PLAYER_H/2)-pp.y)<PORTAL_H*0.5){
      startPortalWarp(pp);
    }
  }

  // ── dynamic hazard: magma bursts erupting from the lava ──
  if(Math.random()<dt*0.5) spawnMagmaBurst();
  for(let i=magmaBursts.length-1;i>=0;i--){
    const m=magmaBursts[i];
    m.vy+=520*dt;
    m.x+=m.vx*dt; m.y+=m.vy*dt;
    m.life+=dt;
    if(m.y>=LAVA_Y||m.life>4){
      spawnParticles(m.x-camX,LAVA_Y,4,["#ff8800","#ffcc00"],
        {minSpd:20,maxSpd:70,upBias:30,minLife:0.15,maxLife:0.35,type:"circle",gravity:100});
      magmaBursts.splice(i,1);
      continue;
    }
    if(player.invuln<=0 && Math.hypot((player.x+PLAYER_W/2)-m.x,(player.y+PLAYER_H/2)-m.y)<20){
      takeDamage("lava");
      magmaBursts.splice(i,1);
    }
  }

  // ── boss entrance: siren + WARNING! + descent, before the fight begins ──
  // gated on the arena wave being cleared first, so the two camera-locks can
  // never overlap or race each other
  if(boss && !boss.dead && arenaCleared && !bossIntroTriggered && player.x+PLAYER_W/2>=BOSS_TRIGGER_X){
    bossIntroTriggered=true;
    cameraLock=true;
    boss.introState="warning";
    boss.introTimer=2.2;
    warningBannerTimer=2.2;
    startSiren(2.2);
    queueRadio("boss","ACİL DURUM",
      ["ALFA TEHDİT YAKLAŞIYOR!","YOLU TEMİZLE!"],
      {color:"#ff2222",urgent:true,hold:3.2});
  }

  // ── boss: Alpha Pterodactyl guarding the exit gate ──
  if(boss&&!boss.dead){
    if(boss.dying){
      boss.deathTimer-=dt;
      if(boss.deathTimer<=0){ boss.dead=true; killBoss(); }
    } else if(boss.introState==="warning"){
      boss.introTimer-=dt;
      if(boss.introTimer<=0){
        boss.introState="descending"; boss.introTimer=1.3;
        bossCardTimer=2.6;   // the name card rides in with the descent
      }
    } else if(boss.introState==="descending"){
      boss.introTimer-=dt;
      const p=1-clamp(boss.introTimer/1.3,0,1);
      boss.y=lerp(-160,boss.baseY,p);
      if(boss.introTimer<=0){ boss.introState="active"; boss.y=boss.baseY; }
    } else if(boss.introState==="active"){
      // the real fight — note this must stay an explicit check, not a bare
      // `else`: before the intro is triggered, introState is "pending" and
      // the boss must do nothing (no attacks, no contact damage) while it
      // waits off-screen. A bare `else` here previously fell through and
      // ran the full fight AI from frame one, firing lava balls/flame
      // bursts at the player from off-screen before the boss ever appeared.
      // half health flips the fight over
      if(boss.phase===1 && boss.hp<=boss.maxHp/2) enterBossPhase2();
      const rage=boss.phase>=2;
      boss.wavePhase+=dt*(rage?3.2:2);
      if(boss.hitFlash>0) boss.hitFlash=Math.max(0,boss.hitFlash-dt);

      if(boss.kind==="titan"){
        // A GROUND TITAN. It never leaves the floor, closes slowly, and has
        // two answers: a horizontal freeze breath, and a slam that brings
        // the whole ceiling down on you.
        boss.y=GROUND_Y-boss.h/2;
        const toP=(player.x+PLAYER_W/2)-boss.x;
        boss.walkDir=Math.sign(toP)||1;
        if(Math.abs(toP)>140 && boss.breathState==="none"){
          boss.x+=boss.walkDir*(rage?70:42)*dt;
        }

        // freeze breath — telegraph, then a wide horizontal beam
        if(boss.breathState==="none"){
          boss.breathCooldown-=dt*(rage?1.6:1);
          if(boss.breathCooldown<=0){
            boss.breathState="wind"; boss.breathTimer=0.5;
            boss.breathDir=boss.walkDir;
          }
        } else if(boss.breathState==="wind"){
          boss.breathTimer-=dt;
          if(boss.breathTimer<=0){
            boss.breathState="blow";
            // the sweep needs longer than the straight beam, or the arc goes
            // past you faster than you can read it
            boss.breathDur=rage?1.8:1.0;
            boss.breathTimer=boss.breathDur;
            // every blow opens level. In phase 2 the sweep below takes over
            // from the first frame and drives the angle itself, so there is
            // nothing to seed here; in phase 1 it simply stays level.
            boss.breathAngle=0;
          }
        } else {
          boss.breathTimer-=dt;
          if(rage){
            // One linear sweep across the whole arc over the blow: it starts
            // aimed over your head and rakes down past you to the floor, so
            // the dodge is a jump timed as it arrives rather than a place to
            // stand. It ends below the standing line, which is what stops the
            // attack from simply parking on the player.
            const p=clamp(1-boss.breathTimer/boss.breathDur,0,1);
            boss.breathAngle=-BREATH_ARC+p*2*BREATH_ARC;
          }
          const r=breathRay();
          if(player.invuln<=0 &&
             segDist(player.x+PLAYER_W/2, player.y+PLAYER_H/2,
                     r.ax,r.ay,r.bx,r.by) < BREATH_HALF_W){
            player.chilled=1.4;
            takeDamage("enemy");
          }
          if(Math.random()<dt*90){
            const u=Math.random();
            spawnParticles(
              (r.ax+(r.bx-r.ax)*u)-camX, r.ay+(r.by-r.ay)*u+rnd(-16,16), 1,
              ["#dff6ff","#7dd3fc","#ffffff"],
              {minSpd:40,maxSpd:160,minLife:0.2,maxLife:0.6,type:"square",gravity:-20,minSz:2,maxSz:5});
          }
          if(boss.breathTimer<=0){
            boss.breathState="none";
            boss.breathAngle=0;
            boss.breathCooldown=rnd(2.6,4.2);
          }
        }

        // the slam: every icicle on the ceiling comes down at once
        boss.poundCooldown-=dt*(rage?1.5:1);
        if(boss.poundCooldown<=0 && boss.breathState==="none"){
          boss.poundCooldown=rnd(5,8);
          const n=dropAllIcicles();
          screenShake=Math.min(6,screenShake+6);
          bossShakeTimer=Math.max(bossShakeTimer,0.6);
          hitStopTimer=Math.max(hitStopTimer,0.07);
          playExplosion();
          if(n>0) spawnFloatingText(boss.x-camX,boss.y-boss.h*0.7,"TAVAN ÇÖKÜYOR!","#bae6fd",16);
          spawnParticles(boss.x-camX,GROUND_Y-6,20,["#dff6ff","#7dd3fc","#ffffff"],
            {minSpd:80,maxSpd:260,upBias:80,minLife:0.3,maxLife:0.7,type:"square",gravity:380,minSz:2,maxSz:6});
        }
      } else if(boss.kind==="walker"){
        // GROUND UNIT: it never leaves the floor. It closes on the player and
        // stomps; the wave punishes standing, so the fight reads as "keep
        // moving and get airborne", the opposite of the flyers.
        boss.y=GROUND_Y-boss.h/2;
        const toP=(player.x+PLAYER_W/2)-boss.x;
        boss.walkDir=Math.sign(toP)||1;
        if(Math.abs(toP)>90) boss.x+=boss.walkDir*(rage?78:48)*dt;
        boss.stompCooldown-=dt*(rage?1.7:1);
        if(boss.stompCooldown<=0){
          boss.stompCooldown=rnd(2.0,3.0);
          for(const d of (rage?[-1,1,-1]:[-1,1])){
            shockwaves.push({x:boss.x+d*40,dir:d,life:rage?rnd(0,0.25):0});
          }
          screenShake=Math.min(6,screenShake+5);
          hitStopTimer=Math.max(hitStopTimer,0.05);
          playExplosion();
        }
      } else {
        // FLYER: the original hover-and-bob, plus a telegraphed swoop
        boss.baseY=170+Math.sin(t*(rage?1.9:1.2))*(rage?58:40);
        boss.y=boss.baseY+Math.sin(Date.now()/220+boss.wavePhase)*8;
        boss.diveCooldown-=dt*(rage?1.6:1);
        if(boss.diveState==="none" && boss.diveCooldown<=0){
          boss.diveState="telegraph"; boss.diveTimer=0.55;
          boss.diveDir=Math.sign((player.x+PLAYER_W/2)-boss.x)||-1;
          boss.diveTargetY=player.y+PLAYER_H/2;
        } else if(boss.diveState==="telegraph"){
          boss.diveTimer-=dt;
          if(boss.diveTimer<=0){ boss.diveState="swoop"; boss.diveTimer=0.9; }
        } else if(boss.diveState==="swoop"){
          boss.diveTimer-=dt;
          boss.x+=boss.diveDir*(rage?560:430)*dt;
          boss.y+=((boss.diveTargetY-boss.y))*Math.min(1,dt*4);
          boss.baseY=boss.y;
          if(boss.diveTimer<=0){
            boss.diveState="none";
            boss.diveCooldown=rnd(2.6,4.4);
          }
        }
      }

      // attack 1: slow homing lava ball
      boss.fireCooldown-=dt*(rage?1.7:1);
      if(boss.fireCooldown<=0){
        boss.fireCooldown=rnd(2.2,3.4);
        const dx=(player.x+PLAYER_W/2)-boss.x, dy=(player.y+PLAYER_H/2)-boss.y;
        const dd=Math.hypot(dx,dy)||1;
        // every lava ball is parryable: slow, telegraphed, and the one thing
        // in the fight that rewards standing your ground instead of running
        lavaBalls.push({x:boss.x,y:boss.y,vx:(dx/dd)*160,vy:-140,life:0,parry:true});
        // phase 2 spits a three-way fan instead of a single shot
        if(boss.phase>=2){
          for(const spread of [-0.42,0.42]){
            const ca=Math.cos(spread), sa=Math.sin(spread);
            lavaBalls.push({
              x:boss.x, y:boss.y,
              vx:((dx/dd)*ca-(-1)*sa)*160, vy:-140+sa*90,
              life:0, parry:true
            });
          }
        }
        playPew();
      }

      // attack 2: a downward vertical flame burst dropped beneath the boss
      boss.flameCooldown-=dt*(rage?1.8:1);
      if(boss.flameCooldown<=0 && boss.kind!=="walker" && boss.kind!=="titan"){
        boss.flameCooldown=rnd(3.5,5);
        bossFlameBursts.push({x:boss.x,y:boss.y+boss.h/2,life:0,maxLife:1.1});
        playExplosion();
      }

      if(player.invuln<=0 && overlaps({x:boss.x-boss.w/2,y:boss.y-boss.h/2,w:boss.w,h:boss.h},{x:player.x,y:player.y,w:PLAYER_W,h:PLAYER_H})){
        takeDamage("enemy");
      }
    }
  }

  // Once the Alpha falls the rift opens, but the stage does NOT end by
  // itself any more — the player has to walk the rescued hatchlings into it.
  // (stageClearDelay is now just the beat before the evac call goes out.)
  if(boss&&boss.dead&&!goalReached&&stageClearDelay>0){
    stageClearDelay-=dt;
    if(stageClearDelay<=0){
      queueRadio("evac","KOMUTA MERKEZİ",
        ["Portal açıldı!","Yavruları topla ve içeri gir!"],
        {color:"#7dffcf",urgent:true,hold:3.6});
    }
  }

  // boss lava-ball projectiles
  for(let i=lavaBalls.length-1;i>=0;i--){
    const lb=lavaBalls[i];
    lb.vy+=340*dt;
    lb.x+=lb.vx*dt; lb.y+=lb.vy*dt;
    lb.life+=dt;
    if(lb.y>LAVA_Y||lb.life>6){ lavaBalls.splice(i,1); continue; }
    const near=Math.hypot((player.x+PLAYER_W/2)-lb.x,(player.y+PLAYER_H/2)-lb.y)<26;
    // PARRY — dash into a parryable shot and you swat it instead of eating it.
    // Checked before the damage test, and deliberately not gated on invuln:
    // the dash grants i-frames of its own, so gating it there would mean the
    // parry could never fire.
    if(near && lb.parry && player.dashTimer>0){
      parryShot(lb);
      lavaBalls.splice(i,1);
      continue;
    }
    if(player.invuln<=0 && near){
      // a chill round freezes your footing as well as taking a heart
      if(lb.chill) player.chilled=1.0;
      takeDamage("enemy");
      spawnParticles(lb.x-camX,lb.y,8,["#ff8800","#ffcc00","#ff4400"],
        {minSpd:60,maxSpd:180,minLife:0.2,maxLife:0.4,type:"circle",gravity:150});
      lavaBalls.splice(i,1);
    }
  }

  updateShockwaves(dt);

  // boss vertical flame-burst hazards (attack 2) — a column of fire that
  // telegraphs briefly, then damages anything standing in it
  for(let i=bossFlameBursts.length-1;i>=0;i--){
    const fb=bossFlameBursts[i];
    fb.life+=dt;
    if(fb.life>fb.maxLife){ bossFlameBursts.splice(i,1); continue; }
    const active=fb.life>0.4; // brief telegraph window before it actually burns
    if(active && player.invuln<=0 &&
       Math.abs((player.x+PLAYER_W/2)-fb.x)<26 &&
       player.y+PLAYER_H>fb.y && player.y<LAVA_Y){
      takeDamage("enemy");
    }
    if(active && Math.random()<0.5) spawnParticles(fb.x-camX,fb.y+rnd(0,LAVA_Y-fb.y),1,
      ["#ff8800","#ffcc00","#ff4400"],
      {minSpd:10,maxSpd:40,upBias:0,minLife:0.15,maxLife:0.3,type:"square",gravity:0,minSz:3,maxSz:6});
  }

  // player lava bombs (Magma Crystal attack) — arcs out, explodes on impact
  // with an enemy, a cage, or the ground/lava
  for(let i=playerBombs.length-1;i>=0;i--){
    const b=playerBombs[i];
    if(!b.straight) b.vy+=520*dt;   // rockets fly flat; lava bombs arc
    b.x+=b.vx*dt; b.y+=b.vy*dt;
    b.life+=dt;
    let exploded=false;
    if(b.y>=LAVA_Y||b.life>(b.straight?1.1:3)){ exploded=true; }
    if(b.seed && b.life>2.2) exploded=true;
    if(!exploded){
      for(const pf of platforms){
        if(pf.lavaPit) continue;
        if(b.x>=pf.x&&b.x<=pf.x+pf.w&&b.y>=pf.y&&b.vy>0){ b.y=pf.y; exploded=true; break; }
      }
    }
    if(!exploded){
      // contact detonation — the splash in explodePlayerBomb does the damage,
      // but without this a rocket would sail straight through its target
      for(const e of [...enemies,...groundEnemies]){
        if(e.dead||e.dying) continue;
        if(overlaps({x:b.x-6,y:b.y-6,w:12,h:12},{x:e.x,y:e.y,w:e.w,h:e.h})){ exploded=true; break; }
      }
      if(!exploded && boss && !boss.dead && boss.introState==="active" &&
         overlaps({x:b.x-6,y:b.y-6,w:12,h:12},
                  {x:boss.x-boss.w/2,y:boss.y-boss.h/2,w:boss.w,h:boss.h})) exploded=true;
    }
    if(!exploded){
      for(const cage of cages){
        if(cage.alive && Math.hypot(cage.x-b.x,cage.y-b.y)<26){ breakCage(cage); exploded=true; break; }
      }
    }
    if(exploded){ explodePlayerBomb(b); playerBombs.splice(i,1); }
  }

  // hatchlings that peeled off a full train — purely visual, they scamper off
  for(let i=babyDinos.length-1;i>=0;i--){
    const bd=babyDinos[i];
    bd.x+=bd.vx*dt;
    bd.life-=dt;
    if(bd.life<=0) babyDinos.splice(i,1);
  }

  // rescue train — records the player's path and walks the chain along it
  updateFollowers(dt);
  updateScaredBabies(dt);
  updateBabyShots(dt);

  // ── story trigger: closing on the first lava pit of the stage ──
  // lavaPits carry world x/width, and player.x is world space too, so these
  // compare directly with no camX anywhere in the test
  if(!radioFired["heat"]){
    const heatCx=player.x+PLAYER_W/2;
    for(const lp of lavaPits){
      if(heatCx>lp.x-150 && heatCx<lp.x+lp.w+40){
        queueRadio("heat","ISI SENSÖRÜ",
          ["SICAKLIK KRİTİK!","Jetpack'i kullan — ZIPLAMA'yı basılı tut!"],
          {color:"#ff4444",urgent:true,hold:3.6});
        break;
      }
    }
  }

  // ── story trigger: the first low shelf of the stage ──
  if(!radioFired["slide"]){
    const pcx=player.x+PLAYER_W/2;
    for(const p of platforms){
      if(!p.lowBar) continue;
      if(pcx>p.x-240 && pcx<p.x+p.w+40){
        queueRadio("slide","SAHA ANALİZİ",
          ["Alçak buz rafı — ayakta geçilmez.","AŞAĞI tuşuyla kayarak süzül!"],
          {color:"#7dd3fc",urgent:true,hold:3.6});
        break;
      }
    }
  }

  // weapon pickups bob gently, same idle motion as the classic power-up boxes
  // (no extra state needed — drawWeaponPickups reads t+bob directly)

  // ── arena wave: entering the band locks the camera until every enemy
  // spawned inside it is cleared, Metal Slug style ──
  if(!arenaCleared){
    const arenaAlive=[...enemies,...groundEnemies].some(e=>e.arenaEnemy&&!e.dead);
    if(!arenaAlive){
      // cleared — whether that's because the lock engaged and the wave was
      // beaten, or the enemies happened to die before the player ever
      // reached the trigger line. Either way this must never get stuck.
      if(cameraLock){ cameraLock=false; arenaGoTimer=2.5; playPowerUp(); }
      arenaCleared=true;
    } else if(!cameraLock){
      const pcx=player.x+PLAYER_W/2;
      if(pcx>=ARENA_X_START && pcx<=ARENA_X_END){
        // standing INSIDE the band with the wave still alive — lock them in.
        // (Testing only the lower bound would re-arm the lock from anywhere
        // to the right of the band, including well past it.)
        cameraLock=true;
        arenaBannerTimer=2.6;
        screenShake=Math.min(6,screenShake+4);
        queueRadio("arena","KOMUTA MERKEZİ",
          ["Sürü yolu kesti — bölge kilitlendi!","Hepsini indirmeden ilerleyemezsin!"],
          {color:"#ff8844",urgent:true,hold:3.0});
      } else if(pcx>ARENA_X_END+60){
        // got clean past the band without the lock ever engaging (flew over
        // it, or the wave drifted). Treat the wave as behind them — otherwise
        // arenaCleared stays false forever, and on the boss stage that
        // permanently blocks the boss trigger AND leaves the exit sealed,
        // i.e. an unwinnable run.
        arenaCleared=true;
      }
    }
  }
  if(bossCardTimer>0) bossCardTimer-=dt;
  if(bossRageTimer>0) bossRageTimer-=dt;
  if(arenaBannerTimer>0) arenaBannerTimer-=dt;
  if(arenaGoTimer>0) arenaGoTimer-=dt;
  if(warningBannerTimer>0) warningBannerTimer-=dt;

  // camera — smooth lerp keeping the dino at ~30-35% of the screen width
  // (classic side-scroller framing: more visible space ahead than behind),
  // frozen in place entirely while cameraLock is active (arena wave or boss intro)
  if(!cameraLock){
    const targetCamX=player.x+PLAYER_W/2-W*0.33;
    camX=clamp(lerp(camX,targetCamX,dt*3.2),0,Math.max(0,levelWidth-W));
  }
  // vertical lift: only stages that declare camRise can raise the view, and
  // it eases back to zero everywhere else
  const camRise=LEVELS[levelIndex].camRise||0;
  const wantY=camRise>0?clamp(CAM_LIFT_ANCHOR-player.y,0,camRise):0;
  camY=lerp(camY,wantY,dt*(camRise>0?3.4:5));

  updateParticles(dt);
  updateFloatingTexts(dt);
  applyShake(dt);
}

function addChain(n){
  chain+=n;
  // every path that grows the chain funnels through here, so this is the one
  // place the stage's best run has to be recorded
  if(chain>bestChainThisLevel) bestChainThisLevel=chain;
  chainTimer=CHAIN_WINDOW;
  if(n>0 && chain%2===0 && chain>=2){
    spawnFloatingText(player.x+PLAYER_W/2-camX,player.y-24,`COMBO x${chain}!`,"#ffdd44",13);
  }
  if(chain>=FEVER_THRESHOLD&&!feverMode){
    feverMode=true; feverFlash=1;
    screenShake+=12;
    spawnParticles(W/2,H/2,30,["#ff2266","#ff8800","#ffee00","#00ffcc","#aa44ff"],
      {minSpd:100,maxSpd:300,minLife:0.4,maxLife:1.0,type:"square",gravity:60,minSz:3,maxSz:8});
    spawnFloatingText(player.x+PLAYER_W/2-camX,player.y-40,"FEVER!","#ff2fb0",22);
  }
}

// Locks an enemy solid. It stops thinking, stops hurting you on contact,
// and becomes something you can stand on.
function freezeSolid(e){
  if(e.frozen>0||e.dead||e.dying) return;
  e.frozen=FROZEN_SECONDS;
  e.freeze=0;
  e.frozenVx=e.vx; e.vx=0;
  playChime(chain);
  spawnFloatingText(e.x+e.w/2-camX,e.y-14,"DONDU!","#7dd3fc",15);
  spawnParticles(e.x+e.w/2-camX,e.y+e.h/2,18,["#dff6ff","#7dd3fc","#bae6fd"],
    {minSpd:50,maxSpd:190,minLife:0.25,maxLife:0.6,type:"square",gravity:120,minSz:2,maxSz:5});
}
// Hitting a frozen enemy blows it apart, and the shards cut down anything
// standing near it — a frozen crusher in a crowd is a bomb.
function shatterFrozen(e){
  if(!(e.frozen>0)) return;
  e.frozen=0;
  const cx=e.x+e.w/2, cy=e.y+e.h/2;
  spawnParticles(cx-camX,cy,26,["#dff6ff","#7dd3fc","#bae6fd","#ffffff"],
    {minSpd:110,maxSpd:340,minLife:0.3,maxLife:0.8,type:"square",gravity:260,minSz:2,maxSz:6});
  screenShake=Math.min(6,screenShake+4);
  hitStopTimer=Math.max(hitStopTimer,0.05);
  playExplosion();
  spawnFloatingText(cx-camX,cy-18,"PARÇALANDI!","#bae6fd",15);
  e.hp=0;
  if(!e.dying){ e.dying=true; e.deathTimer=0.05; }
  for(const o of [...enemies,...groundEnemies]){
    if(o===e||o.dead||o.dying) continue;
    if(Math.hypot((o.x+o.w/2)-cx,(o.y+o.h/2)-cy)<95){
      o.hp-=2; o.hitFlash=0.25;
      if(o.hp<=0&&!o.dying){ o.dying=true; o.deathTimer=0.07; }
    }
  }
}
// every frozen thing on the stage, as a platform-shaped box
function frozenBlocks(){
  const out=[];
  for(const e of [...enemies,...groundEnemies]){
    if(e.dead||e.dying||!(e.frozen>0)) continue;
    out.push(e);
  }
  return out;
}

function killEnemy(e){
  const ex=e.type==="ground" ? e.x-camX+e.w/2 : e.x-camX;
  const ey=e.y+e.h/2;
  // big explosion — 18 shards that bounce and lose speed to friction until
  // they come to rest on whatever platform is beneath them, instead of just
  // falling straight through
  spawnParticles(ex,ey,18,["#aa44ff","#8822cc","#cc88ff","#ffffff"],
    {minSpd:80,maxSpd:280,minLife:0.8,maxLife:1.6,type:"square",gravity:260,minSz:2,maxSz:7,
     bounce:true,restitution:0.42});
  // decorative burst of pink/cyan/yellow shards, on top of the real catchable
  // drops spawned below
  spawnParticles(ex,ey,10,["#ff4fd8","#4fe0ff","#ffe94f"],
    {minSpd:60,maxSpd:220,upBias:80,minLife:0.4,maxLife:0.8,type:"square",gravity:220,minSz:3,maxSz:6});

  // piñata effect — real catchable gems + coins launched into the air, world-space
  // (e.x is treated as center-x for flying enemies, left-edge for ground ones —
  // matches how each type is already positioned elsewhere in this file)
  const worldEx=e.type==="ground" ? e.x+e.w/2 : e.x;
  const worldEy=e.y+e.h/2;
  spawnDrop(worldEx+rnd(-14,14),worldEy,"gem-pink");
  spawnDrop(worldEx+rnd(-14,14),worldEy,"gem-cyan");
  spawnDrop(worldEx+rnd(-14,14),worldEy,"gem-yellow");
  spawnDrop(worldEx-16,worldEy-8,"coin");
  spawnDrop(worldEx+16,worldEy-8,"coin");

  const pts=(feverMode?800:400)*Math.max(1,chain);
  score+=pts;
  spawnFloatingText(ex,ey-16,`+${pts}`,"#ff8844",15);
  addChain(2);
  screenShake=Math.min(6,screenShake+(feverMode?6:4));
  hitStopTimer=Math.max(hitStopTimer,0.04);
  playExplosion();
}

// A parry is the skill move: no damage, a big chain jump, score, and a
// freeze-frame. It is the only way to gain ground during the boss fight
// rather than just surviving it.
// The turn: the Alpha stops pacing itself, the shots come in threes, and the
// screen says so. Everything it changes is read off boss.phase, so a
// mini-boss can opt in by simply having the same field.
// The Titan's turn is its own: it cracks the armour off itself, the shell
// comes apart as a shard blast, and the ceiling it was saving comes down
// with it. Everything after this reads off boss.phase like every other boss.
function shatterTitanArmour(){
  playExplosion();
  dropAllIcicles();
  const cx=boss.x, cy=boss.y;
  // the shell is a real hit if you are standing in it
  if(player.invuln<=0 &&
     Math.hypot((player.x+PLAYER_W/2)-cx,(player.y+PLAYER_H/2)-cy)<150){
    player.chilled=1.4;
    takeDamage("enemy");
  }
  for(let i=0;i<34;i++){
    const a=(i/34)*Math.PI*2;
    particles.push({
      x:cx-camX+Math.cos(a)*boss.w*0.4, y:cy+Math.sin(a)*boss.h*0.4,
      vx:Math.cos(a)*rnd(140,420), vy:Math.sin(a)*rnd(140,420)-40,
      life:1, maxLife:rnd(0.4,0.9),
      color:["#dff6ff","#7dd3fc","#bae6fd","#ffffff"][i%4],
      size:rnd(3,8), type:"square", gravity:300
    });
  }
  spawnFloatingText(cx-camX,cy-boss.h*0.7,"ZIRH PARÇALANDI!","#dff6ff",18);
}

function enterBossPhase2(){
  boss.phase=2;
  const icy=boss.kind==="titan";
  // stage 1's drone comes apart: same fight, visibly wrecked
  if(boss.rageArt) boss.art=boss.rageArt;
  // ...and a boss that can call for help does it here, once
  // enterBossPhase2 only ever runs on the phase 1 -> 2 edge, so this needs
  // no "already summoned" flag of its own
  if(boss.summons) summonSwarm(boss.summons,2);
  bossRageTimer=2.2;
  boss.fireCooldown=Math.min(boss.fireCooldown,0.7);
  hitStopTimer=Math.max(hitStopTimer,0.12);
  screenShake=Math.min(6,screenShake+6);
  bossShakeTimer=1.2;
  feverFlash=Math.max(feverFlash,0.7);
  startSiren(1.6);
  playExplosion();
  if(icy){
    shatterTitanArmour();
    queueRadio(null,"ACİL DURUM",
      ["ZIRHINI KIRDI — ZEMİN BUZ TUTTU!","Nefes tepeden aşağı süpürüyor.",
       "Geçerken üstünden atla!"],
      {color:"#7dd3fc",urgent:true,hold:4.0});
  } else {
    spawnParticles(boss.x-camX,boss.y,34,["#ff2244","#ff8800","#ffffff","#ff2fb0"],
      {minSpd:120,maxSpd:360,minLife:0.4,maxLife:1.0,type:"square",gravity:120,minSz:3,maxSz:8});
    queueRadio(null,"ACİL DURUM",
      ["ALFA ÇILGINA DÖNDÜ!","Pembe atışları DASH ile savuşturabilirsin!"],
      {color:"#ff2244",urgent:true,hold:3.6});
  }
}

// A boss with a `summons` species calls a pair of them in on its phase
// flip. They are ordinary entries in `enemies`, so everything that already
// kills an enemy kills these too.
function summonSwarm(species,n){
  const sp=SPECIES[species];
  for(let i=0;i<n;i++){
    const sx=boss.x+rnd(-120,120), sy=boss.y+rnd(-40,40);
    enemies.push({
      type:"fly", id:1000+enemies.length,
      species:species,
      dripCooldown:rnd(0.8,2.0),
      x:sx, y:sy, baseY:sy,
      w:sp?sp.w:ENEMY_FLY_W, h:sp?sp.h:ENEMY_FLY_H,
      vx:(i%2?1:-1)*80, vy:0,
      patrolMin:boss.x-320, patrolMax:boss.x+220,
      hp:2, maxHp:2,
      wingPhase:rnd(0,Math.PI*2), glowPhase:rnd(0,Math.PI*2), wavePhase:rnd(0,Math.PI*2),
      hitFlash:0, dying:false, deathTimer:0, dead:false, beamTick:0,
      arenaEnemy:false
    });
    // the call-in takes the summoner's colour, so the ice fight does not
    // flash canopy green
    const icy=boss.kind==="titan";
    spawnParticles(sx-camX,sy,14,
      icy?["#7dd3fc","#dff6ff","#ffffff"]:["#34d399","#a7f3d0","#ffffff"],
      {minSpd:80,maxSpd:240,minLife:0.3,maxLife:0.7,type:"circle",gravity:40});
  }
  spawnFloatingText(boss.x-camX,boss.y-60,"SÜRÜ ÇAĞRILDI!",
    boss.kind==="titan"?"#7dd3fc":"#34d399",16);
  playPowerUp();
}

function parryShot(lb){
  parriesThisLevel++;
  playParry();
  hitStopTimer=Math.max(hitStopTimer,0.09);
  screenShake=Math.min(6,screenShake+5);
  feverFlash=Math.max(feverFlash,0.8);
  score+=300;
  addChain(4);
  player.jetFuel=Math.min(1,player.jetFuel+0.25);
  player.dashCooldown=0;              // a clean parry refunds the dash
  spawnFloatingText(lb.x-camX,lb.y-18,"PARRY! +300","#ff2fb0",18);
  spawnParticles(lb.x-camX,lb.y,26,["#ff2fb0","#ffffff","#e879f9","#7dffcf"],
    {minSpd:120,maxSpd:340,minLife:0.25,maxLife:0.6,type:"square",gravity:40,minSz:2,maxSz:6});
}

function killBoss(){
  const ex=boss.x-camX, ey=boss.y;
  // massive gold/gem explosion, also settling onto platforms via bounce+friction
  spawnParticles(ex,ey,40,["#ffdd00","#ffaa00","#ff4fd8","#4fe0ff","#ffe94f","#ffffff"],
    {minSpd:100,maxSpd:340,minLife:0.8,maxLife:1.8,type:"square",gravity:260,minSz:3,maxSz:9,
     bounce:true,restitution:0.4});
  const gemKinds=["gem-pink","gem-cyan","gem-yellow"];
  for(let i=0;i<10;i++){
    spawnDrop(boss.x+rnd(-40,40), boss.y+rnd(-20,20), Math.random()<0.4?"coin":gemKinds[Math.floor(Math.random()*3)]);
  }
  // BOSS COIN eruption — a fountain of oversized 320-point coins on top of
  // the gem piñata, thrown wide enough to rain across the whole arena
  for(let i=0;i<16;i++){
    const bc={x:boss.x+rnd(-30,30), y:boss.y+rnd(-16,16),
              vx:rnd(-260,260), vy:rnd(-520,-300),
              kind:"bosscoin", landed:false, life:0, rot:rnd(0,Math.PI*2)};
    drops.push(bc);
  }
  spawnParticles(ex,ey,26,["#ffcc00","#fff3a0","#ffffff"],
    {minSpd:140,maxSpd:420,upBias:120,minLife:0.5,maxLife:1.2,type:"circle",gravity:300,minSz:2,maxSz:6});
  if(isIce()){
    // it freezes solid, then comes apart
    spawnParticles(ex,ey,46,["#dff6ff","#7dd3fc","#bae6fd","#ffffff"],
      {minSpd:90,maxSpd:380,minLife:0.5,maxLife:1.4,type:"square",gravity:300,minSz:3,maxSz:9,
       bounce:true,restitution:0.35});
    feverFlash=Math.max(feverFlash,0.8);
  }
  score+=5000;
  spawnFloatingText(ex,ey-40,"BOSS DEFEATED!","#ffee44",22);
  spawnFloatingText(ex,ey-16,"+5000","#ffdd44",16);
  hitStopTimer=Math.max(hitStopTimer,0.12); // a full 120ms freeze — much heavier than a normal hit
  bossShakeTimer=2; // sustained shake, handled specially in applyShake
  stageClearDelay=2.4; // let the explosion/shake play out before auto-advancing to STAGE CLEAR
  cameraLock=false;
  gateOpen=true;
  portalReveal=0;              // ...and the rift spins up out of nothing
  playExplosion();
  playPowerUp();
}

function takeDamage(reason){
  if(player.invuln>0) return;
  // an active SHIELD absorbs exactly one hit instead of taking damage
  if(player.shieldCharge){
    player.shieldCharge=false;
    player.activePower=null;
    player.invuln=0.6;
    screenShake=Math.min(6,screenShake+3);
    spawnParticles(player.x+PLAYER_W/2-camX,player.y+PLAYER_H/2,16,
      ["#33ff88","#aaffcc","#ffffff"],{minSpd:80,maxSpd:220,minLife:0.3,maxLife:0.6});
    spawnFloatingText(player.x+PLAYER_W/2-camX,player.y-16,"SHIELD BLOCKED!","#33ff88",13);
    playPowerUp();
    return;
  }
  player.hp--;
  player.invuln=2.0;
  screenShake+=10;
  chain=0; chainTimer=0; feverMode=false;
  spawnParticles(player.x+PLAYER_W/2-camX,player.y+PLAYER_H/2,12,
    ["#ff2244","#ff8800","#ffffff"],{minSpd:60,maxSpd:200,minLife:0.3,maxLife:0.7});
  if(reason==="lava"||reason==="fall"){
    player.vx=0; player.vy=0;
    if(cameraLock){
      // resetting all the way to the world start would desync the player
      // from a locked camera (arena wave / boss intro) and strand them
      // off-screen with no way back in — respawn at the left edge of
      // whatever's currently visible instead
      player.x=camX+40; player.y=340;
    } else {
      player.x=60; player.y=340;
      camX=0;
    }
    // the respawn teleports the player, so the recorded trail no longer
    // connects to them — reset it or the hatchlings whip across the stage
    snapFollowersToPlayer();
  }
  hitsThisLevel++;
  if(player.hp<=0){
    stopLaserSound(); player.wasFiring=false;
    if(continuesLeft>0){
      // the arcade moment: ten seconds to decide, not an instant wipe
      STATE="continue"; stateTimer=0;
      continueTimer=CONTINUE_SECONDS;
      continueTickAt=Math.ceil(CONTINUE_SECONDS);
    } else {
      STATE="dead"; stateTimer=0;
      bankSalvage();
      newRecord=saveHiScoreIfNeeded();
    }
  }
}

// Spend a credit. The stage is rebuilt from scratch — half-restored entity
// state is where respawn bugs live — and the player is then placed at the
// checkpoint if they had reached it.
function useContinue(){
  continuesLeft--;
  const resumeAt = checkpointUsed ? LEVELS[levelIndex].checkpoint : null;
  player.hp=player.maxHp;
  player.activePower=null; player.shieldCharge=false;
  player.dashTimer=0; player.dashCooldown=0;
  chain=0; chainTimer=0; feverMode=false; feverFlash=0;
  screenShake=0; bossShakeTimer=0; hitStopTimer=0;
  weapon="beam"; weaponAmmo=Infinity; rocketCd=0;
  loadLevel(levelIndex);
  if(resumeAt!==null && isFinite(resumeAt)){
    checkpointUsed=true;              // loadLevel disarmed it; it stays earned
    player.x=resumeAt; player.y=300; player.vx=0; player.vy=0;
    camX=clamp(resumeAt-W*0.33,0,Math.max(0,levelWidth-W));
    snapFollowersToPlayer();
    queueRadio("resume","KOMUTA MERKEZİ",
      ["Kontrol noktasından devam.","Soyu kurtarmaya geri dön!"],
      {color:"#7dffcf",urgent:true,hold:3.0});
  }
  player.invuln=2.5;
  STATE="playing"; stateTimer=0;
  playPowerUp();
}

// Reaching the evacuation portal. Every stage now routes through the same
// mission debrief; the report's own advance step decides whether that means
// the next stage or the final victory screen.
function endLevel(){
  STATE="report"; stateTimer=0;
  reportTimer=0;
  stopLaserSound(); stopSiren();
  player.wasFiring=false;
  radio=null; radioQueue=[];   // nothing on the air over a dark screen

  // anything still loose when you step into the rift is left behind. Silent,
  // because the debrief is about to tell the story anyway.
  for(const b of scaredBabies) loseBaby(b,true);
  scaredBabies=[]; babyShots=[];

  // the rescue train boards the capsule — 500 per hatchling, 1000 more if
  // the whole brood made it out
  const total=LEVELS[levelIndex].cages.length;
  lastRescueBonus=rescuedThisLevel*500+(rescuedThisLevel>=total?1000:0);
  lastComboBonus=bestChainThisLevel*250;
  score+=lastRescueBonus+lastComboBonus;
  reportTypeTick=0;
  for(const f of followers){
    spawnParticles(f.x-camX,f.y,10,["#ffdd88","#8effc9","#ffffff"],
      {minSpd:40,maxSpd:160,minLife:0.3,maxLife:0.8,type:"square",gravity:-40,minSz:2,maxSz:5});
  }
  followers=[];

  spawnParticles(W/2,H/2,30,["#00ff88","#ffee44","#ffffff","#44aaff"],
    {minSpd:100,maxSpd:300,minLife:0.5,maxLife:1.2,type:"square",gravity:80,minSz:3,maxSz:8});
  playPowerUp();

  const grade=computeGrade();
  lastGrade=grade.letter; lastGradeScore=grade.pts;
  lastGradeIsBest=recordGrade(grade.letter);
  // the pouch is only safe once the squad is through the rift
  bankStageClear(grade.letter);

  // the world's final score is locked in here, before the debrief plays, so
  // the victory screen never re-runs the high-score check
  const lvs=WORLDS[worldIndex].levels;
  if(lvs.indexOf(levelIndex)===lvs.length-1) newRecord=saveHiScoreIfNeeded();
}

function restartGame(){
  player.maxHp=maxHearts();
  player.hp=player.maxHp; player.invuln=0;
  player.activePower=null; player.shieldCharge=false;
  player.dashTimer=0; player.dashCooldown=0; player.dashKeyWasDown=false;
  score=0; chain=0; chainTimer=0; feverMode=false; feverFlash=0;
  newRecord=false;
  stopLaserSound(); stopSiren(); player.wasFiring=false;
  STATE="playing"; stateTimer=0; reportTimer=0;
  rescuedTotal=0; lastRescueBonus=0; lastComboBonus=0; babyDinos=[];
  continuesLeft=maxContinues(); continueTimer=0;
  weapon="beam"; weaponAmmo=Infinity; rocketCd=0;
  screenShake=0; bossShakeTimer=0;
  // back to the top of the CURRENT world, not to the first stage of the game
  if(!startWorld(worldIndex)) startWorld(0);
}
