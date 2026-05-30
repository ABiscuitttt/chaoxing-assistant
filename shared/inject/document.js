/**
 * shared/inject/document.js
 * 文档任务点操作脚本
 */

/** 提取文档下载 URL（需要先加载 panView iframe） */
export const GET_DOWNLOAD_URL = `
(function(){
  var mf=document.getElementById("iframe");
  if(!mf)return JSON.stringify({error:"no iframe"});
  var doc=mf.contentDocument||mf.contentWindow.document;
  var pdfFrame=doc.querySelector("iframe.insertdoc-online-pdf");
  if(!pdfFrame)return JSON.stringify({error:"no pdf frame"});
  var pDoc=pdfFrame.contentDocument||pdfFrame.contentWindow.document;
  var panFrame=pDoc.querySelector("#panView");
  if(!panFrame)return JSON.stringify({error:"no panView"});
  var panDoc=panFrame.contentDocument||panFrame.contentWindow.document;
  var body=panDoc.body?panDoc.body.textContent:"";

  var dm=body.match(/download['"]?\s*:\s*['"]([^'"]+)['"]/);
  var nm=body.match(/name['"]?\s*:\s*['"]([^'"]+\.\w+)['"]/i);

  return JSON.stringify({
    downloadUrl: dm ? dm[1] : null,
    filename: nm ? nm[1] : null
  });
})();
`;

/** 触发浏览器下载（创建 <a> 点击） */
export function TRIGGER_DOWNLOAD(url, filename) {
  const fn = filename || "document.pdf";
  return `
(function(){
  var a=document.createElement("a");
  a.href="${url}";
  a.download="${fn}";
  a.style.display="none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return "download triggered: ${fn}";
})();
`;
}

/** 获取 PDF iframe 内部关键变量 */
export const GET_PDF_INTERNALS = `
(function(){
  var mf=document.getElementById("iframe");
  if(!mf)return"no iframe";
  var doc=mf.contentDocument||mf.contentWindow.document;
  var pdfFrame=doc.querySelector("iframe.insertdoc-online-pdf");
  if(!pdfFrame)return"no pdf frame";
  var pw=pdfFrame.contentWindow;
  return JSON.stringify({
    isJob: typeof pw.isJob==="function"?pw.isJob():null,
    jobid: pw.jobid||"",
    _jobindex: pw._jobindex||"",
    targetPageNum: pw.targetPageNum||"",
    hasJobToFinish: typeof pw.hasJobToFinish==="function"?pw.hasJobToFinish():null,
    hasFinishJob: typeof pw.finishJob==="function",
    hasUnMask: typeof pw.unMaskAndFinishJob==="function",
  });
})();
`;
