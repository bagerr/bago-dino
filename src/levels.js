// Biomes, the stage table and the world map data
// Part of NEON DINO-AGE: RESCUE PROTOCOL. Loaded as a classic
// script, in the order index2.html lists — these files share one
// global scope on purpose and are not modules.

// ─── LEVEL GEOMETRY ─────────────────────────────────────────
// Platforms: {x,y,w,h,lavaPit?,goal?}
const GROUND_Y = 430;
const LAVA_Y = GROUND_Y + 40;

// Three hand-authored stages, escalating in length and pressure. EVERYTHING
// that differs between stages lives in this table — loadLevel() rebuilds all
// the live entity arrays from it, so no other system needs to know which
// stage is running. Only the final stage carries a boss; stages 1 and 2 end
// at an open exit portal instead.
// Every stage names a biome, and the liquid in the pits, the backdrop and
// the platform surface all read off it. A new biome is a new entry here plus
// its art, not a new branch in six draw functions.
const THEMES={
  // portalArt names a biome's own rift. A free-floating vortex spins; a
  // built gate does not — the canopy's portal is a stone arch wrapped in
  // vines, and rotating it would read as the masonry tumbling.
  volcano:{ liquid:["#ff6a00","#d02800","#4a0400"], surface:"#ffaa33",
            glow:"#ff7700", haze:"255,125,30",
            spark:["#ff8800","#ffcc00","#ff4400"],
            portalArt:null, portalSpin:true,
            portalBloom:["130,225,255","95,60,225"], portalMote:"#7dffcf" },
  forest: { liquid:["#10b981","#047857","#022c22"], surface:"#6ee7b7",
            glow:"#10b981", haze:"16,185,129",
            spark:["#6ee7b7","#34d399","#a7f3d0"],
            portalArt:"forest_portal.png", portalSpin:false,
            portalBloom:["110,255,180","40,180,120"], portalMote:"#a7f3d0",
            bg:"forest_bg.png", bgTint:["rgba(2,12,8,0.45)","4,24,14","6,40,24","2,20,12"],
            cap:{art:"forest_ground.png", x:150,w:540,
                 tuftY:348, top:426, bodyEnd:1065, hangY:1074, hangEnd:1170,
                 tile:96, tuftPx:13, hangPx:30} },
  // Frozen Peaks. The pit is liquid nitrogen rather than lava, the shelves
  // are ice (see slipFactor), and the ceiling drops on you.
  ice:    { liquid:["#6fd7ff","#2b7fb8","#0a2740"], surface:"#dff6ff",
            glow:"#7dd3fc", haze:"125,211,252",
            spark:["#dff6ff","#7dd3fc","#bae6fd"],
            portalArt:null, portalSpin:true,
            portalBloom:["150,225,255","70,140,255"], portalMote:"#bae6fd",
            bg:"ice_bg.png", bgTint:["rgba(4,10,22,0.38)","6,16,34","10,30,60","4,10,24"],
            cap:{art:"ice_ground.png", x:300,w:424,
                 tuftY:286, top:310, bodyEnd:560, hangY:620, hangEnd:900,
                 tile:104, tuftPx:10, hangPx:34},
            slip:true, snow:true, pitSpikes:true },
};
function levelTheme(){ return (LEVELS[levelIndex]&&LEVELS[levelIndex].theme)||"volcano"; }
function themeOf(){ return THEMES[levelTheme()]||THEMES.volcano; }
function isForest(){ return levelTheme()==="forest"; }
function isIce(){ return levelTheme()==="ice"; }
// a biome with a `cap` entry paints its platforms from a single block sheet
function capSpec(){ return themeOf().cap||null; }

const LEVELS = [
  { // ── STAGE 1 — Ember Path (gentle intro: one wide gap, no forced fight)
    name:"EMBER PATH", theme:"volcano",
    width:1300,
    platforms:[
      {x:-200,y:GROUND_Y,w:520,h:76},
      {x:320, y:GROUND_Y,w:110,h:76,lavaPit:true},
      {x:430, y:GROUND_Y,w:330,h:76},
      {x:760, y:GROUND_Y,w:90, h:76,lavaPit:true},
      {x:850, y:GROUND_Y,w:450,h:76},
      {x:180, y:340,w:120,h:18},
      {x:480, y:320,w:110,h:18},
      {x:640, y:260,w:120,h:18},
      {x:900, y:300,w:120,h:18},
      {x:1120,y:350,w:140,h:18,goal:true},
    ],
    lavaPits:[{x:320,w:110},{x:760,w:90}],
    crystals:[{x:1000,y:370},{x:1040,y:380}],
    coins:()=>[
      ...coinArcOver(180,340,120,4),
      ...coinArcOver(480,320,110,4),
      ...coinArcOver(640,260,120,5),
      ...coinArcOver(900,300,120,4),
      ...coinArc(300,330,440,330,4,50),   // over the lava gaps
      ...coinArc(755,330,860,330,4,45),
    ],
    flyers:[
      {x:520,y:170,patrol:[420,720], spd:70},
      {x:920,y:150,patrol:[820,1180],spd:80},
    ],
    grounders:[{platX:430,platW:330,spd:55}],
    powerBoxes:[{x:480,y:270},{x:900,y:250}],
    weapons:[{x:250,y:300,kind:"spread"}],
    // three captives per stage — the debrief tallies X / 3
    cages:[{x:240,y:318},{x:640,y:238},{x:960,y:278}],
    escapeLine:"EMBER PATH TAHLİYE EDİLDİ",
    checkpoint:620, parTime:60,
    arena:null,
    boss:{x:1050,triggerX:900,hp:7,kind:"flyer",w:130,h:82,
          sprite:"boss_stage1.png", rageSprite:"boss_stage1_rage.png",
          name:"SİKLON", title:"EMBER PATH DEVRİYESİ"},
  },
  { // ── STAGE 2 — Magma Bridge (three gaps + a forced arena wave)
    name:"MAGMA BRIDGE", theme:"volcano",
    width:1700,
    platforms:[
      {x:-200,y:GROUND_Y,w:500,h:76},
      {x:300, y:GROUND_Y,w:120,h:76,lavaPit:true},
      {x:420, y:GROUND_Y,w:280,h:76},
      {x:700, y:GROUND_Y,w:120,h:76,lavaPit:true},
      {x:820, y:GROUND_Y,w:300,h:76},
      {x:1120,y:GROUND_Y,w:100,h:76,lavaPit:true},
      {x:1220,y:GROUND_Y,w:480,h:76},
      {x:150, y:330,w:110,h:18},
      {x:460, y:290,w:110,h:18},
      {x:720, y:250,w:120,h:18},
      {x:960, y:290,w:110,h:18},
      {x:1180,y:240,w:130,h:18},
      {x:1520,y:350,w:140,h:18,goal:true},
    ],
    lavaPits:[{x:300,w:120},{x:700,w:120},{x:1120,w:100}],
    crystals:[{x:1300,y:370},{x:1350,y:380},{x:1400,y:360}],
    coins:()=>[
      ...coinArcOver(150,330,110,4),
      ...coinArcOver(460,290,110,4),
      ...coinArcOver(720,250,120,5),
      ...coinArcOver(960,290,110,4),
      ...coinArcOver(1180,240,130,5),
      ...coinArc(285,330,430,330,4,55),
      ...coinArc(690,330,830,330,4,55),
      ...coinArc(1110,330,1230,330,4,50),
    ],
    flyers:[
      {x:500, y:170,patrol:[400,700],  spd:80},
      {x:820, y:140,patrol:[700,1100], spd:90},
      {x:1250,y:160,patrol:[1150,1500],spd:85},
    ],
    grounders:[{platX:420,platW:280,spd:60},{platX:820,platW:300,spd:65}],
    powerBoxes:[{x:460,y:240},{x:960,y:240},{x:1180,y:190}],
    weapons:[{x:720,y:200,kind:"spread"},{x:1350,y:300,kind:"rocket"}],
    cages:[{x:205,y:308},{x:960,y:268},{x:1180,y:218}],
    escapeLine:"MAGMA KÖPRÜSÜ GERİDE BIRAKILDI",
    // past the arena band: dying to the wave should not replay the run-up
    checkpoint:1260, parTime:80,
    boss:{x:1450,triggerX:1300,hp:10,kind:"walker",w:150,h:148,
          sprite:"boss_stage2.png",
          name:"MAGMA YÜRÜYÜCÜ", title:"KÖPRÜNÜN AĞIR ZIRHI"},
    arena:{start:700,end:1150},
  },
  { // ── STAGE 3 — Volcano Core (longest gauntlet, then the Alpha boss)
    name:"VOLCANO CORE", theme:"volcano",
    width:1800,
    platforms:[
      {x:-200,y:GROUND_Y,w:480,h:76},
      {x:280, y:GROUND_Y,w:120,h:76,lavaPit:true},
      {x:400, y:GROUND_Y,w:240,h:76},
      {x:640, y:GROUND_Y,w:120,h:76,lavaPit:true},
      {x:760, y:GROUND_Y,w:260,h:76},
      {x:1020,y:GROUND_Y,w:110,h:76,lavaPit:true},
      {x:1130,y:GROUND_Y,w:670,h:76},
      {x:140, y:320,w:100,h:18},
      {x:430, y:280,w:100,h:18},
      {x:690, y:240,w:110,h:18},
      {x:880, y:290,w:100,h:18},
      {x:1150,y:250,w:120,h:18},
      {x:1380,y:300,w:120,h:18},
      {x:1620,y:350,w:140,h:18,goal:true},
    ],
    lavaPits:[{x:280,w:120},{x:640,w:120},{x:1020,w:110}],
    crystals:[{x:1450,y:370},{x:1500,y:380},{x:1550,y:360}],
    coins:()=>[
      ...coinArcOver(140,320,100,4),
      ...coinArcOver(430,280,100,4),
      ...coinArcOver(690,240,110,5),
      ...coinArcOver(880,290,100,4),
      ...coinArcOver(1150,250,120,5),
      ...coinArcOver(1380,300,120,4),
      ...coinArc(265,330,410,330,4,60),
      ...coinArc(630,330,770,330,4,60),
      ...coinArc(1010,330,1140,330,4,55),
    ],
    flyers:[
      {x:450, y:170,patrol:[350,650],  spd:85},
      {x:750, y:140,patrol:[650,1000], spd:95},
      {x:950, y:160,patrol:[850,1150], spd:90},
      {x:1300,y:150,patrol:[1200,1550],spd:100},
    ],
    grounders:[{platX:400,platW:240,spd:60},{platX:760,platW:260,spd:70},{platX:1130,platW:670,spd:65}],
    powerBoxes:[{x:430,y:230},{x:820,y:240},{x:1250,y:200}],
    weapons:[{x:690,y:190,kind:"flame"},{x:1250,y:160,kind:"spread"},{x:1460,y:255,kind:"rocket"}],
    cages:[{x:480,y:258},{x:880,y:268},{x:1150,y:228}],
    escapeLine:"VOLKAN ÇEKİRDEĞİNDEN KAÇILDI",
    // past the arena, short of BOSS_TRIGGER_X — a death to the Alpha resumes
    // on the approach instead of at the start of the stage
    checkpoint:1200, parTime:100,
    arena:{start:600,end:1100},
    boss:{x:1450,triggerX:1380,hp:12,kind:"flyer",w:140,h:100,
          sprite:"enemyboss.png",
          name:"ALFA PTERODACTYL", title:"VOLKAN ÇEKİRDEĞİNİN BEKÇİSİ"},
  },
  { // ── STAGE 4 — Spore Walk (the Toxic Canopy's first stage)
    // No boss and no new enemy types yet: this stage exists to carry the
    // forest biome's backdrop, platform surface and acid pits. Its exit
    // portal is open from the start (boss:null), so it plays as traversal.
    name:"SPORE WALK", theme:"forest",
    width:1400,
    platforms:[
      {x:-200,y:GROUND_Y,w:540,h:76},
      {x:340, y:GROUND_Y,w:120,h:76,lavaPit:true},
      {x:460, y:GROUND_Y,w:300,h:76},
      {x:760, y:GROUND_Y,w:110,h:76,lavaPit:true},
      {x:870, y:GROUND_Y,w:530,h:76},
      {x:170, y:330,w:120,h:18},
      {x:470, y:300,w:120,h:18},
      {x:660, y:250,w:130,h:18},
      {x:930, y:290,w:120,h:18},
      {x:1180,y:340,w:150,h:18,goal:true},
    ],
    lavaPits:[{x:340,w:120},{x:760,w:110}],
    crystals:[{x:1060,y:370},{x:1100,y:380}],
    coins:()=>[
      ...coinArcOver(170,330,120,4),
      ...coinArcOver(470,300,120,4),
      ...coinArcOver(660,250,130,5),
      ...coinArcOver(930,290,120,4),
      ...coinArc(325,330,470,330,4,55),
      ...coinArc(750,330,880,330,4,50),
    ],
    // the canopy's own fauna — same arrays, different species
    flyers:[
      {x:540,y:150,patrol:[430,780], spd:70,species:"forest_flyer"},
      {x:980,y:140,patrol:[860,1300],spd:80,species:"forest_flyer"},
    ],
    grounders:[
      {platX:460,platW:300,spd:52,species:"forest_crawler"},
      {platX:870,platW:530,spd:58,species:"forest_crawler"},
      {fixed:{x:300,y:GROUND_Y},species:"forest_plant"},
      {fixed:{x:1090,y:GROUND_Y},species:"forest_plant"},
      {fixed:{x:725,y:250},species:"forest_plant"},
    ],
    powerBoxes:[{x:470,y:250},{x:930,y:240}],
    weapons:[{x:260,y:300,kind:"spread"},{x:1000,y:210,kind:"flame"}],
    // one hostage in this stage, and it is a triceratops
    cages:[{x:700,y:228,species:"trike"}],
    escapeLine:"ZEHİRLİ ÇATIDAN ÇIKILDI",
    checkpoint:700, parTime:70,
    arena:null,
    boss:null,
  },
  { // ── STAGE 5 — Canopy Climb (the canopy's vertical half)
    // The first stage that goes UP. camRise lets the view follow, the route
    // is a zig-zag of mushroom shelves, and two vines carry you over the
    // widest gap — a released swing goes further than any jump.
    name:"CANOPY CLIMB", theme:"forest",
    width:1200,
    camRise:300,
    // A bouncy cap is only worth anything if the sky above it is clear: the
    // first draft put one directly under a shelf, so every bounce ended in a
    // bonk on its underside and the cap did nothing at all. Both caps here
    // stand in an open column, and both have a landing ledge inside the arc.
    platforms:[
      {x:-200,y:GROUND_Y,w:420,h:76},
      {x:220, y:GROUND_Y,w:140,h:76,lavaPit:true},
      {x:360, y:GROUND_Y,w:220,h:76},
      {x:580, y:GROUND_Y,w:160,h:76,lavaPit:true},
      {x:740, y:GROUND_Y,w:460,h:76},

      // the opening launcher: nothing above it all the way to the ceiling
      {x:10,  y:398,w:90, h:16,bounce:true},

      // the staircase — ~48px rungs with 30-40px gaps, so it is a rhythm
      // rather than a series of committed leaps
      {x:110, y:352,w:110,h:18},
      {x:250, y:300,w:100,h:18,crumble:true},
      {x:390, y:254,w:100,h:18},
      {x:500, y:206,w:100,h:18,crumble:true},

      // the vine crossing: 258px of open air, wider than any jump, with a
      // launcher below it and a net under the vines so a miss is not a death
      {x:608, y:400,w:96, h:16,bounce:true},
      {x:716, y:300,w:90, h:18},

      {x:858, y:128,w:110,h:18},
      {x:1020,y:92, w:150,h:18,goal:true},
    ],
    lavaPits:[{x:220,w:140},{x:580,w:160}],
    vines:[{x:718,y:70,len:145},{x:800,y:62,len:152}],
    crystals:[{x:900,y:370},{x:940,y:380}],
    coins:()=>[
      ...coinArcOver(110,352,110,4),
      ...coinArcOver(250,300,100,4),
      ...coinArcOver(390,254,100,4),
      ...coinArcOver(500,206,100,4),
      ...coinArcOver(716,300,90,3),
      ...coinArcOver(858,128,110,4),
      ...coinArc(620,300,850,300,5,90),   // the swing's own arc
    ],
    flyers:[{x:520,y:150,patrol:[380,860],spd:72,species:"forest_flyer"}],
    grounders:[
      {fixed:{x:420,y:GROUND_Y},species:"forest_plant"},
      {platX:740,platW:460,spd:54,species:"forest_crawler"},
    ],
    powerBoxes:[{x:390,y:204},{x:858,y:78}],
    weapons:[{x:165,y:302,kind:"spread"},{x:760,y:250,kind:"seed"}],
    cages:[{x:913,y:106,species:"trike"}],
    escapeLine:"KANOPİNİN TEPESİNE ÇIKILDI",
    checkpoint:700, parTime:90,
    arena:null,
    // the canopy's finale, waiting at the top of the climb
    boss:{x:1010,triggerX:900,hp:14,kind:"flyer",w:150,h:112,
          sprite:"boss_forest.png", summons:"forest_flyer",
          name:"KANOPİ KRALİÇESİ", title:"ZEHİRLİ ÇATININ ANASI"},
  },
  { // ── STAGE 6 — Rotwood Rise (the canopy's pressure stage)
    // The rot rises behind you. There is no way to fight it and no way to
    // wait it out: the only answer is to keep climbing. A vine curtain seals
    // the high route until you burn it, which is the first time a weapon
    // letter is a key rather than a damage number.
    name:"ROTWOOD RISE", theme:"forest",
    width:1100,
    camRise:320,
    fog:{startY:GROUND_Y+130, topY:150, rise:8},
    platforms:[
      {x:-200,y:GROUND_Y,w:480,h:76},
      {x:280, y:GROUND_Y,w:140,h:76,lavaPit:true},
      {x:420, y:GROUND_Y,w:680,h:76},
      {x:140, y:350,w:110,h:18},
      {x:330, y:300,w:100,h:18,crumble:true},
      {x:500, y:255,w:110,h:18},
      {x:520, y:120,w:24, h:132,curtain:true},
      {x:660, y:210,w:110,h:18,crumble:true},
      {x:820, y:165,w:110,h:18},
      {x:950, y:110,w:140,h:18,goal:true},
    ],
    lavaPits:[{x:280,w:140}],
    vines:[{x:620,y:60,len:120}],
    crystals:[{x:760,y:370},{x:800,y:380}],
    coins:()=>[
      ...coinArcOver(140,350,110,4),
      ...coinArcOver(330,300,100,4),
      ...coinArcOver(500,255,110,4),
      ...coinArcOver(660,210,110,4),
      ...coinArcOver(820,165,110,4),
    ],
    flyers:[{x:600,y:150,patrol:[460,900],spd:76,species:"forest_flyer"}],
    grounders:[
      {fixed:{x:470,y:GROUND_Y},species:"forest_plant"},
      {platX:420,platW:680,spd:56,species:"forest_crawler"},
    ],
    powerBoxes:[{x:500,y:205},{x:820,y:115}],
    // the flame comes BEFORE the curtain on purpose
    weapons:[{x:200,y:300,kind:"flame"},{x:700,y:160,kind:"seed"}],
    cages:[{x:875,y:143,species:"trike"}],
    escapeLine:"ÇÜRÜME SUYUNDAN KAÇILDI",
    checkpoint:600, parTime:95,
    arena:null,
    boss:null,
  },
  { // ── STAGE 7 — Glacier Summit (Frozen Peaks)
    // Ice takes your grip away, the ceiling is loaded, and the hostage is
    // frozen into a block that only FLAME opens. The Titan waits at the end.
    name:"GLACIER SUMMIT", theme:"ice",
    width:1600,
    platforms:[
      {x:-200,y:GROUND_Y,w:520,h:76},
      {x:320, y:GROUND_Y,w:130,h:76,lavaPit:true},
      {x:450, y:GROUND_Y,w:320,h:76},
      {x:770, y:GROUND_Y,w:140,h:76,lavaPit:true},
      {x:910, y:GROUND_Y,w:690,h:76},
      {x:150, y:344,w:120,h:18},
      {x:470, y:300,w:120,h:18},
      {x:660, y:250,w:120,h:18},
      {x:900, y:296,w:120,h:18},
      {x:1130,y:250,w:120,h:18},
      {x:1420,y:344,w:160,h:18,goal:true},
    ],
    lavaPits:[{x:320,w:130},{x:770,w:140}],
    // the loaded ceiling
    icicles:[{x:250,y:70},{x:400,y:60},{x:560,y:72},{x:700,y:58},
             {x:850,y:70},{x:1000,y:62},{x:1150,y:72},{x:1290,y:60}],
    crystals:[{x:1240,y:370},{x:1290,y:380}],
    coins:()=>[
      ...coinArcOver(150,344,120,4),
      ...coinArcOver(470,300,120,4),
      ...coinArcOver(660,250,120,5),
      ...coinArcOver(900,296,120,4),
      ...coinArcOver(1130,250,120,5),
      ...coinArc(305,330,460,330,4,55),
      ...coinArc(760,330,920,330,4,55),
    ],
    flyers:[
      {x:520,y:160,patrol:[420,780], spd:78,species:"ice_flyer"},
      {x:1000,y:150,patrol:[900,1340],spd:86,species:"ice_flyer"},
    ],
    grounders:[
      {platX:450,platW:320,spd:44,species:"ice_crusher"},
      {platX:910,platW:690,spd:48,species:"ice_crusher"},
    ],
    powerBoxes:[{x:470,y:250},{x:1130,y:200}],
    // the flame has to come before the frozen hostage
    weapons:[{x:230,y:300,kind:"flame"},{x:700,y:250,kind:"freeze"},
             {x:980,y:250,kind:"spread"}],
    cages:[{x:1190,y:226,species:"frozen"}],
    escapeLine:"BUZ ZİRVELERİNDEN İNİLDİ",
    checkpoint:1050, parTime:110,
    arena:{start:1000,end:1380},
    boss:{x:1330,triggerX:1240,hp:15,kind:"titan",w:172,h:132,
          sprite:"boss_frozen.png", summons:"ice_flyer",
          name:"BUZUL TİTANI", title:"ZİRVENİN SON BEKÇİSİ"},
  },
  { // ── STAGE 8 — Whiteout Ridge (Frozen Peaks, the approach)
    // Built around the wind. The two pits are narrow enough to clear from a
    // standstill and the ledges between them are wide, because the stage's
    // question is not "can you make this jump" but "are you standing
    // somewhere you can afford to be pushed from when the gust lands".
    name:"WHITEOUT RIDGE", theme:"ice",
    width:1500,
    wind:{speed:175, rate:1.9, warn:1.0, blow:2.0, calmMin:3.2, calmMax:5},
    platforms:[
      {x:-200,y:GROUND_Y,w:540,h:76},
      {x:340, y:GROUND_Y,w:140,h:76,lavaPit:true},
      // a frozen pond laid over the first cryo pit: it holds you for a
      // second, cracks, and then there is nothing under you at all
      {x:340, y:GROUND_Y,w:140,h:76,crack:true},
      {x:480, y:GROUND_Y,w:280,h:76},
      {x:760, y:GROUND_Y,w:150,h:76,lavaPit:true},
      {x:910, y:GROUND_Y,w:590,h:76},
      // a shelf hanging the full height of the cave. There is no way over it
      // and no way through it standing up — the only way past is flat out.
      {x:1120,y:60, w:76, h:338,lowBar:true},
      {x:150, y:348,w:130,h:18},
      {x:440, y:300,w:140,h:18},
      {x:700, y:252,w:140,h:18},
      {x:960, y:300,w:140,h:18},
      {x:1190,y:252,w:130,h:18},
      {x:1350,y:346,w:150,h:18,goal:true},
    ],
    lavaPits:[{x:340,w:140},{x:760,w:150}],
    icicles:[{x:300,y:66},{x:520,y:58},{x:780,y:70},{x:1020,y:60},{x:1240,y:68}],
    crystals:[{x:1080,y:370},{x:1130,y:380}],
    coins:()=>[
      ...coinArcOver(150,348,130,4),
      ...coinArcOver(440,300,140,5),
      ...coinArcOver(700,252,140,5),
      ...coinArcOver(960,300,140,5),
      ...coinArcOver(1190,252,130,4),
      ...coinArc(325,330,495,330,4,60),
      ...coinArc(745,330,925,330,4,60),
    ],
    flyers:[
      {x:560,y:150,patrol:[440,880], spd:74,species:"ice_flyer"},
      {x:1060,y:142,patrol:[930,1300],spd:82,species:"ice_flyer"},
    ],
    grounders:[
      {platX:480,platW:280,spd:42,species:"ice_crusher"},
      {platX:910,platW:190,spd:46,species:"ice_crusher"},
    ],
    powerBoxes:[{x:440,y:250},{x:1190,y:202}],
    // the flame is the last letter before the frozen hostage, on purpose:
    // nothing else thaws a block of ice
    weapons:[{x:210,y:306,kind:"freeze"},{x:740,y:210,kind:"rocket"},
             {x:1000,y:258,kind:"flame"}],
    cages:[{x:1250,y:226,species:"frozen"}],
    escapeLine:"TİPİNİN İÇİNDEN GEÇİLDİ",
    checkpoint:960, parTime:105,
    arena:null,
    boss:null,
  },
  { // ── STAGE 9 — Crevasse Run (Frozen Peaks, the middle)
    // The ridge taught the wind and the summit has the Titan; this one is
    // about the floor. A single long crevasse is bridged by nothing but
    // three frozen ponds laid end to end, and each one starts cracking the
    // moment you stand on it — so the crossing is a rhythm, not a walk. The
    // wind is gentler here on purpose: the ponds are pressure enough.
    name:"CREVASSE RUN", theme:"ice",
    width:1700,
    wind:{speed:140, rate:1.7, warn:1.0, blow:1.6, calmMin:4, calmMax:6},
    platforms:[
      {x:-200,y:GROUND_Y,w:560,h:76},
      {x:360, y:GROUND_Y,w:150,h:76,lavaPit:true},
      {x:510, y:GROUND_Y,w:190,h:76},
      // the crevasse itself — 460px of nothing, and the only floor over it
      // is three ponds that will not hold
      {x:700, y:GROUND_Y,w:460,h:76,lavaPit:true},
      {x:700, y:GROUND_Y,w:153,h:76,crack:true},
      {x:853, y:GROUND_Y,w:153,h:76,crack:true},
      {x:1006,y:GROUND_Y,w:154,h:76,crack:true},
      {x:1160,y:GROUND_Y,w:540,h:76},
      {x:120, y:348,w:130,h:18},
      {x:420, y:300,w:130,h:18},
      // a shelf you can go over OR under: the slide is the short way, the
      // ledge at 420 is the long one
      {x:560, y:250,w:76, h:148,lowBar:true},
      {x:640, y:250,w:120,h:18},
      // the high road over the crevasse — slower, and it costs you the coins
      {x:900, y:210,w:120,h:18},
      {x:1200,y:300,w:140,h:18},
      // and one that is a gate, not a choice
      {x:1400,y:60, w:76, h:338,lowBar:true},
      {x:1500,y:250,w:130,h:18},
      {x:1560,y:346,w:140,h:18,goal:true},
    ],
    lavaPits:[{x:360,w:150},{x:700,w:460}],
    icicles:[{x:300,y:66},{x:560,y:58},{x:800,y:70},
             {x:1000,y:60},{x:1250,y:68},{x:1520,y:62}],
    crystals:[{x:1250,y:370},{x:1300,y:380}],
    coins:()=>[
      ...coinArcOver(120,348,130,4),
      ...coinArcOver(420,300,130,4),
      ...coinArcOver(640,250,120,4),
      ...coinArcOver(1200,300,140,5),
      ...coinArcOver(1500,250,130,4),
      // strung across the ponds, so the greedy line is the low one
      ...coinArc(720,384,1140,384,7,26),
    ],
    flyers:[
      {x:640,y:150,patrol:[520,900],  spd:76,species:"ice_flyer"},
      {x:1250,y:150,patrol:[1170,1330],spd:84,species:"ice_flyer"},
    ],
    grounders:[
      {platX:510, platW:190,spd:44,species:"ice_crusher"},
      {platX:1160,platW:160,spd:46,species:"ice_crusher"},
    ],
    powerBoxes:[{x:420,y:250},{x:900,y:160}],
    // the flame is the last letter before the frozen hostage
    weapons:[{x:200,y:300,kind:"freeze"},{x:900,y:168,kind:"spread"},
             {x:1220,y:250,kind:"flame"}],
    cages:[{x:1520,y:224,species:"frozen"}],
    escapeLine:"YARIKTAN SAĞ ÇIKILDI",
    // past the arena band, same as every other stage with a wave
    checkpoint:1480, parTime:120,
    arena:{start:1160,end:1330},
    boss:null,
  },
];

// ─── WORLDS (the mission select map) ──────────────────────────
// A world owns a run of stages. Clearing the last stage of a world stamps it
// on the map and unlocks the next one. mx/my are fractions of the canvas, so
// the map layout is resolution independent.
const WORLDS=[
  {id:"volcano", name:"VOLCANO CORE", sub:"LAV ÇEKİRDEĞİ",   levels:[0,1,2],
   mx:0.17, my:0.66, color:"#ff6a2a"},
  {id:"forest",  name:"TOXIC CANOPY", sub:"ZEHİRLİ ÇATI",    levels:[3,5,4],
   mx:0.40, my:0.33, color:"#10b981"},
  {id:"frozen",  name:"FROZEN PEAKS", sub:"DONMUŞ ZİRVELER", levels:[7,8,6],
   mx:0.63, my:0.62, color:"#7dd3fc"},
  {id:"cyber",   name:"CYBER CRATER", sub:"SİBER KRATER",    levels:[],
   mx:0.85, my:0.30, color:"#c084fc"},
];
let worldIndex=0;
let mapSel=0;
let mapStampTimer=0;      // the CLEARED stamp slamming down on arrival
let mapStampWorld=-1;
let mapKeyWasDown=false;

// progress survives a refresh
let worldProgress={};
try{ worldProgress=JSON.parse(localStorage.getItem("neonDinoWorlds")||"{}")||{}; }
catch(e){ worldProgress={}; }
function worldState(i){
  const w=WORLDS[i];
  const p=worldProgress[w.id]||{};
  // the first world is always open; the rest have to be earned. A world with
  // no stages yet can never be entered, however it is flagged.
  const unlocked = i===0 ? true : !!p.unlocked;
  return {unlocked, cleared:!!p.cleared, playable: unlocked && w.levels.length>0};
}
function saveWorlds(){
  try{ localStorage.setItem("neonDinoWorlds",JSON.stringify(worldProgress)); }catch(e){}
}
function markWorldCleared(i){
  const w=WORLDS[i];
  worldProgress[w.id]=Object.assign({},worldProgress[w.id],{unlocked:true,cleared:true});
  const next=WORLDS[i+1];
  if(next) worldProgress[next.id]=Object.assign({},worldProgress[next.id],{unlocked:true});
  saveWorlds();
}

// live level state — rebuilt by loadLevel()
let levelIndex = 0;                 // 0-based index into LEVELS
let levelWidth = LEVELS[0].width;
let platforms = [];
let lavaPits = [];
let crystals = [];
let stalactites = [];
