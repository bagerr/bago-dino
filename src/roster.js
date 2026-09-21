// The brood: the hatchlings have names now
// Part of NEON DINO-AGE: RESCUE PROTOCOL. Loaded as a classic
// script, in the order index2.html lists — these files share one
// global scope on purpose and are not modules.

// ─── THE BROOD ────────────────────────────────────────────────
// A hatchling used to be a number. rescuedThisLevel went up, rescuedThisLevel
// went down, and the debrief printed the difference. The rescue game's own
// subject was the one thing in it with no identity.
//
// Now every cage holds somebody. They are named when you free them, they
// carry that name through the stage, the radio uses it when they panic, and
// the debrief reads it out. Deliver one and it joins the brood at base, for
// good. Lose one and it never arrives — there is no grave, just a name you
// do not see again.
//
// The growth axis is deliberately NOT time served, because time served is
// farmable. A hatchling arrives at base with the seniority it was rescued
// WITH: deliver somebody on an S run and they come in seasoned; drag them
// out on a D and they arrive raw. What the brood gives back is escort
// strength (see followerPower), so the reward for rescuing well is rescuing
// better — the loop feeds itself instead of feeding a separate upgrade tree.

const HATCH_NAMES=[
  "PATİ","KÜÇÜK","ÇİZGİ","BORA","MİNİK","KARDELEN","TOSUN","ZIPZIP",
  "PAMUK","ALEV","FINDIK","ŞİMŞEK","DAMLA","KÖMÜR","YUMAK","CEVİZ",
  "MERCAN","TARÇIN","BADEM","KIVILCIM","ÇAKIL","MISIR","LEYLA","ÇINAR",
  "BULUT","NAR","KESTANE","YONCA","TOPAÇ","ZEYTİN",
];

const ROLES={
  gunner:{id:"gunner", name:"NİŞANCI",   color:"#ff8844",
          blurb:"Işını daha sık tetikler."},
  tech:  {id:"tech",   name:"TEKNİSYEN", color:"#44aaff",
          blurb:"Jetpack ikmalini hızlandırır."},
  guard: {id:"guard",  name:"KORUMA",    color:"#8effc9",
          blurb:"Refakat ateşini erken açar."},
};
const ROLE_IDS=["gunner","tech","guard"];

// seniority, earned at the moment of delivery and never after
const RANKS=["","ÇAYLAK","USTA","KIDEMLİ"];
const GRADE_RANK={S:3, A:3, B:2, C:1, D:1};
function rankForGrade(letter){ return GRADE_RANK[letter]||1; }

let roster={members:[], lost:0, delivered:0, nextId:1, fallen:[]};
try{
  const raw=localStorage.getItem("neonDinoRoster");
  if(raw){
    const p=JSON.parse(raw);
    if(p&&typeof p==="object"){
      roster.members=Array.isArray(p.members)?p.members.filter(m=>m&&m.name):[];
      roster.lost=Math.max(0,Math.floor(Number(p.lost)||0));
      roster.delivered=Math.max(0,Math.floor(Number(p.delivered)||0));
      roster.nextId=Math.max(1,Math.floor(Number(p.nextId)||1));
      roster.fallen=Array.isArray(p.fallen)?p.fallen.filter(f=>f&&f.name):[];
    }
  }
}catch(e){ /* a blocked or corrupt store just means an empty brood */ }

function saveRoster(){
  try{ localStorage.setItem("neonDinoRoster",JSON.stringify(roster)); }catch(e){}
}

// A name nobody in the brood is using. Falls back to a numbered one rather
// than repeating, because two hatchlings called PATİ makes the loss of one
// of them mean nothing.
function freshName(){
  const taken=new Set(roster.members.map(m=>m.name));
  const free=HATCH_NAMES.filter(n=>!taken.has(n));
  if(free.length) return free[Math.floor(Math.random()*free.length)];
  for(let i=2;i<99;i++){
    for(const n of HATCH_NAMES) if(!taken.has(n+"-"+i)) return n+"-"+i;
  }
  return "YAVRU-"+roster.nextId;
}

// Born at the cage, not at the rift: it has to have a name while it is still
// losable, or the loss is just a counter going down again.
function makeHatchling(species){
  return {
    id:roster.nextId++,
    name:freshName(),
    role:ROLE_IDS[Math.floor(Math.random()*ROLE_IDS.length)],
    species:species||"baby",
    rank:1,
    home:false,
  };
}

function enrolHatchling(rec,letter){
  if(!rec||rec.home) return null;
  rec.rank=rankForGrade(letter);
  rec.home=true;
  // the sentence of its own rescue, read off what actually happened
  recordDeed(rec);
  roster.members.push({id:rec.id,name:rec.name,role:rec.role,
                       species:rec.species,rank:rec.rank,
                       deed:rec.deed,where:rec.where});
  roster.delivered++;
  saveRoster();
  return rec;
}

function loseHatchling(rec){
  if(!rec) return;
  roster.lost++;
  // a counter going up is arithmetic. The memorial is the story.
  recordFallen(rec);
  saveRoster();
}

function roleName(id){ return (ROLES[id]||{}).name||"?"; }
function roleColor(id){ return (ROLES[id]||{}).color||"#ffffff"; }
function rankName(n){ return RANKS[Math.max(1,Math.min(3,n|0))]; }

// Weight of a role in the brood: seniority counts, headcount counts, and
// both saturate — an enormous brood should not trivialise the escort.
function broodWeight(roleId){
  let w=0;
  for(const m of roster.members) if(m.role===roleId) w+=Math.max(1,m.rank|0);
  return w;
}
// 0..3, and the steps get further apart on purpose
function broodTier(roleId){
  const w=broodWeight(roleId);
  return w>=15?3:(w>=8?2:(w>=3?1:0));
}

// ─── THE BROOD SCREEN ─────────────────────────────────────────
// A wall of names at base. It sells nothing and it costs nothing — it is
// the trophy cabinet, and the reason a panicking hatchling is worth turning
// around for.
let broodScroll=0;
let broodTab=0;                 // 0 = the living, 1 = the fallen
function openBrood(){ STATE="brood"; stateTimer=0; broodScroll=0; broodTab=0; }
function broodPages(){ return broodTab===0?roster.members:(roster.fallen||[]); }
function broodTabButton(i){ return {x:40+i*130, y:H-52, w:120, h:32}; }
function closeBrood(){ STATE="map"; stateTimer=0; }
function broodBackButton(){ return {x:W-132, y:H-52, w:110, h:34}; }
function mapBroodButton(){ return {x:W-150, y:H-102, w:128, h:36}; }

let broodTabKeyWasDown=false;
function setBroodTab(i){
  if(i===broodTab) return;
  broodTab=i; broodScroll=0;
  playPew();
}
function updateBrood(dt){
  stateTimer+=dt;
  updateParticles(dt);
  const rows=Math.max(0,broodPages().length-BROOD_ROWS*BROOD_COLS);
  if(K["ArrowDown"]||K["KeyS"]) broodScroll=Math.min(rows,broodScroll+dt*6);
  if(K["ArrowUp"]||K["KeyW"])   broodScroll=Math.max(0,broodScroll-dt*6);
  const lr=(K["ArrowLeft"]||K["KeyA"])?0:((K["ArrowRight"]||K["KeyD"])?1:-1);
  if(lr>=0&&!broodTabKeyWasDown) setBroodTab(lr);
  broodTabKeyWasDown=lr>=0;
  if(K["Escape"]||K["Backspace"]){ K["Escape"]=false; K["Backspace"]=false; closeBrood(); }
}

const BROOD_COLS=2, BROOD_ROWS=4, BROOD_CARD_W=390, BROOD_CARD_H=72;
function drawBrood(){
  const g=ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,"#04080c"); g.addColorStop(0.6,"#0a1418"); g.addColorStop(1,"#0d1016");
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);

  ctx.textAlign="left";
  glow("#8effc9",14);
  ctx.font="bold 26px 'Courier New',monospace";
  ctx.fillStyle="#dfffe9";
  ctx.fillText("SOY",40,58);
  noGlow();
  ctx.font="bold 11px 'Courier New',monospace";
  ctx.fillStyle="#7d99a0";
  ctx.fillText("ÜSSE VARANLAR — KALICI",40,76);

  // the tally, including the one number nobody wants to grow
  ctx.textAlign="right";
  ctx.font="bold 20px 'Courier New',monospace";
  ctx.fillStyle="#8effc9";
  ctx.fillText(String(roster.members.length),W-150,58);
  ctx.font="bold 9px 'Courier New',monospace";
  ctx.fillStyle="#7d99a0";
  ctx.fillText("KURTARILDI",W-150,72);
  ctx.font="bold 20px 'Courier New',monospace";
  ctx.fillStyle=roster.lost>0?"#ff5577":"#3a4a52";
  ctx.fillText(String(roster.lost),W-40,58);
  ctx.font="bold 9px 'Courier New',monospace";
  ctx.fillStyle="#7d99a0";
  ctx.fillText("KAYIP",W-40,72);
  ctx.textAlign="left";

  // what the brood gives back, by role
  let rx=40;
  for(const id of ROLE_IDS){
    const tier=broodTier(id);
    ctx.font="bold 11px 'Courier New',monospace";
    ctx.fillStyle=tier>0?roleColor(id):"#3a4a52";
    ctx.fillText(roleName(id),rx,100);
    for(let i=0;i<3;i++){
      ctx.fillStyle=i<tier?roleColor(id):"rgba(255,255,255,0.10)";
      ctx.fillRect(rx+i*13,108,9,6);
    }
    rx+=150;
  }

  const page=broodPages();
  const fallenTab=broodTab===1;
  if(!page.length){
    ctx.textAlign="center";
    ctx.font="bold 14px 'Courier New',monospace";
    ctx.fillStyle="#5b7078";
    ctx.fillText(fallenTab?"Kimse geride kalmadı."
                          :"Henüz kimse üsse varmadı.",W/2,H/2);
    ctx.font="12px 'Courier New',monospace";
    ctx.fillText(fallenTab?"Böyle kalsın."
                          :"Bir kafes kır ve yavruyu yarığa kadar götür.",W/2,H/2+22);
    ctx.textAlign="left";
  } else {
    const top=126, skip=Math.floor(broodScroll)*BROOD_COLS;
    for(let i=0;i<BROOD_ROWS*BROOD_COLS;i++){
      const m=page[skip+i];
      if(!m) break;
      const cx=40+(i%BROOD_COLS)*(BROOD_CARD_W+18);
      const cy=top+Math.floor(i/BROOD_COLS)*(BROOD_CARD_H+8);
      ctx.fillStyle=fallenTab?"rgba(255,85,119,0.05)":"rgba(255,255,255,0.04)";
      ctx.fillRect(cx,cy,BROOD_CARD_W,BROOD_CARD_H);
      ctx.fillStyle=fallenTab?"#ff5577":roleColor(m.role);
      ctx.fillRect(cx,cy,3,BROOD_CARD_H);

      ctx.font="bold 14px 'Courier New',monospace";
      ctx.fillStyle=fallenTab?"#ffc2ce":"#e6f6ee";
      ctx.fillText(m.name,cx+12,cy+19);
      ctx.font="bold 9px 'Courier New',monospace";
      ctx.fillStyle=fallenTab?"#a8707f":roleColor(m.role);
      ctx.fillText(fallenTab?roleName(m.role)
                            :(roleName(m.role)+" · "+rankName(m.rank)),cx+12,cy+32);
      ctx.textAlign="right";
      ctx.fillStyle="#5b7078";
      ctx.fillText(m.where||"",cx+BROOD_CARD_W-10,cy+19);
      ctx.textAlign="left";

      // the sentence: wrapped, because it is generated rather than
      // hand-written to a width the way the radio's lines are
      if(m.deed){
        const lines=wrapText(m.deed,BROOD_CARD_W-24,"11px 'Courier New',monospace");
        ctx.fillStyle=fallenTab?"#c99aa6":"#9fd8bd";
        for(let k=0;k<Math.min(2,lines.length);k++)
          ctx.fillText(lines[k],cx+12,cy+48+k*13);
      }
    }
  }

  // the two tabs
  for(let i=0;i<2;i++){
    const tb=broodTabButton(i);
    const on=broodTab===i;
    ctx.fillStyle=on?(i?"rgba(255,85,119,0.16)":"rgba(142,255,201,0.14)")
                    :"rgba(255,255,255,0.04)";
    ctx.fillRect(tb.x,tb.y,tb.w,tb.h);
    ctx.strokeStyle=on?(i?"#ff5577":"#8effc9"):"#3a4a52"; ctx.lineWidth=on?2:1;
    ctx.strokeRect(tb.x+0.5,tb.y+0.5,tb.w-1,tb.h-1);
    ctx.textAlign="center";
    ctx.font="bold 11px 'Courier New',monospace";
    ctx.fillStyle=on?(i?"#ffc2ce":"#dfffe9"):"#6b8088";
    ctx.fillText((i?"KAYIP ":"SOY ")+(i?(roster.fallen||[]).length
                                        :roster.members.length),
                 tb.x+tb.w/2,tb.y+20);
    ctx.textAlign="left";
  }

  const b=broodBackButton();
  ctx.fillStyle="rgba(255,255,255,0.06)";
  ctx.fillRect(b.x,b.y,b.w,b.h);
  ctx.strokeStyle="#7d99a0"; ctx.lineWidth=1;
  ctx.strokeRect(b.x+0.5,b.y+0.5,b.w-1,b.h-1);
  ctx.textAlign="center";
  ctx.font="bold 12px 'Courier New',monospace";
  ctx.fillStyle="#c8e4d8";
  ctx.fillText("HARİTA",b.x+b.w/2,b.y+22);
  ctx.font="bold 10px 'Courier New',monospace";
  ctx.fillStyle="#4e6169";
  ctx.fillText(touchMode?"SEKMEYE DOKUN":"←→ SEKME    ↑↓ KAYDIR    ESC: HARİTA",
               W/2,H-14);
  ctx.textAlign="left";
}
