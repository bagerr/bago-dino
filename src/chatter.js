// Chatter: the escort has something to say
// Part of NEON DINO-AGE: RESCUE PROTOCOL. Loaded as a classic
// script, in the order index2.html lists — these files share one
// global scope on purpose and are not modules.

// ─── THE ESCORT SPEAKS ────────────────────────────────────────
// The train has been silent since it was built. It has names now, and roles,
// and a rank earned by how well it was rescued — and none of that was ever
// heard from during a run, only read afterwards on a wall.
//
// So: once in a while, one of them says something. Which one and what it
// says are decided by who is actually back there, the same way the deeds
// are: a raw ÇAYLAK does not talk like a KIDEMLİ, a NİŞANCI does not talk
// like a TEKNİSYEN, and somebody who has just watched a sibling panic has
// something else on its mind entirely.
//
// Three rules keep it from becoming noise, which is the only real risk:
//   * a long gap between lines, and a longer one after anything urgent;
//   * never over a boss intro, a debrief, or another transmission;
//   * the same line never twice in a row from the same hatchling.
const CHATTER_MIN=14, CHATTER_MAX=26;   // seconds between remarks
const CHATTER_QUIET=6;                  // hush this long after any other call

let chatterTimer=0;
let chatterLast={};                     // hatchling id -> last line said

// ── what they say ─────────────────────────────────────────────
// Keyed by situation first, then by role. The situation lists are checked in
// priority order, so a hatchling remarks on what is actually happening
// rather than on the weather in general.
const CHATTER_RANK={
  1:["Bu ilk seferim.","Arkandan geliyorum!"],
  2:["Bu işi biliyorum artık.","Sen önden git."],
  3:["Kaç sefer oldu, saymayı bıraktım.","Merak etme. Buradayım."],
};
const CHATTER_ROLE={
  gunner:["Nişan aldım.","Sol tarafı ben tutarım.","Ateş serbest mi?"],
  tech:  ["Depon yarılandı.","İkmal hazır.","Bas gaza, yakıt bende."],
  guard: ["Arkanı kolluyorum.","Yaklaşan var.","Sen bakma, ben hallederim."],
};
const CHATTER_HURT=["İyi misin?","Kanıyorsun.","Dur biraz, nefeslen."];
const CHATTER_ALONE=["Bir tek ben kaldım.","Diğerleri nerede?"];
const CHATTER_FULL=["Hepimiz buradayız!","Kimseyi bırakmadık."];
const CHATTER_FOG=["Su yükseliyor!","Yukarı, çabuk!"];
const CHATTER_STORM=["Rüzgâr çok sert!","Tutun bir yere!"];
const CHATTER_BOSS=["O şey çok büyük.","Korkuyorum ama buradayım."];
const CHATTER_LOST=["...onu geride bıraktık.","Bir daha olmasın."];

// Pick a line this one did not just say, so the same mouth never repeats
// itself back to back.
function pickLine(rec,list){
  if(!list||!list.length) return null;
  const last=rec?chatterLast[rec.id]:null;
  const fresh=list.filter(l=>l!==last);
  const pool=fresh.length?fresh:list;
  const line=pool[Math.floor(Math.random()*pool.length)];
  if(rec) chatterLast[rec.id]=line;
  return line;
}

// What is worth remarking on, most pressing first.
function chatterFor(rec){
  const L=LEVELS[levelIndex];
  const total=(L.cages||[]).length;
  if(fogAtHeels())                       return pickLine(rec,CHATTER_FOG);
  if(stormBlowing())                     return pickLine(rec,CHATTER_STORM);
  if(boss&&!boss.dead&&boss.introState==="active") return pickLine(rec,CHATTER_BOSS);
  if(player.hp<=1)                       return pickLine(rec,CHATTER_HURT);
  if(lastLostName)                       return pickLine(rec,CHATTER_LOST);
  if(total>0&&rescuedThisLevel>=total&&followers.length>1)
                                         return pickLine(rec,CHATTER_FULL);
  if(followers.length===1&&total>1)      return pickLine(rec,CHATTER_ALONE);
  // nothing pressing: they talk about themselves, which is the point of
  // having given them a rank and a role in the first place
  if(rec&&Math.random()<0.5)             return pickLine(rec,CHATTER_RANK[rec.rank||1]);
  return pickLine(rec,CHATTER_ROLE[rec&&rec.role]||CHATTER_ROLE.guard);
}

function resetChatter(){
  chatterTimer=rnd(CHATTER_MIN,CHATTER_MAX);
  chatterLast={};
}

// Called every frame of a stage. Deliberately silent unless the screen is
// genuinely free: the escort chipping in over a boss card or a debrief
// would read as a bug, not as company.
function updateChatter(dt){
  if(STATE!=="playing"){ return; }
  // anything else on the air pushes the next remark back
  if(radio||radioQueue.length){ chatterTimer=Math.max(chatterTimer,CHATTER_QUIET); return; }
  if(bossCardTimer>0||bossRageTimer>0||warningBannerTimer>0||arenaBannerTimer>0){
    chatterTimer=Math.max(chatterTimer,CHATTER_QUIET); return;
  }
  if(!followers.length){ return; }

  chatterTimer-=dt;
  if(chatterTimer>0) return;
  chatterTimer=rnd(CHATTER_MIN,CHATTER_MAX);

  // whoever is on the train, picked at random — but the LINE is not random
  const f=followers[Math.floor(Math.random()*followers.length)];
  const rec=f&&f.rec;
  if(!rec) return;
  const line=chatterFor(rec);
  if(!line) return;
  queueRadio(null,rec.name,[line],
    {color:roleColor(rec.role),hold:2.2});
}
