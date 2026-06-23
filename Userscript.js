// ==UserScript==
// @name         Dark Star Menu
// @namespace    dark-star-menu
// @version      1.0.0
// @description  Bypasses drawing board so you can input answers while also drawing
// @match        https://www.khanacademy.org/*
// @match        https://khanacademy.org/*
// @match        https://*.khanacademy.org/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(()=>{"use strict";

if(!location.hostname.endsWith("khanacademy.org")||!location.pathname.startsWith("/math"))return;
if(window.__darkStarMenuLoadedOnce)return;
window.__darkStarMenuLoadedOnce=true;

function startWhenReady(){
  if(!document.body){setTimeout(startWhenReady,50);return}
  runDarkStar();
}
startWhenReady();

function runDarkStar(){

try{window.__kahController?.abort?.()}catch(e){}
try{window.__kahLongTextScrollController?.abort?.()}catch(e){}
const controller=new AbortController(),signal=controller.signal;
window.__kahController=controller;

const TOP_Z=2147483647,CALC_Z=2147483646,ACC="#8b9bff",TXT="#e7e9ee";
let bypassOn=false;
let areaTimer=0,stateTimer=0,selectionOverlayTimer=0;
let angleMode="deg",lastAns=0;
let lockedInput=null,lockedUntil=0,caretStart=0,caretEnd=0,selectionOverlay=null;

const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>{try{return Array.from(r.querySelectorAll(s))}catch(e){return[]}};

function cleanupOld(){
  try{document.querySelectorAll(".kah-root,[data-kah-exact-khan-calc='true'],[data-kah-calc],[data-kah-text-proxy='true'],[data-kah-selection-overlay='true']").forEach(e=>e.remove())}catch(e){}
  try{document.getElementById("kah-style")?.remove();document.getElementById("kah-answer-access-style")?.remove()}catch(e){}
  try{document.body?.classList?.remove("kah-bypass-khan-draw-interaction","kah-answer-access","kah-text-entry-sticky")}catch(e){}
  try{
    document.querySelectorAll("[data-kah-area-pass='true'],[data-kah-pass-through='true'],[data-kah-bypass-pass-through='true'],[data-kah-aa-surface='true']").forEach(e=>{
      const o=e.getAttribute("data-kah-old-pe")??e.getAttribute("data-kah-bypass-original-pointer-events")??e.getAttribute("data-kah-aa-pe");
      if(o==null||o==="")e.style.removeProperty("pointer-events");else e.style.pointerEvents=o;
      ["data-kah-area-pass","data-kah-pass-through","data-kah-bypass-pass-through","data-kah-aa-surface","data-kah-old-pe","data-kah-bypass-original-pointer-events","data-kah-aa-pe"].forEach(a=>e.removeAttribute(a));
    });
  }catch(e){}
  try{
    document.querySelectorAll("[data-kah-lifted='true'],[data-kah-bypass-lifted='true'],[data-kah-aa-answer='true']").forEach(e=>{
      const o=e.getAttribute("data-kah-old-style")??e.getAttribute("data-kah-bypass-original-style")??e.getAttribute("data-kah-aa-style");
      if(o==null||o==="")e.removeAttribute("style");else e.setAttribute("style",o);
      ["data-kah-lifted","data-kah-bypass-lifted","data-kah-aa-answer","data-kah-old-style","data-kah-bypass-original-style","data-kah-aa-style"].forEach(a=>e.removeAttribute(a));
    });
  }catch(e){}
}
cleanupOld();

function isInsideOurUi(el){return!!el?.closest?.(".kah-root,[data-kah-exact-khan-calc='true'],[data-kah-selection-overlay='true']")}
function labelOf(el){return el instanceof Element?[(el.getAttribute("aria-label")||""),(el.getAttribute("title")||""),(el.getAttribute("data-testid")||""),(el.getAttribute("placeholder")||""),(el.getAttribute("name")||""),(el.getAttribute("role")||""),(typeof el.className==="string"?el.className:""),(el.textContent||"")].join(" ").replace(/\s+/g," ").trim().toLowerCase():""}
function visible(el){if(!(el instanceof Element))return false;const r=el.getBoundingClientRect(),c=getComputedStyle(el);return r.width>0&&r.height>0&&c.display!=="none"&&c.visibility!=="hidden"&&Number(c.opacity||"1")>0}
function isToolbar(el){if(!(el instanceof Element))return false;const l=labelOf(el);return!!(el.closest("[role='toolbar'],[class*='toolbar' i],[data-testid*='toolbar' i],[aria-label*='toolbar' i],[class*='toolbox' i],[class*='palette' i]")||/\b(toolbar|pen|pencil|marker|highlighter|eraser|erase|undo|redo|clear|color|thickness|line|shape|text)\b/.test(l))}
function drawingAreas(){return $$("[data-testid='drawing-area'],[class*='drawing-area' i],[aria-label*='drawing area' i]").filter(e=>!isInsideOurUi(e))}

function savePointer(el){
  if((el instanceof HTMLElement||el instanceof SVGElement)&&!el.hasAttribute("data-kah-old-pe"))el.setAttribute("data-kah-old-pe",el.style.pointerEvents||"");
}
function applyPass(el){
  if(!(el instanceof HTMLElement||el instanceof SVGElement)||isInsideOurUi(el))return;
  savePointer(el);
  el.setAttribute("data-kah-area-pass","true");
  el.style.setProperty("pointer-events","none","important");
}
function restoreOnePass(el){
  if(!(el instanceof HTMLElement||el instanceof SVGElement))return;
  const o=el.getAttribute("data-kah-old-pe");
  if(o==null||o==="")el.style.removeProperty("pointer-events");else el.style.pointerEvents=o;
  el.removeAttribute("data-kah-old-pe");
  el.removeAttribute("data-kah-area-pass");
}
function setAreaPassThrough(on){
  if(on){
    drawingAreas().forEach(area=>{
      applyPass(area);
      try{area.querySelectorAll(":scope > svg,:scope > canvas").forEach(applyPass)}catch(e){}
    });
  }else{
    document.querySelectorAll("[data-kah-area-pass='true']").forEach(restoreOnePass);
  }
}
function restorePassThrough(){setAreaPassThrough(false)}

const INPUT_SELECTOR="input[data-testid='input-with-examples'],input[aria-label*='Your answer' i],input[class*='perseus-input' i],input:not([type='hidden']),textarea,[contenteditable='true'],[role='textbox'],[role='combobox'],.mq-editable-field,.mq-textarea,.mq-root-block";
const ANSWER_SELECTOR=INPUT_SELECTOR+",select,label,button,[role='button'],[role='radio'],[role='checkbox'],[role='option'],[aria-label*='answer' i],[aria-label*='choice' i],[aria-label*='option' i],[data-testid*='answer' i],[data-testid*='choice' i],[data-testid*='option' i],[data-testid*='radio' i],[class*='answer' i],[class*='choice' i],[class*='option' i],[class*='radio' i],[class*='perseus-radio' i],[class*='perseus-multiple-choice' i],[class*='multiple-choice' i]";

function isTextInput(el){
  if(el instanceof HTMLTextAreaElement)return true;
  if(el instanceof HTMLInputElement)return!["button","checkbox","color","file","hidden","image","radio","range","reset","submit"].includes((el.type||"text").toLowerCase());
  return!!(el instanceof HTMLElement&&(el.isContentEditable||el.getAttribute("role")==="textbox"||el.matches(".mq-editable-field,.mq-textarea,.mq-root-block,[class*='math-input' i],[class*='perseus-input' i],[class*='numeric-input' i],[class*='free-response' i]")));
}
function textInputFrom(el){
  if(!(el instanceof Element))return null;
  if(el instanceof HTMLElement&&isTextInput(el))return el;
  const c=el.closest?.(INPUT_SELECTOR);
  if(c instanceof HTMLElement){
    if(isTextInput(c))return c;
    const i=$(INPUT_SELECTOR,c);
    if(i instanceof HTMLElement&&isTextInput(i))return i;
  }
  return null;
}
function findInputAtPoint(x,y){
  setAreaPassThrough(true);
  let best=null,score=-Infinity;
  for(const el of document.elementsFromPoint(x,y)){
    if(!(el instanceof Element)||isInsideOurUi(el)||isToolbar(el))continue;
    const arr=[];
    const c=el.closest?.(INPUT_SELECTOR);
    if(c instanceof HTMLElement)arr.push(c);
    let n=el,d=0;
    while(n&&n!==document.body&&n!==document.documentElement&&d++<8){
      if(n instanceof HTMLElement)arr.push(n);
      n=n.parentElement;
    }
    for(const a of arr){
      const input=textInputFrom(a);
      if(!input||!visible(input))continue;
      const r=input.getBoundingClientRect();
      if(x<r.left-10||x>r.right+10||y<r.top-10||y>r.bottom+10)continue;
      let s=0;
      if(input.matches("input[data-testid='input-with-examples'],input[aria-label*='Your answer' i],input[class*='perseus-input' i]"))s+=5000;
      if(input instanceof HTMLInputElement||input instanceof HTMLTextAreaElement)s+=2000;
      if(input.isContentEditable)s+=1200;
      if(r.width>=40&&r.height>=16)s+=100;
      if(s>score){score=s;best=input}
    }
  }
  return best;
}
function getVal(el){
  if(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement)return String(el.value||"");
  return String(el.textContent||"");
}
function nativeSetValue(el,val){
  if(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement){
    try{
      const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
      const d=Object.getOwnPropertyDescriptor(proto,"value");
      d&&d.set?d.set.call(el,val):el.value=val;
    }catch(e){el.value=val}
    try{el.setAttribute("value",val)}catch(e){}
  }else if(el instanceof HTMLElement){
    el.textContent=val;
  }
}
function emitInput(el,inputType="insertText",data=null){
  try{el.dispatchEvent(new InputEvent("input",{bubbles:true,cancelable:true,inputType,data}))}catch(e){try{el.dispatchEvent(new Event("input",{bubbles:true}))}catch(_){}}
  try{el.dispatchEvent(new Event("change",{bubbles:true}))}catch(e){}
}
function setSelection(el,s,e=s){
  caretStart=Math.max(0,s);
  caretEnd=Math.max(0,e);
  if(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement){
    try{el.setSelectionRange(caretStart,caretEnd)}catch(_){}
    keepCaretVisible(el);
  }
  updateSelectionOverlay();
}
function measureTextForInput(el,text){
  try{
    const c=measureTextForInput.canvas||(measureTextForInput.canvas=document.createElement("canvas"));
    const ctx=c.getContext("2d");
    const cs=getComputedStyle(el);
    ctx.font=cs.font||`${cs.fontSize||"16px"} ${cs.fontFamily||"Arial"}`;
    return ctx.measureText(String(text||"")).width;
  }catch(e){return String(text||"").length*8}
}
function getNumberStyle(v,fallback=0){const n=parseFloat(v);return Number.isFinite(n)?n:fallback}
function keepCaretVisible(el){
  if(!(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement))return;
  const value=String(el.value||"");
  const cs=getComputedStyle(el);
  const padL=getNumberStyle(cs.paddingLeft,6);
  const padR=getNumberStyle(cs.paddingRight,6);
  const usable=Math.max(20,el.clientWidth-padL-padR-12);
  let pos=value.length;
  try{pos=el.selectionEnd??el.selectionStart??value.length}catch(e){}
  const caretX=measureTextForInput(el,value.slice(0,pos));
  const leftLimit=el.scrollLeft+10;
  const rightLimit=el.scrollLeft+usable-10;
  if(caretX>rightLimit)el.scrollLeft=Math.max(0,caretX-usable+24);
  else if(caretX<leftLimit)el.scrollLeft=Math.max(0,caretX-24);
  if(pos>=value.length-1)el.scrollLeft=el.scrollWidth;
}
function keepAllInputsVisible(){
  $$(INPUT_SELECTOR).forEach(el=>{
    if(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement)keepCaretVisible(el);
  });
}
function ensureSelectionOverlay(){
  if(selectionOverlay&&document.contains(selectionOverlay))return selectionOverlay;
  selectionOverlay=document.createElement("div");
  selectionOverlay.setAttribute("data-kah-selection-overlay","true");
  selectionOverlay.innerHTML='<div data-kah-selection-bar="true"></div><div data-kah-caret="true"></div>';
  document.body.appendChild(selectionOverlay);
  return selectionOverlay;
}
function removeSelectionOverlay(){
  clearInterval(selectionOverlayTimer);
  selectionOverlayTimer=0;
  selectionOverlay?.remove();
  selectionOverlay=null;
}
function updateSelectionOverlay(){
  if(!bypassOn||!lockedInput||!document.contains(lockedInput)){removeSelectionOverlay();return}
  const el=lockedInput;
  if(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement)keepCaretVisible(el);
  const r=el.getBoundingClientRect();
  if(r.width<=0||r.height<=0){removeSelectionOverlay();return}
  const overlay=ensureSelectionOverlay();
  const cs=getComputedStyle(el);
  const padL=getNumberStyle(cs.paddingLeft,6);
  const padR=getNumberStyle(cs.paddingRight,6);
  const padT=getNumberStyle(cs.paddingTop,0);
  const fontSize=getNumberStyle(cs.fontSize,16);
  const lineH=getNumberStyle(cs.lineHeight,fontSize*1.25);
  const text=getVal(el);
  const a=Math.min(caretStart,caretEnd),b=Math.max(caretStart,caretEnd);
  const scrollLeft=(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement)?el.scrollLeft||0:0;
  let baseX=padL-scrollLeft;
  if((cs.textAlign||"").toLowerCase()==="right"){
    const total=measureTextForInput(el,text);
    baseX=Math.max(padL,r.width-padR-total-scrollLeft);
  }else if((cs.textAlign||"").toLowerCase()==="center"){
    const total=measureTextForInput(el,text);
    baseX=Math.max(padL,(r.width-total)/2-scrollLeft);
  }
  const before=measureTextForInput(el,text.slice(0,a));
  const selected=measureTextForInput(el,text.slice(a,b));
  const x=Math.max(padL,Math.min(r.width-padR,baseX+before));
  const w=Math.max(2,Math.min(r.width-padR-x,selected));
  const y=Math.max(2,padT+(r.height-lineH)/2);
  overlay.style.cssText=`position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;z-index:${TOP_Z-2};pointer-events:none;border-radius:${cs.borderRadius||"4px"};overflow:hidden;`;
  const bar=overlay.querySelector("[data-kah-selection-bar]");
  const caret=overlay.querySelector("[data-kah-caret]");
  if(a!==b){
    bar.style.cssText=`position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${Math.max(14,lineH)}px;background:rgba(24,101,242,.32);border-radius:2px;display:block;`;
    caret.style.display="none";
  }else{
    bar.style.display="none";
    caret.style.cssText=`position:absolute;left:${x}px;top:${y}px;width:2px;height:${Math.max(14,lineH)}px;background:#1865f2;border-radius:2px;display:block;`;
  }
}
function lockInput(el){
  if(!(el instanceof HTMLElement))return;
  lockedInput=el;
  lockedUntil=Date.now()+120000;
  document.body.classList.add("kah-text-entry-sticky");
  setAreaPassThrough(true);
  try{el.focus({preventScroll:true})}catch(e){try{el.focus()}catch(_){}}
  const v=getVal(el);
  let s=v.length,e=v.length;
  if(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement){
    try{s=el.selectionStart??v.length;e=el.selectionEnd??s}catch(_){}
  }
  setSelection(el,s,e);
  if(!selectionOverlayTimer)selectionOverlayTimer=setInterval(updateSelectionOverlay,120);
}
function unlockInput(){
  lockedInput=null;
  lockedUntil=0;
  document.body.classList.remove("kah-text-entry-sticky");
  removeSelectionOverlay();
}
function keepInputAlive(){
  if(!bypassOn)return;
  setAreaPassThrough(true);
  if(lockedInput&&document.contains(lockedInput)&&Date.now()<lockedUntil){updateSelectionOverlay();return}
  if(lockedInput&&(!document.contains(lockedInput)||Date.now()>=lockedUntil))unlockInput();
}
function insertTextIntoLocked(text){
  if(!lockedInput||!document.contains(lockedInput))return false;
  const v=getVal(lockedInput),a=Math.min(caretStart,caretEnd),b=Math.max(caretStart,caretEnd),nv=v.slice(0,a)+text+v.slice(b),pos=a+text.length;
  nativeSetValue(lockedInput,nv);
  setSelection(lockedInput,pos,pos);
  emitInput(lockedInput,"insertText",text);
  if(lockedInput instanceof HTMLInputElement||lockedInput instanceof HTMLTextAreaElement)keepCaretVisible(lockedInput);
  lockedUntil=Date.now()+120000;
  updateSelectionOverlay();
  return true;
}
function deleteInLocked(backspace){
  if(!lockedInput||!document.contains(lockedInput))return false;
  const v=getVal(lockedInput);
  let a=Math.min(caretStart,caretEnd),b=Math.max(caretStart,caretEnd);
  if(a===b){
    if(backspace){if(a<=0)return true;a--}
    else{if(b>=v.length)return true;b++}
  }
  const nv=v.slice(0,a)+v.slice(b);
  nativeSetValue(lockedInput,nv);
  setSelection(lockedInput,a,a);
  emitInput(lockedInput,backspace?"deleteContentBackward":"deleteContentForward",null);
  if(lockedInput instanceof HTMLInputElement||lockedInput instanceof HTMLTextAreaElement)keepCaretVisible(lockedInput);
  lockedUntil=Date.now()+120000;
  updateSelectionOverlay();
  return true;
}
function handleBridgeKey(e){
  if(!bypassOn||isInsideOurUi(e.target))return;
  if(lockedInput&&(!document.contains(lockedInput)||Date.now()>lockedUntil))unlockInput();
  if(!lockedInput)return;
  setAreaPassThrough(true);
  if(document.activeElement===lockedInput){
    setTimeout(()=>{
      if(lockedInput&&document.activeElement===lockedInput){
        try{caretStart=lockedInput.selectionStart??caretStart;caretEnd=lockedInput.selectionEnd??caretEnd}catch(e){}
        if(lockedInput instanceof HTMLInputElement||lockedInput instanceof HTMLTextAreaElement)keepCaretVisible(lockedInput);
        updateSelectionOverlay();
      }
    },0);
    return;
  }
  if(e.metaKey||e.altKey)return;
  if(e.ctrlKey&&e.key.toLowerCase()==="a"){
    e.preventDefault();e.stopImmediatePropagation();
    setSelection(lockedInput,0,getVal(lockedInput).length);
    return;
  }
  if(e.shiftKey&&e.key==="ArrowLeft"){
    e.preventDefault();e.stopImmediatePropagation();
    const n=Math.max(0,caretEnd-1);
    setSelection(lockedInput,caretStart,n);
    return;
  }
  if(e.shiftKey&&e.key==="ArrowRight"){
    e.preventDefault();e.stopImmediatePropagation();
    const n=Math.min(getVal(lockedInput).length,caretEnd+1);
    setSelection(lockedInput,caretStart,n);
    return;
  }
  if(e.ctrlKey)return;
  if(e.key==="Backspace"){
    e.preventDefault();e.stopImmediatePropagation();
    deleteInLocked(true);
    return;
  }
  if(e.key==="Delete"){
    e.preventDefault();e.stopImmediatePropagation();
    deleteInLocked(false);
    return;
  }
  if(e.key==="ArrowLeft"){
    e.preventDefault();e.stopImmediatePropagation();
    const p=Math.max(0,Math.min(caretStart,caretEnd)-1);
    setSelection(lockedInput,p,p);
    return;
  }
  if(e.key==="ArrowRight"){
    e.preventDefault();e.stopImmediatePropagation();
    const p=Math.min(getVal(lockedInput).length,Math.max(caretStart,caretEnd)+1);
    setSelection(lockedInput,p,p);
    return;
  }
  if(e.key==="Home"){
    e.preventDefault();e.stopImmediatePropagation();
    setSelection(lockedInput,0,0);
    return;
  }
  if(e.key==="End"){
    e.preventDefault();e.stopImmediatePropagation();
    const n=getVal(lockedInput).length;
    setSelection(lockedInput,n,n);
    return;
  }
  if(e.key==="Enter"&&lockedInput instanceof HTMLTextAreaElement){
    e.preventDefault();e.stopImmediatePropagation();
    insertTextIntoLocked("\n");
    return;
  }
  if(e.key.length===1){
    e.preventDefault();e.stopImmediatePropagation();
    insertTextIntoLocked(e.key);
  }
}
function handlePaste(e){
  if(!bypassOn||!lockedInput||isInsideOurUi(e.target))return;
  if(document.activeElement===lockedInput)return;
  const txt=e.clipboardData?.getData?.("text/plain");
  if(txt){
    e.preventDefault();e.stopImmediatePropagation();
    insertTextIntoLocked(txt);
  }
}
function scanAnswers(){
  if(!bypassOn)return;
  setAreaPassThrough(true);
  keepAllInputsVisible();
}

window.addEventListener("pointerdown",e=>{
  if(!bypassOn||isInsideOurUi(e.target))return;
  setAreaPassThrough(true);
  const direct=textInputFrom(e.target);
  const input=direct||findInputAtPoint(e.clientX,e.clientY);
  if(input){
    lockInput(input);
    e.preventDefault();
    e.stopImmediatePropagation();
  }
},{capture:true,signal});

window.addEventListener("mousedown",e=>{
  if(!bypassOn||isInsideOurUi(e.target))return;
  const input=textInputFrom(e.target)||findInputAtPoint(e.clientX,e.clientY);
  if(input){
    lockInput(input);
    e.preventDefault();
    e.stopImmediatePropagation();
  }
},{capture:true,signal});

window.addEventListener("focusin",e=>{
  if(bypassOn&&!isInsideOurUi(e.target)){
    const input=textInputFrom(e.target);
    if(input)lockInput(input);
  }
},{capture:true,signal});

window.addEventListener("keydown",e=>{
  handleBridgeKey(e);
  requestAnimationFrame(keepAllInputsVisible);
  setTimeout(keepAllInputsVisible,40);
},{capture:true,signal});

window.addEventListener("input",e=>{
  const el=e.target;
  if(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement){
    if(el.matches(INPUT_SELECTOR))requestAnimationFrame(()=>keepCaretVisible(el));
  }
},{capture:true,signal});

window.addEventListener("paste",e=>{
  handlePaste(e);
  requestAnimationFrame(keepAllInputsVisible);
  setTimeout(keepAllInputsVisible,40);
},{capture:true,signal});

window.addEventListener("selectionchange",()=>{
  if(lockedInput&&document.activeElement===lockedInput){
    try{caretStart=lockedInput.selectionStart??caretStart;caretEnd=lockedInput.selectionEnd??caretEnd}catch(e){}
    if(lockedInput instanceof HTMLInputElement||lockedInput instanceof HTMLTextAreaElement)keepCaretVisible(lockedInput);
    updateSelectionOverlay();
  }else{
    requestAnimationFrame(keepAllInputsVisible);
  }
},{signal});

function getDrawButton(){
  const strong=[],weak=[];
  for(const e of $$("button,[role='button'],[aria-label],[data-testid]")){
    if(!(e instanceof HTMLElement)||isInsideOurUi(e)||!visible(e))continue;
    const l=labelOf(e);
    if(/\b(draw on exercise|drawing tool|draw tool)\b/.test(l)&&!/withdraw|drawer|drawn|redraw|drawbacks/.test(l))strong.push(e);
    else if(/\b(draw|drawing|pencil|pen|annotate|annotation)\b/.test(l)&&!/withdraw|drawer|drawn|redraw|drawbacks|clear|delete|trash|eraser|erase/.test(l))weak.push(e);
  }
  return strong[0]||weak[0]||null;
}
function getDrawToolbar(){
  for(const s of["[role='toolbar']","[class*='drawing-toolbar' i]","[class*='draw-toolbar' i]","[class*='toolbar' i]","[data-testid*='drawing-toolbar' i]","[aria-label*='drawing toolbar' i]","[aria-label*='draw toolbar' i]"]){
    const x=$$(s).find(e=>e instanceof HTMLElement&&!isInsideOurUi(e)&&visible(e)&&/\b(draw|drawing|pen|pencil|marker|eraser|undo|redo|clear|toolbar)\b/.test(labelOf(e)));
    if(x)return x;
  }
  return null;
}
function isDrawActive(){
  const b=getDrawButton();
  if(!b)return!!getDrawToolbar()||!!$("#drawing-area-shapes-group")||drawingAreas().length>0;
  const l=labelOf(b),c=typeof b.className==="string"?b.className.toLowerCase():"";
  return b.getAttribute("aria-pressed")==="true"||b.getAttribute("aria-expanded")==="true"||b.getAttribute("aria-selected")==="true"||b.dataset.state==="on"||b.dataset.selected==="true"||/hide drawing|close drawing|drawing on/.test(l)||/active|selected|pressed/.test(c)||!!getDrawToolbar()||!!$("#drawing-area-shapes-group")||drawingAreas().length>0;
}
function openDrawTool(){
  if(isDrawActive()){updateClearState();return true}
  const b=getDrawButton();
  if(b){
    b.click();
    setTimeout(()=>{setAreaPassThrough(bypassOn);scanAnswers();updateClearState()},250);
    setTimeout(()=>{setAreaPassThrough(bypassOn);scanAnswers();updateClearState()},700);
    return true;
  }
  updateClearState();
  return false;
}
function setBypass(v){
  bypassOn=!!v;
  bypassDrawSwitch.setAttribute("aria-checked",String(bypassOn));
  document.body.classList.toggle("kah-bypass-khan-draw-interaction",bypassOn);
  clearInterval(areaTimer);
  if(bypassOn){
    openDrawTool();
    setAreaPassThrough(true);
    scanAnswers();
    areaTimer=setInterval(()=>{if(bypassOn){keepInputAlive();scanAnswers()}},80);
    setTimeout(()=>{openDrawTool();setAreaPassThrough(true);scanAnswers()},250);
  }else{
    unlockInput();
    restorePassThrough();
    updateClearState();
  }
}
function updateClearState(){
  const a=isDrawActive()||!!$("#drawing-area-shapes-group");
  clearDrawingBtn.disabled=!a;
  clearDrawingBtn.classList.toggle("kah-disabled",!a);
  clearDrawingBtn.classList.toggle("kah-active",a);
  clearDrawingBtn.title=a?"Clear visible Khan drawing strokes/text boxes":"No drawing layer found";
}
function clearAllDrawing(){
  $$("#drawing-area-shapes-group").forEach(g=>{
    while(g.firstChild)g.removeChild(g.firstChild);
    try{g.dispatchEvent(new Event("input",{bubbles:true}));g.dispatchEvent(new Event("change",{bubbles:true}))}catch(e){}
  });
  $$(".drawing-area_textBox--movable-resizable,[class*='drawing-area_textBox' i]").forEach(e=>{
    if(e instanceof HTMLElement&&!isInsideOurUi(e))try{e.remove()}catch(_){e.style.display="none"}
  });
  setTimeout(updateClearState,100);
}
function findVideoHref(){
  for(const a of $$("a[href]")){
    let h=a.getAttribute("href")||"";
    if(h.startsWith("/"))h=location.origin+h;
    if(/khanacademy\.org\/.*\/v\//.test(h)||/\/video\//.test(h))return h;
  }
  return null;
}
function openVideo(){
  const h=findVideoHref();
  if(h){open(h,"_blank","noopener");return}
  const q=$("h1")?.textContent?.trim()||document.title.replace(/\s*[-|]\s*Khan Academy.*$/i,"").split("|")[0].trim();
  open("https://www.khanacademy.org/search?page_search_query="+encodeURIComponent(q),"_blank","noopener");
}
function startDrag(handle,box,onClick){
  if(!handle||!box)return;
  let sx=0,sy=0,startLeft=0,startTop=0,moved=false,dragging=false;
  function begin(clientX,clientY,ev){
    if(ev?.target?.closest?.("button,input,textarea,select"))return;
    moved=false;dragging=true;sx=clientX;sy=clientY;
    const r=box.getBoundingClientRect();startLeft=r.left;startTop=r.top;
    box.style.right="auto";box.style.bottom="auto";box.style.transform="none";box.style.left=startLeft+"px";box.style.top=startTop+"px";
    ev?.preventDefault?.();
    document.addEventListener("mousemove",moveMouse,true);
    document.addEventListener("mouseup",endMouse,true);
    document.addEventListener("touchmove",moveTouch,{capture:true,passive:false});
    document.addEventListener("touchend",endTouch,true);
  }
  function moveTo(clientX,clientY,ev){
    if(!dragging)return;
    if(Math.abs(clientX-sx)+Math.abs(clientY-sy)>3)moved=true;
    box.style.left=Math.max(0,Math.min(innerWidth-box.offsetWidth,startLeft+clientX-sx))+"px";
    box.style.top=Math.max(0,Math.min(innerHeight-48,startTop+clientY-sy))+"px";
    ev?.preventDefault?.();
  }
  function finish(ev){
    if(!dragging)return;
    dragging=false;
    document.removeEventListener("mousemove",moveMouse,true);
    document.removeEventListener("mouseup",endMouse,true);
    document.removeEventListener("touchmove",moveTouch,true);
    document.removeEventListener("touchend",endTouch,true);
    if(!moved&&onClick)onClick();
    ev?.preventDefault?.();
  }
  function moveMouse(e){moveTo(e.clientX,e.clientY,e)}
  function endMouse(e){finish(e)}
  function moveTouch(e){const t=e.touches[0]||e.changedTouches[0];if(t)moveTo(t.clientX,t.clientY,e)}
  function endTouch(e){finish(e)}
  handle.addEventListener("mousedown",e=>{if(e.button===0)begin(e.clientX,e.clientY,e)},true);
  handle.addEventListener("touchstart",e=>{const t=e.touches[0];if(t)begin(t.clientX,t.clientY,e)},{capture:true,passive:false});
}

const style=document.createElement("style");
style.id="kah-style";
style.textContent=`
.kah-root,.kah-root *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}.kah-root{position:fixed;top:20px;right:20px;z-index:${TOP_Z};width:296px}.kah-toggle{display:flex;align-items:center;justify-content:space-between;cursor:move;touch-action:none;background:#0a0b0e;color:${TXT};border:2px solid ${ACC};border-radius:12px;padding:14px 16px;font-size:15px;font-weight:700;letter-spacing:.3px;box-shadow:0 8px 24px #0007;user-select:none}.kah-toggle:hover{background:#15171d}.kah-caret{transition:transform .15s ease;font-size:14px;color:${ACC}}.kah-root.kah-open .kah-caret{transform:rotate(180deg)}.kah-menu{display:none;margin-top:8px;background:#16181d;border:1px solid #2a2e36;border-radius:12px;box-shadow:0 12px 32px #0008;overflow:hidden}.kah-root.kah-open .kah-menu{display:block}.kah-item{width:100%;border:0;background:#16181d;cursor:pointer;text-align:left;font-size:13px;font-weight:600;color:${TXT};padding:12px 14px;border-bottom:1px solid #2a2e36}.kah-item:hover,.kah-item.kah-active{background:#1e2127}.kah-item.kah-active{color:${ACC}}.kah-item:disabled,.kah-item.kah-disabled{opacity:.38!important;cursor:not-allowed!important;color:#727a8c!important;background:#121419!important}.kah-switch-row{width:100%;border:0;background:#16181d;cursor:pointer;text-align:left;color:${TXT};padding:12px 14px;border-bottom:1px solid #2a2e36;display:flex;align-items:center;justify-content:space-between;gap:12px;user-select:none}.kah-switch-row:hover{background:#1e2127}.kah-switch-copy{display:flex;flex-direction:column;gap:2px;min-width:0}.kah-switch-label{font-size:13px;font-weight:800;line-height:1.15}.kah-switch-note{color:#aeb4c2;font-size:11px;font-weight:600;line-height:1.25}.kah-switch{width:48px;height:28px;border-radius:999px;background:#3a3f4a;border:1px solid #fff2;box-shadow:inset 0 1px 2px #0005;padding:2px;flex:0 0 48px}.kah-switch-knob{width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 2px 8px #0005;display:block;transition:transform .18s}.kah-switch-row[aria-checked=true] .kah-switch{background:${ACC};border-color:${ACC}}.kah-switch-row[aria-checked=true] .kah-switch-knob{transform:translateX(20px)}
body.kah-bypass-khan-draw-interaction [data-testid="drawing-area"],body.kah-bypass-khan-draw-interaction [data-kah-area-pass=true]{pointer-events:none!important}
.kah-root,.kah-root *,[data-kah-exact-khan-calc=true],[data-kah-exact-khan-calc=true] *{pointer-events:auto!important}
[data-kah-exact-khan-calc=true],[data-kah-exact-khan-calc=true] *{box-sizing:border-box!important;font-family:Lato,"Noto Sans","Helvetica Neue",Helvetica,Arial,sans-serif!important}[data-kah-exact-khan-calc=true]{position:fixed!important;left:calc(100vw - 430px);top:calc(100vh - 455px);z-index:${CALC_Z}!important;width:408px!important;max-width:calc(100vw - 24px)!important;background-color:rgb(235,238,242)!important;border-radius:8px!important;box-shadow:rgba(0,0,0,.25) 0 8px 24px!important;overflow:hidden!important;color:rgb(33,36,44)!important;touch-action:none!important}.kah-calc-head{height:44px!important;display:flex!important;align-items:center!important;padding:0 10px!important;background-color:rgb(235,238,242)!important;border-bottom:1px solid rgba(33,36,44,.16)!important;cursor:move!important;user-select:none!important;touch-action:none!important}.kah-calc-title{margin:0!important;padding:0!important;flex:1 1 auto!important;text-align:center!important;color:rgb(33,36,44)!important;font-size:16px!important;line-height:44px!important;font-weight:700!important}.kah-calc-close{width:32px!important;height:32px!important;border:0!important;border-radius:6px!important;background:transparent!important;cursor:pointer!important;padding:0!important;margin-left:8px!important;font-size:22px!important;line-height:32px!important;color:rgb(33,36,44)!important}.kah-calc-close:hover{background:rgba(33,36,44,.08)!important}.kah-calc-body{width:100%!important;padding:12px!important;background:rgb(235,238,242)!important}#textField{width:100%!important;height:68px!important;border:1px solid rgb(186,194,207)!important;border-radius:8px!important;background:#fff!important;color:rgb(33,36,44)!important;font-size:28px!important;line-height:1.2!important;font-weight:500!important;text-align:right!important;padding:10px 12px!important;outline:0!important;min-width:0!important;margin-bottom:8px!important}.kah-angle-row{display:grid!important;grid-template-columns:1fr 1fr!important;gap:7px!important;margin-bottom:7px!important}.kah-calc-grid{width:100%!important;display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:7px!important;margin:0!important}.kah-calc-grid button,.kah-angle-btn{width:100%!important;min-width:0!important;height:42px!important;min-height:42px!important;border:1px solid rgb(186,194,207)!important;border-radius:7px!important;background:#fff!important;color:rgb(33,36,44)!important;cursor:pointer!important;padding:0 4px!important;margin:0!important;display:flex!important;align-items:center!important;justify-content:center!important;text-align:center!important;font-size:16px!important;font-weight:700!important;line-height:1!important;box-shadow:0 1px 0 rgba(33,36,44,.08)!important;user-select:none!important;white-space:nowrap!important}.kah-calc-grid button:hover,.kah-angle-btn:hover{background:rgb(247,248,250)!important}.kah-angle-btn[aria-checked=true]{background:rgb(33,36,44)!important;color:#fff!important;border-color:rgb(33,36,44)!important}.kah-calc-grid button[data-id="="]{background:rgb(24,101,242)!important;border-color:rgb(24,101,242)!important;color:#fff!important}`;
document.head.appendChild(style);

const root=document.createElement("div");
root.className="kah-root";
root.innerHTML=`<div class="kah-toggle" id="kah-toggle"><span>Dark Star Menu</span><span class="kah-caret">▾</span></div><div class="kah-menu"><button class="kah-switch-row" id="kah-bypass-draw-switch" type="button" role="switch" aria-checked="false"><span class="kah-switch-copy"><span class="kah-switch-label">Bypass No Interaction During Drawing</span><span class="kah-switch-note">Bypasses drawing board so you can input answers while also drawing</span></span><span class="kah-switch" aria-hidden="true"><span class="kah-switch-knob"></span></span></button><button class="kah-item kah-disabled" id="kah-clear-drawing-btn" type="button" disabled>Clear All Drawing</button><button class="kah-item" id="kah-calc-btn" type="button">Force Calculator</button><button class="kah-item" id="kah-video-btn" type="button">Open Video</button></div>`;
document.body.appendChild(root);

const toggle=root.querySelector("#kah-toggle"),calcBtn=root.querySelector("#kah-calc-btn"),bypassDrawSwitch=root.querySelector("#kah-bypass-draw-switch"),clearDrawingBtn=root.querySelector("#kah-clear-drawing-btn");
startDrag(toggle,root,()=>root.classList.toggle("kah-open"));
bypassDrawSwitch.onclick=()=>setBypass(!bypassOn);
clearDrawingBtn.onclick=clearAllDrawing;
root.querySelector("#kah-video-btn").onclick=openVideo;

function setCalcValue(f,v){f.value=v;f.setAttribute("value",v);f.dispatchEvent(new Event("input",{bubbles:true}));f.focus()}
function formatNum(n){if(Number.isNaN(n))return"Error";if(!Number.isFinite(n))return n<0?"-∞":"∞";const r=Math.round((n+Number.EPSILON)*1e12)/1e12;return Math.abs(r)>=1e13||Math.abs(r)>0&&Math.abs(r)<1e-9?r.toExponential(10).replace(/\.?0+e/,"e"):String(r)}
function calcEval(s){
  s=String(s||"").replace(/π/g,"pi").replace(/×/g,"*").replace(/÷/g,"/").replace(/[−–—]/g,"-").replace(/√/g,"sqrt(").replace(/\s+/g,"");
  let bal=0;for(const ch of s){if(ch==="(")bal++;if(ch===")")bal--}if(bal>0)s+=")".repeat(bal);
  if(!/^[\d.+\-*/%^(),a-z]+$/i.test(s))throw Error("bad");
  const R=x=>angleMode==="deg"?x*Math.PI/180:x,G=x=>angleMode==="deg"?x*180/Math.PI:x;
  const F={pi:Math.PI,e:Math.E,ans:lastAns,sqrt:Math.sqrt,ln:Math.log,log:Math.log10||((x)=>Math.log(x)/Math.LN10),sin:x=>Math.sin(R(x)),cos:x=>Math.cos(R(x)),tan:x=>Math.tan(R(x)),asin:x=>G(Math.asin(x)),acos:x=>G(Math.acos(x)),atan:x=>G(Math.atan(x))};
  s=s.replace(/\^/g,"**").replace(/\b(pi|e|ans)\b/g,"F.$1").replace(/\b(sqrt|ln|log|sin|cos|tan|asin|acos|atan)\(/g,"F.$1(");
  return Function("F","return ("+s+")")(F);
}
function runCalc(f){try{const r=calcEval(f.value);if(Number.isFinite(r))lastAns=r;setCalcValue(f,formatNum(r))}catch(e){setCalcValue(f,"Error")}}
function openCalculator(){
  let old=document.querySelector('[data-kah-exact-khan-calc="true"]');
  if(old){old.style.display="";old.inert=false;old.querySelector("#textField")?.focus();calcBtn.classList.add("kah-active");return}
  const calc=document.createElement("div");
  calc.setAttribute("data-kah-exact-khan-calc","true");
  calc.innerHTML=`<div class="kah-calc-head"><span style="width:24px;height:24px;display:inline-block"></span><p class="kah-calc-title">Calculator</p><button class="kah-calc-close" type="button" aria-label="Close Calculator">×</button></div><div class="kah-calc-body"><input id="textField" type="text" autocomplete="off" spellcheck="false"><div class="kah-angle-row"><button class="kah-angle-btn" id="RAD" role="switch" aria-checked="false" type="button">RAD</button><button class="kah-angle-btn" id="DEG" role="switch" aria-checked="true" type="button">DEG</button></div><div class="kah-calc-grid"></div></div>`;
  document.body.appendChild(calc);
  const grid=calc.querySelector(".kah-calc-grid"),field=calc.querySelector("#textField");
  [["asin(","sin⁻¹"],["sin(","sin"],["BACK","del"],["AC","ac"],["acos(","cos⁻¹"],["cos(","cos"],["(","("],[")",")"],["atan(","tan⁻¹"],["tan(","tan"],["pi","π"],["ans","ans"],["ln(","ln"],["log(","log"],["e^","eˣ"],["E","EXP"],["7","7"],["8","8"],["9","9"],["/","÷"],["4","4"],["5","5"],["6","6"],["*","×"],["1","1"],["2","2"],["3","3"],["-","-"],["0","0"],[".","."],["=","="],["+","+"],["sqrt(","√"],["^","xʸ"],["%","%"],["",""]].forEach(([id,label])=>{
    if(!id){grid.appendChild(document.createElement("span"));return}
    const b=document.createElement("button");b.type="button";b.dataset.kind="secondary";b.dataset.id=id;b.textContent=label;grid.appendChild(b);
  });
  calc.querySelector(".kah-calc-close").onclick=()=>{calc.style.display="none";calc.inert=true;calcBtn.classList.remove("kah-active")};
  calc.querySelector("#RAD").onclick=()=>{angleMode="rad";calc.querySelector("#RAD").setAttribute("aria-checked","true");calc.querySelector("#DEG").setAttribute("aria-checked","false")};
  calc.querySelector("#DEG").onclick=()=>{angleMode="deg";calc.querySelector("#DEG").setAttribute("aria-checked","true");calc.querySelector("#RAD").setAttribute("aria-checked","false")};
  grid.onclick=e=>{
    const b=e.target.closest?.("button[data-id]");if(!b)return;
    let v=field.value||"";if(v==="Error")v="";
    const id=b.dataset.id;
    if(id==="AC")return setCalcValue(field,"");
    if(id==="BACK")return setCalcValue(field,v.slice(0,-1));
    if(id==="=")return runCalc(field);
    if(id==="ans")return setCalcValue(field,v+String(lastAns));
    if(id==="pi")return setCalcValue(field,v+"pi");
    if(id==="E")return setCalcValue(field,v+"*10^");
    setCalcValue(field,v+id);
  };
  field.onkeydown=e=>{if(e.key==="Enter"||e.key==="="){e.preventDefault();runCalc(field)}};
  startDrag(calc.querySelector(".kah-calc-head"),calc);
  calcBtn.classList.add("kah-active");
  setTimeout(()=>field.focus(),0);
}
calcBtn.onclick=openCalculator;

stateTimer=setInterval(updateClearState,900);
window.addEventListener("resize",()=>bypassOn&&scanAnswers(),{signal});
window.addEventListener("scroll",()=>bypassOn&&scanAnswers(),{signal,passive:true});
signal.addEventListener("abort",()=>{
  clearInterval(stateTimer);
  clearInterval(areaTimer);
  clearInterval(selectionOverlayTimer);
  unlockInput();
  restorePassThrough();
  cleanupOld();
});
updateClearState();

}
})();
