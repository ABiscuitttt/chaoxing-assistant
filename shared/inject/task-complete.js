/**
 * shared/inject/task-complete.js
 * 完成任务点脚本
 */

/** 完成文档类任务点：调用 unMaskAndFinishJob() */
export const COMPLETE_DOCUMENT = `
(function(){
  try {
    var mf=document.getElementById("iframe");
    var doc=mf.contentDocument||mf.contentWindow.document;
    var pdfFrame=doc.querySelector("iframe.insertdoc-online-pdf");
    if(!pdfFrame)return"no pdf frame";
    var pw=pdfFrame.contentWindow;

    // 方法 1: unMaskAndFinishJob
    if(typeof pw.unMaskAndFinishJob==="function"){
      pw.unMaskAndFinishJob();
      return "called unMaskAndFinishJob";
    }

    // 方法 2: 手动清除遮罩 + finishJob
    var pop=pw.document.getElementById("popWindow");
    var mask=pw.document.getElementById("maskLayer");
    if(pop)pop.style.display="none";
    if(mask)mask.style.display="none";
    if(typeof pw.finishJob==="function"){
      pw.finishJob();
      return "called finishJob (manual unmask)";
    }
    return "no finish function found";
  }catch(e){return"error: "+e.message;}
})();
`;

/** 完成视频类任务点：播放 + 2x + 等待 */
export function COMPLETE_VIDEO(speed) {
  const rate = speed || 2;
  return `
(function(){
  try {
    var mf=document.getElementById("iframe");
    var doc=mf.contentDocument||mf.contentWindow.document;
    var vf=doc.querySelector("iframe.ans-insertvideo-online");
    if(!vf)return"no video frame";
    var vdoc=vf.contentDocument||vf.contentWindow.document;
    var v=vdoc.querySelector("video");
    if(!v)return"no video";

    v.playbackRate=${rate};

    // 尝试解除拖拽限制
    try{v.onSeeking=null;v.onSeeked=null;}catch(e){}

    // 播放 + 静音
    var bigBtn=vdoc.querySelector(".vjs-big-play-button");
    if(bigBtn)bigBtn.click();
    v.muted=true;
    v.play();

    return JSON.stringify({
      playing:!v.paused,
      rate:v.playbackRate,
      currentTime:v.currentTime,
      duration:v.duration
    });
  }catch(e){return"error: "+e.message;}
})();
`;
}
