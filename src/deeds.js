// Deeds: what happened to this one
// Part of NEON DINO-AGE: RESCUE PROTOCOL. Loaded as a classic
// script, in the order index2.html lists — these files share one
// global scope on purpose and are not modules.

// ─── THE DEED ─────────────────────────────────────────────────
// A name on a wall is not a story. This gives every hatchling the sentence
// of its own rescue — and every hatchling that did not make it the sentence
// of its own loss.
//
// The one rule that makes this storytelling rather than decoration: the
// line must be TRUE. Nothing here is picked at random. The engine already
// knows everything worth saying at the moment a hatchling is delivered —
// how many hearts were left, whether the fog was at your heels, whether
// this one panicked and you went back for it, whether somebody else did not
// come home on the same run — and none of it was being written down.
//
// So each list below is a PRIORITY ORDER, not a shuffle: the first
// condition that actually holds wins. The most dramatic true thing about
// the rescue becomes its sentence, and a quiet rescue gets a quiet one.
const FALLEN_KEPT=40;      // the memorial is long, not infinite

function stageName(i){ return (LEVELS[i]&&LEVELS[i].name)||"BİLİNMEYEN BÖLGE"; }

// Is the rot/blizzard actually on top of the player right now?
function fogAtHeels(){
  return typeof fogY==="number" && isFinite(fogY) &&
         fogY < player.y+PLAYER_H+90;
}
function stormBlowing(){ return typeof windState==="string" && windState==="blow"; }

// ── delivered ─────────────────────────────────────────────────
// `rec` carries what happened to it personally (panicked, recaptured);
// everything else is read off the run as it stands at the rift.
function deedForDelivered(rec){
  const L=LEVELS[levelIndex];
  const total=(L.cages||[]).length;
  const bossDown=!!(boss&&(boss.dead||boss.dying));
  const bossName=(L.boss&&L.boss.name)||"ALFA";

  if(player.hp<=1)            return "Son kalbinle çıkardın.";
  if(rec&&rec.panicked)       return "Panikledi ve kaçtı. Geri döndün.";
  if(lastLostName)            return lastLostName+" dönemedi. O döndü.";
  if(bossDown)                return bossName+" düşerken kollarındaydı.";
  if(fogAtHeels())            return "Çürüme suyu topuklarındaydı.";
  if(stormBlowing())          return "Tipi henüz dinmemişti.";
  if(total>0&&rescuedThisLevel>=total) return "Bütün kardeşleriyle birlikte çıktı.";
  if(hitsThisLevel===0)       return "Tek çizik almadan çıkardın.";
  if(L.parTime&&levelTime<L.parTime*0.7) return "Hızlıydın. O da öyle.";
  return "Sessiz bir tahliyeydi.";
}

// ── lost ──────────────────────────────────────────────────────
function deedForLost(rec){
  const L=LEVELS[levelIndex];
  const bossUp=!!(boss&&!boss.dead&&boss.introState==="active");
  const bossName=(L.boss&&L.boss.name)||"ALFA";

  if(fogAtHeels())      return "Çürüme suyu yükselirken kopmuştu.";
  if(stormBlowing())    return "Tipi onu aldı.";
  if(bossUp)            return bossName+" saldırırken kopmuştu.";
  if(player.hp<=1)      return "Sen de zor ayaktaydın.";
  if(rec&&rec.recaptured) return "Bir kez yakalamıştın. İkincisi olmadı.";
  return "Kopmuştu. Dönemedin.";
}

// ── writing it down ───────────────────────────────────────────
function recordDeed(rec){
  if(!rec) return;
  rec.deed=deedForDelivered(rec);
  rec.where=stageName(levelIndex);
}

function recordFallen(rec){
  if(!rec) return;
  roster.fallen=roster.fallen||[];
  roster.fallen.unshift({
    id:rec.id, name:rec.name, role:rec.role, species:rec.species,
    where:stageName(levelIndex),
    deed:deedForLost(rec),
  });
  while(roster.fallen.length>FALLEN_KEPT) roster.fallen.pop();
}

// ── a wrapper, because these lines are generated and cannot be
//    hand-wrapped the way the radio's are ────────────────────
function wrapText(str,maxW,font){
  ctx.font=font;
  const words=String(str||"").split(" ");
  const out=[];
  let line="";
  for(const w of words){
    const probe=line?line+" "+w:w;
    if(line && ctx.measureText(probe).width>maxW){ out.push(line); line=w; }
    else line=probe;
  }
  if(line) out.push(line);
  return out;
}
