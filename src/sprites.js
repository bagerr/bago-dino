// Sprite auto-crop (must load before any Image)
// Part of NEON DINO-AGE: RESCUE PROTOCOL. Loaded as a classic
// script, in the order index2.html lists — these files share one
// global scope on purpose and are not modules.

// ─── SPRITE AUTO-CROP ──────────────────────────────────────────
// PNG art from generators often ships with a lot of transparent margin (and
// sometimes a baked-in ground shadow/smoke puff) around the actual character.
// Scaling the WHOLE image — margin included — into a fixed on-screen box
// shrinks the visible art inside that box and throws off exactly where the
// feet land, which reads as the sprite "floating" instead of standing on the
// scene. Computing the tight opaque bounding box once (on load) and using it
// as the drawImage SOURCE rect fixes that without touching the PNG file.
function computeSpriteBBox(img, excludeGroundSmoke){
  const oc=document.createElement("canvas");
  oc.width=img.naturalWidth; oc.height=img.naturalHeight;
  const octx=oc.getContext("2d");
  octx.drawImage(img,0,0);
  let data;
  try{ data=octx.getImageData(0,0,oc.width,oc.height).data; }
  catch(e){ return {x:0,y:0,w:img.naturalWidth,h:img.naturalHeight}; } // e.g. file:// canvas taint
  let minX=oc.width,minY=oc.height,maxX=0,maxY=0,found=false;
  for(let y=0;y<oc.height;y++){
    for(let x=0;x<oc.width;x++){
      const i=(y*oc.width+x)*4;
      const a=data[i+3];
      if(a<24) continue;
      if(excludeGroundSmoke){
        const r=data[i],g=data[i+1],b=data[i+2];
        // the baked-in dust/smoke puff is near-white and low-contrast — treat
        // it as background so it doesn't drag the bounding box (and the feet
        // anchor point) downward
        if(r>222&&g>218&&b>206&&Math.abs(r-g)<14&&Math.abs(g-b)<22) continue;
      }
      found=true;
      if(x<minX)minX=x; if(x>maxX)maxX=x;
      if(y<minY)minY=y; if(y>maxY)maxY=y;
    }
  }
  if(!found) return {x:0,y:0,w:img.naturalWidth,h:img.naturalHeight};
  return {x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1};
}
