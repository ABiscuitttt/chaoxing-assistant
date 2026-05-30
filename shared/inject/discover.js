/**
 * shared/inject/discover.js
 * 注入浏览器，扫描当前章节页面的所有任务点
 *
 * 返回 JSON 字符串，结构见 ./types.js 中的 TaskPointDiscovery
 *
 * 此脚本通过以下方式使用：
 *   - CLI:  bridge.evaluate(DISCOVER_SCRIPT) → HTTP → WebBridge → eval
 *   - 插件: content script 直接注入 → eval
 */

export const DISCOVER_SCRIPT = `
(function () {
  var result = { courseName: "", chapterTitle: "", taskPoints: [], raw: null };

  try {
    var mf = document.getElementById("iframe");
    if (!mf) { result.error = "未找到主 iframe"; return JSON.stringify(result); }
    var doc = mf.contentDocument || mf.contentWindow.document;

    // ---- 读取 setting 对象 ----
    var setting = null;
    var pdfFrames = doc.querySelectorAll("iframe.insertdoc-online-pdf, iframe.ans-attach-online");
    for (var i = 0; i < pdfFrames.length; i++) {
      try { var w = pdfFrames[i].contentWindow; if (w && w.setting) { setting = w.setting; break; } } catch (e) {}
    }
    if (!setting || !setting.attachments) {
      result.error = "未找到 setting.attachments，页面可能未加载完成";
      return JSON.stringify(result);
    }

    result.courseName = (setting.coursename || "").trim();

    // ---- 从 iframe src 提取 knowledgeid，匹配章节标题 ----
    if (mf.src) {
      var km = mf.src.match(/knowledgeid=(\\d+)/);
      if (km) {
        var kid = km[1];
        result.chapterId = kid;
        // 在 #coursetree 中找 id 匹配的节点
        var nodeEl = document.querySelector("#coursetree [id$='" + kid + "']");
        if (nodeEl) {
          var nameSpan = nodeEl.querySelector("span.posCatalog_name, span.posCatalog_title");
          if (nameSpan) {
            var em = nameSpan.querySelector("em.posCatalog_sbar");
            var title = nameSpan.textContent.trim();
            if (em) title = title.replace(em.textContent, "").trim();
            result.chapterTitle = title;
          }
        }
        if (!result.chapterTitle) result.chapterTitle = "knowledgeId=" + kid;
      }
    }

    // ---- 按 DOM 顺序建立容器映射 ----
    var containers = doc.querySelectorAll(".ans-attach-ct");
    var containerByModule = {};
    var domOrderModules = [];
    for (var ci = 0; ci < containers.length; ci++) {
      var c = containers[ci];
      var iframe = c.querySelector("iframe.ans-attach-online");
      if (iframe) {
        var cls = iframe.className.toString();
        if (cls.indexOf("insertdoc") > -1) { containerByModule.insertdoc = c; domOrderModules.push("insertdoc"); }
        else if (cls.indexOf("insertvideo") > -1) { containerByModule.insertvideo = c; domOrderModules.push("insertvideo"); }
        else { var k = "_other_" + ci; containerByModule[k] = c; domOrderModules.push(k); }
      }
    }

    // ---- 按 DOM 顺序重排 attachments ----
    var attachments = setting.attachments;
    var ordered = [];
    for (var di = 0; di < domOrderModules.length; di++) {
      for (var ai = 0; ai < attachments.length; ai++) {
        var am = (attachments[ai].property && attachments[ai].property.module) || attachments[ai].type;
        if (am === domOrderModules[di] && ordered.indexOf(attachments[ai]) === -1) {
          ordered.push(attachments[ai]);
        }
      }
    }
    for (var ai2 = 0; ai2 < attachments.length; ai2++) {
      if (ordered.indexOf(attachments[ai2]) === -1) ordered.push(attachments[ai2]);
    }

    // ---- 构建任务点列表 ----
    for (var i = 0; i < ordered.length; i++) {
      var att = ordered[i];
      var module = (att.property && att.property.module) || att.type;
      var tp = {
        index: i,
        type: att.type || "unknown",
        jobid: att.jobid || "",
        isFinished: att.isPassed === true,
        title: (att.property && att.property.title) || "",
        filename: (att.property && att.property.name) || "",
        module: module,
      };

      if (att.type === "video" || module === "insertvideo") {
        tp.videoDuration = att.attDuration || 0;
        tp.canFastForward = att.property.fastforward === "true";
        tp.canDoubleSpeed = att.property.doublespeed == 1;
        tp.size = att.property.size || 0;
        tp.sizeHuman = att.property.hsize || "";
      }

      if (att.type === "document" || module === "insertdoc") {
        tp.pageCount = parseInt(att.property.pagenum) || 0;
        tp.size = att.property.size || 0;
        tp.sizeHuman = att.property.hsize || "";
        tp.jtoken = att.jtoken || "";
      }

      var container = containerByModule[module];
      if (container) {
        var jobIcon = container.querySelector(".ans-job-icon");
        if (jobIcon) tp.iconClass = jobIcon.className.toString().trim();
        var taskCond = container.querySelector(".task-condition");
        if (taskCond) tp.completionCondition = (taskCond.textContent || "").replace(/\\s+/g, " ").trim();
        var contentFrame = container.querySelector("iframe.ans-attach-online");
        if (contentFrame) {
          var rect = contentFrame.getBoundingClientRect();
          tp.frameVisible = rect.width > 0 && rect.height > 0;
          tp.frameSrc = contentFrame.src;
        }
      }

      result.taskPoints.push(tp);
    }

    // ---- 原始元数据（便于调试） ----
    result.raw = {
      control: setting.control,
      defaults: setting.defaults ? {
        userid: setting.defaults.userid,
        courseid: setting.defaults.courseid,
        clazzId: setting.defaults.clazzId,
        knowledgeid: setting.defaults.knowledgeid,
        reportTimeInterval: setting.defaults.reportTimeInterval,
      } : null,
    };

  } catch (e) {
    result.error = "脚本异常: " + e.message;
  }

  return JSON.stringify(result);
})();
`;
