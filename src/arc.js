// The arc: Command is lying, and the chests say so
// Part of NEON DINO-AGE: RESCUE PROTOCOL. Loaded as a classic
// script, in the order index2.html lists — these files share one
// global scope on purpose and are not modules.

// ─── THE STORY ARC ────────────────────────────────────────────
// Everything here is DATA plus four trigger points. No new engine system:
// the radio window, the secret chests, the brood roster and the victory
// screen already existed and were all saying nothing in particular. This
// gives them something to say.
//
// The spine is that KOMUTA MERKEZİ — the voice that has been barking orders
// since the first stage — is not telling you the truth. The content is what
// the chests hold: ARŞİV, a dead researcher's log, which contradicts it.
// The two voices never address each other, and the player is the only one
// who hears both.
//
// The whole arc is optional. Find no keys and Command is simply your boss
// and the game ends with a thank-you. Find all three and you end up
// somewhere else entirely. That is the point of putting the truth behind an
// out-of-the-way perch rather than in the main route: the story is a thing
// you go looking for.
const ARC_COMMAND="KOMUTA MERKEZİ";
const ARC_ARCHIVE="ARŞİV";
const CMD_COLOR="#ff8844";
const ARC_COLOR="#a78bfa";

// Beats already played, kept so the arc does not repeat itself across a
// session. Deliberately NOT persisted: a new evening replays the story, the
// way an arcade cabinet would.
let arcSeen={};
// Chests opened THIS run, which is a different question from whether a key
// has ever been found (hasSeal, which the map glyph reads and which is
// permanent on purpose). The ending asks this one — reading the permanent
// seal instead meant that finding all three once made the other two endings
// unreachable for good.
let arcOpened={};

// What Command says on arrival, per world. It was one hardcoded line about
// a volcano erupting, played at the top of every stage in the game —
// including the ones with no volcano in them.
const ARC_BRIEF={
  volcano:["DİKKAT: Volkan patlıyor.","Kafesleri kır, yavruları çıkar."],
  forest: ["Bu bölge kayıtlarda yok.","Soruları bırak. Gir ve çık."],
  frozen: ["Zirveye çıkma emri verilmedi.","Yine de oradasın. Not edildi."],
  cyber:  ["Sinyal karışıyor.","Dikkatli ol."],
};

// What it says once a world is behind you. It gets less comfortable every
// time, and never answers anything.
const ARC_DEBRIEF={
  volcano:["Temiz iş. Yavruları teslim et.","Gerisi bizim sorunumuz."],
  forest: ["Sayı tutmuyor.","Kaç yavru çıkardığını tekrar bildir."],
  frozen: ["Telsizi kapat.","Bu bir emirdir."],
};

// The chests. One per biome, and each one is a page from somebody who was
// there before you.
const ARC_LOG={
  volcano:["KAYIT 1 — Kafesleri biz yapmadık.","Onları burada bulduk.",
           "Yuva zaten doluydu."],
  forest: ["KAYIT 7 — Alfa bir canavar değil.","Aynı soydan. Sadece büyütülmüş.",
           "Kim büyüttü, orası eksik."],
  frozen: ["KAYIT 19 — Kafesler bir depo.","Depo birine teslimat yapar.",
           "Alıcının çağrı adı: KOMUTA."],
};

function arcFire(key,title,lines,color,opts){
  if(arcSeen[key]) return false;
  arcSeen[key]=true;
  queueRadio(null,title,lines,Object.assign({color:color,hold:4.2},opts||{}));
  return true;
}

// how much of the truth the player is carrying THIS run
function arcFragments(){
  let n=0;
  for(let i=0;i<LEVELS.length;i++) if(LEVELS[i].secretKey && arcOpened[i]) n++;
  return n;
}
// ...and how much has ever been found, which is what the map draws
function arcFragmentsEver(){
  let n=0;
  for(let i=0;i<LEVELS.length;i++) if(LEVELS[i].secretKey && hasSeal(i)) n++;
  return n;
}
function arcFragmentsTotal(){
  return LEVELS.filter(L=>!!L.secretKey).length;
}

// ── the four trigger points ───────────────────────────────────

// What Command says at the top of a stage that is NOT the world's first.
// Every stage has always opened with a transmission and that contract is
// worth keeping — the story briefing just takes the first one's slot.
const ARC_STAGE={
  volcano:["Sıradaki bölge sıcak.","Kafesler yerinde duruyor."],
  forest: ["Spor yoğunluğu artıyor.","Kayıt tutmuyoruz. Devam et."],
  frozen: ["Telsiz zayıflıyor.","Yine de duyuyoruz seni."],
  cyber:  ["Parazit var.","Devam."],
};

// 1. walking into a stage. The world's first one carries the story; the
//    others carry a line that says nothing, which is the point.
function arcBrief(){
  const w=WORLDS[worldIndex]||{};
  const id=w.id||"volcano";
  // The world's first stage carries the briefing. Not gated on a "seen"
  // flag: loadLevel(0) runs once at boot to build the stage arrays, and a
  // flag would let that boot call eat the beat before the player ever
  // pressed anything. loadLevel clears the radio, so the boot copy is
  // discarded rather than heard.
  const tellStory=(w.levels||[])[0]===levelIndex;
  const lines=tellStory ? (ARC_BRIEF[id]||ARC_BRIEF.volcano)
                        : (ARC_STAGE[id]||ARC_STAGE.volcano);
  // keyed "start" so loadLevel re-arms it per stage, as it always has
  queueRadio("start",ARC_COMMAND,lines,
    {color:CMD_COLOR,urgent:true,hold:tellStory?4.6:3.2});
  // and once you have handed one over, this is where Command mentions it
  arcFirstDelivery();
}

// 2. opening a chest — the only place the other voice speaks
function arcLog(){
  const id=(WORLDS[worldIndex]||{}).id||"volcano";
  arcOpened[levelIndex]=true;      // this run has read that record
  const lines=ARC_LOG[id];
  if(!lines) return;
  arcFire("log_"+id,ARC_ARCHIVE,lines,ARC_COLOR,{urgent:true,hold:5.0});
}

// 3. finishing a world
function arcDebrief(){
  const id=(WORLDS[worldIndex]||{}).id||"volcano";
  const lines=ARC_DEBRIEF[id];
  if(!lines) return;
  arcFire("debrief_"+id,ARC_COMMAND,lines,CMD_COLOR,{urgent:true});
}

// 4. the first hatchling you ever delivered. Fired at the top of the NEXT
//    stage rather than at the rift, because endLevel() clears the radio on
//    purpose — nothing plays over the debrief card.
function arcFirstDelivery(){
  if(!roster.delivered) return;
  arcFire("first_delivery",ARC_COMMAND,
    ["Yavruyu aldık.","Onu bir daha sorma."],CMD_COLOR,{hold:3.4});
}

// ── the ending ────────────────────────────────────────────────
// Three, chosen by what the player actually did: how much of the archive
// they went looking for, and how much of the brood got home. No choice
// prompt — the ending IS the choice, made across the whole run.
function arcEnding(){
  const frags=arcFragments(), total=arcFragmentsTotal();
  const home=roster.members.length;
  const lost=roster.lost;
  if(frags>=total && total>0){
    return {
      id:"escape",
      title:"TELSİZ KAPATILDI",
      color:"#8effc9",
      lines:[
        "Üç kayıt da elinde.",
        "KOMUTA'nın istediği yavrular değil —",
        "teslimattı.",
        "Kanalı kapattın ve soyu aldın.",
        "Kimse nereye gittiğinizi bilmiyor.",
      ],
    };
  }
  if(frags>0){
    return {
      id:"doubt",
      title:"TAHLİYE TAMAMLANDI",
      color:"#ffcc55",
      lines:[
        "Yavruları teslim ettin.",
        "Elindeki tek kayıt cebinde duruyor",
        "ve hiçbir şeye uymuyor.",
        "KOMUTA teşekkür etti.",
        "Sen teşekkürü duymadın.",
      ],
    };
  }
  return {
    id:"protocol",
    title:"PROTOKOL TAMAMLANDI",
    color:"#8fa0c8",
    lines:[
      "Görev kapatıldı.",
      "Soy teslim alındı.",
      "KOMUTA memnun.",
      home?("Üsse varan: "+home+" yavru."):"Üsse kimse varmadı.",
      lost?("Geri dönmeyen: "+lost+"."):"Kimse geride kalmadı.",
    ],
  };
}

// drawn under the victory screen's own tally
function drawArcEnding(y){
  const e=arcEnding();
  ctx.save();
  ctx.textAlign="center";
  glow(e.color,14);
  ctx.font="bold 20px 'Courier New',monospace";
  ctx.fillStyle=e.color;
  ctx.fillText(e.title,W/2,y);
  noGlow();
  ctx.font="13px 'Courier New',monospace";
  ctx.fillStyle="#cbd5e1";
  for(let i=0;i<e.lines.length;i++) ctx.fillText(e.lines[i],W/2,y+22+i*17);
  // and how much of the archive was ever found
  ctx.font="bold 10px 'Courier New',monospace";
  ctx.fillStyle="#a78bfa";
  ctx.fillText("ARŞİV: "+arcFragments()+" / "+arcFragmentsTotal()+" KAYIT",
               W/2,y+28+e.lines.length*17);
  ctx.textAlign="left";
  ctx.restore();
}
