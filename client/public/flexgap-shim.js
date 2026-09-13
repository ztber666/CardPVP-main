/*!
 * CardPVP flex-gap 兼容补丁
 *
 * 背景：Chromium 84 之前的浏览器（以及 Win7 上不少双核浏览器的"极速模式"内核，
 * 例如 360安全浏览器 13 / 搜狗高速浏览器等）不支持 flex 布局的 gap，
 * 页面里所有 flex 容器上的间距会全部消失，元素挤在一起。
 *
 * 做法：在不支持 flex gap 的浏览器上，把 gap 换算成子元素的 margin；
 * 支持 flex gap 的现代浏览器会直接 return，不做任何改动。
 * 只监听 class 变化和节点增删（不监听 style，避免动画期间频繁重算）。
 */
(function () {
  'use strict';

  function supportsFlexGap() {
    var wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:10px;position:absolute;left:-9999px;top:-9999px;width:20px;';
    var a = document.createElement('div');
    a.style.cssText = 'height:0px;margin:0;padding:0;';
    var b = document.createElement('div');
    b.style.cssText = 'height:0px;margin:0;padding:0;';
    wrap.appendChild(a);
    wrap.appendChild(b);
    var host = document.body || document.documentElement;
    if (!host) return true;
    host.appendChild(wrap);
    var h = wrap.getBoundingClientRect ? wrap.getBoundingClientRect().height : wrap.offsetHeight;
    host.removeChild(wrap);
    return h >= 5;
  }

  if (supportsFlexGap()) return; // 现代内核：什么都不做

  // 供 /check.html 自检页识别补丁是否生效
  window.__cardpvpFlexGapShim = true;

  var MARK = 'data-fg';
  var scheduled = false;
  var pending = [];

  function num(v) {
    var n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  function gapValue(cs, prop, fallback) {
    var v = cs[prop];
    if (v === undefined || v === '' || v === 'normal') v = cs[fallback];
    return num(v);
  }

  function fixElement(el) {
    if (!el || el.nodeType !== 1) return;
    var cs;
    try { cs = window.getComputedStyle(el); } catch (e) { return; }
    if (!cs) return;
    var display = cs.display;
    if (display !== 'flex' && display !== 'inline-flex') return;

    var rowGap = gapValue(cs, 'rowGap', 'gap');
    var colGap = gapValue(cs, 'columnGap', 'gap');
    if (rowGap <= 0 && colGap <= 0) return;

    var isColumn = String(cs.flexDirection || '').indexOf('column') === 0;
    var value = isColumn ? rowGap : colGap;
    var attr = MARK + (isColumn ? 't' : 'l');
    var otherAttr = MARK + (isColumn ? 'l' : 't');
    var prop = isColumn ? 'marginTop' : 'marginLeft';
    var otherProp = isColumn ? 'marginLeft' : 'marginTop';

    var kids = el.children;
    for (var i = 0; i < kids.length; i++) {
      var kid = kids[i];
      if (kid.nodeType !== 1) continue;
      // 方向变化时清掉另一侧残留的补丁
      if (kid.getAttribute(otherAttr) !== null) {
        kid.style[otherProp] = '';
        kid.removeAttribute(otherAttr);
      }
      var want = i === 0 ? '' : value + 'px';
      if (kid.getAttribute(attr) === want) continue;
      kid.style[prop] = want;
      if (want) kid.setAttribute(attr, want);
      else kid.removeAttribute(attr);
    }
  }

  function scan(root) {
    if (!root || root.nodeType !== 1) return;
    fixElement(root);
    fixElement(root.parentNode);
    var all = root.getElementsByTagName('*');
    for (var i = 0; i < all.length; i++) fixElement(all[i]);
  }

  function flush() {
    scheduled = false;
    var list = pending;
    pending = [];
    for (var i = 0; i < list.length; i++) scan(list[i]);
  }

  function schedule(node) {
    if (!node || node.nodeType !== 1) return;
    if (pending.indexOf(node) !== -1) return;
    pending.push(node);
    if (scheduled) return;
    scheduled = true;
    if (window.requestAnimationFrame) window.requestAnimationFrame(flush);
    else setTimeout(flush, 16);
  }

  function start() {
    scan(document.body || document.documentElement);
    if (!window.MutationObserver) return;
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type === 'childList') {
          for (var j = 0; j < m.addedNodes.length; j++) schedule(m.addedNodes[j]);
          if (m.addedNodes.length) schedule(m.target);
        } else {
          schedule(m.target);
        }
      }
    });
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
