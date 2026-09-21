// Every sound in the game, synthesised
// Part of NEON DINO-AGE: RESCUE PROTOCOL. Loaded as a classic
// script, in the order index2.html lists — these files share one
// global scope on purpose and are not modules.

// ─── RETRO 8-BIT AUDIO (pure Web Audio API, no external files) ─
let actx=null;
function ensureAudio(){
  if(!actx){
    try{ actx = new (window.AudioContext||window.webkitAudioContext)(); }catch(err){ actx=null; }
  }
  if(actx && actx.state==="suspended") actx.resume();
  startBGM();
}
window.addEventListener("keydown", ensureAudio, {once:true});
// Picking a destination with the mouse — handy while testing, and the
// obvious thing to try on a map screen. The canvas is CSS-scaled to fit the
// window, so a click has to be divided back into canvas space.
function canvasPoint(ev){
  const r=C.getBoundingClientRect();
  if(!r||!r.width||!r.height) return null;
  return {x:(ev.clientX-r.left)*(W/r.width), y:(ev.clientY-r.top)*(H/r.height)};
}
window.addEventListener("pointerdown", ev=>{
  const p=canvasPoint(ev);
  if(!p) return;
  if(ev.preventDefault) ev.preventDefault();

  // in a stage, the pad owns the screen
  if(STATE==="playing"||STATE==="warp"){
    if(touchMode) touchPressAt(ev.pointerId===undefined?0:ev.pointerId,p);
    return;
  }
  // the brood roster: the only thing to tap is the way out
  if(STATE==="brood"){
    const b=broodBackButton();
    if(p.x>=b.x&&p.x<=b.x+b.w&&p.y>=b.y&&p.y<=b.y+b.h) closeBrood();
    return;
  }
  // the hangar: tap a row to buy it, or the button to leave
  if(STATE==="hangar"){
    const b=hangarBackButton();
    if(p.x>=b.x&&p.x<=b.x+b.w&&p.y>=b.y&&p.y<=b.y+b.h){ closeHangar(); return; }
    const row=hangarRowAt(p.x,p.y);
    if(row>=0){
      // one tap selects, and buys what it selected — a tablet has no ENTER
      hangarSel=row;
      tryBuy(UPGRADES[row].id);
    }
    return;
  }
  // the map: tap a destination
  if(STATE==="map"){
    if(mapStampTimer>0) return;
    const hb=mapHangarButton();
    if(p.x>=hb.x&&p.x<=hb.x+hb.w&&p.y>=hb.y&&p.y<=hb.y+hb.h){ openHangar(); return; }
    const bb=mapBroodButton();
    if(p.x>=bb.x&&p.x<=bb.x+bb.w&&p.y>=bb.y&&p.y<=bb.y+bb.h){ openBrood(); return; }
    for(let i=0;i<WORLDS.length;i++){
      const nx=WORLDS[i].mx*W, ny=WORLDS[i].my*H;
      if(Math.hypot(p.x-nx,p.y-ny)>38) continue;
      if(!worldState(i).playable){ playPew(); return; }
      mapSel=i;
      startWorld(i);
      return;
    }
    return;
  }
  // every other screen is waiting for a confirm, and a tablet has no ENTER.
  // A tap anywhere is that confirm.
  if(STATE==="report"||STATE==="continue"){ K["Enter"]=true; touchConfirm=0.25; }
  else if(STATE==="dead"||STATE==="win"){ K["KeyR"]=true; touchConfirm=0.25; }
});
window.addEventListener("pointerup",   ev=>touchRelease(ev.pointerId===undefined?0:ev.pointerId));
window.addEventListener("pointercancel",ev=>touchRelease(ev.pointerId===undefined?0:ev.pointerId));
window.addEventListener("pointermove", ev=>{
  if(!touchMode) return;
  if(STATE!=="playing"&&STATE!=="warp") return;
  const pid=ev.pointerId===undefined?0:ev.pointerId;
  if(!touchHeld.has(pid) && !(ev.buttons&1) && ev.pressure===undefined) return;
  const p=canvasPoint(ev);
  if(p) touchPressAt(pid,p);
});
// a synthesised confirm is a tap, not a held key — let it go again
let touchConfirm=0;
function updateTouchConfirm(dt){
  if(touchConfirm<=0) return;
  touchConfirm-=dt;
  if(touchConfirm<=0){ K["Enter"]=false; K["KeyR"]=false; }
}
window.addEventListener("pointerdown", ensureAudio, {once:true});

// ─── CHIPTUNE BGM (bassline + arpeggio, pure oscillators, loops forever) ──
let bgmStarted=false;
const BGM_BASS=[110.00,110.00,130.81,146.83, 110.00,110.00,164.81,146.83]; // A2 A2 C3 D3 | A2 A2 E3 D3
const BGM_ARP=[220.00,277.18,329.63,392.00]; // A3 C#4 E4 G4 arpeggio, cycles independently of the bass
let bgmStep=0;
function startBGM(){
  if(bgmStarted||!actx) return;
  bgmStarted=true;
  function tick(){
    if(!actx) return;
    // FEVER MODE speeds the whole loop up — read live each tick so tempo
    // snaps immediately when fever starts/ends rather than waiting a bar
    const stepSec=feverMode?0.105:0.155;
    const now=actx.currentTime;

    // bassline — punchy short square note, one per step (a bit louder and
    // brighter in fever for extra energy)
    const bf=BGM_BASS[bgmStep%BGM_BASS.length];
    const bo=actx.createOscillator(), bgn=actx.createGain();
    bo.type="square"; bo.frequency.setValueAtTime(feverMode?bf*2:bf,now);
    bgn.gain.setValueAtTime(0.0001,now);
    bgn.gain.linearRampToValueAtTime(feverMode?0.14:0.11,now+0.008);
    bgn.gain.exponentialRampToValueAtTime(0.0001,now+stepSec*0.9);
    bo.connect(bgn); bgn.connect(actx.destination);
    bo.start(now); bo.stop(now+stepSec);

    // arpeggio — plucky triangle note layered on top, two per bass step for
    // energy (three per step, faster, during fever)
    const subdivisions=feverMode?3:2;
    for(let sub=0;sub<subdivisions;sub++){
      const at=now+sub*stepSec/subdivisions;
      const af=BGM_ARP[(bgmStep*subdivisions+sub)%BGM_ARP.length];
      const ao=actx.createOscillator(), agn=actx.createGain();
      ao.type="triangle"; ao.frequency.setValueAtTime(feverMode?af*2:af,at);
      agn.gain.setValueAtTime(0.0001,at);
      agn.gain.linearRampToValueAtTime(feverMode?0.075:0.055,at+0.004);
      agn.gain.exponentialRampToValueAtTime(0.0001,at+(stepSec/subdivisions)*0.9);
      ao.connect(agn); agn.connect(actx.destination);
      ao.start(at); ao.stop(at+stepSec/subdivisions);
    }

    bgmStep++;
    setTimeout(tick,stepSec*1000);
  }
  tick();
}

// ─── CONTINUOUS LASER HUM (sustained oscillator while the beam fires) ──
let laserOsc=null, laserOscGain=null;
function startLaserSound(){
  if(!actx||laserOsc) return;
  laserOsc=actx.createOscillator(); laserOscGain=actx.createGain();
  laserOsc.type="sawtooth";
  laserOsc.frequency.setValueAtTime(520,actx.currentTime);
  laserOscGain.gain.setValueAtTime(0.0001,actx.currentTime);
  laserOscGain.gain.linearRampToValueAtTime(0.07,actx.currentTime+0.03);
  laserOsc.connect(laserOscGain); laserOscGain.connect(actx.destination);
  laserOsc.start();
}
function updateLaserSound(fever){
  if(!laserOsc) return;
  const now=actx.currentTime;
  const wob=520+Math.sin(now*40)*40+(fever?120:0);
  laserOsc.frequency.setValueAtTime(wob,now);
}
function stopLaserSound(){
  if(!laserOsc) return;
  const now=actx.currentTime;
  laserOscGain.gain.linearRampToValueAtTime(0.0001,now+0.05);
  laserOsc.stop(now+0.06);
  laserOsc=null; laserOscGain=null;
}

// retro "pew" — quick downward frequency-sweep square blip, fired on each shot
function playPew(){
  if(!actx) return;
  const now=actx.currentTime;
  const o=actx.createOscillator(), g=actx.createGain();
  o.type="square";
  o.frequency.setValueAtTime(900,now);
  o.frequency.exponentialRampToValueAtTime(180,now+0.09);
  g.gain.setValueAtTime(0.16,now);
  g.gain.exponentialRampToValueAtTime(0.001,now+0.1);
  o.connect(g); g.connect(actx.destination);
  o.start(now); o.stop(now+0.11);
}

// bright chime for coin pickups — pitch rises with the current chain count
function playChime(chainCount){
  if(!actx) return;
  const now=actx.currentTime;
  const freq=620+Math.min(chainCount,20)*35;
  const o=actx.createOscillator(), g=actx.createGain();
  o.type="triangle";
  o.frequency.setValueAtTime(freq,now);
  o.frequency.exponentialRampToValueAtTime(freq*1.5,now+0.08);
  g.gain.setValueAtTime(0.0001,now);
  g.gain.exponentialRampToValueAtTime(0.22,now+0.012);
  g.gain.exponentialRampToValueAtTime(0.0001,now+0.18);
  o.connect(g); g.connect(actx.destination);
  o.start(now); o.stop(now+0.2);
}

// noise-burst explosion for enemy kills — filtered white noise with a fast decay envelope
function playExplosion(){
  if(!actx) return;
  const now=actx.currentTime;
  const dur=0.28;
  const bufferSize=Math.floor(actx.sampleRate*dur);
  const buffer=actx.createBuffer(1,bufferSize,actx.sampleRate);
  const data=buffer.getChannelData(0);
  for(let i=0;i<bufferSize;i++) data[i]=(Math.random()*2-1)*(1-i/bufferSize);
  const noise=actx.createBufferSource(); noise.buffer=buffer;
  const filter=actx.createBiquadFilter();
  filter.type="lowpass";
  filter.frequency.setValueAtTime(1400,now);
  filter.frequency.exponentialRampToValueAtTime(90,now+dur);
  const g=actx.createGain();
  g.gain.setValueAtTime(0.35,now);
  g.gain.exponentialRampToValueAtTime(0.001,now+dur);
  noise.connect(filter); filter.connect(g); g.connect(actx.destination);
  noise.start(now); noise.stop(now+dur);
}

// rising energetic retro "power-up" sting — used both for the box breaking
// and for the power-up actually taking effect
function playPowerUp(){
  if(!actx) return;
  const now=actx.currentTime;
  const o=actx.createOscillator(), g=actx.createGain();
  o.type="square";
  o.frequency.setValueAtTime(220,now);
  o.frequency.exponentialRampToValueAtTime(900,now+0.22);
  g.gain.setValueAtTime(0.0001,now);
  g.gain.linearRampToValueAtTime(0.2,now+0.02);
  g.gain.exponentialRampToValueAtTime(0.0001,now+0.3);
  o.connect(g); g.connect(actx.destination);
  o.start(now); o.stop(now+0.31);
  // a fifth above, slightly delayed, for a fuller chiptune "power chord" rise
  const o2=actx.createOscillator(), g2=actx.createGain();
  o2.type="square";
  o2.frequency.setValueAtTime(330,now+0.03);
  o2.frequency.exponentialRampToValueAtTime(1320,now+0.25);
  g2.gain.setValueAtTime(0.0001,now+0.03);
  g2.gain.linearRampToValueAtTime(0.14,now+0.05);
  g2.gain.exponentialRampToValueAtTime(0.0001,now+0.32);
  o2.connect(g2); g2.connect(actx.destination);
  o2.start(now+0.03); o2.stop(now+0.33);
}

// alarm siren — alternating up/down warble for the boss's dramatic entrance
let sirenOsc=null, sirenGain=null, sirenInterval=null;
function startSiren(durationSec){
  if(!actx) return;
  const now=actx.currentTime;
  sirenOsc=actx.createOscillator(); sirenGain=actx.createGain();
  sirenOsc.type="sawtooth";
  sirenGain.gain.setValueAtTime(0.09,now);
  sirenOsc.connect(sirenGain); sirenGain.connect(actx.destination);
  sirenOsc.start(now);
  let up=true;
  sirenInterval=setInterval(()=>{
    if(!sirenOsc) return;
    const t0=actx.currentTime;
    sirenOsc.frequency.cancelScheduledValues(t0);
    sirenOsc.frequency.setValueAtTime(up?440:660,t0);
    sirenOsc.frequency.linearRampToValueAtTime(up?660:440,t0+0.35);
    up=!up;
  },350);
  setTimeout(stopSiren,durationSec*1000);
}
function stopSiren(){
  if(sirenInterval){ clearInterval(sirenInterval); sirenInterval=null; }
  if(sirenOsc){
    const now=actx?actx.currentTime:0;
    try{
      sirenGain.gain.linearRampToValueAtTime(0.0001,now+0.15);
      sirenOsc.stop(now+0.16);
    }catch(e){}
    sirenOsc=null; sirenGain=null;
  }
}

// ─── ARMOUR RICOCHET ──────────────────────────────────────────
// a short metallic tink, quieter than the parry so the two never confuse
function playRicochet(){
  if(!actx) return;
  const now=actx.currentTime;
  const o=actx.createOscillator(), g=actx.createGain();
  o.type="square";
  o.frequency.setValueAtTime(2300,now);
  o.frequency.exponentialRampToValueAtTime(1500,now+0.05);
  g.gain.setValueAtTime(0.0001,now);
  g.gain.linearRampToValueAtTime(0.09,now+0.005);
  g.gain.exponentialRampToValueAtTime(0.0001,now+0.11);
  o.connect(g); g.connect(actx.destination);
  o.start(now); o.stop(now+0.12);
}

// ─── PARRY ────────────────────────────────────────────────────
// a bright metallic ring — it has to cut through the middle of a boss fight
function playParry(){
  if(!actx) return;
  const now=actx.currentTime;
  [1320,1980,2640].forEach((f,i)=>{
    const o=actx.createOscillator(), g=actx.createGain();
    o.type=i===0?"square":"triangle";
    o.frequency.setValueAtTime(f,now);
    o.frequency.exponentialRampToValueAtTime(f*1.35,now+0.07);
    g.gain.setValueAtTime(0.0001,now);
    g.gain.linearRampToValueAtTime(0.18/(i+1),now+0.008);
    g.gain.exponentialRampToValueAtTime(0.0001,now+0.32);
    o.connect(g); g.connect(actx.destination);
    o.start(now); o.stop(now+0.33);
  });
}

// ─── CONTINUE COUNTDOWN TICK ──────────────────────────────────
// one dry blip per second while the credit clock runs down
function playContinueTick(urgent){
  if(!actx) return;
  const now=actx.currentTime;
  const o=actx.createOscillator(), g=actx.createGain();
  o.type="square";
  o.frequency.setValueAtTime(urgent?880:520,now);
  g.gain.setValueAtTime(0.0001,now);
  g.gain.linearRampToValueAtTime(urgent?0.20:0.13,now+0.01);
  g.gain.exponentialRampToValueAtTime(0.0001,now+0.14);
  o.connect(g); g.connect(actx.destination);
  o.start(now); o.stop(now+0.15);
}

// ─── HATCHLING SFX ────────────────────────────────────────────
// a frightened upward chirp when one is knocked off the train
function playBabyPanic(){
  if(!actx) return;
  const now=actx.currentTime;
  const o=actx.createOscillator(), g=actx.createGain();
  o.type="square";
  o.frequency.setValueAtTime(700,now);
  o.frequency.exponentialRampToValueAtTime(1500,now+0.09);
  o.frequency.exponentialRampToValueAtTime(900,now+0.2);
  g.gain.setValueAtTime(0.0001,now);
  g.gain.linearRampToValueAtTime(0.16,now+0.02);
  g.gain.exponentialRampToValueAtTime(0.0001,now+0.26);
  o.connect(g); g.connect(actx.destination);
  o.start(now); o.stop(now+0.27);
}
// and a flat, falling two-tone when one is gone for good
function playBabyLost(){
  if(!actx) return;
  const now=actx.currentTime;
  [[440,0],[294,0.16]].forEach(([f,off])=>{
    const o=actx.createOscillator(), g=actx.createGain();
    o.type="triangle";
    o.frequency.setValueAtTime(f,now+off);
    g.gain.setValueAtTime(0.0001,now+off);
    g.gain.linearRampToValueAtTime(0.18,now+off+0.02);
    g.gain.exponentialRampToValueAtTime(0.0001,now+off+0.3);
    o.connect(g); g.connect(actx.destination);
    o.start(now+off); o.stop(now+off+0.31);
  });
}

// ─── RADIO TRANSMISSION SFX (squelch blips + carrier hiss) ────
// Deliberately short and quiet: the comms window opens over live gameplay,
// so this can never step on the BGM or the sustained laser tone.
function playRadioBeep(urgent){
  if(!actx) return;
  const now=actx.currentTime;
  const base=urgent?1180:820;
  for(let i=0;i<2;i++){
    const off=i*0.09;
    const o=actx.createOscillator(), g=actx.createGain();
    o.type="square";
    o.frequency.setValueAtTime(base+i*160,now+off);
    g.gain.setValueAtTime(0.0001,now+off);
    g.gain.linearRampToValueAtTime(urgent?0.13:0.09,now+off+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001,now+off+0.07);
    o.connect(g); g.connect(actx.destination);
    o.start(now+off); o.stop(now+off+0.08);
  }
  // band-passed noise under the blips — the carrier opening up
  const dur=0.18;
  const buf=actx.createBuffer(1,Math.floor(actx.sampleRate*dur),actx.sampleRate);
  const data=buf.getChannelData(0);
  for(let i=0;i<data.length;i++) data[i]=(Math.random()*2-1)*(1-i/data.length);
  const noise=actx.createBufferSource(); noise.buffer=buf;
  const filt=actx.createBiquadFilter();
  filt.type="bandpass"; filt.frequency.setValueAtTime(1800,now); filt.Q.value=1.2;
  const ng=actx.createGain();
  ng.gain.setValueAtTime(0.05,now);
  ng.gain.exponentialRampToValueAtTime(0.001,now+dur);
  noise.connect(filt); filt.connect(ng); ng.connect(actx.destination);
  noise.start(now); noise.stop(now+dur);
}
// one dry click per typed character while the message prints
function playRadioType(){
  if(!actx) return;
  const now=actx.currentTime;
  const o=actx.createOscillator(), g=actx.createGain();
  o.type="square";
  o.frequency.setValueAtTime(rnd(1500,2100),now);
  g.gain.setValueAtTime(0.03,now);
  g.gain.exponentialRampToValueAtTime(0.0005,now+0.02);
  o.connect(g); g.connect(actx.destination);
  o.start(now); o.stop(now+0.025);
}
