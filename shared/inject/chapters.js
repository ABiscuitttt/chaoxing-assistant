/**
 * shared/inject/chapters.js
 * 从左侧目录 #coursetree 提取所有章节及其 nodeId
 *
 * 返回 JSON 字符串
 */

export const CHAPTERS_SCRIPT = `
(function () {
  // 尝试多个容器选择器（课程首页 vs 学习页面）
  var tree = document.querySelector("#coursetree");
  if (!tree) {
    // 学习页面：左侧目录在 .posChapter 中
    var pos = document.querySelector(".posChapter");
    if (pos) tree = pos.querySelector("div:first-child, [class*='chapter']");
  }
  if (!tree) {
    // 最后回退：直接搜所有含章节格式的 li
    var allLi = document.querySelectorAll("li");
    var chapters = [];
    allLi.forEach(function(li){
      var txt = (li.textContent||"").replace(/\\s+/g," ").trim();
      var m = txt.match(/^(\\d+(?:\\.\\d+)?)\\s+(.+)/);
      if(m && txt.length > 3 && txt.length < 300 && !li.querySelector("ul, ol")){
        chapters.push({
          id: "",
          number: m[1],
          title: m[2].slice(0,80),
          isLeaf: true,
          depth: 0,
        });
      }
    });
    return JSON.stringify({ total: chapters.length, leaves: chapters.length, chapters: chapters, fallback: true });
  }

  var chapters = [];

  function walk(ul, depth, parentNumber) {
    if (!ul || !ul.children) return;
    for (var i = 0; i < ul.children.length; i++) {
      var li = ul.children[i];
      if (li.tagName !== "LI") continue;

      var div = li.querySelector("div.posCatalog_select, div.firstLayer");
      var span = div ? div.querySelector("span.posCatalog_title, span.posCatalog_name") : null;
      var em = span ? span.querySelector("em.posCatalog_sbar") : null;

      var number = em ? em.textContent.trim() : "";
      var title = span ? span.textContent.trim() : "";
      // 去掉编号前缀
      if (em && title.startsWith(number)) title = title.slice(number.length).trim();

      var nodeId = div ? div.id.replace(/^cur/, "") : "";

      var hasChildren = !!li.querySelector("ul");
      var ch = {
        id: nodeId,
        number: number,
        title: title,
        isLeaf: !hasChildren,
        depth: depth,
      };
      chapters.push(ch);

      var subUl = li.querySelector(":scope > ul, :scope > div > ul");
      if (subUl) walk(subUl, depth + 1, number);
    }
  }

  // 从 tree 下的第一个 UL 开始遍历
  var startUl = tree.querySelector("ul");
  if (startUl) walk(startUl, 0, "");

  var leaves = chapters.filter(function (c) { return c.isLeaf; });
  return JSON.stringify({
    total: chapters.length,
    leaves: leaves.length,
    chapters: chapters,
  });
})();
`;

/** 点击指定章节（按 nodeId） */
export function GOTO_CHAPTER(nodeId) {
  return `
(function(){
  var el = document.querySelector("#coursetree [id$='${nodeId}']");
  if (!el) {
    el = document.querySelector("#coursetree [id$='cur${nodeId}']");
  }
  if (!el) return "not found: ${nodeId}";
  var span = el.querySelector("span.posCatalog_name, span.posCatalog_title");
  if (span) { span.click(); return "clicked ${nodeId}"; }
  el.click();
  return "clicked el ${nodeId}";
})();
`;
}
