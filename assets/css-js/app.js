/* ============================================================
   app.js — Shared core: state, utils, chart helpers, IndexedDB
   cache, data loading (price+volume), filter/tab wiring.
   Loaded before price.js and volume.js.
   ============================================================ */
const state = {
  data:null, geo:null,
  filterProduct:null, filterDateISO:null, filterYear:'', filterRegion:'', filterProvince:'', filterDistrictIdx:'',
  theme:'dark', // enforced dark theme
  sidebarState:{type:null, key:null}
};
const fmt = n => n==null? '-' : n.toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
const $ = id => document.getElementById(id);
const THAI_MONTHS_FULL = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const THAI_MONTHS_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
function thDate(iso, mode='short'){
  if(!iso) return '-';
  const [y,m,dd] = iso.split('-').map(Number);
  const be = y+543;
  if(mode==='full') return `${dd} ${THAI_MONTHS_FULL[m-1]} ${be}`;
  if(mode==='axis') return `${dd} ${THAI_MONTHS_SHORT[m-1]}`;
  return `${dd} ${THAI_MONTHS_SHORT[m-1]} ${String(be).slice(2)}`;
}
function daysInMonth(yearCE, month){ return new Date(yearCE, month, 0).getDate(); }
function buildISO(yearBE, month, day){
  const yearCE = yearBE - 543;
  const dim = daysInMonth(yearCE, month);
  const dd = Math.min(day, dim);
  return `${String(yearCE).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
}

function SC(n){ return Math.round(n * (state.uiScale||1)); }
state.uiScale = 1;
(function initFontSizeSlider(){
  const slider = $('fontSizeRange');
  const valueEl = $('fontSizeValue');
  if(!slider) return;

  // รองรับค่าที่เคยบันทึกจากปุ่ม เล็ก / กลาง / ใหญ่ เดิม
  const legacySize = localStorage.getItem('or_ui_size');
  const legacyPct = {small:88, medium:100, large:132};
  const savedScale = parseInt(localStorage.getItem('or_ui_scale'), 10);
  let currentPct = Number.isFinite(savedScale) ? savedScale : (legacyPct[legacySize] || 100);
  currentPct = Math.max(80, Math.min(150, Math.round(currentPct / 5) * 5));

  let renderTimer = null;
  function apply(pct, rerenderCharts){
    pct = Math.max(80, Math.min(150, Number(pct) || 100));
    state.uiScale = pct / 100;
    document.documentElement.style.setProperty('--ui-scale', state.uiScale);
    slider.value = String(pct);
    if(valueEl) valueEl.textContent = `${pct}%`;
    localStorage.setItem('or_ui_scale', String(pct));

    if(rerenderCharts){
      clearTimeout(renderTimer);
      renderTimer = setTimeout(()=>{
        Object.values(charts).forEach(c=>c.resize());
        const activePageId = document.querySelector('.page.active')?.id || '';
        if((activePageId==='page-volume' || activePageId==='page-share') && typeof renderVolumeAll==='function') renderVolumeAll();
        else if(typeof renderAll==='function') renderAll();
      }, 80);
    }
  }

  // ตัวอักษร DOM ปรับทันทีระหว่างลาก ส่วนกราฟ re-render ตอนปล่อยเมาส์/นิ้ว
  slider.addEventListener('input', ()=>apply(slider.value, false));
  slider.addEventListener('change', ()=>apply(slider.value, true));
  apply(currentPct, false);
})();

(function initThemeSwitch(){
  const saved = localStorage.getItem('or_ui_theme') || 'dark';
  const btn = $('themeToggle');
  function apply(theme, isUserClick){
    document.documentElement.setAttribute('data-theme', theme);
    if(btn) btn.textContent = theme==='light' ? '☾' : '☀';
    localStorage.setItem('or_ui_theme', theme);
    if(isUserClick){
      setTimeout(()=>{ Object.values(charts).forEach(c=>c.resize()); if(typeof renderAll==='function') renderAll(); }, 60);
    }
  }
  if(btn) btn.onclick = ()=> apply(document.documentElement.dataset.theme==='light' ? 'dark' : 'light', true);
  apply(saved, false);
})();

/* ---------- Modern chart styling layer -------------------------------
   Applies a consistent "soft/modern" look to every ECharts instance in
   the dashboard (smooth curved lines, soft gradient area fills, rounded
   bar corners, dot-shaped legend markers) WITHOUT touching each chart's
   own colors/data logic — colors stay exactly as defined per-chart so
   the existing theme palette (--or-blue, --up/--down, product/region
   colors, etc.) is preserved. This only changes *shape*, not *color*. */
function hexToRgba(hex, alpha){
  if(typeof hex !== 'string' || hex[0] !== '#') return null;
  let h = hex.slice(1);
  if(h.length === 3) h = h.split('').map(c=>c+c).join('');
  if(h.length !== 6) return null;
  const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
  return `rgba(${r},${g},${b},${alpha})`;
}
function modernizeSeriesEntry(s, seriesCount){
  if(!s || typeof s !== 'object') return s;
  const many = seriesCount > 4;
  if(s.type === 'line'){
    if(s.smooth === undefined) s.smooth = true;
    if(s.smoothMonotone === undefined) s.smoothMonotone = 'x';
    if(s.showSymbol === undefined) s.showSymbol = false;
    s.symbolSize = s.symbolSize === undefined ? 6 : s.symbolSize;
    s.lineStyle = Object.assign({width: 2.5, cap:'round', join:'round'}, s.lineStyle);
    const lineColor = s.lineStyle.color || (s.itemStyle && s.itemStyle.color) || s.color;
    if(!many && typeof lineColor === 'string' && lineColor[0]==='#' && s.lineStyle.shadowBlur===undefined){
      s.lineStyle.shadowBlur = 4;
      s.lineStyle.shadowColor = hexToRgba(lineColor, 0.22);
      s.lineStyle.shadowOffsetY = 2;
    }
    if(!s.areaStyle && !many){
      const c = (s.itemStyle && s.itemStyle.color) || s.color || (s.lineStyle && s.lineStyle.color);
      if(typeof c === 'string' && c[0] === '#' && typeof echarts !== 'undefined'){
        s.areaStyle = { color: new echarts.graphic.LinearGradient(0,0,0,1,[
          {offset:0, color: hexToRgba(c,0.28)},
          {offset:1, color: hexToRgba(c,0.02)}
        ])};
      } else {
        s.areaStyle = { opacity: 0.12 };
      }
    }
    if(s.emphasis === undefined){
      s.emphasis = { scale: 1.35, focus:'series' };
    }
  }
  if(s.type === 'bar'){
    s.itemStyle = Object.assign({}, s.itemStyle);
    if(!s.stack && s.itemStyle.borderRadius === undefined) s.itemStyle.borderRadius = [6,6,0,0];
    if(s.emphasis === undefined){
      s.emphasis = { itemStyle: { shadowBlur: 12, shadowColor:'rgba(0,0,0,0.25)' }, focus:'series' };
    }
  }
  return s;
}
function modernizeAxis(ax){
  if(!ax || typeof ax !== 'object') return;
  if(ax.axisTick === undefined) ax.axisTick = { show:false };
  if(ax.axisLine && ax.axisLine.lineStyle === undefined){
    ax.axisLine.lineStyle = Object.assign({ opacity: 0.35 }, ax.axisLine.lineStyle);
  }
  if(ax.splitLine && ax.splitLine.lineStyle && ax.splitLine.lineStyle.type === undefined){
    ax.splitLine.lineStyle.type = 'dashed';
    ax.splitLine.lineStyle.opacity = ax.splitLine.lineStyle.opacity === undefined ? 0.5 : ax.splitLine.lineStyle.opacity;
  }
}
function modernizeOption(option){
  if(!option || typeof option !== 'object') return;
  if(option.legend){
    const legends = Array.isArray(option.legend) ? option.legend : [option.legend];
    legends.forEach(l => { if(l && l.icon === undefined) l.icon = 'circle'; if(l && l.itemWidth===undefined) l.itemWidth=8; if(l && l.itemHeight===undefined) l.itemHeight=8; });
  }
  ['xAxis','yAxis'].forEach(key => {
    if(option[key]){
      const axes = Array.isArray(option[key]) ? option[key] : [option[key]];
      axes.forEach(modernizeAxis);
    }
  });
  if(option.series){
    const list = Array.isArray(option.series) ? option.series : [option.series];
    list.forEach(s => modernizeSeriesEntry(s, list.length));
  }
  if(option.tooltip){
    const tips = Array.isArray(option.tooltip) ? option.tooltip : [option.tooltip];
    tips.forEach(t=>{
      if(!t || typeof t !== 'object') return;
      if(t.borderWidth === undefined) t.borderWidth = 0;
      if(t.padding === undefined) t.padding = [10,14];
      if(t.extraCssText === undefined) t.extraCssText = 'border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,0.35); backdrop-filter:blur(6px);';
      if(t.textStyle === undefined) t.textStyle = { fontSize: 12 };
    });
  }
  if(option.animationEasing === undefined) option.animationEasing = 'cubicOut';
  if(option.animationDurationUpdate === undefined) option.animationDurationUpdate = 450;
}

const charts = {};
function getChart(id){
  if(!charts[id]){
    charts[id] = echarts.init($(id), null, {renderer:'canvas'});
    const _origSetOption = charts[id].setOption.bind(charts[id]);
    charts[id].setOption = function(option, ...rest){
      try { modernizeOption(option); } catch(e){ /* never block a render */ }
      return _origSetOption(option, ...rest);
    };
  }
  return charts[id];
}
window.addEventListener('resize', ()=>Object.values(charts).forEach(c=>c.resize()));

const fullscreenCardState = {
  card:null,
  backdrop:null,
  movedNodes:[],
  filterZone:null,
  fontControl:null
};
function scheduleChartResize(){
  requestAnimationFrame(()=>{
    Object.values(charts).forEach(c=>{ try{ c.resize(); }catch(e){} });
  });
  setTimeout(()=>{
    Object.values(charts).forEach(c=>{ try{ c.resize(); }catch(e){} });
  }, 220);
}
function ensureCardBackdrop(){
  if(fullscreenCardState.backdrop) return fullscreenCardState.backdrop;
  const el = document.createElement('div');
  el.className = 'card-fullscreen-backdrop';
  el.addEventListener('click', ()=>toggleCardFullscreen(null));
  document.body.appendChild(el);
  fullscreenCardState.backdrop = el;
  return el;
}
function moveNodeIntoFullscreen(node, host, extraClass){
  if(!node || !host || !node.parentNode) return;
  const style = window.getComputedStyle(node);
  if(style.display === 'none') return;
  const placeholder = document.createComment('fullscreen-restore-point');
  node.parentNode.insertBefore(placeholder, node);
  fullscreenCardState.movedNodes.push({node, placeholder, extraClass});
  if(extraClass) node.classList.add(extraClass);
  host.appendChild(node);
}
function restoreFullscreenNodes(){
  fullscreenCardState.movedNodes.slice().reverse().forEach(({node, placeholder, extraClass})=>{
    if(extraClass) node.classList.remove(extraClass);
    if(placeholder && placeholder.parentNode){
      placeholder.parentNode.insertBefore(node, placeholder);
      placeholder.remove();
    }
  });
  fullscreenCardState.movedNodes = [];
  if(fullscreenCardState.filterZone){
    fullscreenCardState.filterZone.remove();
    fullscreenCardState.filterZone = null;
  }
  if(fullscreenCardState.fontControl){
    fullscreenCardState.fontControl.remove();
    fullscreenCardState.fontControl = null;
  }
}
function buildFullscreenFontControl(){
  const wrap = document.createElement('div');
  wrap.className = 'fullscreen-font-control';
  const mainRange = $('fontSizeRange');
  const current = mainRange ? mainRange.value : String(Math.round((state.uiScale||1)*100));
  wrap.innerHTML = `
    <span class="fullscreen-font-label">ขนาดตัวอักษร</span>
    <span class="fullscreen-font-a fullscreen-font-a-sm">A</span>
    <input type="range" min="80" max="150" step="5" value="${current}" aria-label="ปรับขนาดตัวอักษรในโหมดเต็มจอ">
    <span class="fullscreen-font-a fullscreen-font-a-lg">A</span>
    <span class="fullscreen-font-value">${current}%</span>`;
  const range = wrap.querySelector('input[type="range"]');
  const value = wrap.querySelector('.fullscreen-font-value');
  const sync = (commit)=>{
    value.textContent = `${range.value}%`;
    if(mainRange){
      mainRange.value = range.value;
      mainRange.dispatchEvent(new Event(commit ? 'change' : 'input', {bubbles:true}));
    }else{
      state.uiScale = Number(range.value)/100;
      document.documentElement.style.setProperty('--ui-scale', state.uiScale);
      localStorage.setItem('or_ui_scale', range.value);
      if(commit) scheduleChartResize();
    }
  };
  range.addEventListener('input', ()=>sync(false));
  range.addEventListener('change', ()=>sync(true));
  return wrap;
}
function prepareFullscreenControls(card){
  const zone = document.createElement('div');
  zone.className = 'card-fullscreen-filter-zone';
  const title = card.querySelector('h3');
  if(title) title.insertAdjacentElement('afterend', zone);
  else card.prepend(zone);
  fullscreenCardState.filterZone = zone;

  // ย้าย filter ตัวจริงเข้ามาในหน้าต่างเต็มจอ จึงใช้ event เดิมทั้งหมดได้ทันที
  moveNodeIntoFullscreen(document.querySelector('.filterbar'), zone, 'fullscreen-inline-filterbar');

  // ย้ายแถวเลือกผลิตภัณฑ์ที่กำลังใช้งานเข้ามาด้วย (ราคา/ปริมาณ)
  const globalProduct = $('productIconRow');
  if(globalProduct && window.getComputedStyle(globalProduct).display !== 'none'){
    moveNodeIntoFullscreen(globalProduct, zone, 'fullscreen-inline-productbar');
  }
  const activePage = document.querySelector('.page.active');
  const volumeProduct = activePage && activePage.querySelector('#volProductIconRow');
  if(volumeProduct && window.getComputedStyle(volumeProduct).display !== 'none'){
    moveNodeIntoFullscreen(volumeProduct, zone, 'fullscreen-inline-productbar');
  }

  const fontControl = buildFullscreenFontControl();
  card.appendChild(fontControl);
  fullscreenCardState.fontControl = fontControl;
}
function toggleCardFullscreen(card){
  const current = fullscreenCardState.card;
  if(current && (!card || current === card)){
    const backdrop = ensureCardBackdrop();
    backdrop.classList.remove('active');
    document.body.classList.remove('card-fullscreen-open');
    current.classList.remove('card-fullscreen');
    current.setAttribute('aria-expanded','false');
    restoreFullscreenNodes();
    fullscreenCardState.card = null;
    scheduleChartResize();
    return;
  }
  if(current && current !== card){
    current.classList.remove('card-fullscreen');
    current.setAttribute('aria-expanded','false');
    restoreFullscreenNodes();
    fullscreenCardState.card = null;
  }
  if(card){
    const backdrop = ensureCardBackdrop();
    document.body.classList.add('card-fullscreen-open');
    backdrop.classList.add('active');
    card.classList.add('card-fullscreen');
    card.setAttribute('aria-expanded','true');
    fullscreenCardState.card = card;
    prepareFullscreenControls(card);
    scheduleChartResize();
  }
}
function initCardFullscreenButtons(){
  const cards = Array.from(document.querySelectorAll('.card'));
  cards.forEach((card, index)=>{
    if(card.querySelector('.card-expand-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'card-expand-btn';
    btn.setAttribute('title', 'ขยายดูเต็มจอ');
    btn.setAttribute('aria-label', 'ขยายดูเต็มจอ');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="15 3 21 3 21 9"></polyline>
        <polyline points="9 21 3 21 3 15"></polyline>
        <line x1="21" y1="3" x2="14" y2="10"></line>
        <line x1="3" y1="21" x2="10" y2="14"></line>
      </svg>
      <span class="label-close">ปิด</span>`;
    btn.addEventListener('click', (ev)=>{
      ev.preventDefault();
      ev.stopPropagation();
      toggleCardFullscreen(fullscreenCardState.card === card ? null : card);
    });
    const firstTitle = card.querySelector('h3');
    if(firstTitle){
      const label = (firstTitle.childNodes[0] && firstTitle.childNodes[0].textContent || firstTitle.textContent || `การ์ด ${index+1}`).trim();
      card.dataset.cardTitle = label;
    }
    card.appendChild(btn);
  });

  document.addEventListener('keydown', (ev)=>{
    if(ev.key === 'Escape' && fullscreenCardState.card){
      ev.preventDefault();
      toggleCardFullscreen(null);
    }
  });
}

(function initSidebarCollapse(){
  const btn = document.getElementById('sbCollapseBtn');
  if(!btn) return;
  const saved = localStorage.getItem('pttor-sidebar-collapsed') === '1';
  if(saved) document.body.classList.add('sidebar-collapsed');
  btn.onclick = () => {
    document.body.classList.toggle('sidebar-collapsed');
    localStorage.setItem('pttor-sidebar-collapsed', document.body.classList.contains('sidebar-collapsed') ? '1' : '0');
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
      Object.values(charts).forEach(c => c && c.resize());
    }, 260);
  };
})();

/* ---------- Sticky offset engine: keeps filterbar/product-icon-row
   pinned right under topbar no matter its actual (variable) height,
   so filters stay visible+clickable while scrolling on any screen/font size. */
(function initStickyOffsets(){
  const root = document.documentElement;
  let raf = null;
  function measure(){
    const topbar = document.querySelector('.topbar');
    const filterbar = document.querySelector('.filterbar');
    const topbarH = topbar ? Math.ceil(topbar.getBoundingClientRect().height) : 57;
    const filterbarH = filterbar ? Math.ceil(filterbar.getBoundingClientRect().height) : 56;
    root.style.setProperty('--topbar-h', topbarH + 'px');
    root.style.setProperty('--sticky2-h', (topbarH + filterbarH) + 'px');
  }
  function schedule(){
    if(raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(measure);
  }
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  if(window.ResizeObserver){
    const ro = new ResizeObserver(schedule);
    document.addEventListener('DOMContentLoaded', ()=>{
      const topbar = document.querySelector('.topbar');
      const filterbar = document.querySelector('.filterbar');
      if(topbar) ro.observe(topbar);
      if(filterbar) ro.observe(filterbar);
    });
  }
  document.addEventListener('DOMContentLoaded', schedule);
  window.addEventListener('load', schedule);
  schedule();
})();

const CACHE_DB = 'pttor-insight-cache', CACHE_STORE = 'kv';
const PRICE_CACHE_PREFIX = 'or-price-postgres-v4-month';
const VOLUME_CACHE_PREFIX = 'or-volume-pttor-postgres-v4';

// Browser-side configuration.  In Docker the browser talks only to /api;
// PostgreSQL credentials stay inside the API container.
const APP_CONFIG = window.OR_APP_CONFIG || {};
const DATA_API_BASE = String(APP_CONFIG.apiBase || '/api').replace(/\/+$/,'');
const priceRequests = new Map();
let volumeRequest = null;

async function requestJSON(url, options={}, timeoutMs=45000){
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), timeoutMs);
  try{
    const response = await fetch(url, {...options, signal:controller.signal});
    const raw = await response.text();
    let data;
    try{ data = JSON.parse(raw); }catch{
      throw new Error(response.ok ? 'ข้อมูลที่ได้รับไม่ใช่ JSON' : 'เซิร์ฟเวอร์ตอบกลับ HTTP '+response.status);
    }
    if(!response.ok){
      const error = new Error(data.message || 'HTTP '+response.status);
      error.code = data.code;
      error.status = response.status;
      throw error;
    }
    return data;
  }catch(error){
    if(controller.signal.aborted) throw new Error('เซิร์ฟเวอร์ใช้เวลานานเกิน '+timeoutMs/1000+' วินาที กรุณาลองใหม่');
    if(error instanceof TypeError) throw new Error('เชื่อมต่อ Local API ไม่ได้ กรุณาตรวจสอบ Docker / Nginx / API');
    throw error;
  }finally{
    clearTimeout(timer);
  }
}
function createLocalRpcClient(label){
  return {
    async rpc(name, args={}){
      try{
        const data = await requestJSON(DATA_API_BASE+'/rpc/'+encodeURIComponent(name), {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify(args||{})
        }, name.endsWith('_meta') ? 12000 : 60000);
        return {data, error:null};
      }catch(error){
        if(error.status===404){
          error.message = 'ยังไม่มีคำสั่ง '+name+' ใน Local API / PostgreSQL';
        }else if(error.code==='57014'){
          error.message = 'คำสั่ง '+name+' ใช้เวลานานเกินกำหนด กรุณาตรวจสอบ PostgreSQL';
        }
        return {data:null, error};
      }
    }
  };
}
const priceDb = createLocalRpcClient('ราคา');
const volumeDb = createLocalRpcClient('ปริมาณ');
function idbOpen(){
  return new Promise((resolve,reject)=>{
    const req = indexedDB.open(CACHE_DB, 1);
    let settled = false;
    const finish = (error, db)=>{
      if(settled){ if(db) db.close(); return; }
      settled = true;
      clearTimeout(timer);
      error ? reject(error) : resolve(db);
    };
    const timer = setTimeout(()=>finish(new Error('Cache open timeout')), 1500);
    req.onupgradeneeded = ()=>req.result.createObjectStore(CACHE_STORE);
    req.onsuccess = ()=>finish(null, req.result);
    req.onerror = ()=>finish(req.error);
    req.onblocked = ()=>finish(new Error('Cache is blocked'));
  });
}
async function cacheTransaction(mode, operation){
  let db;
  try{
    db = await idbOpen();
    return await new Promise((resolve,reject)=>{
      const tx = db.transaction(CACHE_STORE,mode);
      const timer = setTimeout(()=>{ tx.abort(); reject(new Error('Cache timeout')); }, 2500);
      let result;
      tx.oncomplete = ()=>{ clearTimeout(timer); resolve(result); };
      tx.onerror = tx.onabort = ()=>{ clearTimeout(timer); reject(tx.error || new Error('Cache transaction failed')); };
      const req = operation(tx.objectStore(CACHE_STORE));
      if(req) req.onsuccess = ()=>{ result=req.result; };
    });
  }catch(error){
    // Storage is optional: blocked/private/full storage must not block the dashboard.
    return null;
  }finally{
    if(db) db.close();
  }
}
function idbGet(key){ return cacheTransaction('readonly', store=>store.get(key)); }
function idbSet(key,value){ return cacheTransaction('readwrite', store=>store.put(value,key)); }
function showLoadError(error){
  console.error(error);
  const overlay = $('loadingOverlay');
  overlay.style.display='flex';
  overlay.querySelector('.spinner').hidden=true;
  $('loadingText').textContent = error.message || String(error);
  $('retryLoad').hidden=false;
}
function showVolumeStatus(message, retry=false){
  document.querySelectorAll('#page-volume, #page-share').forEach(page=>{
    page.classList.toggle('data-unavailable', !state.volumeReady);
    const panel=page.querySelector('.data-load-status');
    panel.hidden=!message;
    panel.querySelector('span').textContent=message;
    panel.querySelector('button').hidden=!retry;
    panel.querySelector('button').onclick=()=>ensureVolumeData();
  });
}
async function ensureVolumeData(){
  if(state.volumeReady) return true;
  if(volumeRequest) return volumeRequest;
  volumeRequest=(async()=>{
    showVolumeStatus('กำลังโหลดข้อมูลปริมาณจำหน่าย...');
    try{
      const meta=await loadVolumeMetaFromSupabase();
      state.volumeMeta=meta;
      const version=String(meta.data_version || meta.latest_period || 'v1').replace(/[^0-9A-Za-z_-]+/g,'_');
      const key=VOLUME_CACHE_PREFIX+'-'+version;
      let ds=await idbGet(key);
      if(!ds || !Array.isArray(ds.recs) || !ds.recs.length){
        ds=await buildVolumeDatasetFromSupabase(meta);
        if(!ds.recs.length) throw new Error('ไม่พบรายการปริมาณจำหน่าย');
        void idbSet(key,ds);
      }
      state.volData=ds;
      buildVolumeIndices();
      state.volumeReady=true;
      if(state.onVolumeReady) state.onVolumeReady();
      showVolumeStatus('');
      renderAll();
      return true;
    }catch(error){
      console.error(error);
      showVolumeStatus(error.message || String(error),true);
      return false;
    }finally{
      volumeRequest=null;
    }
  })();
  return volumeRequest;
}
let xlsxRequest;
function loadXlsx(){
  if(window.XLSX) return Promise.resolve(window.XLSX);
  if(xlsxRequest) return xlsxRequest;
  xlsxRequest=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    const timer=setTimeout(()=>fail(),15000);
    function fail(){
      clearTimeout(timer);
      script.remove();
      xlsxRequest=null;
      reject(new Error('โหลดเครื่องมืออ่านไฟล์ Excel ไม่สำเร็จ กรุณาลองใหม่'));
    }
    script.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    script.onload=()=>{ clearTimeout(timer); window.XLSX ? resolve(window.XLSX) : fail(); };
    script.onerror=fail;
    document.head.appendChild(script);
  });
  return xlsxRequest;
}

function toISO(dateStr){
  const [d] = dateStr.trim().split(' ');
  const [dd, mm, yyBE] = d.split('-');
  const yyCE = parseInt(yyBE, 10) - 543;
  return `${String(yyCE).padStart(4,'0')}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
}
async function fetchSheetRows(url){
  $('loadingText').textContent = `กำลังอ่านไฟล์ ${url.split('/').pop()} ...`;
  const buf = await fetch(url).then(r=>{
    if(!r.ok) throw new Error('โหลดไฟล์ไม่สำเร็จ: '+url);
    return r.arrayBuffer();
  });
  await loadXlsx();
  const wb = XLSX.read(buf, {type:'array'});
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, {header:1, raw:true, defval:null});
}



async function loadVolumeMetaFromSupabase(){
  showVolumeStatus('กำลังเชื่อมต่อข้อมูลปริมาณจำหน่าย...');
  const {data,error} = await volumeDb.rpc('or_volume_meta');
  if(error) throw new Error('อ่านข้อมูลปริมาณ PostgreSQL ไม่สำเร็จ: '+(error.message||error));
  if(!data || !Array.isArray(data.years) || !data.years.length){
    throw new Error('ไม่พบข้อมูลปริมาณของ ปตท. น้ำมันและการค้าปลีก ใน PostgreSQL');
  }
  return data;
}

async function buildVolumeDatasetFromSupabase(meta){
  const provsIdx={}, provsList=[];
  const prodsIdx={}, prodsList=[];
  const pid=p=>(p in provsIdx)?provsIdx[p]:(provsIdx[p]=provsList.length, provsList.push(p), provsIdx[p]);
  const rid=p=>(p in prodsIdx)?prodsIdx[p]:(prodsIdx[p]=prodsList.length, prodsList.push(p), prodsIdx[p]);
  const recs=[];
  const years=[...(meta.years||[])].map(Number).filter(Number.isFinite).sort((a,b)=>a-b);

  const CONCURRENCY=4;
  for(let start=0; start<years.length; start+=CONCURRENCY){
    const batchYears=years.slice(start,start+CONCURRENCY);
    showVolumeStatus('กำลังโหลดปริมาณปี '+batchYears[0]+'–'+batchYears[batchYears.length-1]+' ('+Math.min(start+batchYears.length,years.length)+'/'+years.length+' ปี)...');
    const batch=await Promise.all(batchYears.map(async yearBE=>{
      const {data,error}=await volumeDb.rpc('or_volume_dashboard_year',{p_year_be:yearBE});
      if(error) throw new Error(`โหลดปริมาณปี ${yearBE} ไม่สำเร็จ: `+(error.message||error));
      return {yearBE, rows:Array.isArray(data?.rows)?data.rows:[]};
    }));
    for(const {yearBE,rows} of batch){
      for(const r of rows){
        if(!Array.isArray(r) || r.length<4) continue;
        const month=Number(r[0]);
        const prov=String(r[1]??'').trim();
        const prod=String(r[2]??'').trim();
        const vol=Number(r[3]);
        if(!prov || !prod || !Number.isFinite(month) || !Number.isFinite(vol)) continue;
        recs.push([yearBE, month, pid(prov), rid(prod), Math.round(vol*1000)/1000]);
      }
    }
  }
  return {years, provinces:provsList, products:prodsList, recs};
}

async function loadPriceMetaFromSupabase(){
  $('loadingText').textContent = 'กำลังเชื่อมต่อฐานข้อมูลราคาจาก PostgreSQL...';
  const {data,error} = await priceDb.rpc('or_price_meta');
  if(error) throw new Error('อ่านข้อมูลราคา PostgreSQL ไม่สำเร็จ: '+(error.message||error));
  if(!data || !Array.isArray(data.years) || !data.years.length){
    throw new Error('ไม่พบข้อมูลราคาใน PostgreSQL หรือยังไม่ได้ติดตั้ง Price schema / นำเข้าข้อมูล');
  }
  return data;
}

function mergeCompactPriceYear(globalDs, part){
  const datesIdx = globalDs._datesIdx;
  const provsIdx = globalDs._provsIdx;
  const distsIdx = globalDs._distsIdx;
  const prodsIdx = globalDs._prodsIdx;

  const localDateToGlobal = (part.dates||[]).map(iso=>{
    if(iso in datesIdx) return datesIdx[iso];
    const i=globalDs.dates.length; datesIdx[iso]=i; globalDs.dates.push(iso); return i;
  });
  const localProvToGlobal = (part.provinces||[]).map(name=>{
    if(name in provsIdx) return provsIdx[name];
    const i=globalDs.provinces.length; provsIdx[name]=i; globalDs.provinces.push(name); return i;
  });
  const localProdToGlobal = (part.products||[]).map(name=>{
    if(name in prodsIdx) return prodsIdx[name];
    const i=globalDs.products.length; prodsIdx[name]=i; globalDs.products.push(name); return i;
  });
  const localDistToGlobal = (part.districts||[]).map(dd=>{
    const localProvIdx=Number(dd[0]);
    const provName=(part.provinces||[])[localProvIdx];
    const distName=String(dd[1]??'');
    const key=provName+'|'+distName;
    if(key in distsIdx) return distsIdx[key];
    const globalProvIdx=localProvToGlobal[localProvIdx];
    const i=globalDs.districts.length;
    distsIdx[key]=i;
    globalDs.districts.push([globalProvIdx,distName]);
    return i;
  });

  for(const r of (part.district_prices||[])){
    globalDs.district_prices.push([
      localDateToGlobal[Number(r[0])],
      localDistToGlobal[Number(r[1])],
      localProdToGlobal[Number(r[2])],
      Number(r[3])
    ]);
  }
  for(const r of (part.bangkok_prices||[])){
    globalDs.bangkok_prices.push([
      localDateToGlobal[Number(r[0])],
      localProdToGlobal[Number(r[1])],
      Number(r[2])
    ]);
  }
}

function newEmptyPriceDataset(){
  return {
    dates:[], provinces:[], districts:[], products:[],
    district_prices:[], bangkok_prices:[], transport_cost:{},
    _datesIdx:{}, _provsIdx:{}, _distsIdx:{}, _prodsIdx:{}
  };
}

function sortAndRemapPriceDates(ds){
  const order=ds.dates.map((iso,i)=>i).sort((a,b)=>ds.dates[a].localeCompare(ds.dates[b]));
  let alreadySorted=true;
  for(let i=0;i<order.length;i++){ if(order[i]!==i){ alreadySorted=false; break; } }
  if(alreadySorted) return;
  const oldToNew={};
  order.forEach((oldIdx,newIdx)=>oldToNew[oldIdx]=newIdx);
  ds.dates=order.map(i=>ds.dates[i]);
  ds.district_prices.forEach(r=>{r[0]=oldToNew[r[0]];});
  ds.bangkok_prices.forEach(r=>{r[0]=oldToNew[r[0]];});
  ds._datesIdx={};
  ds.dates.forEach((iso,i)=>{ds._datesIdx[iso]=i;});
}

function priceYearVersion(meta,yearBE){
  const yv=meta?.year_versions || {};
  const latestYear=Math.max(...(meta?.years||[]).map(Number).filter(Number.isFinite));
  return String(
    yv[String(yearBE)] ||
    yv[yearBE] ||
    (yearBE===latestYear ? meta?.data_version : '') ||
    'v1'
  ).replace(/[^0-9A-Za-z_-]+/g,'_');
}

function priceMonthsForYear(meta,yearBE){
  const ym=meta?.year_months || {};
  const raw=ym[String(yearBE)] || ym[yearBE] || [];
  return [...new Set((raw||[]).map(Number).filter(m=>m>=1 && m<=12))].sort((a,b)=>a-b);
}

/* Price date availability (v4.3.3)
   - Year/month options come only from successful/warning imported periods.
   - Days between price-change events remain selectable because prices are
     effective until the next change (forward-fill/as-of semantics).
   - Days before the first known price are not selectable.
   - Future days in the current calendar month are not selectable. */
function localTodayParts(){
  const now=new Date();
  return {year:now.getFullYear(),month:now.getMonth()+1,day:now.getDate()};
}
function priceFirstKnownISO(){
  const v=String(state.priceMeta?.first_price_date||'').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v)?v:'';
}
function priceAvailableDays(yearCE,month){
  yearCE=Number(yearCE); month=Number(month);
  if(!Number.isFinite(yearCE)||!Number.isFinite(month)) return [];
  const yearBE=yearCE+543;
  if(!priceMonthsForYear(state.priceMeta,yearBE).includes(month)) return [];
  const dim=daysInMonth(yearCE,month);
  let start=1, end=dim;
  const first=priceFirstKnownISO();
  const ym=`${String(yearCE).padStart(4,'0')}-${String(month).padStart(2,'0')}`;
  if(first){
    const firstYM=first.slice(0,7);
    if(ym<firstYM) return [];
    if(ym===firstYM) start=Math.max(start,Number(first.slice(8,10))||1);
  }
  const today=localTodayParts();
  const todayYM=`${String(today.year).padStart(4,'0')}-${String(today.month).padStart(2,'0')}`;
  if(ym>todayYM) return [];
  if(yearCE===today.year && month===today.month) end=Math.min(end,today.day);
  if(end<start) return [];
  return Array.from({length:end-start+1},(_,i)=>start+i);
}
function latestSelectablePriceISO(){
  const years=[...(state.priceMeta?.years||[])].map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
  for(let yi=years.length-1; yi>=0; yi--){
    const yearBE=years[yi], yearCE=yearBE-543;
    const months=priceMonthsForYear(state.priceMeta,yearBE);
    for(let mi=months.length-1; mi>=0; mi--){
      const month=months[mi];
      const days=priceAvailableDays(yearCE,month);
      if(days.length) return buildISO(yearBE,month,days[days.length-1]);
    }
  }
  return '';
}

function priceMonthKey(yearBE,month){
  return Number(yearBE)+'-'+String(Number(month)).padStart(2,'0');
}

async function getPriceMonthPart(meta,yearBE,month){
  yearBE=Number(yearBE); month=Number(month);
  const key=PRICE_CACHE_PREFIX+'-'+yearBE+'-'+String(month).padStart(2,'0')+'-'+priceYearVersion(meta,yearBE);
  if(priceRequests.has(key)) return priceRequests.get(key);
  const pending=(async()=>{
    const cached=await idbGet(key);
    if(cached?.dates?.length && Array.isArray(cached.district_prices) && Array.isArray(cached.bangkok_prices)){
      return cached;
    }
    const {data,error}=await priceDb.rpc('or_price_dashboard_month',{p_year_be:yearBE,p_month:month});
    if(error) throw new Error(`โหลดราคาปี ${yearBE} เดือน ${month} ไม่สำเร็จ: `+error.message);
    if(!data || !Array.isArray(data.dates) || !Array.isArray(data.district_prices) || !Array.isArray(data.bangkok_prices)){
      throw new Error(`ข้อมูลราคาปี ${yearBE} เดือน ${month} รูปแบบไม่ถูกต้อง`);
    }
    void idbSet(key,data);
    return data;
  })();
  priceRequests.set(key,pending);
  try{ return await pending; }finally{ priceRequests.delete(key); }
}

function preparePriceMergeIndices(ds){
  ds._datesIdx={}; ds.dates.forEach((x,i)=>{ds._datesIdx[x]=i;});
  ds._provsIdx={}; ds.provinces.forEach((x,i)=>{ds._provsIdx[x]=i;});
  ds._prodsIdx={}; ds.products.forEach((x,i)=>{ds._prodsIdx[x]=i;});
  ds._distsIdx={};
  ds.districts.forEach((dd,i)=>{ds._distsIdx[ds.provinces[dd[0]]+'|'+dd[1]]=i;});
}

function applyTransportCostToDataset(ds,transportRaw){
  ds.transport_cost={};
  const distLookup={};
  ds.districts.forEach((dd,i)=>{distLookup[ds.provinces[dd[0]]+'|'+dd[1]]=i;});
  const altIdx={};
  for(const key in distLookup){
    const [prov,dist]=key.split('|');
    if(dist.startsWith('เมือง') && dist!=='เมือง') altIdx[prov+'|เมือง']=distLookup[key];
  }
  for(const key in (transportRaw||{})){
    if(key in distLookup) ds.transport_cost[distLookup[key]]=transportRaw[key];
    else if(key in altIdx) ds.transport_cost[altIdx[key]]=transportRaw[key];
  }
}

function finishPriceMerge(ds){
  sortAndRemapPriceDates(ds);
  applyTransportCostToDataset(ds,state.transportRaw||{});
  delete ds._datesIdx;
  delete ds._provsIdx;
  delete ds._distsIdx;
  delete ds._prodsIdx;
  buildIndices();
}

async function ensurePriceMonthLoaded(yearBE,month,{silent=false}={}){
  yearBE=Number(yearBE); month=Number(month);
  if(!Number.isFinite(yearBE) || !Number.isFinite(month) || !state.data) return;
  state.loadedPriceMonths ||= new Set();
  const mk=priceMonthKey(yearBE,month);
  if(state.loadedPriceMonths.has(mk)) return;

  if(!silent) $('loadingText').textContent=`กำลังโหลดราคาปี ${yearBE} เดือน ${month}...`;
  const part=await getPriceMonthPart(state.priceMeta,yearBE,month);
  if(state.loadedPriceMonths.has(mk)) return;
  if(!part?.dates?.length){
    state.loadedPriceMonths.add(mk);
    return;
  }
  const ds=state.data;
  preparePriceMergeIndices(ds);
  mergeCompactPriceYear(ds,part);
  finishPriceMerge(ds);
  state.loadedPriceMonths.add(mk);

  const expected=priceMonthsForYear(state.priceMeta,yearBE);
  if(expected.length && expected.every(m=>state.loadedPriceMonths.has(priceMonthKey(yearBE,m)))){
    state.loadedPriceYears ||= new Set();
    state.loadedPriceYears.add(yearBE);
  }
}

async function ensurePriceYearLoaded(yearBE){
  yearBE=Number(yearBE);
  if(!Number.isFinite(yearBE) || !state.data) return;
  state.loadedPriceYears ||= new Set();
  if(state.loadedPriceYears.has(yearBE)) return;
  const months=priceMonthsForYear(state.priceMeta,yearBE);
  for(const month of months){
    await ensurePriceMonthLoaded(yearBE,month,{silent:true});
  }
  state.loadedPriceYears.add(yearBE);
}

async function prefetchPriceYear(yearBE){
  yearBE=Number(yearBE);
  const months=priceMonthsForYear(state.priceMeta,yearBE);
  if(!months.length) return;
  state.loadedPriceMonths ||= new Set();
  const todo=months.filter(m=>!state.loadedPriceMonths.has(priceMonthKey(yearBE,m)));
  if(!todo.length){ state.loadedPriceYears?.add(yearBE); return; }

  // Background prefetch: UI is already visible. Keep concurrency small so browser remains responsive.
  const CONCURRENCY=2;
  for(let i=0;i<todo.length;i+=CONCURRENCY){
    const batch=todo.slice(i,i+CONCURRENCY);
    await Promise.all(batch.map(m=>ensurePriceMonthLoaded(yearBE,m,{silent:true}).catch(err=>{
      console.warn('Background price prefetch failed',yearBE,m,err);
    })));
    if(String(state.filterPriceYear)==String(yearBE-543) && typeof renderAll==='function'){
      renderAll();
    }
    await new Promise(r=>setTimeout(r,60));
  }
}

async function buildDatasetFromSupabase(meta){
  const ds=newEmptyPriceDataset();
  const years=[...(meta.years||[])].map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
  const latestYearBE=years[years.length-1];
  if(!latestYearBE) throw new Error('ไม่พบปีข้อมูลราคา');
  const months=priceMonthsForYear(meta,latestYearBE);
  const latestMonth=months[months.length-1];
  if(!latestMonth) throw new Error('ไม่พบเดือนข้อมูลราคาปีล่าสุด');

  // FAST v2: first paint loads only the newest month, not ~350k rows for the whole year.
  $('loadingText').textContent=`กำลังโหลดข้อมูลล่าสุด ${latestYearBE}-${String(latestMonth).padStart(2,'0')}...`;
  const part=await getPriceMonthPart(meta,latestYearBE,latestMonth);
  mergeCompactPriceYear(ds,part||{});
  sortAndRemapPriceDates(ds);
  applyTransportCostToDataset(ds,state.transportRaw);

  state.loadedPriceMonths=new Set([priceMonthKey(latestYearBE,latestMonth)]);
  state.loadedPriceYears=new Set();
  state.initialPriceYearBE=latestYearBE;

  delete ds._datesIdx;
  delete ds._provsIdx;
  delete ds._distsIdx;
  delete ds._prodsIdx;
  return ds;
}

async function loadTransportCostFromServer(){
  try{
    const payload=await requestJSON(DATA_API_BASE+'/transport-costs',{},15000);
    const rows=Array.isArray(payload?.rows)?payload.rows:[];
    if(rows.length){
      const out={};
      rows.forEach(r=>{
        const prov=String(r.province??'').trim();
        const dist=String(r.district??'').trim();
        const value=Number(r.transport_cost);
        if(prov && dist && Number.isFinite(value)) out[prov+'|'+dist]=value;
      });
      if(Object.keys(out).length) return out;
    }
  }catch(error){
    console.warn('โหลดค่าขนส่งจาก PostgreSQL ไม่สำเร็จ ใช้ไฟล์สำรองแทน',error);
  }
  return requestJSON('assets/data/transport-cost-2549.json',{},15000);
}

async function loadData(){
  if(location.protocol==='file:'){
    throw new Error('กรุณาเปิด Dashboard ผ่าน Docker/Nginx เช่น http://IP-SERVER:8080/DashboardOR.html');
  }
  if(typeof echarts==='undefined'){
    throw new Error('โหลดเครื่องมือกราฟไม่สำเร็จ กรุณาตรวจสอบการเข้าถึง cdn.jsdelivr.net แล้วลองใหม่');
  }
  $('sidebar').classList.remove('open');
  state.sidebarState={type:null,key:null};
  $('loadingText').textContent='กำลังโหลดข้อมูลราคาและแผนที่...';
  const [priceMeta,geo,transportRaw]=await Promise.all([
    loadPriceMetaFromSupabase(),
    requestJSON('assets/data/thailand_th.geojson',{},15000),
    loadTransportCostFromServer()
  ]);
  state.priceMeta=priceMeta;
  state.geo=geo;
  state.transportRaw=transportRaw;
  echarts.registerMap('thailand',geo);
  state.data=await buildDatasetFromSupabase(priceMeta);
  buildIndices();
  // Volume is requested only when its tab is opened; failure cannot block prices.
  state.volData={years:[],provinces:[],products:[],recs:[]};
  state.volumeReady=false;
  buildVolumeIndices();
  initFilters();
  $('loadingOverlay').style.display='none';
  renderAll();
  // Do not block first paint with the full year. Load remaining months quietly afterwards.
  setTimeout(()=>prefetchPriceYear(state.initialPriceYearBE),350);
}


const LOGO_FILE = {
  'เบนซิน':'BENZIN.PNG',
  'เบนซินแก๊สโซฮอล์ 95':'GASOHAL95.png',
  'เบนซินแก๊สโซฮอล์ 91':'GASOHAL91.png',
  'เบนซินแก๊สโซฮอล์ E20':'E20.png',
  'เบนซินแก๊สโซฮอล์ E85':'E85.png',
  'ดีเซล':'DIESEL.png',
  'ดีเซล B20':'B20.png',
  'Super Power GSH95':'SPWGASOHAL95.png',
  'Super Power Diesel':'SPWXDiesel.png',
  'Super Power X99':'SPWX99.png'
};

const PROD_LABEL = {
  'เบนซิน':'เบนซิน 95',
  'เบนซินแก๊สโซฮอล์ 95':'แก๊สโซฮอล์ 95',
  'เบนซินแก๊สโซฮอล์ 91':'แก๊สโซฮอล์ 91',
  'เบนซินแก๊สโซฮอล์ E20':'แก๊สโซฮอล์ E20',
  'เบนซินแก๊สโซฮอล์ E85':'แก๊สโซฮอล์ E85',
  'ดีเซล':'ดีเซล B7',
  'ดีเซล B20':'ดีเซล B20',
  'Super Power GSH95':'Super Power Gasohol 95',
  'Super Power Diesel':'Super Power Diesel B7',
  'Super Power X99':'Super Power X99'
};

const PROD_COLOR_MAP = {
  'เบนซิน': '#F5A623',
  'เบนซินแก๊สโซฮอล์ 95': '#E8622C',
  'เบนซินแก๊สโซฮอล์ 91': '#2F8F4E',
  'เบนซินแก๊สโซฮอล์ E20': '#8CB43A',
  'เบนซินแก๊สโซฮอล์ E85': '#C2368E',
  'ดีเซล': '#2E5FA3',
  'ดีเซล B20': '#C43A3A',
  'Super Power GSH95': '#A9832E',
  'Super Power Diesel': '#1C1C1C',
  'Super Power X99': '#2B2B2B'
};
const PROD_TEXT_MAP = {
  'เบนซิน': '#1A2332',
  'เบนซินแก๊สโซฮอล์ 95': '#FFFFFF',
  'เบนซินแก๊สโซฮอล์ 91': '#FFFFFF',
  'เบนซินแก๊สโซฮอล์ E20': '#1A2332',
  'เบนซินแก๊สโซฮอล์ E85': '#FFFFFF',
  'ดีเซล': '#FFFFFF',
  'ดีเซล B20': '#FFFFFF',
  'Super Power GSH95': '#FFFFFF',
  'Super Power Diesel': '#FFFFFF',
  'Super Power X99': '#FFFFFF'
};
function prodTextColor(name){ return PROD_TEXT_MAP[name] || '#FFFFFF'; }

function dispName(raw){ return PROD_LABEL[raw] || raw; }
function prodColor(name){ return PROD_COLOR_MAP[name] || '#8A9BA8'; }

function sortedProdIdx(products){
  const order = Object.keys(LOGO_FILE);
  const rank = name => { const i = order.indexOf(name); return i===-1 ? 999 : i; };
  return products.map((p,i)=>i).sort((a,b)=> rank(products[a]) - rank(products[b]));
}

function initFilters(){
  const d = state.data;
  const LOGO_ORDER = Object.keys(LOGO_FILE);
  const firstLogoName = LOGO_ORDER.find(name=>d.products.includes(name));
  const defaultProd = firstLogoName ? d.products.indexOf(firstLogoName) : 0;
  state.filterProduct = defaultProd;

  const iconRow = $('productIconRow');
  if(iconRow){
    const idxOf = name => d.products.indexOf(name);
    const ordered = LOGO_ORDER.filter(name=>idxOf(name)!==-1).map(name=>({i:idxOf(name), label:dispName(name), file:LOGO_FILE[name]}));
    const leftover = d.products.map((p,i)=>({i, label:dispName(p), file:LOGO_FILE[p]||null})).filter(it=>!LOGO_ORDER.includes(d.products[it.i]));
    const items = ordered.concat(leftover);
    iconRow.innerHTML = items.map((it)=>`
      <div class="product-icon${it.i===state.filterProduct?' active':''}" data-i="${it.i}" title="${it.label}" style="background:${prodColor(d.products[it.i])}; color:${prodTextColor(d.products[it.i])};">
        ${it.file ? `<img src="assets/Logo/${it.file}" alt="" style="width:118%;height:118%;object-fit:cover;border-radius:50%;display:block;" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">` : ''}
        <span style="display:${it.file?'none':'block'};">${it.label}</span>
      </div>`).join('');
    iconRow.querySelectorAll('.product-icon').forEach(el=>{
      el.onclick = ()=>{
        state.filterProduct = +el.dataset.i;
        iconRow.querySelectorAll('.product-icon').forEach(x=>x.classList.remove('active'));
        el.classList.add('active');
        renderAll();
      };
    });
  }

  const volIconRow = $('volProductIconRow');
  if(volIconRow && state.volData){
    const idxOf = name => d.products.indexOf(name);
    const ordered = LOGO_ORDER.filter(name=>idxOf(name)!==-1).map(name=>({i:idxOf(name), label:dispName(name), file:LOGO_FILE[name]}));
    const leftover = d.products.map((p,i)=>({i, label:dispName(p), file:LOGO_FILE[p]||null})).filter(it=>!LOGO_ORDER.includes(d.products[it.i]));
    const volItems = [{i:-1, label:'รวมทุกผลิตภัณฑ์', file:'ALL.png'}].concat(ordered, leftover);
    state.filterVolProductRaw = -1;
    volIconRow.innerHTML = volItems.map((it)=>`
      <div class="product-icon${it.i===state.filterVolProductRaw?' active':''}" data-i="${it.i}" title="${it.label}" style="background:${it.i===-1?'#0B3D91':prodColor(d.products[it.i])}; color:${it.i===-1?'#FFFFFF':prodTextColor(d.products[it.i])};">
        ${it.file ? `<img src="assets/Logo/${it.file}" alt="" style="width:118%;height:118%;object-fit:cover;border-radius:50%;display:block;" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">` : ''}
        <span style="display:${it.file?'none':'block'};">${it.i===-1?'รวม':it.label}</span>
      </div>`).join('');
    volIconRow.querySelectorAll('.product-icon').forEach(el=>{
      el.onclick = ()=>{
        state.filterVolProductRaw = +el.dataset.i;
        volIconRow.querySelectorAll('.product-icon').forEach(x=>x.classList.remove('active'));
        el.classList.add('active');
        if(state.volData) renderVolumeAll();
      };
    });
  }

  const yearSel = $('fYear');
  const rawPriceYears = (state.priceMeta?.years?.length ? state.priceMeta.years.map(y=>String(Number(y)-543)) : [...new Set(d.dates.map(x=>x.slice(0,4)))]).sort();
  const priceYears = rawPriceYears.filter(y=>priceMonthsForYear(state.priceMeta,Number(y)+543).some(m=>priceAvailableDays(Number(y),m).length));
  let volumeYears = [];

  const monthSel = $('fMonth');
  const daySel = $('fDay');

  function fillYearOptions(isVolPage){
    const years = isVolPage && volumeYears.length ? volumeYears : priceYears;
    const prev = yearSel.value;
    yearSel.innerHTML = '';
    years.forEach(y=>{
      const o=document.createElement('option');
      o.value=y; o.textContent=(+y+543)+' (พ.ศ.)';
      yearSel.appendChild(o);
    });
    if(years.includes(prev)) yearSel.value = prev;
    else if(years.length) yearSel.value = years[years.length-1];
  }

  function priceMonthsForSelectedYear(){
    const yCE=Number(yearSel.value || state.filterPriceYear || priceYears[priceYears.length-1]);
    if(!Number.isFinite(yCE)) return [];
    const fromMeta=priceMonthsForYear(state.priceMeta,yCE+543).filter(m=>priceAvailableDays(yCE,m).length);
    if(fromMeta.length) return fromMeta;
    return [...new Set(d.dates.filter(x=>x.startsWith(String(yCE)+'-')).map(x=>Number(x.slice(5,7))))].sort((a,b)=>a-b);
  }

  function fillMonthOptions(isVolPage){
    const prev = monthSel.value;
    monthSel.innerHTML = '';
    if(isVolPage){
      const all=document.createElement('option'); all.value=''; all.textContent='ทั้งปี'; monthSel.appendChild(all);
      THAI_MONTHS_FULL.forEach((name,i)=>{ const o=document.createElement('option'); o.value=String(i+1); o.textContent=name; monthSel.appendChild(o); });
      const allowed=[...monthSel.options].map(o=>o.value);
      if(allowed.includes(prev)) monthSel.value=prev;
      return;
    }
    const months=priceMonthsForSelectedYear();
    months.forEach(m=>{
      const o=document.createElement('option');
      o.value=String(m); o.textContent=THAI_MONTHS_FULL[m-1];
      monthSel.appendChild(o);
    });
    const allowed=months.map(String);
    if(allowed.includes(prev)) monthSel.value=prev;
    else if(allowed.length) monthSel.value=allowed[allowed.length-1];
  }

  function fillPriceDayOptions(preferredValue){
    const prev = preferredValue!==undefined ? String(preferredValue) : daySel.value;
    daySel.innerHTML='';
    const month=Number(monthSel.value);
    const yearCE=Number(yearSel.value);
    const days=priceAvailableDays(yearCE,month);
    const all=document.createElement('option');
    all.value=''; all.textContent='ภาพรวมเดือน';
    daySel.appendChild(all);
    days.forEach(day=>{
      const o=document.createElement('option');
      o.value=String(day); o.textContent=String(day);
      daySel.appendChild(o);
    });
    const allowed=days.map(String);
    if(prev==='' || allowed.includes(prev)) daySel.value=prev;
    else if(allowed.length) daySel.value=allowed[allowed.length-1];
    else daySel.value='';
    return days;
  }

  function syncDateFilterOptions(page){
    const isVolPage = page==='volume' || page==='share';
    fillYearOptions(isVolPage);
    if(isVolPage){
      fillMonthOptions(true);
      const fallbackY = state.filterVolYear || volumeYears[volumeYears.length-1] || priceYears[priceYears.length-1];
      yearSel.value = volumeYears.includes(String(fallbackY)) ? String(fallbackY) : (volumeYears[volumeYears.length-1] || String(fallbackY));
      monthSel.value = state.filterVolMonth ?? '';
    } else {
      const desiredYear=String(state.filterPriceYear || priceYears[priceYears.length-1] || '');
      if(priceYears.includes(desiredYear)) yearSel.value=desiredYear;
      fillMonthOptions(false);
      const months=priceMonthsForSelectedYear().map(String);
      const desiredMonth=String(state.filterPriceMonth || '');
      monthSel.value=months.includes(desiredMonth)?desiredMonth:(months[months.length-1]||'');
      fillPriceDayOptions(state.filterDay ?? '');
    }
  }
  window.syncDateFilterOptions = syncDateFilterOptions;
  fillYearOptions(false);
  fillMonthOptions(false);

  const latestSelectableISO = latestSelectablePriceISO() || d.dates[d.dates.length-1];
  const [initY, initM, initD] = latestSelectableISO.split('-').map(Number);

  state.filterPriceYear = String(initY);
  state.filterPriceMonth = String(initM);
  state.filterDay = String(initD);
  yearSel.value = state.filterPriceYear;
  fillMonthOptions(false);
  monthSel.value = state.filterPriceMonth;
  fillPriceDayOptions(state.filterDay);
  state.filterDateISO = latestSelectableISO;

  const latestVolYearBE = state.volData?.years?.[state.volData.years.length-1];
  let latestVolYearCE = latestVolYearBE ? String(+latestVolYearBE-543) : String(initY);
  const latestVolMonths = state.volData?.recs
    ?.filter(r=>r[0]===latestVolYearBE)
    .map(r=>+r[1]) || [];
  let latestVolMonth = latestVolMonths.length ? String(Math.max(...latestVolMonths)) : '';
  state.filterVolYear = latestVolYearCE;
  state.filterVolMonth = latestVolMonth;
  state.onVolumeReady=()=>{
    volumeYears=state.volData.years.map(y=>String(+y-543)).sort();
    latestVolYearCE=volumeYears[volumeYears.length-1];
    const months=state.volData.recs.filter(r=>r[0]===Number(latestVolYearCE)+543).map(r=>r[1]);
    latestVolMonth=months.length ? String(Math.max(...months)) : '';
    state.filterVolYear=latestVolYearCE;
    state.filterVolMonth=latestVolMonth;
    const page=document.querySelector('.tab-btn.active')?.dataset.page || 'overview';
    syncDateFilterOptions(page);
    refreshProvinceOptions();
  };

  const regionSel = $('fRegion');
  Object.keys(REGIONS).forEach(r=>{ const o=document.createElement('option'); o.value=r; o.textContent=r; regionSel.appendChild(o); });

  const provSel = $('fProvince');
  const distSel = $('fDistrict');

  function refreshProvinceOptions(){
    const region = state.filterRegion;
    provSel.innerHTML = '<option value="">ทั้งหมด</option>';
    const page=document.querySelector('.tab-btn.active')?.dataset.page;
    let provs = [...((page==='volume' || page==='share') && state.volumeReady ? state.volData.provinces : d.provinces)];
    if(region) provs = provs.filter(p=>regionOf(p)===region);
    provs.sort((a,b)=>a.localeCompare(b,'th'));
    provs.forEach(p=>{
      const o=document.createElement('option'); o.value=p;
      o.textContent = p==='กรุงเทพมหานคร' ? 'กรุงเทพมหานคร (ราคากลาง)'
        : d._zeroTransportProvinces.has(p) ? p+' (ค่าขนส่ง 0 บาท — ราคาเท่า กทม.)'
        : p;
      provSel.appendChild(o);
    });
    if(state.filterProvince && provs.includes(state.filterProvince)) provSel.value = state.filterProvince;
    else { state.filterProvince = ''; provSel.value = ''; }
  }
  refreshProvinceOptions(); 

  function refreshDistrictOptions(){
    const prov = state.filterProvince;
    distSel.innerHTML = '<option value="">ทั้งหมด</option>';
    if(!prov || prov==='กรุงเทพมหานคร') return;
    const provIdx = d.provinces.indexOf(prov);
    const distIdxs = (d._provDists[provIdx] || []).slice()
      .sort((a,b)=>d.districts[a][1].localeCompare(d.districts[b][1],'th'));
    distIdxs.forEach(i=>{ const o=document.createElement('option'); o.value=i; o.textContent=d.districts[i][1]; distSel.appendChild(o); });
  }

  window.setProvinceFilter = (prov)=>{
    if(state.filterProvince === prov && !state.filterDistrictIdx){ prov = ''; }
    state.filterProvince = prov; state.filterDistrictIdx = '';
    provSel.value = prov; refreshDistrictOptions(); distSel.value = '';
    renderAll();
    return prov === '';
  };
  window.setDistrictFilter = (distIdx)=>{
    if(String(state.filterDistrictIdx) === String(distIdx)){
      state.filterDistrictIdx = '';
      distSel.value = '';
      renderAll();
      return true;
    }
    const dd = d.districts[distIdx];
    const prov = d.provinces[dd[0]];
    state.filterProvince = prov; state.filterDistrictIdx = String(distIdx);
    provSel.value = prov; refreshDistrictOptions(); distSel.value = String(distIdx);
    renderAll();
    return false;
  };

  let dateRequest=0;
  async function updateDateFromPickers(){
    const request=++dateRequest;
    const activeTab = document.querySelector('.tab-btn.active')?.dataset.page;
    const isVolPage = activeTab==='volume' || activeTab==='share';

    if(isVolPage){
      state.filterVolYear = yearSel.value;
      state.filterVolMonth = monthSel.value;
      if(state.volData) renderVolumeAll();
      return;
    }

    const previousYear=state.filterPriceYear;
    const previousMonth=state.filterPriceMonth;
    const previousDay=state.filterDay;
    const previousDateISO=state.filterDateISO;
    state.filterPriceYear = yearSel.value;
    state.filterPriceMonth = monthSel.value;
    const yearBE = +yearSel.value + 543;

    // FAST v2: load only the selected month. The remaining months are prefetched in background.
    const selectedMonth=Number(monthSel.value);
    const mk=priceMonthKey(yearBE,selectedMonth);
    if(!(state.loadedPriceMonths?.has(mk))){
      const overlay=$('loadingOverlay');
      overlay.style.display='flex';
      $('loadingText').textContent=`กำลังโหลดราคา ${yearBE}-${String(selectedMonth).padStart(2,'0')}...`;
      try{
        await ensurePriceMonthLoaded(yearBE,selectedMonth);
        refreshProvinceOptions();
        refreshDistrictOptions();
      }catch(err){
        console.error(err);
        if(request!==dateRequest) return;
        state.filterPriceYear=previousYear;
        state.filterPriceMonth=previousMonth;
        state.filterDay=previousDay;
        state.filterDateISO=previousDateISO;
        yearSel.value=previousYear;
        fillMonthOptions(false);
        monthSel.value=previousMonth;
        fillPriceDayOptions(previousDay);
        overlay.style.display='none';
        alert(err.message||String(err));
        return;
      }
      if(request!==dateRequest) return;
      overlay.style.display='none';
      setTimeout(()=>prefetchPriceYear(yearBE),250);
    }

    state.filterDay = daySel.value;
    if(daySel.value===''){
      const validDays=priceAvailableDays(+yearSel.value,+monthSel.value);
      const lastDay=validDays.length?validDays[validDays.length-1]:daysInMonth(+yearSel.value,+monthSel.value);
      state.filterDateISO = buildISO(yearBE, +monthSel.value, lastDay);
    } else {
      state.filterDateISO = buildISO(yearBE, +monthSel.value, +daySel.value);
    }
    renderAll();
  }

  window.refreshProvinceOptions = refreshProvinceOptions;
  window.refreshDistrictOptions = refreshDistrictOptions;

  yearSel.onchange = ()=>{
    const activeTab=document.querySelector('.tab-btn.active')?.dataset.page;
    const isVolPage=activeTab==='volume'||activeTab==='share';
    if(!isVolPage){ fillMonthOptions(false); fillPriceDayOptions(''); }
    void updateDateFromPickers();
  };
  monthSel.onchange = ()=>{
    const activeTab=document.querySelector('.tab-btn.active')?.dataset.page;
    const isVolPage=activeTab==='volume'||activeTab==='share';
    if(!isVolPage) fillPriceDayOptions('');
    void updateDateFromPickers();
  };
  daySel.onchange = ()=>{ void updateDateFromPickers(); };
  regionSel.onchange = ()=>{ state.filterRegion = regionSel.value; state.filterProvince=''; state.filterDistrictIdx=''; refreshProvinceOptions(); refreshDistrictOptions(); renderAll(); };
  provSel.onchange = ()=>{ state.filterProvince = provSel.value; state.filterDistrictIdx=''; refreshDistrictOptions(); renderAll(); };
  distSel.onchange = ()=>{ state.filterDistrictIdx = distSel.value; renderAll(); };
  $('resetFilters').onclick = ()=>{
    state.filterProduct=defaultProd;
    state.filterVolProductRaw=-1;
    const row=$('productIconRow');
    if(row){ row.querySelectorAll('.product-icon').forEach(x=>x.classList.toggle('active', +x.dataset.i===defaultProd)); }
    const volRow=$('volProductIconRow');
    if(volRow){ volRow.querySelectorAll('.product-icon').forEach(x=>x.classList.toggle('active', +x.dataset.i===-1)); }
    const activeTab = document.querySelector('.tab-btn.active')?.dataset.page;
    const isVolPage = activeTab==='volume' || activeTab==='share';
    state.filterPriceYear = String(initY); state.filterPriceMonth = String(initM); state.filterDay=String(initD);
    state.filterVolYear = latestVolYearCE; state.filterVolMonth = latestVolMonth;
    syncDateFilterOptions(activeTab || 'overview');
    if(!isVolPage){ fillPriceDayOptions(String(initD)); daySel.value=String(initD); }
    state.filterDateISO = latestSelectableISO; state.filterYear='';
    regionSel.value=''; state.filterRegion=''; refreshProvinceOptions();
    provSel.value=''; state.filterProvince=''; state.filterDistrictIdx=''; refreshDistrictOptions();
    $('fSearch').value='';
    state.sidebarState = {type:null, key:null}; $('sidebar').classList.remove('open');
    renderAll();
  };

  $('mapResetBtn').onclick = ()=>{
    state.filterRegion='';
    state.filterProvince='';
    state.filterDistrictIdx='';
    if(typeof regionSel!=='undefined'){ regionSel.value=''; refreshProvinceOptions(); }
    if(typeof provSel!=='undefined'){ provSel.value=''; refreshDistrictOptions(); }
    getChart('mapChart').dispatchAction({type:'restore'});
    renderAll();
  };

  const searchInput = $('fSearch'), results = $('searchResults');
  searchInput.oninput = ()=>{
    const q = searchInput.value.trim();
    if(!q){ results.style.display='none'; return; }
    const matches = [];
    [...d.provinces, 'กรุงเทพมหานคร'].forEach(p=>{
      if(!p.includes(q)) return;
      const label = p==='กรุงเทพมหานคร' ? 'กรุงเทพมหานคร (ราคากลาง)'
        : d._zeroTransportProvinces.has(p) ? p+' (ค่าขนส่ง 0 บาท)'
        : p;
      matches.push({type:'prov', label, prov:p});
    });
    const activePage = document.querySelector('.tab-btn.active')?.dataset.page;
    const isVolPage = activePage==='volume' || activePage==='share';
    if(!isVolPage){
      d.districts.forEach((dd,i)=>{ if(dd[1].includes(q)) matches.push({type:'dist', label:d.provinces[dd[0]]+' / '+dd[1], distIdx:i}); });
    }
    results.innerHTML='';
    matches.slice(0,15).forEach(m=>{
      const div=document.createElement('div'); div.textContent=m.label;
      div.onclick=()=>{
        results.style.display='none'; searchInput.value=m.label;
        if(m.type==='prov'){
          const activePage = document.querySelector('.tab-btn.active')?.dataset.page;
          const isVolPage = activePage==='volume' || activePage==='share';
          if(isVolPage){
            state.filterProvince = m.prov; state.filterDistrictIdx='';
            provSel.value = m.prov; refreshDistrictOptions();
            renderVolumeAll();
            if(typeof openVolProvinceSidebar==='function') openVolProvinceSidebar(m.prov);
          } else {
            setProvinceFilter(m.prov); openProvinceSidebar(m.prov);
          }
        } else { setDistrictFilter(m.distIdx); openDistrictSidebar(m.distIdx); }
      };
      results.appendChild(div);
    });
    results.style.display = matches.length? 'block':'none';
  };
  document.addEventListener('click', e=>{ if(!e.target.closest('.search-wrap')) results.style.display='none'; });

  // ตัวช่วยกลาง: chip-based compare picker (ราคา + ปริมาณ ใช้ร่วมกัน)
  function createCompareChips(opts){
    const colors = COMPARE_COLORS;
    function renderChips(){
      const items = opts.getItems();
      opts.chipsEl.innerHTML = items.map((it,i)=>`
        <div class="chip" style="border-color:${colors[i%colors.length]}; color:${colors[i%colors.length]}; display:flex; align-items:center; gap:6px;">
          ${opts.iconFor(it)} ${it.label} <button type="button" data-k="${it.key}" class="cmp-remove" aria-label="ลบรายการเปรียบเทียบ" title="ลบรายการนี้">×</button>
        </div>`).join('') || `<span class="hint" style="color:var(--text-dim)">${opts.emptyHint}</span>`;
      opts.chipsEl.querySelectorAll('.cmp-remove').forEach(x=>{
        x.onclick = ()=>{ opts.setItems(opts.getItems().filter(it=>it.key!==x.dataset.k)); renderChips(); opts.onChange(); };
      });
    }
    opts.inputEl.oninput = ()=>{
      const q = opts.inputEl.value.trim();
      if(!q){ opts.resultsEl.style.display='none'; return; }
      const haveKeys = new Set(opts.getItems().map(it=>it.key));
      const matches = opts.search(q, haveKeys);
      if(!matches.length){ opts.resultsEl.style.display='none'; return; }
      opts.resultsEl.innerHTML = matches.map(m=>`<div data-k="${m.key}">${m.label}${m.sub?` <span style="color:var(--text-dim); font-size:10px;">(${m.sub})</span>`:''}</div>`).join('');
      opts.resultsEl.style.display='block';
      opts.resultsEl.querySelectorAll('div').forEach((el,i)=>{
        el.onclick = ()=>{
          if(opts.getItems().length>=8){ alert('เทียบได้สูงสุด 8 รายการ'); return; }
          opts.setItems([...opts.getItems(), matches[i].add()]);
          opts.inputEl.value=''; opts.resultsEl.style.display='none';
          renderChips(); opts.onChange();
        };
      });
    };
    document.addEventListener('click', (e)=>{ if(!opts.inputEl.contains(e.target) && !opts.resultsEl.contains(e.target)) opts.resultsEl.style.display='none'; });
    renderChips();
    return renderChips;
  }

  function makeProvItem(prov){
    const provIdx = d.provinces.indexOf(prov);
    return {key:'prov:'+prov, label:prov, type:'prov', distIdxs: d._provDists[provIdx]||[]};
  }
  function makeDistItem(distIdx){
    const dd = d.districts[distIdx]; const prov = d.provinces[dd[0]];
    return {key:'dist:'+distIdx, label:`${dd[1]}, ${prov}`, type:'dist', distIdxs:[distIdx]};
  }
  const defP1 = d.provinces.includes('เชียงใหม่') ? 'เชียงใหม่' : d.provinces[0];
  const defP2 = d.provinces.includes('ภูเก็ต') ? 'ภูเก็ต' : d.provinces[1];
  state.compareItems = [defP1, defP2].filter(Boolean).map(makeProvItem);
  const cmpInput = $('compareSearch'), cmpResults = $('compareSearchResults'), cmpChips = $('compareChips');
  const renderCompareChips = createCompareChips({
    getItems: ()=>state.compareItems, setItems: v=>state.compareItems=v,
    chipsEl: cmpChips, inputEl: cmpInput, resultsEl: cmpResults,
    iconFor: it=> it.type==='prov'?'📍':'📌',
    emptyHint: 'ยังไม่ได้เลือก — พิมพ์ค้นหาด้านบน (จังหวัด หรือ อำเภอ)',
    search: (q, haveKeys)=>{
      const provMatches = d.provinces.filter(p=>p.includes(q) && !haveKeys.has('prov:'+p)).slice(0,5).map(p=>({key:'prov:'+p, label:p, sub:'จังหวัด', add:()=>makeProvItem(p)}));
      const distMatches = [];
      d.districts.forEach((dd,i)=>{
        if(distMatches.length>=6) return;
        if(haveKeys.has('dist:'+i)) return;
        if(dd[1].includes(q)){ distMatches.push({key:'dist:'+i, label:`${dd[1]}, ${d.provinces[dd[0]]}`, sub:'อำเภอ', add:()=>makeDistItem(i)}); }
      });
      return [...provMatches, ...distMatches];
    },
    onChange: renderCompare
  });

  $('sidebarClose').onclick = ()=>{ $('sidebar').classList.remove('open'); state.sidebarState = {type:null, key:null}; };
  $('outlierSearch').oninput = renderOutlierTable;
  $('outlierShowAll').onchange = renderOutlierTable;

  // --- Tab switching + hash routing -------------------------------
  // จำ tab ปัจจุบันไว้ใน URL hash (เช่น #volume) เพื่อไม่ให้รีเฟรชแล้ว
  // เด้งกลับไปหน้า overview ทุกครั้ง
  function activateTab(page, opts){
    opts = opts || {};
    const btn = document.querySelector('.tab-btn[data-page="'+page+'"]');
    if(!btn) return;
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    $('page-'+page).classList.add('active');
    const isVolPage = page==='volume' || page==='share';
    $('wrapDay').style.display = isVolPage ? 'none' : '';
    $('wrapDistrict').style.display = isVolPage ? 'none' : '';
    $('productIconRow').style.display = isVolPage ? 'none' : '';
    if(searchInput){
      searchInput.placeholder = isVolPage ? 'พิมพ์ชื่อจังหวัด...' : 'พิมพ์ชื่อจังหวัด/อำเภอ...';
      const searchLabel = searchInput.closest('label');
      if(searchLabel && searchLabel.firstChild && searchLabel.firstChild.nodeType===3){
        searchLabel.firstChild.nodeValue = isVolPage ? 'ค้นหาจังหวัด' : 'ค้นหาจังหวัด/อำเภอ';
      }
    }

    // สลับรายการปี/เดือนให้ตรงกับชุดข้อมูลของแต่ละหน้า
    // ราคาและปริมาณอ่านจาก PostgreSQL ใน Docker โดยปริมาณกรองเฉพาะกลุ่มชื่อ ปตท. น้ำมันและการค้าปลีก
    syncDateFilterOptions(page);
    refreshProvinceOptions();

    if(isVolPage && state.volData) renderVolumeAll();
    else renderAll(); // ให้รีเฟรชหน้าราคาด้วยกรณีสลับกลับมา

    setTimeout(()=>Object.values(charts).forEach(c=>c.resize()), 50);

    if(!opts.skipHash && location.hash.slice(1) !== page){
      history.replaceState(null, '', '#'+page);
    }
  }
  window.activateTab = activateTab;

  document.querySelectorAll('.tab-btn').forEach(btn=>{
    btn.onclick = ()=> activateTab(btn.dataset.page);
  });

  window.addEventListener('hashchange', ()=>{
    const page = location.hash.slice(1);
    if(page && document.querySelector('.tab-btn[data-page="'+page+'"]')) activateTab(page);
  });

  // เปิดหน้าตาม hash ที่ค้างอยู่ (กรณีรีเฟรช/เปิดลิงก์ตรง) ถ้าไม่มี hash ให้อยู่ tab ปัจจุบัน (default: overview)
  const hashPage = location.hash.slice(1);
  if(hashPage && document.querySelector('.tab-btn[data-page="'+hashPage+'"]')){
    activateTab(hashPage, {skipHash:true});
  }

  document.querySelectorAll('#mapColorSwitch .chip').forEach(btn=>{
    btn.onclick = ()=>{
      document.querySelectorAll('#mapColorSwitch .chip').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      renderMap();
    };
  });
}

const REGIONS = {
  "ภาคเหนือ": ["เชียงราย","เชียงใหม่","พะเยา","ลำปาง","แม่ฮ่องสอน","ลำพูน","น่าน","แพร่","อุตรดิตถ์"],
  "กรุงเทพและปริมณฑล": ["กรุงเทพมหานคร","นนทบุรี","ปทุมธานี","สมุทรปราการ","นครปฐม","สมุทรสาคร"],
  "ภาคกลาง": ["ลพบุรี","สิงห์บุรี","อุทัยธานี","ชัยนาท","อ่างทอง","พระนครศรีอยุธยา","สระบุรี","นครนายก","สุโขทัย","พิษณุโลก","กำแพงเพชร","พิจิตร","เพชรบูรณ์","นครสวรรค์","สมุทรสงคราม","สุพรรณบุรี"],
  "ภาคตะวันตก": ["กาญจนบุรี","ราชบุรี","เพชรบุรี","ประจวบคีรีขันธ์","ตาก"],
  "ภาคตะวันออกเฉียงเหนือ": ["เลย","หนองคาย","หนองบัวลำภู","อุดรธานี","ขอนแก่น","ชัยภูมิ","นครราชสีมา","บุรีรัมย์","สกลนคร","บึงกาฬ","นครพนม","กาฬสินธุ์","มหาสารคาม","มุกดาหาร","ร้อยเอ็ด","ยโสธร","อำนาจเจริญ","อุบลราชธานี","ศรีสะเกษ","สุรินทร์"],
  "ภาคตะวันออก": ["ปราจีนบุรี","สระแก้ว","ฉะเชิงเทรา","ชลบุรี","จันทบุรี","ระยอง","ตราด"],
  "ภาคใต้": ["ชุมพร","ระนอง","สุราษฎร์ธานี","พังงา","นครศรีธรรมราช","กระบี่","ภูเก็ต","ตรัง","พัทลุง","สงขลา","สตูล","ปัตตานี","ยะลา","นราธิวาส"]
};
function regionOf(prov){ for(const r in REGIONS){ if(REGIONS[r].includes(prov)) return r; } return 'อื่นๆ'; }
const REGION_COLORS = {
  'กรุงเทพและปริมณฑล':'#2563EB', 'ภาคกลาง':'#0D9488', 'ภาคตะวันตก':'#65A30D', 'ภาคตะวันออก':'#EA580C',
  'ภาคตะวันออกเฉียงเหนือ':'#CA8A04', 'ภาคเหนือ':'#7C3AED', 'ภาคใต้':'#DC2626', 'อื่นๆ':'#6B7280'
};
// สีสำหรับกราฟเปรียบเทียบจังหวัด/อำเภอ (compare) — คนละชุดกับสี Product และ Region เพื่อไม่ให้สื่อความหมายซ้อนกัน
const COMPARE_COLORS = ['#7199F2','#E772A6','#61B9B1','#DCB25B','#A97EF3','#7A8390','#847DDC','#9AC361'];


function chartTheme(){
  const light = document.documentElement.dataset.theme === 'light';
  return light ? {
    text: '#0F172A',
    dim: '#64748B',
    blue: '#2563EB', blueLight:'#3B82F6', up:'#DC2626', down:'#059669', border: '#D8E0EA',
    surface: '#FFFFFF'
  } : {
    text: '#F8FAFC',
    dim: '#94A3B8',
    blue: '#2563EB', blueLight:'#60A5FA', up:'#E04040', down:'#23A27B', border: '#263A55',
    surface: '#101C2E'
  };
}


function startDashboard(){
  $('retryLoad').onclick=()=>location.reload();
  initCardFullscreenButtons();
  loadData().catch(showLoadError);
}
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',startDashboard,{once:true});
}else{
  startDashboard();
}
$('refreshData').onclick = async ()=>{
  $('refreshData').disabled=true;
  await cacheTransaction('readwrite',store=>store.clear());
  location.reload();
};
