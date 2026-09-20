// The bank: what a mission was worth, and what survives it
// Part of NEON DINO-AGE: RESCUE PROTOCOL. Loaded as a classic
// script, in the order index2.html lists — these files share one
// global scope on purpose and are not modules.

// ─── THE BANK ─────────────────────────────────────────────────
// Coins used to be worth fifty points and nothing else, and points only ever
// fed a high-score line. They are a currency now.
//
// Two rules shape the whole thing.
//
// A coin is not banked when you pick it up — it is banked when you walk the
// squad into the rift. Everything you are carrying is at risk until then,
// which is what makes a full pouch a reason to be careful rather than a
// reason to be greedy. Losing the last heart still pays SALVAGE_FRAC of the
// haul, because a run that ends with literally nothing is the fastest way to
// make someone stop playing.
//
// And the payout is weighted by the GRADE, not by how many coins were on the
// floor. Coins are the floor of the payout; the brood, the chain and the
// clock are the rest of it. That is deliberate: if raw pickups paid best,
// the optimal way to play would be to farm the easiest stage forever. The
// first clear of a stage pays a bonus that a replay never pays again, for
// the same reason.
let bank = {coins:0, earned:0, firstClear:{}, up:{}};
try{
  const raw=localStorage.getItem("neonDinoBank");
  if(raw){
    const p=JSON.parse(raw);
    if(p && typeof p==="object"){
      bank.coins=Math.max(0,Math.floor(Number(p.coins)||0));
      bank.earned=Math.max(0,Math.floor(Number(p.earned)||0));
      bank.firstClear=(p.firstClear&&typeof p.firstClear==="object")?p.firstClear:{};
      bank.up=(p.up&&typeof p.up==="object")?p.up:{};
    }
  }
}catch(e){ /* a corrupt or blocked store just means an empty bank */ }

function saveBank(){
  try{ localStorage.setItem("neonDinoBank",JSON.stringify(bank)); }catch(e){}
}

// What each pickup is worth in credits. Deliberately flat and small: the
// multipliers below are where a good run actually pays.
const COIN_VALUE={coin:2, bosscoin:10, gem:1, crystal:1};
const RESCUE_VALUE=15;         // per hatchling delivered
const BROOD_BONUS=25;          // ...and again if none were left behind
const FIRST_CLEAR_BONUS=120;   // once per stage, ever
const SALVAGE_FRAC=0.25;       // what a failed run still pays
const GRADE_MULT={S:2.0, A:1.6, B:1.3, C:1.1, D:1.0};

// coins picked up in the stage being played. Reset by loadLevel, so a
// continue costs you the pouch and hands back the coins to collect again.
let runCoins=0;
// the last payout, kept whole so the debrief can show its working
let lastPayout=null;

function earnCoins(n){ runCoins+=n; }

function gradeMult(letter){ return GRADE_MULT[letter]||1; }

// The sum, as a plain object, so the debrief can print each line and the
// tests can assert on the parts instead of on one total that could be right
// for the wrong reason.
function computePayout(letter){
  const L=LEVELS[levelIndex];
  const total=L.cages?L.cages.length:0;
  const rescue=rescuedThisLevel*RESCUE_VALUE +
               (total>0&&rescuedThisLevel>=total?BROOD_BONUS:0);
  const mult=gradeMult(letter);
  const first=bank.firstClear[levelIndex]?0:FIRST_CLEAR_BONUS;
  const base=runCoins+rescue;
  return {
    coins:runCoins, rescue, mult, first,
    scaled:Math.round(base*mult),
    total:Math.round(base*mult)+first,
    firstTime:first>0
  };
}

// Reaching the rift. Banks the payout and marks the stage cleared, which is
// what stops a replay paying the first-clear bonus a second time.
function bankStageClear(letter){
  lastPayout=computePayout(letter);
  bank.coins+=lastPayout.total;
  bank.earned+=lastPayout.total;
  bank.firstClear[levelIndex]=true;
  saveBank();
  runCoins=0;
  return lastPayout;
}

// Losing the last heart. A quarter of the pouch, no multiplier, no bonus —
// enough that the evening was not wasted, not enough to be a strategy.
function bankSalvage(){
  const rate=salvageFrac();
  const got=Math.floor(runCoins*rate);
  lastPayout={coins:runCoins, rescue:0, mult:rate, first:0,
              scaled:got, total:got, firstTime:false, salvage:true};
  if(got>0){ bank.coins+=got; bank.earned+=got; saveBank(); }
  runCoins=0;
  return got;
}

function spendCoins(n){
  if(n>bank.coins) return false;
  bank.coins-=n;
  saveBank();
  return true;
}
