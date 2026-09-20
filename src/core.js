// Canvas, assets, input and the touch pad
// Part of NEON DINO-AGE: RESCUE PROTOCOL. Loaded as a classic
// script, in the order index2.html lists — these files share one
// global scope on purpose and are not modules.

"use strict";
// ============================================================
//  NEON DINO-AGE  —  RESCUE PROTOCOL
//  Single-file HTML5 Canvas game  —  all art drawn procedurally
//
//  Story layer sitting on top of the arcade platformer:
//   1. RADIO — a pixel comms window that wipes open mid-play (it never
//      freezes the sim) to narrate the eruption, the heat and the Alpha.
//   2. RESCUE TRAIN — hatchlings freed from cages fall in behind the dino,
//      each one replaying the player's own recorded path a beat later.
//   3. EVACUATION PORTAL — the stage exit is an obsidian time capsule; the
//      screen blacks out into a mission debrief when you reach it.
// ============================================================

const C = document.getElementById("c");
const W = 900, H = 506;
C.width = W; C.height = H;
// scale to fit window
function resize(){
  const s = Math.min(window.innerWidth/W, window.innerHeight/H);
  C.style.width = W*s+"px"; C.style.height = H*s+"px";
}
resize(); window.addEventListener("resize", resize);
const ctx = C.getContext("2d");

// ─── ASSETS ─────────────────────────────────────────────────
// Every image the game loads is asked for by name through here. Left alone
// it returns the name, so the game runs from a folder exactly as before. A
// build can define window.__ASSETS = {"baby.png":"data:image/png;base64,…"}
// ahead of this script and the whole game becomes one sendable file with no
// sibling files to lose.
//
// Inlined art has a second benefit: a data: URI does not taint the canvas the
// way a file:// image does, so computeSpriteBBox can actually measure a
// sprite instead of falling back to its full frame.
function assetURL(name){
  const m = (typeof window!=="undefined") && window.__ASSETS;
  return (m && m[name]) || name;
}

// ─── INPUT ──────────────────────────────────────────────────
const K = {};
window.addEventListener("keydown", e => { K[e.code] = true; e.preventDefault&&["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.code)&&e.preventDefault(); });
window.addEventListener("keyup",  e => { K[e.code] = false; });

// ─── TOUCH CONTROLS ─────────────────────────────────────────
// A tablet has no keyboard, so the pad drives the SAME K[] table the keys
// do. Nothing downstream of input has to know a finger is involved.
//
// The buttons live in canvas space and are hit-tested there, so they line up
// no matter how the canvas has been scaled to fit the screen.
let touchMode=false;
try{
  touchMode = ("ontouchstart" in window) ||
              (navigator && navigator.maxTouchPoints>0) ||
              /[?&]touch=1/.test((location&&location.search)||"");
}catch(e){ touchMode=false; }
const TOUCH_KEYS={LEFT:"ArrowLeft", RIGHT:"ArrowRight", JUMP:"Space",
                  FIRE:"KeyF", DASH:"ShiftLeft", SLIDE:"ArrowDown"};
function touchButtons(){
  const pad=16, r=40;
  return [
    {id:"LEFT",  x:pad+r,        y:H-pad-r,       r, label:"◀"},
    {id:"RIGHT", x:pad+r*3+10,   y:H-pad-r,       r, label:"▶"},
    {id:"FIRE",  x:W-pad-r*3-10, y:H-pad-r,       r, label:"ATEŞ"},
    {id:"JUMP",  x:W-pad-r,      y:H-pad-r,       r, label:"ZIPLA"},
    {id:"DASH",  x:W-pad-r*2+6,  y:H-pad-r*3-4,   r:32, label:"DASH"},
    {id:"SLIDE", x:pad+r*2+5,    y:H-pad-r*3-4,   r:32, label:"KAY"},
  ];
}
function touchButtonAt(x,y){
  for(const b of touchButtons()){
    // a generous hit box — thumbs are not precise, and a near miss that does
    // nothing is the single most frustrating thing about on-screen controls
    if(Math.hypot(x-b.x,y-b.y)<=b.r+10) return b;
  }
  return null;
}
const touchHeld=new Map();   // pointerId -> button id
function touchSet(id,down){
  const code=TOUCH_KEYS[id];
  if(code) K[code]=down;
}
function touchRelease(pid){
  const was=touchHeld.get(pid);
  if(was===undefined) return;
  touchHeld.delete(pid);
  // only let go of the key if no other finger is still on that button
  for(const v of touchHeld.values()) if(v===was) return;
  touchSet(was,false);
}
function touchPressAt(pid,p){
  const b=touchButtonAt(p.x,p.y);
  const was=touchHeld.get(pid);
  if(b && was===b.id) return;
  if(was!==undefined) touchRelease(pid);
  if(b){ touchHeld.set(pid,b.id); touchSet(b.id,true); }
}
function drawTouchPad(){
  if(!touchMode) return;
  if(STATE!=="playing"&&STATE!=="warp") return;
  ctx.save();
  for(const b of touchButtons()){
    const held=[...touchHeld.values()].includes(b.id);
    ctx.globalAlpha=held?0.55:0.26;
    ctx.fillStyle=held?"#e879f9":"#0b0a18";
    ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha=held?0.95:0.5;
    ctx.strokeStyle=held?"#ffffff":"#8fa0c8"; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.stroke();
    ctx.globalAlpha=held?1:0.8;
    ctx.fillStyle="#e8ecff";
    ctx.font="bold "+(b.label.length>2?11:20)+"px 'Courier New',monospace";
    ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText(b.label,b.x,b.y);
  }
  ctx.textAlign="left"; ctx.textBaseline="alphabetic";
  ctx.restore();
}

// ─── UTILS ──────────────────────────────────────────────────
function rnd(a,b){ return a + Math.random()*(b-a); }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function lerp(a,b,t){ return a+(b-a)*t; }
function overlaps(a,b){ return a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y; }
