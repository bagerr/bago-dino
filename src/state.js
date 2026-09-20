// Camera, arena lock, continues, checkpoint, grade
// Part of NEON DINO-AGE: RESCUE PROTOCOL. Loaded as a classic
// script, in the order index2.html lists — these files share one
// global scope on purpose and are not modules.

// ─── CAMERA ─────────────────────────────────────────────────
// camX is the horizontal scroll, subtracted at draw time as always. camY is
// how far the VIEW has lifted: the whole world pass is translated down by it
// in loop(), so nothing else in the file has to learn about vertical scroll.
// It only ever leaves zero on a stage that sets camRise, so every existing
// stage is bit-for-bit unchanged.
let camX = 0, camY = 0;
const CAM_LIFT_ANCHOR=300;   // the screen row the player is held near while climbing

// ─── ARENA LOCK (Metal Slug style mandatory wave) ─────────────
// per-stage now: stage 1 has no arena at all, so these are set by loadLevel()
let ARENA_X_START=0, ARENA_X_END=0, levelHasArena=false;
let cameraLock=false;
let arenaCleared=false;
let arenaBannerTimer=0; // "DANGER / DEFEND!"
let arenaGoTimer=0;     // blinking "GO! →"

// ─── BOSS INTRO (siren + WARNING! + descent) ──────────────────
// only the final stage has a boss; on stages 1-2 the exit portal is already open
let BOSS_TRIGGER_X=0, levelHasBoss=false;
let bossCardTimer=0;   // the named intro card, Sunset Riders style
let bossRageTimer=0;   // the "ÇILGINA DÖNDÜ" banner on the phase flip
let parriesThisLevel=0;
let bossIntroTriggered=false;
let warningBannerTimer=0;
let stageClearDelay=0; // counts down after the boss dies, then auto-wins

// ─── CONTINUES, CHECKPOINT, GRADE ─────────────────────────────
// The single biggest reason to close the tab was dying six minutes in and
// being sent back to stage 1. A continue costs one of three credits and
// resumes at the stage's checkpoint if it was reached.
const MAX_CONTINUES=3;
const CONTINUE_SECONDS=10;
let continuesLeft=MAX_CONTINUES;
let continueTimer=0;
let continueTickAt=0;          // last whole second announced, for the beep

let checkpointX=Infinity;      // world x of this stage's checkpoint
let checkpointUsed=false;      // has it been passed this attempt?

// graded per stage, best kept in localStorage
let hitsThisLevel=0;
let levelTime=0;
let lastGrade="", lastGradeScore=0, lastGradeIsBest=false;
const GRADE_ORDER=["D","C","B","A","S"];
const GRADE_COLOR={S:"#ffee44",A:"#8effc9",B:"#7aa8ff",C:"#ffaa55",D:"#ff6677"};
let bestGrades={};
try{ bestGrades=JSON.parse(localStorage.getItem("neonDinoGrades")||"{}")||{}; }
catch(e){ bestGrades={}; }

// 40 points for the brood, 25 for the combo, 20 for taking no hits, 15 for
// beating par. Rescue is weighted hardest because that is the mission.
function computeGrade(){
  const L=LEVELS[levelIndex];
  const total=L.cages.length;
  const par=L.parTime||80;
  let pts=0;
  pts+=40*(total?rescuedThisLevel/total:1);
  pts+=25*Math.min(1,bestChainThisLevel/12);
  pts+=Math.max(0,20-hitsThisLevel*7);
  pts+=15*clamp(1-(levelTime-par)/par,0,1);
  const letter = pts>=90?"S" : pts>=75?"A" : pts>=60?"B" : pts>=40?"C" : "D";
  return {letter, pts:Math.round(pts)};
}
function recordGrade(letter){
  const prev=bestGrades[levelIndex];
  if(!prev || GRADE_ORDER.indexOf(letter)>GRADE_ORDER.indexOf(prev)){
    bestGrades[levelIndex]=letter;
    try{ localStorage.setItem("neonDinoGrades",JSON.stringify(bestGrades)); }catch(e){}
    return true;
  }
  return false;
}

// ─── STAGE PROGRESSION ────────────────────────────────────────
// Reaching the evacuation portal blacks the screen out into a mission
// debrief (STATE="report") instead of a bare score banner.
let reportTimer=0;
let lastRescueBonus=0;        // rescue payout shown on the debrief panel
let lastComboBonus=0;         // combo payout shown on the debrief panel
let bestChainThisLevel=0;     // highest chain reached in the current stage
let reportTypeEnd=0;          // when the typewriter finishes (set by the draw)
let reportTypeTick=0;
const REPORT_MIN=1.6;         // ENTER is ignored until the panel has read in
const REPORT_AUTO=14;         // ...and it rolls on by itself after this
