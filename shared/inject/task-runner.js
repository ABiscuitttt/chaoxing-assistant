/**
 * shared/inject/task-runner.js
 * 页面端运行器。TASK_RUNNER 处理当前章节；COURSE_RUNNER 遍历课程并复用章节运行器。
 */

// 视频处理循环（TASK_RUNNER 和 COURSE_RUNNER 共享）
const VIDEO_LOOP = `
async function processVideo(v, vi, total, onProgress) {
  var vSpeed = SPEED_MODE === "auto" ? (v.canDoubleSpeed ? 2 : 1) : (parseFloat(SPEED_MODE) || 1);
  var vScript = COMPLETE_VIDEO.replace("\${rate}", vSpeed);
  onProgress("视频 " + (vi+1) + "/" + total + "  " + vSpeed + "x", (v.title||v.filename) + " (" + v.videoDuration + "s)");
  try { eval(vScript); } catch(e) { onProgress("视频启动失败", e.message); }
  await sleep(1000);

  var startTime = Date.now(), pollCount = 0;
  var maxWait = Math.max(v.videoDuration * 1000 * 1.5, 180000);

  while (true) {
    if (ABORT()) return false;
    var state = parseResult(eval(GET_STATE));
    if (state.error) break;
    var pct = parseFloat(state.progressPct) || 0;
    var elapsed = Math.round((Date.now()-startTime)/1000);
    var mins = Math.floor(elapsed/60), secs = elapsed % 60;
    CURRENT.pct = pct;
    onProgress("视频 " + (vi+1) + "/" + total + "  " + pct + "%",
      state.currentTime + "s/" + (state.duration||"?") + "s  |  " + state.playbackRate + "x  |  " + mins + ":" + (secs<10?"0":"")+secs, pct);
    if (state.ended || pct >= 100) break;
    if (Date.now()-startTime > maxWait) { onProgress("视频超时跳过", ""); break; }
    pollCount++;
    if (pollCount % 6 === 0) {
      var cd = parseResult(eval(DISCOVER));
      var ct = cd.taskPoints ? cd.taskPoints.find(function(t){return t.jobid===v.jobid;}) : null;
      if (ct && ct.isFinished) { onProgress("视频已标记完成", ""); break; }
    }
    await sleep(POLL_MS);
  }

  if (!ABORT()) {
    var vStart = Date.now();
    while (Date.now()-vStart < 30000) {
      if (ABORT()) return false;
      var vrf = parseResult(eval(DISCOVER));
      var tp = vrf.taskPoints ? vrf.taskPoints.find(function(t){return t.jobid===v.jobid;}) : null;
      if (tp && tp.isFinished) { onProgress("视频已确认完成", ""); return true; }
      await sleep(VERIFY_MS);
    }
    onProgress("视频确认超时，跳过", "");
  }
  return !ABORT();
}
`;

export const TASK_RUNNER_TEMPLATE = `
(function() {
  if (window.__CX_RUNNER && window.__CX_RUNNER.running) return;
  window.__CX_RUNNER = null;

  var DISCOVER = ___DISCOVER___;
  var COMPLETE_DOC = ___COMPLETE_DOC___;
  var COMPLETE_VIDEO = ___COMPLETE_VIDEO___;
  var GET_STATE = ___GET_STATE___;
  var SPEED_MODE = ___SPEED___;
  var POLL_MS = 500, VERIFY_MS = 1500;

  function parseResult(r) { return typeof r === "string" ? JSON.parse(r) : r; }
  function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

  var box = document.getElementById("__cx_runner_box");
  if (!box) return;

  function render(head, detail, barPct, showBar) {
    box.innerHTML =
      '<span id="__cx_runner_close" style="position:absolute;top:4px;right:8px;cursor:pointer;color:#aaa;font-size:13px;">x</span>' +
      '<div style="font-weight:bold;margin-bottom:3px;color:#1a73e8;font-size:12px;">超星助手</div>' +
      '<div id="__cx_runner_head" style="font-size:11px;color:#333;">' + (head||"") + '</div>' +
      '<div id="__cx_runner_detail" style="font-size:11px;color:#666;margin-top:1px;">' + (detail||"") + '</div>' +
      '<div id="__cx_runner_bar" style="margin-top:4px;height:3px;background:#e0e0e0;overflow:hidden;' + (showBar?'':'display:none;') + '">' +
        '<div id="__cx_runner_fill" style="height:100%;width:' + (barPct||0) + '%;background:#1a73e8;transition:width 0.3s;"></div></div>';
    document.getElementById("__cx_runner_close").addEventListener("click", function() {
      if (window.__CX_RUNNER && window.__CX_RUNNER.abort) window.__CX_RUNNER.abort();
    });
  }

  function getEl(id) { return document.getElementById(id); }
  function setBar(pct) { var f=getEl("__cx_runner_fill"); if(f) f.style.width=Math.min(100,Math.max(0,pct))+"%"; }
  function setHead(t) { var h=getEl("__cx_runner_head"); if(h) h.textContent=t; }
  function setDetail(t) { var d=getEl("__cx_runner_detail"); if(d) d.textContent=t||""; }

  var _completed,_total,_self,ABORT,CURRENT;
  function progress(head, detail, videoPct) {
    var frac = videoPct!=null ? videoPct/100 : 0;
    var overall = _total>0 ? Math.round(((_completed+frac)/_total)*100) : 0;
    _self.progress.completed=_completed; _self.progress.total=_total; _self.progress.overallPct=overall;
    setBar(overall);
    setHead("["+_completed+"/"+_total+"] "+overall+"%  "+head);
    setDetail(detail||"");
  }

  ___VIDEO_LOOP___

  var runner = {
    running:false,aborted:false,status:"idle",
    progress:{completed:0,total:0,current:null,overallPct:0},

    abort:function(){ this.aborted=true;this.running=false;this.status="aborted";setHead("已停止");setDetail(""); },

    start:async function(){
      if(this.running)return; this.running=true; this.aborted=false;
      ABORT=function(){return runner.aborted;}; CURRENT=this.progress.current;
      _self=this;
      try{
        setHead("正在探测任务点..."); setDetail("");
        var data=parseResult(eval(DISCOVER));
        if(data.error){ render("需手动完成",data.error,0,false); this.running=false; this.status="manual"; return; }
        var pending=data.taskPoints.filter(function(t){return !t.isFinished;});
        _total=pending.length; _completed=0;
        if(_total===0){ render("所有任务点已完成","",100,true); this.running=false; this.status="done"; return; }
        var docs=pending.filter(function(t){return t.type==="document";});
        var videos=pending.filter(function(t){return t.type==="video";});
        var others=pending.filter(function(t){return t.type!=="document"&&t.type!=="video";});

        for(var di=0;di<docs.length;di++){
          if(this.aborted){this.running=false;return;}
          var doc=docs[di]; progress("文档",doc.title||doc.filename);
          eval(COMPLETE_DOC); _completed++; await sleep(600);
        }

        for(var vi=0;vi<videos.length;vi++){
          if(this.aborted){this.running=false;return;}
          this.status="video"; CURRENT={index:vi,total:videos.length,title:videos[vi].title||videos[vi].filename,pct:0};
          if(!await processVideo(videos[vi],vi,videos.length,progress)){ this.running=false; return; }
          _completed++;
        }

        for(var oi=0;oi<others.length;oi++){
          if(this.aborted){this.running=false;return;}
          progress("未知类型: "+others[oi].type,""); _completed++;
        }
        setBar(100); setHead("全部完成 "+_completed+"/"+_total); setDetail("");
        this.running=false; this.status="done";
      }catch(e){ setHead("异常: "+e.message); setDetail(""); this.running=false; this.status="error"; }
    }
  };
  window.__CX_RUNNER=runner; runner.start();
})();
`;

export const COURSE_RUNNER_TEMPLATE = `
(function() {
  if (window.__CX_COURSE_RUNNER && window.__CX_COURSE_RUNNER.running) return;

  var DISCOVER = ___DISCOVER___;
  var COMPLETE_DOC = ___COMPLETE_DOC___;
  var COMPLETE_VIDEO = ___COMPLETE_VIDEO___;
  var GET_STATE = ___GET_STATE___;
  var CHAPTERS = ___CHAPTERS___;
  var GOTO = ___GOTO___;
  var SPEED_MODE = ___SPEED___;
  var POLL_MS = 500, VERIFY_MS = 1500;

  function parseResult(r) { return typeof r === "string" ? JSON.parse(r) : r; }
  function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

  var box = document.getElementById("__cx_runner_box");

  function render(head, detail, barPct) {
    if(!box)return;
    var cr=window.__CX_COURSE_RUNNER;
    box.innerHTML=
      '<span id="__cx_runner_close" style="position:absolute;top:4px;right:8px;cursor:pointer;color:#aaa;font-size:13px;">x</span>'+
      '<div style="font-weight:bold;margin-bottom:2px;color:#1a73e8;font-size:12px;">超星助手 - 课程自动完成</div>'+
      '<div style="font-size:10px;color:#999;">章节 '+(cr?cr._chDone+1:0)+'/'+(cr?cr._chTotal:0)+'</div>'+
      '<div style="font-size:11px;color:#333;">'+(head||"")+'</div>'+
      '<div style="font-size:11px;color:#666;margin-top:1px;">'+(detail||"")+'</div>'+
      '<div style="margin-top:4px;height:3px;background:#e0e0e0;overflow:hidden;">'+
        '<div style="height:100%;width:'+(barPct||0)+'%;background:#1a73e8;transition:width 0.3s;"></div></div>';
    document.getElementById("__cx_runner_close").addEventListener("click",function(){
      if(window.__CX_COURSE_RUNNER)window.__CX_COURSE_RUNNER.aborted=true;
    });
  }

  var ABORT = function(){ return window.__CX_COURSE_RUNNER && window.__CX_COURSE_RUNNER.aborted; };
  var CURRENT = {pct:0};

  ___VIDEO_LOOP___

  async function processChapter() {
    await sleep(3000);
    var data=parseResult(eval(DISCOVER));
    if(data.error) return {ok:false,error:data.error};
    var pending=data.taskPoints.filter(function(t){return !t.isFinished;});
    if(pending.length===0) return {ok:true};
    var _completed=0,_total=pending.length;
    var docs=pending.filter(function(t){return t.type==="document";});
    var videos=pending.filter(function(t){return t.type==="video";});
    var others=pending.filter(function(t){return t.type!=="document"&&t.type!=="video";});
    var cr=window.__CX_COURSE_RUNNER;

    for(var di=0;di<docs.length;di++){
      if(ABORT()) return {abort:true}; eval(COMPLETE_DOC); _completed++;
      render("[任务 "+_completed+"/"+_total+"] 文档完成", docs[di].title||docs[di].filename, Math.round((_completed/_total)*100));
      await sleep(500);
    }
    for(var vi=0;vi<videos.length;vi++){
      if(ABORT()) return {abort:true};
      CURRENT={index:vi,total:videos.length,title:videos[vi].title||videos[vi].filename,pct:0};
      if(!await processVideo(videos[vi],vi,videos.length,function(h,d,p){
        render("[任务 "+(_completed+1)+"/"+_total+"] "+(h||""), d||"", Math.round(((_completed+(p||0)/100)/_total)*100));
      })) return {abort:true};
      _completed++;
    }
    for(var oi=0;oi<others.length;oi++) _completed++;
    render("本章完成 "+_completed+"/"+_total, "", 100);
    return {ok:true};
  }

  async function main(){
    var chData=parseResult(eval(CHAPTERS));
    if(chData.error){ render("错误: "+chData.error,"",0); return; }
    var pending=chData.chapters.filter(function(c){return c.isLeaf&&c.unfinished>0;});
    pending.sort(function(a,b){var an=a.number.split(".").map(Number),bn=b.number.split(".").map(Number);for(var i=0;i<Math.max(an.length,bn.length);i++)if((an[i]||0)!==(bn[i]||0))return (an[i]||0)-(bn[i]||0);return 0;});
    if(pending.length===0){ render("全部章节已完成！","",100); return; }
    var chTotal=pending.length,chDone=0,skippedCount=0;
    window.__CX_COURSE_RUNNER={running:true,aborted:false,_chTotal:chTotal,_chDone:chDone};
    for(var ci=0;ci<pending.length;ci++){
      if(window.__CX_COURSE_RUNNER.aborted)break;
      var ch=pending[ci]; window.__CX_COURSE_RUNNER._ch=ch; window.__CX_COURSE_RUNNER._chDone=chDone;
      render("跳转中...","",0);
      eval(GOTO.replace("\${nodeId}",ch.id));
      await sleep(5000);
      var result=await processChapter();
      if(result.abort)break; if(result.ok)chDone++; else skippedCount++;
      await sleep(1000);
    }
    var msg="课程完成 "+chDone+"/"+chTotal;
    if(skippedCount>0)msg+=" ("+skippedCount+" 个需手动完成)";
    render(msg,"",100); window.__CX_COURSE_RUNNER.running=false;
  }
  main();
})();
`;

export function buildRunner({ discover, completeDoc, completeVideo, getState, speed }) {
  return TASK_RUNNER_TEMPLATE
    .replace("___DISCOVER___", JSON.stringify(discover))
    .replace("___COMPLETE_DOC___", JSON.stringify(completeDoc))
    .replace("___COMPLETE_VIDEO___", JSON.stringify(completeVideo))
    .replace("___GET_STATE___", JSON.stringify(getState))
    .replace("___SPEED___", speed === "auto" ? '"auto"' : JSON.stringify(speed || "1"))
    .replace("___VIDEO_LOOP___", VIDEO_LOOP);
}

export function buildCourseRunner({ discover, completeDoc, completeVideo, getState, chapters, gotoChapter, speed }) {
  return COURSE_RUNNER_TEMPLATE
    .replace("___DISCOVER___", JSON.stringify(discover))
    .replace("___COMPLETE_DOC___", JSON.stringify(completeDoc))
    .replace("___COMPLETE_VIDEO___", JSON.stringify(completeVideo))
    .replace("___GET_STATE___", JSON.stringify(getState))
    .replace("___CHAPTERS___", JSON.stringify(chapters))
    .replace("___GOTO___", JSON.stringify(gotoChapter))
    .replace("___SPEED___", speed === "auto" ? '"auto"' : JSON.stringify(speed || "1"))
    .replace("___VIDEO_LOOP___", VIDEO_LOOP);
}
