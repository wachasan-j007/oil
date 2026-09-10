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
(function initSizeSwitch(){
  const saved = localStorage.getItem('or_ui_size') || 'medium';
  const SCALE = {small:0.88, medium:1, large:1.32};
  function apply(size, isUserClick){
    document.body.classList.remove('size-small','size-medium','size-large');
    document.body.classList.add('size-'+size);
    state.uiScale = SCALE[size] || 1;
    document.querySelectorAll('.size-btn').forEach(b=>b.classList.toggle('active', b.dataset.size===size));
    localStorage.setItem('or_ui_size', size);
    if(isUserClick){
      setTimeout(()=>{ Object.values(charts).forEach(c=>c.resize()); if(typeof renderAll==='function') renderAll(); }, 60);
    }
  }
  document.querySelectorAll('.size-btn').forEach(btn=>{
    btn.onclick = ()=> apply(btn.dataset.size, true);
  });
  apply(saved, false); 
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
    charts[id] = echarts.init($(id), 'orInsight', {renderer:'canvas'});
    const _origSetOption = charts[id].setOption.bind(charts[id]);
    charts[id].setOption = function(option, ...rest){
      try { modernizeOption(option); } catch(e){ /* never block a render */ }
      return _origSetOption(option, ...rest);
    };
  }
  return charts[id];
}
window.addEventListener('resize', ()=>Object.values(charts).forEach(c=>c.resize()));

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
const PRICE_CACHE_PREFIX = 'or-price-supabase-v1';
const VOLUME_CACHE_PREFIX = 'or-volume-pttor-supabase-v1';

/* Price data source: same pattern as the Volume Supabase dashboard.
   Publishable key is intentionally browser-safe. Never put service_role here. */
const SUPABASE_URL = 'https://gyusawedgtzqgsnxztok.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_DQD4NWas1VRl7eMOnbWLLA_hfOSVqoC';
const priceDb = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
});
function idbOpen(){
  return new Promise((res,rej)=>{
    const req = indexedDB.open(CACHE_DB, 1);
    req.onupgradeneeded = ()=> req.result.createObjectStore(CACHE_STORE);
    req.onsuccess = ()=> res(req.result);
    req.onerror = ()=> rej(req.error);
  });
}
async function idbGet(key){
  try{
    const db = await idbOpen();
    return await new Promise((res,rej)=>{
      const tx = db.transaction(CACHE_STORE,'readonly');
      const rq = tx.objectStore(CACHE_STORE).get(key);
      rq.onsuccess = ()=>res(rq.result);
      rq.onerror = ()=>rej(rq.error);
    });
  }catch(e){ return null; }
}
async function idbSet(key,val){
  try{
    const db = await idbOpen();
    await new Promise((res,rej)=>{
      const tx = db.transaction(CACHE_STORE,'readwrite');
      tx.objectStore(CACHE_STORE).put(val, key);
      tx.oncomplete = res; tx.onerror = ()=>rej(tx.error);
    });
  }catch(e){ }
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
  const wb = XLSX.read(buf, {type:'array'});
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, {header:1, raw:true, defval:null});
}



async function loadVolumeMetaFromSupabase(){
  $('loadingText').textContent = 'กำลังเชื่อมต่อข้อมูลปริมาณ ปตท. น้ำมันและการค้าปลีก จาก Supabase...';
  const {data,error} = await priceDb.rpc('or_volume_meta');
  if(error) throw new Error('อ่านข้อมูลปริมาณ Supabase ไม่สำเร็จ: '+(error.message||error));
  if(!data || !Array.isArray(data.years) || !data.years.length){
    throw new Error('ไม่พบข้อมูลปริมาณของ ปตท. น้ำมันและการค้าปลีก หรือยังไม่ได้รัน SQL สำหรับ Dashboard ปริมาณ');
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

  for(let i=0;i<years.length;i++){
    const yearBE=years[i];
    $('loadingText').textContent = `กำลังอ่านปริมาณ ปตท. น้ำมันและการค้าปลีก ปี ${yearBE} จาก PostgreSQL (${i+1}/${years.length}) ...`;
    const {data,error}=await priceDb.rpc('or_volume_dashboard_year',{p_year_be:yearBE});
    if(error) throw new Error(`โหลดปริมาณปี ${yearBE} ไม่สำเร็จ: `+(error.message||error));
    const rows=Array.isArray(data?.rows)?data.rows:[];
    for(const r of rows){
      if(!Array.isArray(r) || r.length<4) continue;
      const month=Number(r[0]);
      const prov=String(r[1]??'').trim();
      const prod=String(r[2]??'').trim();
      const vol=Number(r[3]);
      if(!prov || !prod || !Number.isFinite(month) || !Number.isFinite(vol)) continue;
      // RPC คืนหน่วยเป็น "ล้านลิตร" ให้ตรงกับ volume.js เดิม
      recs.push([yearBE, month, pid(prov), rid(prod), Math.round(vol*1000)/1000]);
    }
  }
  return {years, provinces:provsList, products:prodsList, recs};
}

async function loadPriceMetaFromSupabase(){
  $('loadingText').textContent = 'กำลังเชื่อมต่อฐานข้อมูลราคาจาก Supabase...';
  const {data,error} = await priceDb.rpc('or_price_meta');
  if(error) throw new Error('อ่านข้อมูลราคา Supabase ไม่สำเร็จ: '+(error.message||error));
  if(!data || !Array.isArray(data.years) || !data.years.length){
    throw new Error('ไม่พบข้อมูลราคาใน Supabase หรือยังไม่ได้รัน SQL สำหรับ Dashboard ราคา');
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

async function buildDatasetFromSupabase(meta){
  const ds={
    dates:[], provinces:[], districts:[], products:[],
    district_prices:[], bangkok_prices:[], transport_cost:{},
    _datesIdx:{}, _provsIdx:{}, _distsIdx:{}, _prodsIdx:{}
  };

  const years=[...(meta.years||[])].map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
  for(let i=0;i<years.length;i++){
    const yearBE=years[i];
    $('loadingText').textContent = `กำลังอ่านราคาปี ${yearBE} จาก PostgreSQL ผ่าน Supabase (${i+1}/${years.length}) ...`;
    const {data,error}=await priceDb.rpc('or_price_dashboard_year',{p_year_be:yearBE});
    if(error) throw new Error(`โหลดราคาปี ${yearBE} ไม่สำเร็จ: `+(error.message||error));
    mergeCompactPriceYear(ds,data||{});
  }

  // Sort global dates and remap date indexes after merging yearly parts.
  const order=ds.dates.map((iso,i)=>i).sort((a,b)=>ds.dates[a].localeCompare(ds.dates[b]));
  const oldToNew={}; order.forEach((oldIdx,newIdx)=>oldToNew[oldIdx]=newIdx);
  ds.dates=order.map(i=>ds.dates[i]);
  ds.district_prices.forEach(r=>{r[0]=oldToNew[r[0]];});
  ds.bangkok_prices.forEach(r=>{r[0]=oldToNew[r[0]];});

  $('loadingText').textContent = 'กำลังโหลดค่าอ้างอิงค่าขนส่ง สนพ. ...';
  const transportRaw = await fetch('assets/data/transport-cost-2549.json').then(r=>{
    if(!r.ok) throw new Error('โหลด transport-cost-2549.json ไม่สำเร็จ');
    return r.json();
  });

  const distLookup={};
  ds.districts.forEach((dd,i)=>{distLookup[ds.provinces[dd[0]]+'|'+dd[1]]=i;});
  const altIdx={};
  for(const key in distLookup){
    const [prov,dist]=key.split('|');
    if(dist.startsWith('เมือง') && dist!=='เมือง') altIdx[prov+'|เมือง']=distLookup[key];
  }
  for(const key in transportRaw){
    if(key in distLookup) ds.transport_cost[distLookup[key]]=transportRaw[key];
    else if(key in altIdx) ds.transport_cost[altIdx[key]]=transportRaw[key];
  }

  delete ds._datesIdx; delete ds._provsIdx; delete ds._distsIdx; delete ds._prodsIdx;
  return ds;
}


async function loadData(){
  $('sidebar').classList.remove('open');
  state.sidebarState = {type:null, key:null};
  echarts.registerMap; 
  $('loadingText').textContent = 'กำลังโหลดแผนที่ประเทศไทย...';
  const geo = await fetch('assets/data/thailand_th.geojson').then(r=>r.json());
  state.geo = geo;
  echarts.registerMap('thailand', geo);

  const priceMeta = await loadPriceMetaFromSupabase();
  state.priceMeta = priceMeta;
  const version = String(priceMeta.data_version || priceMeta.latest_price_at || 'v1').replace(/[^0-9A-Za-z_-]+/g,'_');
  const priceCacheKey = `${PRICE_CACHE_PREFIX}-${version}`;
  let ds = await idbGet(priceCacheKey);
  if(!ds){
    ds = await buildDatasetFromSupabase(priceMeta);
    $('loadingText').textContent = 'กำลังบันทึกแคชราคาจาก SQL เพื่อเปิดครั้งถัดไปให้เร็วขึ้น...';
    await idbSet(priceCacheKey, ds);
  } else {
    $('loadingText').textContent = 'พบแคชราคาเวอร์ชันล่าสุดแล้ว...';
  }
  state.data = ds;
  buildIndices();

  const volumeMeta = await loadVolumeMetaFromSupabase();
  state.volumeMeta = volumeMeta;
  const volumeVersion = String(volumeMeta.data_version || volumeMeta.latest_period || 'v1').replace(/[^0-9A-Za-z_-]+/g,'_');
  const volumeCacheKey = `${VOLUME_CACHE_PREFIX}-${volumeVersion}`;
  let volDs = await idbGet(volumeCacheKey);
  if(!volDs){
    volDs = await buildVolumeDatasetFromSupabase(volumeMeta);
    $('loadingText').textContent = 'กำลังบันทึกแคชปริมาณจาก SQL เพื่อเปิดครั้งถัดไปให้เร็วขึ้น...';
    await idbSet(volumeCacheKey, volDs);
  } else {
    $('loadingText').textContent = 'พบแคชปริมาณ ปตท. น้ำมันและการค้าปลีก เวอร์ชันล่าสุดแล้ว...';
  }
  state.volData = volDs;
  buildVolumeIndices();

  initFilters(); // จะเปิด tab ตาม location.hash ให้เองถ้ามี (กันหน้าเด้งตอนรีเฟรช)
  $('loadingOverlay').style.display='none';
  const hashPageOnLoad = location.hash.slice(1);
  if(!hashPageOnLoad || !document.querySelector('.tab-btn[data-page="'+hashPageOnLoad+'"]')){
    renderAll();
  }
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
  const priceYears = (state.priceMeta?.years?.length ? state.priceMeta.years.map(y=>String(Number(y)-543)) : [...new Set(d.dates.map(x=>x.slice(0,4)))]).sort();
  const volumeYears = state.volData ? state.volData.years.map(y=>String(+y-543)).sort() : [];

  const monthSel = $('fMonth');
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
  }
  function fillMonthOptions(isVolPage){
    const prev = monthSel.value;
    monthSel.innerHTML = '';
    if(isVolPage){
      const all=document.createElement('option'); all.value=''; all.textContent='ทั้งปี'; monthSel.appendChild(all);
    }
    THAI_MONTHS_FULL.forEach((name,i)=>{ const o=document.createElement('option'); o.value=String(i+1); o.textContent=name; monthSel.appendChild(o); });
    const allowed = [...monthSel.options].map(o=>o.value);
    if(allowed.includes(prev)) monthSel.value = prev;
  }
  function syncDateFilterOptions(page){
    const isVolPage = page==='volume' || page==='share';
    fillYearOptions(isVolPage);
    fillMonthOptions(isVolPage);
    if(isVolPage){
      const fallbackY = state.filterVolYear || volumeYears[volumeYears.length-1] || priceYears[priceYears.length-1];
      yearSel.value = volumeYears.includes(String(fallbackY)) ? String(fallbackY) : (volumeYears[volumeYears.length-1] || String(fallbackY));
      monthSel.value = state.filterVolMonth ?? '';
    } else {
      yearSel.value = state.filterPriceYear || priceYears[priceYears.length-1];
      monthSel.value = state.filterPriceMonth || '1';
    }
  }
  window.syncDateFilterOptions = syncDateFilterOptions;
  fillYearOptions(false);
  fillMonthOptions(false);

  const daySel = $('fDay');
  const oAllDay = document.createElement('option'); oAllDay.value=''; oAllDay.textContent='ทั้งเดือน'; daySel.appendChild(oAllDay);
  for(let i=1;i<=31;i++){ const o=document.createElement('option'); o.value=i; o.textContent=i; daySel.appendChild(o); }

  const lastISO = d.dates[d.dates.length-1];
  const [initY, initM] = lastISO.split('-').map(Number); // ราคาเริ่มเดือนล่าสุด (ก.ค.)
  
  state.filterPriceYear = String(initY);
  state.filterPriceMonth = String(initM);
  const latestVolYearBE = state.volData?.years?.[state.volData.years.length-1];
  const latestVolYearCE = latestVolYearBE ? String(+latestVolYearBE-543) : String(initY);
  const latestVolMonths = state.volData?.recs
    ?.filter(r=>r[0]===latestVolYearBE)
    .map(r=>+r[1]) || [];
  const latestVolMonth = latestVolMonths.length ? String(Math.max(...latestVolMonths)) : '6';
  state.filterVolYear = latestVolYearCE;
  state.filterVolMonth = latestVolMonth;

  yearSel.value = state.filterPriceYear;
  monthSel.value = state.filterPriceMonth;
  daySel.value = '';
  state.filterDateISO = lastISO;
  state.filterDay = '';

  const regionSel = $('fRegion');
  Object.keys(REGIONS).forEach(r=>{ const o=document.createElement('option'); o.value=r; o.textContent=r; regionSel.appendChild(o); });

  const provSel = $('fProvince');
  const distSel = $('fDistrict');

  function refreshProvinceOptions(){
    const region = state.filterRegion;
    provSel.innerHTML = '<option value="">ทั้งหมด</option>';
    let provs = [...d.provinces];
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

  function updateDateFromPickers(){
    const activeTab = document.querySelector('.tab-btn.active')?.dataset.page;
    const isVolPage = activeTab==='volume' || activeTab==='share';
    
    if(isVolPage){
      state.filterVolYear = yearSel.value;
      state.filterVolMonth = monthSel.value;
    } else {
      state.filterPriceYear = yearSel.value;
      state.filterPriceMonth = monthSel.value;
      const yearBE = +yearSel.value + 543;
      state.filterDay = daySel.value;
      if(daySel.value===''){
        state.filterDateISO = buildISO(yearBE, +monthSel.value, 31);
      } else {
        state.filterDateISO = buildISO(yearBE, +monthSel.value, +daySel.value);
      }
    }
    if(isVolPage && state.volData) renderVolumeAll();
    else renderAll();
  }

  window.refreshProvinceOptions = refreshProvinceOptions;
  window.refreshDistrictOptions = refreshDistrictOptions;

  yearSel.onchange = updateDateFromPickers;
  monthSel.onchange = updateDateFromPickers;
  daySel.onchange = updateDateFromPickers;
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
    state.filterPriceYear = String(initY); state.filterPriceMonth = String(initM);
    state.filterVolYear = latestVolYearCE; state.filterVolMonth = latestVolMonth;
    syncDateFilterOptions(activeTab || 'overview');
    daySel.value=''; state.filterDay='';
    state.filterDateISO = lastISO; state.filterYear='';
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
          ${opts.iconFor(it)} ${it.label} <span data-k="${it.key}" class="cmp-remove" style="cursor:pointer; font-weight:700;">×</span>
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

  if(state.volData){
    const vd = state.volData;
    function makeVolProvItem(prov){ return {key:'vprov:'+prov, label:prov, provIdx: vd.provinces.indexOf(prov)}; }
    const defV1 = vd.provinces.includes('เชียงใหม่') ? 'เชียงใหม่' : vd.provinces[0];
    const defV2 = vd.provinces.includes('ภูเก็ต') ? 'ภูเก็ต' : vd.provinces[1];
    state.volCompareItems = [defV1, defV2].filter(Boolean).map(makeVolProvItem);
    const vCmpInput = $('volCompareSearch'), vCmpResults = $('volCompareSearchResults'), vCmpChips = $('volCompareChips');
    createCompareChips({
      getItems: ()=>state.volCompareItems, setItems: v=>state.volCompareItems=v,
      chipsEl: vCmpChips, inputEl: vCmpInput, resultsEl: vCmpResults,
      iconFor: ()=>'📍',
      emptyHint: 'ยังไม่ได้เลือก — พิมพ์ค้นหาด้านบน',
      search: (q, haveKeys)=> vd.provinces.filter(p=>p.includes(q) && !haveKeys.has('vprov:'+p)).slice(0,8).map(p=>({key:'vprov:'+p, label:p, add:()=>makeVolProvItem(p)})),
      onChange: renderVolCompare
    });
  }
  $('volExportExcel').onclick = exportVolExcel;

  $('sidebarClose').onclick = ()=>{ $('sidebar').classList.remove('open'); state.sidebarState = {type:null, key:null}; };
  $('outlierSearch').oninput = renderOutlierTable;
  $('outlierShowAll').onchange = renderOutlierTable;
  $('exportCsv').onclick = exportCurrentCsv;

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
    // ราคาและปริมาณใช้ปีจาก Supabase PostgreSQL โดยปริมาณกรองเฉพาะ ปตท. น้ำมันและการค้าปลีก
    syncDateFilterOptions(page);

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


loadData();
$('refreshData').onclick = async ()=>{
  const db = await idbOpen();
  await new Promise((res)=>{
    const tx = db.transaction(CACHE_STORE,'readwrite');
    tx.objectStore(CACHE_STORE).clear();
    tx.oncomplete = res;
  });
  location.reload();
};
