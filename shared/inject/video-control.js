/**
 * shared/inject/video-control.js
 * 视频播放控制脚本
 *
 * 每个函数返回可注入的 IIFE 字符串，通过 CLI 或插件 eval
 */

/** 播放视频（点击大播放按钮或调用 play()） */
export const PLAY = `
(function(){
  var mf=document.getElementById("iframe");
  if(!mf)return"no iframe";
  var doc=mf.contentDocument||mf.contentWindow.document;
  var vf=doc.querySelector("iframe.ans-insertvideo-online");
  if(!vf)return"no video frame";
  var vdoc=vf.contentDocument||vf.contentWindow.document;
  var bigBtn=vdoc.querySelector(".vjs-big-play-button");
  var v=vdoc.querySelector("video");
  if(v)v.muted=true;
  if(bigBtn){bigBtn.click();return"clicked play button";}
  if(v){v.play();return"called play()";}
  return"no playable element";
})();
`;

/** 暂停 */
export const PAUSE = `
(function(){
  var mf=document.getElementById("iframe");
  if(!mf)return"no iframe";
  var doc=mf.contentDocument||mf.contentWindow.document;
  var vf=doc.querySelector("iframe.ans-insertvideo-online");
  if(!vf)return"no video frame";
  var vdoc=vf.contentDocument||vf.contentWindow.document;
  var v=vdoc.querySelector("video");
  if(v&&!v.paused){v.pause();return"paused";}
  return v?"already paused":"no video";
})();
`;

/** 设置播放速度 (rate: number, e.g. 1.5 or 2) */
export function SET_SPEED(rate) {
  return `
(function(){
  var mf=document.getElementById("iframe");
  if(!mf)return"no iframe";
  var doc=mf.contentDocument||mf.contentWindow.document;
  var vf=doc.querySelector("iframe.ans-insertvideo-online");
  if(!vf)return"no video frame";
  var vdoc=vf.contentDocument||vf.contentWindow.document;
  var v=vdoc.querySelector("video");
  if(v){v.playbackRate=${rate};return JSON.stringify({rate:v.playbackRate});}
  return"no video";
})();
`;
}

/** 获取视频状态 */
export const GET_STATE = `
(function(){
  var mf=document.getElementById("iframe");
  if(!mf)return JSON.stringify({error:"no iframe"});
  var doc=mf.contentDocument||mf.contentWindow.document;
  var vf=doc.querySelector("iframe.ans-insertvideo-online");
  if(!vf)return JSON.stringify({error:"no video frame"});
  var vdoc=vf.contentDocument||vf.contentWindow.document;
  var v=vdoc.querySelector("video");
  if(!v)return JSON.stringify({error:"no video"});
  return JSON.stringify({
    paused:v.paused,
    ended:v.ended,
    currentTime:Math.round(v.currentTime),
    duration:Math.round(v.duration),
    playbackRate:v.playbackRate,
    progressPct:v.duration?((v.currentTime/v.duration)*100).toFixed(1):"0",
    readyState:v.readyState
  });
})();
`;

/** 拖动进度条到指定秒数 */
export function SEEK_TO(seconds) {
  return `
(function(){
  var mf=document.getElementById("iframe");
  if(!mf)return"no iframe";
  var doc=mf.contentDocument||mf.contentWindow.document;
  var vf=doc.querySelector("iframe.ans-insertvideo-online");
  if(!vf)return"no video frame";
  var vdoc=vf.contentDocument||vf.contentWindow.document;
  var v=vdoc.querySelector("video");
  if(!v)return"no video";
  try{v.currentTime=${seconds};return"seeked to ${seconds}s";}catch(e){return"seek failed: "+e.message;}
})();
`;
}
