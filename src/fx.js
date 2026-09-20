// Particles
// Part of NEON DINO-AGE: RESCUE PROTOCOL. Loaded as a classic
// script, in the order index2.html lists — these files share one
// global scope on purpose and are not modules.

// ─── PARTICLES ──────────────────────────────────────────────
let particles = [];
function spawnParticles(x, y, n, colors, opts={}){
  for(let i=0;i<n;i++){
    const ang = rnd(0, Math.PI*2);
    const spd = rnd(opts.minSpd||40, opts.maxSpd||180);
    particles.push({
      x, y,
      vx: Math.cos(ang)*spd,
      vy: Math.sin(ang)*spd - (opts.upBias||0),
      life: 1, maxLife: rnd(opts.minLife||0.3, opts.maxLife||0.9),
      color: colors[Math.floor(Math.random()*colors.length)],
      size: rnd(opts.minSz||2, opts.maxSz||5),
      type: opts.type||"square",
      gravity: opts.gravity!==undefined ? opts.gravity : 220,
      // optional ground-bounce physics (used for enemy-kill debris) — settles
      // onto a platform instead of falling through it forever
      bounce: !!opts.bounce,
      restitution: opts.restitution!==undefined ? opts.restitution : 0.4,
      settled: false
    });
  }
}
function updateParticles(dt){
  particles = particles.filter(p=>{
    p.life -= dt/p.maxLife;
    p.vy += p.gravity*dt;
    p.x += p.vx*dt; p.y += p.vy*dt;

    if(p.bounce && !p.settled && p.vy>0){
      // platforms are stored in world space; particles live in screen space
      // (drawn without a further camX subtraction), so compare against each
      // platform's screen-space span here
      for(const pf of platforms){
        if(pf.lavaPit) continue;
        const psx=pf.x-camX;
        if(p.x>=psx && p.x<=psx+pf.w && p.y>=pf.y-4 && p.y<=pf.y+12){
          p.y=pf.y;
          p.vy*=-p.restitution;
          p.vx*=0.55; // friction bleeds horizontal speed off on every bounce
          if(Math.abs(p.vy)<45){ p.vy=0; p.settled=true; }
          break;
        }
      }
    } else if(p.settled){
      p.vx*=Math.pow(0.02,dt); // resting friction
    }
    return p.life > 0;
  });
  // hard safety cap — if something ever spawns particles faster than they can
  // expire, drop the oldest ones rather than letting the array grow unbounded
  if(particles.length>420) particles.splice(0,particles.length-420);
}
function drawParticles(){
  // additive "lighter" blending makes overlapping glows bloom into each other
  // (embers, sparks, jetpack flame) instead of just stacking flat alpha
  ctx.globalCompositeOperation="lighter";
  for(const p of particles){
    ctx.globalAlpha = Math.max(0,p.life);
    ctx.fillStyle = p.color;
    if(p.type==="circle"){
      ctx.beginPath(); ctx.arc(p.x,p.y,p.size*p.life,0,Math.PI*2); ctx.fill();
    } else {
      const s = p.size*p.life;
      ctx.fillRect(p.x-s/2, p.y-s/2, s, s);
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation="source-over";
}
