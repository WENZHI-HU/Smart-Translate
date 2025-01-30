// ==UserScript==
// @name         Smart Hover Translator
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  【点击关闭】可拖动开关+防抖悬停翻译
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// ==/UserScript==

GM_addStyle(`
  #translator-switch {
    position: fixed;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    cursor: move;
    z-index: 2147483647;
    border: 2px solid #fff;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    transition: transform 0.2s, background 0.3s;
    touch-action: none;
  }
  #translator-switch.disabled {
    background: #ff4444;
  }
  #translator-switch.enabled {
    background: #00C853;
    transform: scale(1.1);
  }
  .trans-popup {
    position: fixed;
    max-width: 400px;
    padding: 10px 14px;
    background: rgba(255,255,255,0.95);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    font: 14px/1.5 'Microsoft YaHei', sans-serif;
    backdrop-filter: blur(4px);
    z-index: 2147483646;
    pointer-events: auto;
    cursor: text;
    animation: fadeIn 0.2s;
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(5px); }
    to { opacity: 1; transform: translateY(0); }
  }
`);

/****************** 核心逻辑 ******************/
let translatorEnabled = false;
let currentPopup = null;
let activeRequest = null;
let isDragging = false;

// 创建悬浮开关
const switchBtn = document.createElement('div');
switchBtn.id = 'translator-switch';
switchBtn.className = 'disabled';
initSwitchPosition();
document.body.appendChild(switchBtn);

/*********** 拖动功能 ***********/
let dragStartX = 0, dragStartY = 0;
let switchX = 0, switchY = 0;

switchBtn.addEventListener('mousedown', startDrag);
switchBtn.addEventListener('touchstart', startDrag, { passive: false });

function startDrag(e) {
  e.preventDefault();
  isDragging = true;
  const rect = switchBtn.getBoundingClientRect();
  switchX = rect.left;
  switchY = rect.top;
  dragStartX = e.clientX || e.touches[0].clientX;
  dragStartY = e.clientY || e.touches[0].clientY;

  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', endDrag);
  document.addEventListener('touchmove', onDrag);
  document.addEventListener('touchend', endDrag);
}

function onDrag(e) {
  if (!isDragging) return;
  e.preventDefault();

  const clientX = e.clientX || e.touches[0].clientX;
  const clientY = e.clientY || e.touches[0].clientY;
  const deltaX = clientX - dragStartX;
  const deltaY = clientY - dragStartY;

  const newX = Math.max(0, Math.min(window.innerWidth - 24, switchX + deltaX));
  const newY = Math.max(0, Math.min(window.innerHeight - 24, switchY + deltaY));

  switchBtn.style.left = `${newX}px`;
  switchBtn.style.top = `${newY}px`;
}

function endDrag(e) {
  isDragging = false;
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', endDrag);
  document.removeEventListener('touchmove', onDrag);
  document.removeEventListener('touchend', endDrag);

  const moveThreshold = 4;
  const deltaX = Math.abs((e.clientX || e.changedTouches[0].clientX) - dragStartX);
  const deltaY = Math.abs((e.clientY || e.changedTouches[0].clientY) - dragStartY);

  if (deltaX < moveThreshold && deltaY < moveThreshold) {
    toggleTranslator();
  }
}

/*********** 翻译功能 ***********/
let lastTranslateTime = 0;

document.addEventListener('mouseup', async (e) => {
  if (!translatorEnabled || isDragging) return;

  const now = Date.now();
  if (now - lastTranslateTime < 200) return;
  lastTranslateTime = now;

  if (activeRequest) {
    activeRequest.abort();
    activeRequest = null;
  }

  const text = window.getSelection().toString().trim();
  if (!text || text.length > 3000) return;

  try {
    showPopup('翻译中...', e);

    const isChinese = /[\u4e00-\u9fa5]/.test(text);
    const apiUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${isChinese ? 'zh-CN' : 'en'}&tl=${isChinese ? 'en' : 'zh-CN'}&dt=t&q=${encodeURIComponent(text)}`;

    activeRequest = GM_xmlhttpRequest({
      method: 'GET',
      url: apiUrl,
      timeout: 5000,
      onload: (res) => {
        try {
          const data = JSON.parse(res.responseText);
          const result = data[0].map(item => item[0]).join('');
          showPopup(result, e);
        } catch {
          showPopup('解析失败', e);
        }
      },
      onerror: () => showPopup('请求失败', e),
      ontimeout: () => showPopup('超时', e)
    });
  } catch (err) {
    console.error('翻译异常:', err);
  }
});

/*********** 点击关闭弹窗功能 ***********/
function showPopup(text, e) {
  clearPopup();

  currentPopup = document.createElement('div');
  currentPopup.className = 'trans-popup';

  // 智能定位
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  let posX = e.clientX + 15;
  let posY = e.clientY + 20;

  if (posX + 400 > viewportWidth) posX = viewportWidth - 420;
  if (posY + 150 > viewportHeight) posY = e.clientY - 160;

  currentPopup.style.left = `${posX}px`;
  currentPopup.style.top = `${posY}px`;
  currentPopup.textContent = text;

  // 阻止弹窗点击冒泡
  currentPopup.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // 全局点击监听
  document.addEventListener('click', handleClickOutside);

  document.body.appendChild(currentPopup);
}

function handleClickOutside(e) {
  if (currentPopup && !currentPopup.contains(e.target)) {
    clearPopup();
  }
}

function clearPopup() {
  if (currentPopup) {
    document.removeEventListener('click', handleClickOutside);
    currentPopup.remove();
    currentPopup = null;
  }
}

function toggleTranslator() {
  translatorEnabled = !translatorEnabled;
  switchBtn.className = translatorEnabled ? 'enabled' : 'disabled';
  if (!translatorEnabled) clearPopup();
}

function initSwitchPosition() {
  const savedX = localStorage.getItem('translatorSwitchX');
  const savedY = localStorage.getItem('translatorSwitchY');
  switchBtn.style.left = savedX ? `${savedX}px` : '20px';
  switchBtn.style.top = savedY ? `${savedY}px` : '20px';
}

window.addEventListener('beforeunload', () => {
  const rect = switchBtn.getBoundingClientRect();
  localStorage.setItem('translatorSwitchX', rect.left);
  localStorage.setItem('translatorSwitchY', rect.top);
});
