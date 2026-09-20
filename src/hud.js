// HUD, banners, debrief, map, end screens
// Part of NEON DINO-AGE: RESCUE PROTOCOL. Loaded as a classic
// script, in the order index2.html lists — these files share one
// global scope on purpose and are not modules.

// ─── DRAW HUD ────────────────────────────────────────────────
function drawHUD(){
  // hearts (top-left)
  for(let i=0;i<player.maxHp;i++){
    ctx.font="22px serif";
    ctx.fillText(i<player.hp?"❤️":"🖤",14+i*28,30);
  }

  // remaining credits, sitting just right of the hearts
  {
    const hx=14+player.maxHp*28+6;
    ctx.font="bold 12px 'Courier New',monospace";
    ctx.fillStyle=continuesLeft>0?"#8effc9":"#ff5577";
    ctx.fillText("CR",hx,26);
    for(let i=0;i<MAX_CONTINUES;i++){
      const on=i<continuesLeft;
      ctx.fillStyle=on?"#8effc9":"rgba(140,160,170,0.30)";
      if(on){ glow("#8effc9",6); }
      ctx.beginPath();
      ctx.arc(hx+26+i*13,22,4.5,0,Math.PI*2);
      ctx.fill();
      noGlow();
    }
  }

  // chain/fever box (top-right) — neon purple/pink framed panel
  const pad=12;
  const bw=260,bh=feverMode?144:120,bx=W-bw-8,by=8;
  ctx.fillStyle="rgba(12,0,24,0.84)";
  ctx.fillRect(bx,by,bw,bh);
  // neon purple → pink border, pulsing brighter during fever
  const borderG=ctx.createLinearGradient(bx,by,bx+bw,by);
  borderG.addColorStop(0,"#a21caf"); borderG.addColorStop(0.5,"#e879f9");
  borderG.addColorStop(1,"#ff2fb0");
  ctx.shadowColor="#e879f9"; ctx.shadowBlur=feverMode?16:8;
  ctx.strokeStyle=borderG; ctx.lineWidth=3;
  ctx.strokeRect(bx,by,bw,bh);
  noGlow();

  // line baselines, all measured down from box top with consistent padding
  let lineY=by+pad+14; // first line baseline

  // CHAIN
  ctx.textAlign="left";
  glow(feverMode?"#ff44aa":"#ffaa00",feverMode?14:6);
  const chainFontPx=feverMode?18:16;
  ctx.font=`bold ${chainFontPx}px 'Courier New',monospace`;
  ctx.fillStyle=feverMode?"#ff88cc":"#ffdd44";

  const chainTxt=`CHAIN: ${chain}X`;
  // rainbow each character if fever
  if(feverMode){
    const feverColors=["#ff2266","#ff8800","#ffee00","#00ff88","#44aaff","#aa44ff"];
    let cx2=bx+pad;
    for(let i=0;i<chainTxt.length;i++){
      ctx.fillStyle=feverColors[i%feverColors.length];
      ctx.fillText(chainTxt[i],cx2,lineY);
      cx2+=chainFontPx*0.62;
    }
  } else {
    ctx.fillText(chainTxt,bx+pad,lineY);
  }
  lineY+=chainFontPx+6;

  // FEVER MODE ACTIVE line — pulses hard in neon pink/purple/yellow
  if(feverMode){
    ctx.font="bold 12px 'Courier New',monospace";
    const pulse=0.6+0.4*Math.sin(t*14);
    const fc=["#ff2fb0","#e879f9","#ffee00","#ff2fb0","#e879f9"];
    const ft="FEVER MODE ACTIVE!";
    ctx.shadowBlur=6+10*pulse;
    let fx2=bx+pad;
    for(let i=0;i<ft.length;i++){
      ctx.shadowColor=fc[i%fc.length];
      ctx.fillStyle=fc[i%fc.length];
      ctx.fillText(ft[i],fx2,lineY); fx2+=9.8;
    }
    noGlow();
    lineY+=18;
  }

  noGlow();
  ctx.font="bold 15px 'Courier New',monospace";
  ctx.fillStyle="#ffffff";
  ctx.fillText(`SCORE: ${score.toLocaleString()}`,bx+pad,lineY);
  lineY+=18;
  ctx.font="bold 12px 'Courier New',monospace";
  ctx.fillStyle="#ffdd44";
  ctx.fillText(`HI-SCORE: ${Math.max(hiScore,score).toLocaleString()}`,bx+pad,lineY);
  lineY+=18;
  // the pouch. Not banked yet — that is the whole point of showing it here,
  // next to the hearts, while it can still be lost
  ctx.font="bold 12px 'Courier New',monospace";
  ctx.fillStyle=runCoins>0?"#ffcc55":"#6a6a80";
  ctx.fillText(`KESE: ${runCoins}${runCoins>0?" ¢":""}`,bx+pad,lineY);
  lineY+=18;
  ctx.font="bold 11px 'Courier New',monospace";
  ctx.fillStyle="#aaaacc";
  {
    const si=stageInWorld();
    ctx.fillText(`STAGE ${si.pos+1}/${si.count} — ${LEVELS[levelIndex].name}`,bx+pad,lineY);
  }
  lineY+=16;
  ctx.font="bold 11px 'Courier New',monospace";
  // red-flashes while a hatchling is loose — that is a countdown, not a stat
  const loose=scaredBabies.length>0;
  ctx.fillStyle = loose ? (Math.sin(t*12)>0?"#ff3355":"#ffaabb")
        : (rescuedThisLevel>=LEVELS[levelIndex].cages.length?"#8effc9":"#ffcc66");
  const esc=followers.length;
  ctx.fillText(`RESCUE: ${rescuedThisLevel}/${LEVELS[levelIndex].cages.length}`+
               (esc?`  ESCORT x${esc}`:"")+(loose?"  !":""),bx+pad,lineY);

  // combo timer bar under score box
  if(chain>0){
    const barW=(chainTimer/CHAIN_WINDOW)*bw;
    ctx.fillStyle="rgba(255,100,0,0.3)"; ctx.fillRect(bx,by+bh,bw,4);
    ctx.fillStyle=feverMode?"#ff44aa":"#ff8800";
    glow(feverMode?"#ff44aa":"#ff8800",8);
    ctx.fillRect(bx,by+bh,barW,4);
    noGlow();
  }

  ctx.textAlign="left";

  drawPowerUpUI();
  drawWeaponUI();
  if(player.chilled>0){
    const fw=140,fx=W/2-fw/2,fy=player.activePower?88:46;
    ctx.fillStyle="rgba(8,20,34,0.8)"; ctx.fillRect(fx,fy,fw,20);
    ctx.strokeStyle="#7dd3fc"; ctx.lineWidth=2; ctx.strokeRect(fx,fy,fw,20);
    ctx.fillStyle="#bae6fd";
    ctx.fillRect(fx+2,fy+2,(fw-4)*clamp(player.chilled/1.0,0,1),16);
    ctx.font="bold 11px 'Courier New',monospace";
    ctx.fillStyle="#04203a"; ctx.textAlign="center";
    ctx.fillText("DONDU",W/2,fy+14); ctx.textAlign="left";
  }
}

// ─── ACTIVE POWER-UP TIMER (top-center) ────────────────────────
function drawPowerUpUI(){
  const ap=player.activePower;
  if(!ap) return;
  const w=190,h=38,x=W/2-w/2,y=8;
  ctx.fillStyle="rgba(0,0,10,0.75)";
  ctx.fillRect(x,y,w,h);
  ctx.shadowColor=ap.color; ctx.shadowBlur=10;
  ctx.strokeStyle=ap.color; ctx.lineWidth=2;
  ctx.strokeRect(x,y,w,h);
  noGlow();

  ctx.textAlign="center";
  ctx.font="bold 13px 'Courier New',monospace";
  ctx.fillStyle=ap.color;
  ctx.fillText(ap.label,W/2,y+15);

  const barW=w-16;
  ctx.fillStyle="rgba(255,255,255,0.15)"; ctx.fillRect(x+8,y+20,barW,7);
  ctx.fillStyle=ap.color;
  ctx.shadowColor=ap.color; ctx.shadowBlur=6;
  ctx.fillRect(x+8,y+20,barW*clamp(ap.timer/ap.maxTimer,0,1),7);
  noGlow();

  const secs=Math.max(0,Math.ceil(ap.timer));
  ctx.font="10px 'Courier New',monospace"; ctx.fillStyle="#fff";
  ctx.fillText(`0:${String(secs).padStart(2,"0")}`,W/2,y+35);
  ctx.textAlign="left";
}

// ─── EQUIPPED WEAPON (top-centre, under the power-up timer) ───
function drawWeaponUI(){
  if(weapon==="beam") return;       // the base gun needs no readout
  const w=WEAPONS[weapon];
  const bw2=190,bh2=34,bx2=W/2-bw2/2,by2=player.activePower?50:8;
  const frac=clamp(weaponAmmo/w.ammo,0,1);
  const low=frac<0.25;
  ctx.fillStyle="rgba(0,0,10,0.75)";
  ctx.fillRect(bx2,by2,bw2,bh2);
  ctx.shadowColor=w.color; ctx.shadowBlur=low&&Math.sin(t*14)>0?16:8;
  ctx.strokeStyle=w.color; ctx.lineWidth=2;
  ctx.strokeRect(bx2,by2,bw2,bh2);
  noGlow();

  ctx.font="bold 18px 'Courier New',monospace";
  ctx.fillStyle=w.color;
  ctx.textAlign="left";
  ctx.fillText(w.letter,bx2+8,by2+22);
  ctx.font="bold 11px 'Courier New',monospace";
  ctx.fillText(w.label,bx2+26,by2+14);

  // ammo clock
  const barX=bx2+26, barW=bw2-34;
  ctx.fillStyle="rgba(255,255,255,0.15)";
  ctx.fillRect(barX,by2+19,barW,6);
  ctx.fillStyle=low?(Math.sin(t*14)>0?"#ff4466":w.color):w.color;
  ctx.shadowColor=w.color; ctx.shadowBlur=6;
  ctx.fillRect(barX,by2+19,barW*frac,6);
  noGlow();
  ctx.textAlign="left";
}

// ─── FEVER SCREEN FLASH ──────────────────────────────────────
function drawFeverOverlay(){
  if(feverFlash>0){
    ctx.fillStyle=`rgba(255,40,120,${feverFlash*0.35})`;
    ctx.fillRect(0,0,W,H);
    feverFlash=Math.max(0,feverFlash-0.04);
  }
  if(feverMode){
    // pulsing edge vignette
    const v=0.06+0.04*Math.sin(t*8);
    const vg=ctx.createRadialGradient(W/2,H/2,H*0.3,W/2,H/2,H*0.8);
    vg.addColorStop(0,"rgba(0,0,0,0)");
    vg.addColorStop(1,`rgba(180,0,100,${v})`);
    ctx.fillStyle=vg; ctx.fillRect(0,0,W,H);

    // neon pulse hugging the screen edges — cycles pink/purple/cyan and
    // throbs in thickness, the classic arcade "fever" screen-border effect
    const pulse=0.5+0.5*Math.sin(t*9);
    const hue=(t*120)%360;
    const edgeColor=`hsl(${hue},100%,60%)`;
    ctx.save();
    ctx.globalCompositeOperation="lighter";
    ctx.shadowColor=edgeColor; ctx.shadowBlur=24+16*pulse;
    ctx.strokeStyle=edgeColor;
    ctx.lineWidth=6+6*pulse;
    ctx.strokeRect(ctx.lineWidth/2,ctx.lineWidth/2,W-ctx.lineWidth,H-ctx.lineWidth);
    ctx.restore();
  }
}

// ─── ARENA / BOSS BANNERS (DANGER!, GO! →, WARNING!) ──────────
function drawArenaBanners(){
  ctx.textAlign="center";
  if(warningBannerTimer>0){
    // The Alpha's entrance: the camera is already locked, the siren is
    // running, and the whole screen throbs red in time with it.
    const pulse=0.5+0.5*Math.sin(t*16);
    ctx.fillStyle=`rgba(255,20,40,${0.10+0.13*pulse})`;
    ctx.fillRect(0,0,W,H);
    // neon burn hugging the screen edges, same trick as the fever border
    ctx.save();
    ctx.globalCompositeOperation="lighter";
    ctx.shadowColor="#ff2233"; ctx.shadowBlur=26+20*pulse;
    ctx.strokeStyle=`rgba(255,40,60,${0.45+0.45*pulse})`;
    ctx.lineWidth=8+8*pulse;
    ctx.strokeRect(ctx.lineWidth/2,ctx.lineWidth/2,W-ctx.lineWidth,H-ctx.lineWidth);
    ctx.restore();
    // hazard band
    const by2=H*0.30, bh2=96;
    ctx.fillStyle=`rgba(70,0,6,${0.5+0.2*pulse})`;
    ctx.fillRect(0,by2,W,bh2);
    ctx.strokeStyle=`rgba(255,60,80,${0.55+0.45*pulse})`; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(0,by2); ctx.lineTo(W,by2);
    ctx.moveTo(0,by2+bh2); ctx.lineTo(W,by2+bh2); ctx.stroke();
    ctx.shadowColor="#ff2222"; ctx.shadowBlur=14+12*pulse;
    ctx.font="bold 40px 'Courier New',monospace";
    ctx.fillStyle="#ff3333";
    ctx.fillText("⚠ WARNING! ⚠",W/2,by2+50);
    ctx.font="bold 19px 'Courier New',monospace";
    ctx.fillStyle=pulse>0.5?"#ffe0e4":"#ff8899";
    ctx.fillText("ALFA PTERODACTYL DETECTED",W/2,by2+80);
    noGlow();
  } else if(cameraLock && !arenaCleared){
    const pulse=0.5+0.5*Math.sin(t*10);
    ctx.fillStyle=`rgba(0,0,0,${0.3+0.1*pulse})`;
    ctx.fillRect(0,18,W,44);
    ctx.shadowColor="#ff4400"; ctx.shadowBlur=10+8*pulse;
    ctx.font="bold 20px 'Courier New',monospace";
    ctx.fillStyle="#ff5533";
    ctx.fillText("DANGER / DEFEND!",W/2,48);
    noGlow();
  } else if(arenaGoTimer>0 && Math.sin(t*10)>-0.2){
    ctx.shadowColor="#00ff88"; ctx.shadowBlur=16;
    ctx.font="bold 30px 'Courier New',monospace";
    ctx.fillStyle="#00ff88";
    ctx.fillText("GO! →",W/2,70);
    noGlow();
  }
  ctx.textAlign="left";
}

// ─── BOSS NAME CARD + RAGE BANNER ────────────────────────────
// Sunset Riders announced its bosses by name. So does this one: the card
// slides in from the left as the boss descends, holds, then slides out.
function drawBossCard(){
  if(bossCardTimer<=0||!boss) return;
  const total=2.6;
  const el=total-bossCardTimer;
  // 0.35s in, 0.35s out, hold between
  let slide=1;
  if(el<0.35) slide=el/0.35;
  else if(bossCardTimer<0.35) slide=bossCardTimer/0.35;
  const ease=slide*slide*(3-2*slide);       // smoothstep
  const cardW=430, cardH=74;
  const cx=lerp(-cardW-20,W/2-cardW/2,ease);
  const cy=H*0.62;

  ctx.save();
  ctx.globalAlpha=ease;
  ctx.fillStyle="rgba(8,2,12,0.92)";
  ctx.fillRect(cx,cy,cardW,cardH);
  ctx.shadowColor="#ff2244"; ctx.shadowBlur=18;
  ctx.strokeStyle="#ff3344"; ctx.lineWidth=2;
  ctx.strokeRect(cx,cy,cardW,cardH);
  noGlow();
  // a red spine down the left edge
  ctx.fillStyle="#ff2244";
  ctx.fillRect(cx,cy,6,cardH);

  ctx.textAlign="left";
  glow("#ff3344",12);
  ctx.font="bold 26px 'Courier New',monospace";
  ctx.fillStyle="#ff5566";
  ctx.fillText(boss.name,cx+20,cy+34);
  noGlow();
  if(boss.title){
    ctx.font="bold 12px 'Courier New',monospace";
    ctx.fillStyle="#ffaabb";
    ctx.fillText(boss.title,cx+20,cy+56);
  }
  ctx.restore();
  ctx.textAlign="left";
}
function drawBossRage(){
  if(bossRageTimer<=0) return;
  // the banner speaks for whichever boss turned, so the ice fight does not
  // flash red and tell you to parry shots it never fires
  const icy=!!(boss&&boss.kind==="titan");
  const pulse=0.5+0.5*Math.sin(t*18);
  ctx.save();
  ctx.globalAlpha=clamp(bossRageTimer/2.2,0,1);
  ctx.fillStyle=icy?`rgba(125,211,252,${0.10+0.10*pulse})`
                  :`rgba(255,20,50,${0.10+0.10*pulse})`;
  ctx.fillRect(0,0,W,H);
  ctx.textAlign="center";
  glow(icy?"#7dd3fc":"#ff2244",18+14*pulse);
  ctx.font="bold 34px 'Courier New',monospace";
  ctx.fillStyle=icy?"#bae6fd":"#ff4455";
  ctx.fillText(icy?"ZIRHINI KIRDI!":"ÇILGINA DÖNDÜ!",W/2,H*0.24);
  noGlow();
  ctx.font="bold 14px 'Courier New',monospace";
  ctx.fillStyle=icy?"#dff6ff":"#ffccd4";
  ctx.fillText(icy?"ZEMİN BUZ TUTTU — NEFESİ SÜPÜRÜYOR"
                  :"PEMBE ATIŞLARI DASH İLE SAVUŞTUR",W/2,H*0.24+26);
  ctx.restore();
  ctx.textAlign="left";
}

// ─── SCREEN SHAKE ────────────────────────────────────────────
let shakeX=0,shakeY=0;
function applyShake(dt){
  if(bossShakeTimer>0){
    // sustained, gentler shake for the boss-death moment, independent of the
    // normal fast-decaying hit shake
    bossShakeTimer=Math.max(0,bossShakeTimer-dt);
    shakeX=rnd(-4,4); shakeY=rnd(-4,4);
    return;
  }
  if(screenShake>0){
    shakeX=rnd(-screenShake,screenShake);
    shakeY=rnd(-screenShake,screenShake);
    screenShake=Math.max(0,screenShake-1.5);
  } else { shakeX=0;shakeY=0; }
}

// ─── END-OF-STAGE MISSION DEBRIEF ────────────────────────────
// The screen blacks out and the card types itself in on a retro terminal,
// one line at a time with a blinking block cursor. Shown for every stage;
// the final stage hands over to drawWin() once it is dismissed.
//
// Timing lives entirely in reportTimer, so the card is a pure function of
// elapsed time — no per-line state to reset or desync. The running cursor
// clock is published as reportTypeEnd so update() knows how long to keep
// clacking the typewriter.
const REPORT_CPS=40;          // characters per second
const REPORT_LINE_GAP=0.3;    // beat between lines
function drawMissionReport(){
  const total=LEVELS[levelIndex].cages.length;
  const isFinal=levelIndex>=LEVELS.length-1;
  const fade=clamp(reportTimer/0.7,0,1);
  ctx.fillStyle="rgba(0,0,0,"+(0.55+0.43*fade)+")";
  ctx.fillRect(0,0,W,H);
  ctx.textAlign="center";

  const bw=600,bh=372,bx=W/2-bw/2,by=H/2-bh/2;
  ctx.globalAlpha=fade;
  ctx.fillStyle="rgba(4,8,12,0.92)"; ctx.fillRect(bx,by,bw,bh);
  ctx.shadowColor="#00ff88"; ctx.shadowBlur=18;
  ctx.strokeStyle="#00ff88"; ctx.lineWidth=2; ctx.strokeRect(bx,by,bw,bh);
  noGlow();
  ctx.globalAlpha=1;

  // ── typewriter: each line starts where the one above it finished ──
  let cursorAt=0.55;   // when the next line begins typing
  function typeLine(text,y,font,color,glowPx){
    const dur=Math.max(0.01,text.length/REPORT_CPS);
    const started=reportTimer>=cursorAt;
    const prog=clamp((reportTimer-cursorAt)/dur,0,1);
    const startedAt=cursorAt;
    cursorAt+=dur+REPORT_LINE_GAP;
    if(!started) return false;
    const shown=text.slice(0,Math.ceil(text.length*prog));
    ctx.font=font;
    if(glowPx) glow(color,glowPx);
    ctx.fillStyle=color;
    // a block cursor rides the end of the line while it is still printing
    const typing=prog<1;
    const blink=typing||(reportTimer-startedAt-dur)<0.5;
    ctx.fillText(shown+((typing||blink)&&Math.sin(t*9)>0?"_":""),W/2,y);
    if(glowPx) noGlow();
    return prog>=1;
  }

  typeLine("GÖREV: BAŞARILI",by+58,"bold 34px 'Courier New',monospace","#00ff88",16);

  const tallyDone=typeLine("KURTARILAN YAVRULAR: ["+rescuedThisLevel+"/"+total+"]",
                           by+100,"bold 20px 'Courier New',monospace","#ffdd44",0);
  // one drawn hatchling per slot, revealed once its line has finished printing
  if(tallyDone){
    const slotW=46, startX=W/2-((total-1)*slotW)/2;
    for(let i2=0;i2<total;i2++){
      const sx=startX+i2*slotW;
      if(i2<rescuedThisLevel){
        glow("#ffcc55",10);
        drawBaby(sx,by+136+Math.sin(t*4+i2)*3,32,1,
                 (LEVELS[levelIndex].cages[i2]||{}).species);
        noGlow();
      } else {
        // an empty slot reads as a captive still behind bars
        ctx.strokeStyle="rgba(140,120,150,0.55)"; ctx.lineWidth=2;
        ctx.strokeRect(sx-12,by+122,24,30);
        ctx.beginPath(); ctx.moveTo(sx,by+122); ctx.lineTo(sx,by+152); ctx.stroke();
      }
    }
  }

  typeLine(LEVELS[levelIndex].escapeLine||"VOLKAN ÇEKİRDEĞİNDEN KAÇILDI",
           by+182,"bold 17px 'Courier New',monospace","#ff9955",10);
  typeLine("TOPLAM SKOR: "+score.toLocaleString(),
           by+212,"bold 16px 'Courier New',monospace","#ffffff",0);
  typeLine("KOMBO BONUSU: +"+lastComboBonus.toLocaleString()+
           "  (EN İYİ ZİNCİR: x"+bestChainThisLevel+")"+
           (parriesThisLevel?"  PARRY x"+parriesThisLevel:""),
           by+234,"bold 14px 'Courier New',monospace","#ff88cc",0);
  typeLine("KURTARMA BONUSU: +"+lastRescueBonus.toLocaleString()+
           (rescuedThisLevel>=total?"  ★ TAM KURTARMA ★":""),
           by+256,"bold 14px 'Courier New',monospace",
           rescuedThisLevel>=total?"#8effc9":"#ffcc66",0);

  // ── the payout, which is the part that outlives the run ──
  // bankStageClear() has already run by the time this draws, so lastPayout
  // is the real banked figure and not a second calculation that could drift
  // away from it
  const pay=lastPayout;
  if(pay){
    typeLine("KAZANÇ: "+pay.coins+" KESE + "+pay.rescue+" KURTARMA"+
             "  x"+pay.mult.toFixed(1)+" = "+pay.scaled+" ¢",
             by+286,"bold 14px 'Courier New',monospace","#ffcc55",0);
    if(pay.firstTime){
      typeLine("★ İLK GEÇİŞ BONUSU: +"+pay.first+" ¢",
               by+308,"bold 14px 'Courier New',monospace","#8effc9",8);
    }
    typeLine("KASA: "+bank.coins.toLocaleString()+" ¢",
             by+(pay.firstTime?334:320),"bold 18px 'Courier New',monospace","#ffdd44",10);
  }

  const nextY=by+(pay&&pay.firstTime?358:344);
  if(isFinal){
    typeLine("SON BÖLÜM TAMAMLANDI",nextY,"bold 18px 'Courier New',monospace","#e879f9",10);
  } else {
    typeLine("SIRADAKİ: BÖLÜM "+(levelIndex+2)+" — "+LEVELS[levelIndex+1].name,
             nextY,"bold 18px 'Courier New',monospace","#e879f9",10);
  }

  // the grade sits in the panel's top-right corner, outside the typed lines,
  // so adding or rewording a line never has to move it
  if(reportTimer>0.5){
    const gx2=bx+bw-62, gy2=by+52;
    const gp=0.6+0.4*Math.sin(t*7);
    glow(GRADE_COLOR[lastGrade]||"#ffffff",14+10*gp);
    ctx.font="bold 58px 'Courier New',monospace";
    ctx.fillStyle=GRADE_COLOR[lastGrade]||"#ffffff";
    ctx.fillText(lastGrade||"-",gx2,gy2);
    noGlow();
    ctx.font="bold 10px 'Courier New',monospace";
    ctx.fillStyle="#aaaacc";
    ctx.fillText("DERECE  "+lastGradeScore,gx2,gy2+16);
    const best=bestGrades[levelIndex];
    if(best){
      ctx.fillStyle=lastGradeIsBest?"#ffee44":"#8899aa";
      ctx.fillText(lastGradeIsBest?"★ YENİ REKOR":"EN İYİ: "+best,gx2,gy2+30);
    }
  }

  // publish the finish time so update() can stop the typewriter clacks
  reportTypeEnd=cursorAt;

  // prompt — only once the panel will actually accept the key
  if(reportTimer>REPORT_MIN && Math.sin(t*6)>-0.3){
    ctx.font="bold 13px 'Courier New',monospace";
    ctx.fillStyle="#88ccaa";
    ctx.fillText("DEVAM ETMEK İÇİN  [ENTER]",W/2,by+bh+28);
  }
  ctx.textAlign="left";
}

// ─── MISSION SELECT (the world map) ──────────────────────────
// A 16-bit briefing screen: four nodes on a route, a CLEARED stamp on the
// ones behind you, padlocks on the ones ahead. Lock state lives in
// localStorage, so a refresh does not undo an evening's progress.
function drawWorldMap(){
  const g=ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,"#05030f"); g.addColorStop(0.55,"#0b0722"); g.addColorStop(1,"#12061a");
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  // the same starfield as the cave, drifting on its own
  for(const s of stars){
    const sx=((s.x+t*4)%W+W)%W;
    ctx.globalAlpha=0.25+0.35*Math.sin(t*1.5+s.twinkle);
    ctx.fillStyle="#b8d4ff";
    ctx.beginPath(); ctx.arc(sx,s.y*0.9+30,s.r,0,Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha=1;

  // header
  ctx.textAlign="center";
  const pulse=0.6+0.4*Math.sin(t*4);
  glow("#e879f9",14+8*pulse);
  ctx.font="bold 34px 'Courier New',monospace";
  ctx.fillStyle="#e879f9";
  ctx.fillText("MISSION SELECT",W/2,58);
  noGlow();
  ctx.font="bold 11px 'Courier New',monospace";
  ctx.fillStyle="#8899bb";
  ctx.fillText("NEON DINO-AGE  //  RESCUE PROTOCOL",W/2,78);

  const px2=i=>WORLDS[i].mx*W, py2=i=>WORLDS[i].my*H;

  // the route between nodes, dashed and animated
  ctx.save();
  ctx.setLineDash&&ctx.setLineDash([7,9]);
  ctx.lineDashOffset=-t*18;
  for(let i=0;i<WORLDS.length-1;i++){
    const open=worldState(i).cleared;
    ctx.strokeStyle=open?"rgba(142,255,201,0.75)":"rgba(120,130,170,0.30)";
    ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(px2(i),py2(i)); ctx.lineTo(px2(i+1),py2(i+1)); ctx.stroke();
  }
  ctx.restore();
  ctx.setLineDash&&ctx.setLineDash([]);

  // the nodes
  for(let i=0;i<WORLDS.length;i++){
    const w=WORLDS[i], st=worldState(i);
    const x=px2(i), y=py2(i);
    const sel=i===mapSel;
    const col=st.playable?w.color:"#5a6076";

    if(sel&&mapStampTimer<=0){
      glow(w.color,18+10*pulse);
      ctx.strokeStyle=w.color; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(x,y,34+3*pulse,0,Math.PI*2); ctx.stroke();
      noGlow();
    }
    // the node disc
    glow(col,st.playable?16:4);
    ctx.fillStyle="rgba(6,4,14,0.9)";
    ctx.beginPath(); ctx.arc(x,y,24,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle=col; ctx.lineWidth=3;
    ctx.beginPath(); ctx.arc(x,y,24,0,Math.PI*2); ctx.stroke();
    noGlow();
    ctx.fillStyle=col;
    ctx.beginPath(); ctx.arc(x,y,11,0,Math.PI*2); ctx.fill();

    if(!st.unlocked||!w.levels.length){
      // padlock: shackle + body, drawn small so it reads at a glance
      ctx.strokeStyle="#cbd5e1"; ctx.lineWidth=2.5;
      ctx.beginPath(); ctx.arc(x,y-4,6,Math.PI,0); ctx.stroke();
      ctx.fillStyle="#cbd5e1";
      ctx.fillRect(x-8,y-3,16,12);
    }

    ctx.textAlign="center";
    ctx.font="bold 13px 'Courier New',monospace";
    ctx.fillStyle=st.playable?"#ffffff":"#8a90a6";
    ctx.fillText(w.name,x,y+46);
    ctx.font="bold 10px 'Courier New',monospace";
    ctx.fillStyle=st.playable?col:"#6a7188";
    ctx.fillText(w.sub,x,y+60);
    if(!w.levels.length){
      ctx.fillStyle="#6a7188";
      ctx.fillText("YAKINDA",x,y+74);
    }

    // CLEARED stamp — slams down on arrival, then just sits there
    if(st.cleared){
      let sc=1, rot=-0.22;
      if(mapStampTimer>0&&mapStampWorld===i){
        const el=2.4-mapStampTimer;
        sc = el<0.25 ? lerp(3.2,1,el/0.25) : 1;
        if(el<0.35) rot=-0.22+Math.sin(el*60)*0.05;
      }
      ctx.save();
      ctx.translate(x,y-4); ctx.rotate(rot); ctx.scale(sc,sc);
      ctx.globalAlpha=0.92;
      glow("#ff2244",12);
      ctx.strokeStyle="#ff2a45"; ctx.lineWidth=3;
      ctx.strokeRect(-52,-15,104,30);
      ctx.font="bold 18px 'Courier New',monospace";
      ctx.fillStyle="#ff3a53";
      ctx.fillText("CLEARED",0,7);
      noGlow();
      ctx.restore();
      ctx.globalAlpha=1;
    }
  }

  // briefing panel for the highlighted node
  const w=WORLDS[mapSel], st=worldState(mapSel);
  const bw=520,bh=62,bx=W/2-bw/2,by=H-84;
  ctx.fillStyle="rgba(4,4,12,0.88)"; ctx.fillRect(bx,by,bw,bh);
  ctx.strokeStyle=st.playable?w.color:"#5a6076"; ctx.lineWidth=2;
  ctx.strokeRect(bx,by,bw,bh);
  ctx.textAlign="left";
  ctx.font="bold 15px 'Courier New',monospace";
  ctx.fillStyle=st.playable?w.color:"#8a90a6";
  ctx.fillText(w.name,bx+14,by+22);
  ctx.font="bold 11px 'Courier New',monospace";
  ctx.fillStyle="#aab4cc";
  ctx.fillText(w.levels.length?(w.levels.length+" BÖLÜM"):"HENÜZ AÇILMADI",bx+14,by+40);
  const best=w.levels.map(l=>bestGrades[l]).filter(Boolean);
  if(best.length){
    ctx.fillStyle="#ffdd66";
    ctx.fillText("EN İYİ NOT: "+best.join(" "),bx+14,by+55);
  }
  ctx.textAlign="right";
  ctx.font="bold 11px 'Courier New',monospace";
  ctx.fillStyle="#88ccaa";
  if(mapStampTimer<=0&&Math.sin(t*6)>-0.4){
    ctx.fillText(st.playable?"[ENTER] GÖREVE BAŞLA":"KİLİTLİ",bx+bw-14,by+22);
  }
  ctx.fillStyle="#7788aa";
  ctx.fillText("◀ ▶  HEDEF SEÇ",bx+bw-14,by+42);
  ctx.textAlign="left";

  // the balance, top-right, where a briefing screen would put it
  ctx.textAlign="right";
  glow("#ffdd44",10);
  ctx.font="bold 18px 'Courier New',monospace";
  ctx.fillStyle="#ffdd44";
  ctx.fillText(bank.coins.toLocaleString()+" ¢",W-22,44);
  noGlow();
  ctx.font="bold 9px 'Courier New',monospace";
  ctx.fillStyle="#8899bb";
  ctx.fillText("KASA",W-22,58);
  ctx.textAlign="left";

  // the way into the hangar. A real rect, because a tablet has no H key.
  const hb=mapHangarButton();
  const rich=bank.coins>0;
  ctx.fillStyle=rich?"rgba(255,221,68,0.10)":"rgba(255,255,255,0.05)";
  ctx.fillRect(hb.x,hb.y,hb.w,hb.h);
  ctx.strokeStyle=rich?"#ffdd44":"#55607c"; ctx.lineWidth=1;
  ctx.strokeRect(hb.x+0.5,hb.y+0.5,hb.w-1,hb.h-1);
  ctx.textAlign="center";
  ctx.font="bold 13px 'Courier New',monospace";
  ctx.fillStyle=rich?"#ffdd44":"#8899bb";
  ctx.fillText("HANGAR",hb.x+hb.w/2,hb.y+17);
  ctx.font="bold 9px 'Courier New',monospace";
  ctx.fillStyle="#66708c";
  ctx.fillText(touchMode?"DOKUN":"H",hb.x+hb.w/2,hb.y+30);

  ctx.textAlign="center";
  ctx.font="bold 10px 'Courier New',monospace";
  ctx.fillStyle="#66708c";
  ctx.fillText("HI-SCORE: "+hiScore.toLocaleString(),W/2,H-12);
  ctx.textAlign="left";
}

// ─── CONTINUE? ───────────────────────────────────────────────
function drawContinue(){
  ctx.fillStyle="rgba(0,0,0,0.80)"; ctx.fillRect(0,0,W,H);
  ctx.textAlign="center";
  const secs=Math.max(0,Math.ceil(continueTimer));
  const urgent=secs<=3;
  const pulse=0.6+0.4*Math.sin(t*(urgent?14:7));

  glow(urgent?"#ff2244":"#ffaa33",16+12*pulse);
  ctx.font="bold 36px 'Courier New',monospace";
  ctx.fillStyle=urgent?"#ff4466":"#ffcc55";
  ctx.fillText("DEVAM ET?",W/2,H/2-86);
  noGlow();

  // the number, big and getting angrier
  glow(urgent?"#ff2244":"#ffee44",24+18*pulse);
  ctx.font=`bold ${72+(urgent?10*pulse:0)}px 'Courier New',monospace`;
  ctx.fillStyle=urgent?"#ff5577":"#ffee66";
  ctx.fillText(String(secs),W/2,H/2+4);
  noGlow();

  ctx.font="bold 15px 'Courier New',monospace";
  ctx.fillStyle="#aaffdd";
  ctx.fillText(`KALAN DEVAM HAKKI: ${continuesLeft}`,W/2,H/2+42);

  ctx.font="13px 'Courier New',monospace";
  ctx.fillStyle="#88ccaa";
  ctx.fillText(checkpointUsed?"KONTROL NOKTASINDAN DEVAM EDİLECEK"
                             :"BÖLÜM BAŞINDAN DEVAM EDİLECEK",W/2,H/2+66);

  if(Math.sin(t*6)>-0.3){
    ctx.font="bold 14px 'Courier New',monospace";
    ctx.fillStyle="#ffffff";
    ctx.fillText("[ENTER] DEVAM     [R] BAŞTAN BAŞLA",W/2,H/2+100);
  }
  ctx.textAlign="left";
}

// ─── GAME OVER / WIN screens ─────────────────────────────────
function drawGameOver(){
  ctx.fillStyle="rgba(0,0,0,0.75)"; ctx.fillRect(0,0,W,H);
  ctx.textAlign="center";
  glow("#ff2244",30);
  ctx.font="bold 52px 'Courier New',monospace";
  ctx.fillStyle="#ff4466";
  ctx.fillText("GAME OVER",W/2,H/2-40);
  noGlow();
  ctx.font="20px 'Courier New',monospace";
  ctx.fillStyle="#ffaacc";
  ctx.fillText(`SCORE: ${score.toLocaleString()}`,W/2,H/2+10);
  if(newRecord){
    const pulse=0.6+0.4*Math.sin(t*10);
    glow("#ffee00",10+10*pulse);
    ctx.font="bold 18px 'Courier New',monospace";
    ctx.fillStyle="#ffee44";
    ctx.fillText("★ NEW RECORD! ★",W/2,H/2+38);
    noGlow();
  } else {
    ctx.font="14px 'Courier New',monospace";
    ctx.fillStyle="#ffddaa";
    ctx.fillText(`HI-SCORE: ${hiScore.toLocaleString()}`,W/2,H/2+38);
  }
  ctx.fillStyle="#ffddaa";
  ctx.font="14px 'Courier New',monospace";
  ctx.fillText("Press R to restart",W/2,H/2+68);
  ctx.textAlign="left";
}
function drawWin(){
  ctx.fillStyle="rgba(0,10,0,0.75)"; ctx.fillRect(0,0,W,H);
  ctx.textAlign="center";
  glow("#00ff88",30);
  ctx.font="bold 42px 'Courier New',monospace";
  ctx.fillStyle="#00ff88";
  ctx.fillText("TAHLİYE TAMAMLANDI",W/2,H/2-86);
  noGlow();

  // the run-long rescue total — the whole point of the mission
  const grandTotal=WORLDS[worldIndex].levels.reduce((s,i)=>s+LEVELS[i].cages.length,0);
  glow("#ffcc55",12);
  ctx.font="bold 20px 'Courier New',monospace";
  ctx.fillStyle="#ffcc66";
  ctx.fillText("KURTARILAN SOY: "+rescuedTotal+" / "+grandTotal+" YAVRU",W/2,H/2-48);
  noGlow();
  for(let i=0;i<rescuedTotal;i++){
    const sx=W/2-((rescuedTotal-1)*34)/2+i*34;
    drawBaby(sx,H/2-14+Math.sin(t*4+i)*3,30,1);
  }

  ctx.font="22px 'Courier New',monospace";
  ctx.fillStyle="#ffdd44";
  ctx.fillText("FINAL SCORE: "+score.toLocaleString(),W/2,H/2+30);
  if(newRecord){
    const pulse=0.6+0.4*Math.sin(t*10);
    glow("#ffee00",10+10*pulse);
    ctx.font="bold 20px 'Courier New',monospace";
    ctx.fillStyle="#ffee44";
    ctx.fillText("★ NEW RECORD! ★",W/2,H/2+60);
    noGlow();
  } else {
    ctx.font="14px 'Courier New',monospace";
    ctx.fillStyle="#aaffcc";
    ctx.fillText("HI-SCORE: "+hiScore.toLocaleString(),W/2,H/2+60);
  }
  ctx.font="18px 'Courier New',monospace";
  ctx.fillStyle="#aaffdd";
  ctx.fillText(rescuedTotal>=grandTotal?"🥚 SOY KURTARILDI — HİÇ KİMSE GERİDE KALMADI 🥚"
                                       :"Great job, Bago!",W/2,H/2+90);
  ctx.font="14px 'Courier New',monospace";
  ctx.fillStyle="#88ccaa";
  ctx.fillText("Press R — MISSION SELECT",W/2,H/2+118);
  ctx.textAlign="left";
}
