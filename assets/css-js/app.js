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
function dailyForwardFillAvg(distIdxs, prodIdx){
  const d = state.data;
  if(!d.dates.length) return [];
  const startISO = d.dates[0], endISO = d.dates[d.dates.length-1];
  const events = distIdxs.map(di => (d._byDistProd[di+'-'+prodIdx]||[]).map(([dIdx,p])=>[d.dates[dIdx],p]));
  const ptr = events.map(()=>0);
  const cur = events.map(()=>null);
  const result = [];
  let day = new Date(startISO+'T00:00:00Z');
  const end = new Date(endISO+'T00:00:00Z');
  while(day <= end){
    const iso = day.toISOString().slice(0,10);
    for(let j=0;j<events.length;j++){
      const ev = events[j];
      while(ptr[j] < ev.length && ev[ptr[j]][0] <= iso){ cur[j] = ev[ptr[j]][1]; ptr[j]++; }
    }
    let sum=0, n=0;
    for(let j=0;j<cur.length;j++){ if(cur[j]!=null){ sum+=cur[j]; n++; } }
    if(n) result.push([iso, +(sum/n).toFixed(2)]);
    day.setUTCDate(day.getUTCDate()+1);
  }
  return result;
}
function dailyForwardFillAvgAll(distIdxs){
  const d = state.data;
  if(!d.dates.length) return [];
  const startISO = d.dates[0], endISO = d.dates[d.dates.length-1];
  const nProds = d.products.length;
  const events = distIdxs.map(di => {
    return d.products.map((_,pi)=> (d._byDistProd[di+'-'+pi]||[]).map(([dIdx,p])=>[d.dates[dIdx],p]));
  });
  const ptr = distIdxs.map(()=> d.products.map(()=>0));
  const cur = distIdxs.map(()=> d.products.map(()=>null));
  const result = [];
  let day = new Date(startISO+'T00:00:00Z');
  const end = new Date(endISO+'T00:00:00Z');
  while(day <= end){
    const iso = day.toISOString().slice(0,10);
    for(let j=0;j<distIdxs.length;j++){
      for(let pi=0;pi<nProds;pi++){
        const ev = events[j][pi];
        while(ptr[j][pi] < ev.length && ev[ptr[j][pi]][0] <= iso){ cur[j][pi] = ev[ptr[j][pi]][1]; ptr[j][pi]++; }
      }
    }
    let sum=0, n=0;
    for(let j=0;j<distIdxs.length;j++){
      for(let pi=0;pi<nProds;pi++){
        if(cur[j][pi]!=null){ sum+=cur[j][pi]; n++; }
      }
    }
    if(n) result.push([iso, +(sum/n).toFixed(2)]);
    day.setUTCDate(day.getUTCDate()+1);
  }
  return result;
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

const CACHE_DB = 'pttor-insight-cache', CACHE_STORE = 'kv', CACHE_KEY = 'or-dataset-v1';
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

async function buildDatasetFromExcel(){
  const datesIdx = {}, datesList = [];
  const did = iso => (iso in datesIdx) ? datesIdx[iso] : (datesIdx[iso]=datesList.length, datesList.push(iso), datesIdx[iso]);
  const provsIdx = {}, provsList = [];
  const pid = p => (p in provsIdx) ? provsIdx[p] : (provsIdx[p]=provsList.length, provsList.push(p), provsIdx[p]);
  const distsIdx = {}, distsList = [];
  const xid = (prov,dist) => {
    const key = prov+'|'+dist;
    if(key in distsIdx) return distsIdx[key];
    const i = distsList.length; distsList.push([pid(prov), dist]); distsIdx[key]=i; return i;
  };
  const prodsIdx = {}, prodsList = [];
  const rid = p => (p in prodsIdx) ? prodsIdx[p] : (prodsIdx[p]=prodsList.length, prodsList.push(p), prodsIdx[p]);

  const districtPrices = [];
  for(const fn of ['pttor2567.xlsx','pttor2568.xlsx','pttor2569.xlsx']){
    const rows = await fetchSheetRows('assets/data/'+fn);
    for(let i=1;i<rows.length;i++){
      const row = rows[i];
      if(!row || row[0]==null) continue;
      const [dateS, , , prov, dist, prod, price] = row;
      districtPrices.push([did(toISO(String(dateS))), xid(prov,dist), rid(prod), Math.round(parseFloat(price)*100)/100]);
    }
  }

  const bangkokPrices = [];
  {
    const rows = await fetchSheetRows('assets/data/pttorbangkok.xlsx');
    for(let i=1;i<rows.length;i++){
      const row = rows[i];
      if(!row || row[0]==null) continue;
      const [dateS, , , , prod, price] = row;
      bangkokPrices.push([did(toISO(String(dateS))), rid(prod), Math.round(parseFloat(price)*100)/100]);
    }
  }

  $('loadingText').textContent = 'กำลังโหลดค่าอ้างอิงค่าขนส่ง สนพ. ...';
  const transportRaw = await fetch('assets/data/transport-cost-2549.json').then(r=>r.json());
  const transportByXid = {};
  const altIdx = {};
  for(const key in distsIdx){
    const [prov,dist] = key.split('|');
    if(dist.startsWith('เมือง') && dist!=='เมือง') altIdx[prov+'|เมือง'] = distsIdx[key];
  }
  for(const key in transportRaw){
    if(key in distsIdx) transportByXid[distsIdx[key]] = transportRaw[key];
    else if(key in altIdx) transportByXid[altIdx[key]] = transportRaw[key];
  }

  return {
    dates: datesList,
    provinces: provsList,
    districts: distsList,
    products: prodsList,
    district_prices: districtPrices,
    bangkok_prices: bangkokPrices,
    transport_cost: transportByXid
  };
}

async function loadData(){
  $('sidebar').classList.remove('open');
  state.sidebarState = {type:null, key:null};
  echarts.registerMap; 
  $('loadingText').textContent = 'กำลังโหลดแผนที่ประเทศไทย...';
  const geo = await fetch('assets/data/thailand_th.geojson').then(r=>r.json());
  state.geo = geo;
  echarts.registerMap('thailand', geo);

  let ds = await idbGet(CACHE_KEY);
  if(!ds){
    ds = await buildDatasetFromExcel();
    const order = ds.dates.map((iso,i)=>i).sort((a,b)=> ds.dates[a] < ds.dates[b] ? -1 : ds.dates[a] > ds.dates[b] ? 1 : 0);
    const oldToNew = {}; order.forEach((oldIdx,newIdx)=> oldToNew[oldIdx]=newIdx);
    ds.dates = order.map(i=>ds.dates[i]);
    ds.district_prices.forEach(r=>{ r[0] = oldToNew[r[0]]; });
    ds.bangkok_prices.forEach(r=>{ r[0] = oldToNew[r[0]]; });
    $('loadingText').textContent = 'กำลังบันทึกแคช (IndexedDB) เพื่อโหลดครั้งถัดไปให้เร็วขึ้น...';
    await idbSet(CACHE_KEY, ds);
  }
  state.data = ds;
  buildIndices();

  const VOL_CACHE_KEY = 'or-volume-dataset-v1';
  let volDs = await idbGet(VOL_CACHE_KEY);
  if(!volDs){
    $('loadingText').textContent = 'กำลังอ่านไฟล์ volume_all.xlsx ...';
    volDs = await buildVolumeDataset();
    await idbSet(VOL_CACHE_KEY, volDs);
  }
  state.volData = volDs;
  buildVolumeIndices();

  initFilters();
  $('loadingOverlay').style.display='none';
  renderAll();
}

async function buildVolumeDataset(){
  const provsIdx={}, provsList=[]; const pid=p=>(p in provsIdx)?provsIdx[p]:(provsIdx[p]=provsList.length, provsList.push(p), provsIdx[p]);
  const prodsIdx={}, prodsList=[]; const rid=p=>(p in prodsIdx)?prodsIdx[p]:(prodsIdx[p]=prodsList.length, prodsList.push(p), prodsIdx[p]);
  let rows;
  try{ rows = await fetchSheetRows('assets/data/volume_all.xlsx'); }catch(e){ console.error('โหลด volume_all.xlsx ไม่สำเร็จ:', e); throw new Error('โหลด volume_all.xlsx ไม่สำเร็จ — ตรวจสอบว่าวางไฟล์ไว้ที่ assets/data/volume_all.xlsx'); }
  const recs=[]; const yearsSet=new Set();
  for(let i=1;i<rows.length;i++){
    const row=rows[i]; if(!row||row[0]==null) continue;
    const [yearBE, month, prov, prod, vol] = row;
    const v = parseFloat(vol); if(!prov||!prod||isNaN(v)) continue;
    yearsSet.add(+yearBE);
    recs.push([+yearBE, +month, pid(String(prov).trim()), rid(String(prod).trim()), Math.round(v*1000)/1000]);
  }
  return { years:[...yearsSet].sort((a,b)=>a-b), provinces:provsList, products:prodsList, recs };
}
function buildVolumeIndices(){
  const vd = state.volData; if(!vd) return;
  const byProv = {}, monthKeys = new Set();
  vd.recs.forEach(([y,m,pv,pd,v])=>{
    byProv[pv]=byProv[pv]||{}; byProv[pv][y]=byProv[pv][y]||{}; byProv[pv][y][m]=byProv[pv][y][m]||{};
    byProv[pv][y][m][pd] = (byProv[pv][y][m][pd]||0)+v;
    monthKeys.add(y+'-'+String(m).padStart(2,'0'));
  });
  state.volIdx = {byProv, monthKeys:[...monthKeys].sort()};
}
function volOf(provIdx, year, month, prod){
  if(prod===-2) return 0;
  const vd = state.volData; const yData = state.volIdx.byProv[provIdx] && state.volIdx.byProv[provIdx][year];
  if(!yData) return 0;
  let total=0;
  const months = month==='' ? Object.keys(yData).map(Number) : [+month];
  months.forEach(m=>{ const md=yData[m]; if(!md) return;
    if(prod===-1){ Object.values(md).forEach(v=>total+=v); } else { total += (md[prod]||0); }
  });
  return total;
}
function volScopeProvIdxs(){
  const vd = state.volData;
  return vd.provinces.map((p,i)=>i).filter(i=>{
    if(state.filterProvince) return vd.provinces[i]===state.filterProvince;
    if(state.filterRegion) return regionOf(vd.provinces[i])===state.filterRegion;
    return true;
  });
}
function volYearMonth(){
  const rawYear = $('fYear').value;
  const y = rawYear ? (+rawYear + 543) : state.volData.years[state.volData.years.length-1];
  const m = $('fMonth').value || '';
  return {y, m};
}
function renderVolumeAll(){
  renderVolKPI(); renderVolMap(); renderVolTopBottomRegion(); renderVolTrend();
  renderVolCompare(); renderVolRanking();
  renderShareCharts();
}
function currentVolProdIdx(){
  if(state.filterVolProductRaw==null || !state.volData) return -1;
  if(state.filterVolProductRaw===-1) return -1; 
  const name = state.data.products[state.filterVolProductRaw];
  const vi = state.volData.products.indexOf(name);
  return vi===-1 ? -2 : vi;
}
window.currentVolProdIdx = currentVolProdIdx;
function renderVolKPI(){
  const vd = state.volData, {y,m} = volYearMonth();
  const prod = currentVolProdIdx();
  const scope = volScopeProvIdxs();
  let total=0, maxP=null, maxV=-1, minP=null, minV=Infinity;
  scope.forEach(i=>{ const v=volOf(i,y,m,prod); total+=v; if(v>maxV){maxV=v;maxP=vd.provinces[i];} if(v<minV){minV=v;minP=vd.provinces[i];} });
  let prevTotal=0;
  scope.forEach(i=>{ prevTotal += volOf(i, y-1, m, prod); });
  const yoy = prevTotal>0 ? ((total-prevTotal)/prevTotal*100) : null;
  const cards = [
    {label:'ปริมาณรวม', value:total.toLocaleString('th-TH',{maximumFractionDigits:1})+' ล้านลิตร', sub: m===''?'ทั้งปี '+y:THAI_MONTHS_FULL[m-1]+' '+y},
    {label:'จังหวัดสูงสุด', value:maxP||'-', sub:maxV>=0?maxV.toLocaleString('th-TH',{maximumFractionDigits:1})+' ล้านลิตร':''},
    {label:'จังหวัดต่ำสุด', value:minP||'-', sub:isFinite(minV)?minV.toLocaleString('th-TH',{maximumFractionDigits:1})+' ล้านลิตร':''},
    {label:'YoY (เทียบปีก่อน)', value: yoy==null ? '-' : (yoy>=0?'▲ +':'▼ ')+yoy.toFixed(1)+'%', sub: yoy==null?'ไม่มีข้อมูลปีก่อนเทียบ':'ปี '+(y-1)+' → '+y}
  ];
  $('volKpiRow').innerHTML = cards.map(c=>`<div class="kpi-card"><div class="label">${c.label}</div><div class="value">${c.value}</div><div class="sub">${c.sub}</div></div>`).join('');
  $('volMapHint').textContent = (m===''?'ทั้งปี '+y:THAI_MONTHS_FULL[m-1]+' '+y) + (prod===-2? ' · ⚠ ผลิตภัณฑ์นี้ไม่มีข้อมูลปริมาณในไฟล์ volume_all (มีเฉพาะราคา)' : '');
  $('shareHint').textContent = $('volMapHint').textContent;
}
function renderVolCompare(){
  const vd = state.volData; if(!vd || !state.volCompareItems) return;
  const {y,m} = volYearMonth();
  const items = state.volCompareItems;
  const t = chartTheme();
  const colors = COMPARE_COLORS;
  const series = sortedProdIdx(vd.products).map(pi=>{ const prodName = vd.products[pi]; return {
    name:dispName(prodName), type:'bar', stack:'total', itemStyle:{color:prodColor(prodName)},
    data: items.map(it=>Math.round(volOf(it.provIdx,y,m,pi)*10)/10)
  };});
  getChart('volCompareBar').setOption({
    backgroundColor:'transparent', tooltip:{trigger:'axis', axisPointer:{type:'shadow'}},
    legend:{top:0, textStyle:{fontSize:10, color:t.dim}, type:'scroll'},
    grid:{left:70,right:24,top:40,bottom:40},
    xAxis:{type:'category', data:items.map(it=>it.label), axisLabel:{fontSize:10.5, color:t.dim}},
    yAxis:{type:'value', name:'ล้านลิตร', nameLocation:'middle', nameGap:50, axisLabel:{color:t.dim}, splitLine:{lineStyle:{color:t.border}}, nameTextStyle:{color:t.dim}},
    series: items.length? series : []
  }, true);
  const prod = currentVolProdIdx();
  const keys = state.volIdx.monthKeys;
  const trendSeries = items.map((it,i)=>({
    name:it.label, type:'line', smooth:true, itemStyle:{color:colors[i%colors.length]}, lineStyle:{width:2.2},
    data: keys.map(k=>{ const [ky,km]=k.split('-').map(Number); return Math.round(volOf(it.provIdx,ky,km,prod)*10)/10; })
  }));
  getChart('volCompareTrend').setOption({
    backgroundColor:'transparent', tooltip:{trigger:'axis'},
    legend:{top:0, textStyle:{fontSize:10, color:t.dim}, type:'scroll'},
    grid:{left:60,right:24,top:40,bottom:50},
    xAxis:{type:'category', data:keys.map(k=>{ const [ky,km]=k.split('-').map(Number); return THAI_MONTHS_SHORT[km-1]+' '+String(ky).slice(2); }), axisLabel:{fontSize:10, rotate:45, color:t.dim}},
    yAxis:{type:'value', name:'ล้านลิตร', nameLocation:'middle', nameGap:50, axisLabel:{color:t.dim}, splitLine:{lineStyle:{color:t.border}}, nameTextStyle:{color:t.dim}},
    dataZoom:[{type:'inside'},{type:'slider', height:16, bottom:10}],
    series: items.length? trendSeries : []
  }, true);
}
function renderVolRanking(){
  const vd = state.volData; if(!vd) return;
  const {y,m} = volYearMonth();
  const prod = currentVolProdIdx();
  const scope = volScopeProvIdxs();
  const arr = scope.map(i=>({prov:vd.provinces[i], v:volOf(i,y,m,prod)})).sort((a,b)=>b.v-a.v);
  const total = arr.reduce((a,r)=>a+r.v,0);
  $('volRankHint').textContent = (m===''?'ทั้งปี '+y:THAI_MONTHS_FULL[m-1]+' '+y)+' · '+arr.length+' จังหวัด';
  const rows = arr.map((r,i)=>`<tr><td>${i+1}</td><td>${r.prov}</td><td style="text-align:right">${r.v.toLocaleString('th-TH',{maximumFractionDigits:1})}</td><td style="text-align:right">${total>0?(r.v/total*100).toFixed(1):'0.0'}%</td></tr>`).join('');
  $('volRankTable').innerHTML = `<thead><tr><th>อันดับ</th><th>จังหวัด</th><th style="text-align:right">ปริมาณ (ล้านลิตร)</th><th style="text-align:right">สัดส่วน</th></tr></thead><tbody>${rows}</tbody>`;
  state._volRankExport = arr;
}
function exportVolExcel(){
  const rows = (state._volRankExport||[]).map((r,i)=>({'อันดับ':i+1, 'จังหวัด':r.prov, 'ปริมาณ (ล้านลิตร)':r.v}));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ปริมาณจำหน่าย');
  XLSX.writeFile(wb, 'pttor-volume-ranking.xlsx');
}
function renderVolMap(){
  const vd = state.volData, {y,m} = volYearMonth();
  const prod = currentVolProdIdx();
  const vals = vd.provinces.map((p,i)=>({name:p, value:Math.round(volOf(i,y,m,prod)*10)/10}));
  const nz = vals.filter(v=>v.value>0).map(v=>v.value).sort((a,b)=>a-b);
  const maxV = nz.length?Math.max(...nz):1;
  const t = chartTheme();
  // Volume is heavily right-skewed (BKK/big provinces dwarf the rest), so a
  // linear gradient makes almost everything look the same pale/dark blue.
  // Use quantile-based piecewise bands with a vivid, clearly-stepped palette
  // instead, so differences actually pop visually.
  const q = p => nz.length? nz[Math.min(nz.length-1, Math.floor(p*(nz.length-1)))] : 0;
  const bands = [0, q(1/3), q(2/3), maxV];
  const bandColors = ['#BFDBFE','#3B82F6','#1E3A8A'];
  const pieces = bandColors.map((color,i)=>{
    const min = bands[i], max = i===bandColors.length-1 ? undefined : bands[i+1];
    const label = max!==undefined ? `${fmt(min)} - ${fmt(max)}` : `${fmt(min)}+`;
    return max!==undefined ? {min, max, color, label} : {min, color, label};
  });
  getChart('volMapChart').setOption({
    backgroundColor:'transparent',
    tooltip:{trigger:'item', formatter:p=> p.data? `${p.name}<br/>ปริมาณ: ${fmt(p.data.value)} ล้านลิตร`:p.name},
    visualMap:{type:'piecewise', pieces, left:10, bottom:10, orient:'vertical', itemGap:4, itemWidth:16, itemHeight:12,
      text:['สูง (ล้านลิตร)','ต่ำ'], textStyle:{color:t.dim, fontSize:10.5}},
    series:[{type:'map', map:'thailand', roam:false, aspectScale:0.95, layoutCenter:['50%', '50%'], layoutSize:'98%', label:{show:false}, itemStyle:{borderColor:t.border, borderWidth:0.6}, emphasis:{label:{show:true,fontSize:10,color:'#fff'},itemStyle:{areaColor:'#111827'}}, data:vals}]
  });
  
  const chart = getChart('volMapChart');
  chart.off('click');
  chart.on('click', p => {
    if(!p.name) return;
    openVolProvinceSidebar(p.name);
  });
}

function openVolProvinceSidebar(prov){
  state.sidebarState = {type:'vol_province', key:prov};
  const vd = state.volData;
  const provIdx = vd.provinces.indexOf(prov);
  if(provIdx === -1) return;
  const {y,m} = volYearMonth();
  const prod = currentVolProdIdx();
  const isAllProd = prod === -1;
  const prodName = isAllProd ? 'รวมทุกผลิตภัณฑ์' : dispName(vd.products[prod]);
  const region = regionOf(prov);
  
  const curVol = volOf(provIdx, y, m, prod);
  
  let pm, py_m;
  if(m === ''){ pm=''; py_m=y; } else { pm = m===1 ? 12 : m-1; py_m = m===1 ? y-1 : y; }
  const prevMoVol = m===''? null : volOf(provIdx, py_m, pm, prod);
  const prevYrVol = volOf(provIdx, y-1, m, prod);
  
  const calcPct = (c, p) => p ? (((c-p)/p)*100).toFixed(1) : null;
  const mom = calcPct(curVol, prevMoVol);
  const yoy = calcPct(curVol, prevYrVol);

  const allProvsVol = vd.provinces.map((p,i)=>({p, v:volOf(i,y,m,prod)})).sort((a,b)=>b.v-a.v);
  const rank = allProvsVol.findIndex(x=>x.p===prov) + 1;

  $('sbTitle').textContent = prov;
  let html = `<div style="font-size:12px;color:var(--text-dim);margin-bottom:8px;">${region} · ${m===''?'ปี '+y:THAI_MONTHS_FULL[m-1]+' '+y} · ${prodName}</div>`;
  
  html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;">`;
  html += `<div class="kpi-card" style="padding:10px;"><div class="label">ปริมาณจำหน่าย</div><div class="value" style="font-size:16px;color:var(--or-light)">${curVol.toLocaleString('th-TH',{maximumFractionDigits:2})} <small style="font-size:10px">ลิตร</small></div><div class="sub">อันดับ ${rank} ของประเทศ</div></div>`;
  
  const momColor = mom>0 ? 'var(--up)' : (mom<0 ? 'var(--down)' : 'var(--text-dim)');
  const yoyColor = yoy>0 ? 'var(--up)' : (yoy<0 ? 'var(--down)' : 'var(--text-dim)');
  if(m !== ''){
    html += `<div class="kpi-card" style="padding:10px;"><div class="label">เทียบเดือนก่อน (MoM)</div><div class="value" style="font-size:15px;color:${momColor}">${mom!=null ? (mom>=0?'+':'')+mom+'%' : '-'}</div></div>`;
  }
  html += `<div class="kpi-card" style="padding:10px;"><div class="label">เทียบปีก่อน (YoY)</div><div class="value" style="font-size:15px;color:${yoyColor}">${yoy!=null ? (yoy>=0?'+':'')+yoy+'%' : '-'}</div></div>`;
  html += `</div>`;

  html += `<h4 style="font-size:12px;margin:10px 0 6px;">แนวโน้มปริมาณจำหน่ายย้อนหลัง (ล้านลิตร)</h4>`;
  html += `<div id="sbVolTrend" class="echart short" style="margin-bottom:10px;"></div>`;
  
  if(isAllProd){
    html += `<h4 style="font-size:12px;margin:10px 0 6px;">สัดส่วนจำหน่ายแยกตามผลิตภัณฑ์</h4>`;
    html += `<div id="sbVolPie" class="echart short" style="margin-bottom:10px;"></div>`;
    html += `<div style="margin-top:10px;">`;
    const prodData = sortedProdIdx(vd.products).map(pi=>({pi, name:dispName(vd.products[pi]), v:volOf(provIdx, y, m, pi)})).filter(x=>x.value||x.v>0).sort((a,b)=>b.v-a.v);
    prodData.forEach(r=>{
      const pct = curVol ? (r.v/curVol*100).toFixed(1) : 0;
      html += `<div class="district-row">
        <span style="display:flex;align-items:center;gap:6px;"><span class="dot" style="width:8px;height:8px;border-radius:50%;background:${prodColor(vd.products[r.pi])};display:inline-block;"></span>${r.name}</span>
        <span>${r.v.toFixed(2)} <span style="color:var(--text-dim);font-size:10px;">(${pct}%)</span></span>
      </div>`;
    });
    html += `</div>`;
  }

  if(charts['sbVolTrend']){ echarts.dispose(charts['sbVolTrend']); delete charts['sbVolTrend']; }
  if(charts['sbVolPie']){ echarts.dispose(charts['sbVolPie']); delete charts['sbVolPie']; }
  $('sbBody').innerHTML = html;
  $('sidebar').classList.add('open');

  setTimeout(() => {
    const t = chartTheme();
    const keys = state.volIdx.monthKeys;
    const trendData = keys.map(k=>{ const [ky,km]=k.split('-').map(Number); return [THAI_MONTHS_SHORT[km-1]+' '+String(ky).slice(2), volOf(provIdx, ky, km, prod)]; });
    
    const trendChart = getChart('sbVolTrend');
    trendChart.setOption({
      backgroundColor:'transparent', grid:{left:40,right:10,top:10,bottom:30},
      tooltip:{trigger:'axis', valueFormatter:v=>v.toFixed(2)+' ล้านลิตร'},
      xAxis:{type:'category', data:trendData.map(x=>x[0]), axisLabel:{color:t.dim, fontSize:SC(9), rotate:35}},
      yAxis:{type:'value', axisLabel:{color:t.dim, fontSize:SC(9)}, splitLine:{lineStyle:{color:t.border}}},
      series:[{type:'line', data:trendData.map(x=>x[1]), smooth:true, areaStyle:{opacity:0.15}, itemStyle:{color:'#60A5FA'}, lineStyle:{width:2}}]
    }, true);

    if(isAllProd){
      const pieChart = getChart('sbVolPie');
      const pData = sortedProdIdx(vd.products).map(pi=>({name:dispName(vd.products[pi]), value:Math.round(volOf(provIdx,y,m,pi)*10)/10, itemStyle:{color:prodColor(vd.products[pi])}})).filter(x=>x.value>0);
      pieChart.setOption({
        backgroundColor:'transparent', tooltip:{trigger:'item', formatter:'{b}: {c} ล้านลิตร ({d}%)'},
        series:[{type:'pie', radius:['40%','75%'], center:['50%','50%'], label:{color:t.text, fontSize:SC(10), formatter:'{b}\n{d}%'}, data:pData}]
      }, true);
    }
  }, 50);
}

function renderVolTopBottomRegion(){
  const vd = state.volData, {y,m} = volYearMonth();
  const prod = currentVolProdIdx();
  const arr = vd.provinces.map((p,i)=>({name:p, v:volOf(i,y,m,prod)})).filter(x=>x.v>0).sort((a,b)=>b.v-a.v);
  const top5 = arr.slice(0,5), bottom5 = arr.slice(-5).reverse();
  const combined = top5.concat(bottom5.filter(b=>!top5.find(t=>t.name===b.name)));
  const t = chartTheme();
  getChart('volTopBottomChart').setOption({
    backgroundColor:'transparent', tooltip:{trigger:'axis', axisPointer:{type:'shadow'}},
    grid:{left:90,right:20,top:10,bottom:10},
    xAxis:{type:'value', name:'ล้านลิตร', nameLocation:'middle', nameGap:28, axisLabel:{fontSize:10.5, color:t.dim}, splitLine:{lineStyle:{color:t.border}}, nameTextStyle:{color:t.dim}}, yAxis:{type:'category', data:combined.map(x=>x.name).reverse(), axisLabel:{fontSize:10.5, color:t.text}},
    series:[{type:'bar', data:combined.map(x=>x.v).reverse(), itemStyle:{color:p=>{ const idx=combined.length-1-p.dataIndex; return idx<5?'#3763A5':'#2A4B7C'; }}, barMaxWidth:14}]
  });
  const regions = Object.keys(REGIONS);
  const byRegion = regions.map(r=>({name:r, value:Math.round(vd.provinces.reduce((a,p,i)=> regionOf(p)===r ? a+volOf(i,y,m,prod) : a, 0)*10)/10, itemStyle:{color:REGION_COLORS[r]}}));
  getChart('volRegionPie').setOption({
    backgroundColor:'transparent', tooltip:{trigger:'item', formatter:'{b}: {c} ล้านลิตร ({d}%)'},
    legend:{bottom:4, left:'center', textStyle:{fontSize:10, color:t.dim}, itemWidth:12, itemHeight:12, itemGap:10, padding:[10,0,0,0], type:'scroll'},
    series:[{type:'pie', radius:['38%','62%'], center:['50%','42%'], labelLine:{lineStyle:{color:t.dim}}, data:byRegion, label:{fontSize:10, color:t.text}}]
  });
}
function renderVolTrend(){
  const vd = state.volData;
  const prod = currentVolProdIdx();
  const scope = volScopeProvIdxs();
  const keys = state.volIdx.monthKeys;
  const t = chartTheme();
  const vals = keys.map(k=>{ const [y,m]=k.split('-').map(Number); return Math.round(scope.reduce((a,i)=>a+volOf(i,y,m,prod),0)*10)/10; });
  getChart('volTrendChart').setOption({
    backgroundColor:'transparent', tooltip:{trigger:'axis', valueFormatter:v=>v+' ล้านลิตร'},
    grid:{left:70,right:24,top:20,bottom:50},
    xAxis:{type:'category', data:keys.map(k=>{ const [ky,km]=k.split('-').map(Number); return THAI_MONTHS_SHORT[km-1]+' '+String(ky).slice(2); }), axisLabel:{fontSize:10, rotate:45, color:t.dim}},
    yAxis:{type:'value', name:'ล้านลิตร', nameLocation:'middle', nameGap:50, axisLabel:{color:t.dim}, splitLine:{lineStyle:{color:t.border}}, nameTextStyle:{color:t.dim}},
    dataZoom:[{type:'inside'},{type:'slider', height:16, bottom:10}],
    series:[{type:'line', data:vals, smooth:true, areaStyle:{opacity:.12}, itemStyle:{color:'#3763A5'}, lineStyle:{width:2.4}}]
  });
}
function renderShareCharts(){
  const vd = state.volData, {y,m} = volYearMonth();
  const LOGO_ORDER = Object.keys(LOGO_FILE);
  const prodSortIndex = name => { const i = LOGO_ORDER.indexOf(name); return i===-1? 999 : i; };
  const prodOrderIdx = vd.products.map((p,pi)=>pi).sort((a,b)=> prodSortIndex(vd.products[a]) - prodSortIndex(vd.products[b]));
  const data = prodOrderIdx.map(pi=>({name:dispName(vd.products[pi]), value:Math.round(vd.provinces.reduce((a,_,i)=>a+volOf(i,y,m,pi),0)*10)/10, itemStyle:{color:prodColor(vd.products[pi])}})).filter(x=>x.value>0);
  const t = chartTheme();
  getChart('shareProductPie').setOption({
    backgroundColor:'transparent', tooltip:{trigger:'item', formatter:'{b}: {c} ล้านลิตร ({d}%)'},
    legend:{bottom:4, left:'center', textStyle:{fontSize:10, color:t.dim}, itemWidth:12, itemHeight:12, itemGap:10, padding:[10,0,0,0], type:'scroll'},
    series:[{type:'pie', radius:['38%','62%'], center:['50%','42%'], labelLine:{lineStyle:{color:t.dim}}, data, label:{fontSize:10.5, color:t.text}}]
  });
  const regions = Object.keys(REGIONS);
  const prod = currentVolProdIdx();
  const byRegion = regions.map(r=>({name:r, value:Math.round(vd.provinces.reduce((a,p,i)=> regionOf(p)===r ? a+volOf(i,y,m,prod) : a, 0)*10)/10, itemStyle:{color:REGION_COLORS[r]}}));
  getChart('shareRegionPie').setOption({
    backgroundColor:'transparent', tooltip:{trigger:'item', formatter:'{b}: {c} ล้านลิตร ({d}%)'},
    legend:{bottom:4, left:'center', textStyle:{fontSize:10.5, color:t.dim}, itemWidth:12, itemHeight:12, itemGap:10, padding:[10,0,0,0], type:'scroll'},
    series:[{type:'pie', radius:['38%','62%'], center:['50%','42%'], labelLine:{lineStyle:{color:t.dim}}, data:byRegion, label:{fontSize:10.5, color:t.text}}]
  });
  const series = prodOrderIdx.map(pi=>({
    name:dispName(vd.products[pi]), type:'bar', stack:'total', itemStyle:{color:prodColor(vd.products[pi])},
    data: regions.map(r=>Math.round(vd.provinces.reduce((a,p,i)=> regionOf(p)===r ? a+volOf(i,y,m,pi) : a, 0)*10)/10)
  }));
  getChart('shareByRegionChart').setOption({
    backgroundColor:'transparent', tooltip:{trigger:'axis', axisPointer:{type:'shadow'}},
    legend:{top:0, textStyle:{fontSize:10, color:t.dim}, type:'scroll'},
    grid:{left:80,right:24,top:40,bottom:75},
    xAxis:{type:'category', data:regions, axisLabel:{fontSize:10.5, color:t.dim, rotate:30, interval:0, margin:12}},
    yAxis:{type:'value', name:'ล้านลิตร', nameLocation:'middle', nameGap:55, axisLabel:{color:t.dim}, splitLine:{lineStyle:{color:t.border}}, nameTextStyle:{color:t.dim}},
    series
  });
}

function buildIndices(){
  const d = state.data;
  d._byDistProd = {}; 
  for(const [dateIdx, distIdx, prodIdx, price] of d.district_prices){
    const k = distIdx+'-'+prodIdx;
    (d._byDistProd[k] ||= []).push([dateIdx, price]);
  }
  Object.values(d._byDistProd).forEach(arr=>arr.sort((a,b)=>a[0]-b[0]));

  d._bkkByProd = {}; 
  for(const [dateIdx, prodIdx, price] of d.bangkok_prices){
    (d._bkkByProd[prodIdx] ||= []).push([dateIdx, price]);
  }
  Object.values(d._bkkByProd).forEach(arr=>arr.sort((a,b)=>a[0]-b[0]));

  d._provDists = {};
  d.districts.forEach((dd,i)=>{ (d._provDists[dd[0]] ||= []).push(i); });

  d._zeroTransportProvinces = new Set();
  Object.entries(d._provDists).forEach(([provIdx, distIdxs])=>{
    const known = distIdxs.filter(i=> d.transport_cost[i]!=null);
    if(known.length && known.every(i=> d.transport_cost[i]===0)){
      d._zeroTransportProvinces.add(d.provinces[+provIdx]);
    }
  });
}
function priceAsOf(distIdx, prodIdx, cutoffISO){
  const arr = state.data._byDistProd[distIdx+'-'+prodIdx];
  if(!arr) return null;
  const d = state.data;
  if(state.filterDay===''){
    const ym = cutoffISO.slice(0,7);
    const vals = arr.filter(([di])=>d.dates[di].slice(0,7)===ym).map(([,p])=>p);
    return vals.length? +(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(2) : null;
  }
  const cutoffYear = cutoffISO.slice(0,4);
  let val=null, valDateISO=null;
  for(const [di,p] of arr){ if(d.dates[di]<=cutoffISO){ val=p; valDateISO=d.dates[di]; } else break; }
  if(val==null) return null;
  return valDateISO.slice(0,4)===cutoffYear ? val : null; 
}
function bkkAsOf(prodIdx, cutoffISO){
  const arr = state.data._bkkByProd[prodIdx];
  if(!arr) return null;
  const d = state.data;
  if(state.filterDay===''){
    const ym = cutoffISO.slice(0,7);
    const vals = arr.filter(([di])=>d.dates[di].slice(0,7)===ym).map(([,p])=>p);
    return vals.length? +(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(2) : null;
  }
  const cutoffYear = cutoffISO.slice(0,4);
  let val=null, valDateISO=null;
  for(const [di,p] of arr){ if(d.dates[di]<=cutoffISO){ val=p; valDateISO=d.dates[di]; } else break; }
  if(val==null) return null;
  return valDateISO.slice(0,4)===cutoffYear ? val : null;
}
function transportOf(distIdx){ return state.data.transport_cost[distIdx]; }



// --- NEW THEME COLORS & LABELS ---
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
function productAxisLabelOption(prodOrderArr, dataset, size){
  size = size || 44;
  const rich = {};
  prodOrderArr.forEach(pi=>{
    const raw = dataset.products[pi];
    const file = LOGO_FILE[raw];
    if(file){
      rich['logo'+pi] = { height:size, width:size, backgroundColor:{image:'assets/Logo/'+file}, borderRadius:size/2, align:'center' };
    }
  });
  return {
    margin:size<40?14:18, interval:0, rotate:0,
    formatter: function(value, index){
      const pi = prodOrderArr[index];
      const raw = dataset.products[pi];
      return LOGO_FILE[raw] ? '{logo'+pi+'|}' : value;
    },
    rich
  };
}

/* Shared helper: builds an ECharts legend "data" array using product logos
   as icons instead of text, so every chart's product legend looks/sizes
   the same (reuse this instead of hand-rolling legend.data per chart). */
function productLegendOption(prodOrderArr, dataset, size){
  size = size || 44;
  return {
    data: prodOrderArr.map(pi=>{
      const raw = dataset.products[pi];
      const file = LOGO_FILE[raw];
      return { name: dispName(raw), icon: file ? 'image://assets/Logo/'+file : 'circle' };
    }),
    itemWidth: size, itemHeight: size, itemGap: 16, top: 0, type: 'scroll'
  };
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
  const years = [...new Set(d.dates.map(x=>x.slice(0,4)))].sort();
  years.forEach(y=>{ const o=document.createElement('option'); o.value=y; o.textContent=(+y+543)+' (พ.ศ.)'; yearSel.appendChild(o); });

  const monthSel = $('fMonth');
  THAI_MONTHS_FULL.forEach((name,i)=>{ const o=document.createElement('option'); o.value=i+1; o.textContent=name; monthSel.appendChild(o); });

  const daySel = $('fDay');
  const oAllDay = document.createElement('option'); oAllDay.value=''; oAllDay.textContent='ทั้งเดือน'; daySel.appendChild(oAllDay);
  for(let i=1;i<=31;i++){ const o=document.createElement('option'); o.value=i; o.textContent=i; daySel.appendChild(o); }

  const lastISO = d.dates[d.dates.length-1];
  const [initY, initM] = lastISO.split('-').map(Number); // ราคาเริ่มเดือนล่าสุด (ก.ค.)
  
  state.filterPriceYear = String(initY);
  state.filterPriceMonth = String(initM);
  state.filterVolYear = String(initY);
  state.filterVolMonth = '6'; // ปริมาณเริ่มเดือน 6 (มิถุนายน)

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
    renderAll();
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
    const row=$('productIconRow');
    if(row){ row.querySelectorAll('.product-icon').forEach(x=>x.classList.toggle('active', +x.dataset.i===defaultProd)); }
    const activeTab = document.querySelector('.tab-btn.active')?.dataset.page;
    const isVolPage = activeTab==='volume' || activeTab==='share';
    state.filterPriceYear = String(initY); state.filterPriceMonth = String(initM);
    state.filterVolYear = String(initY); state.filterVolMonth = '6';
    
    if(isVolPage){
      yearSel.value = state.filterVolYear; monthSel.value = state.filterVolMonth;
    } else {
      yearSel.value = state.filterPriceYear; monthSel.value = state.filterPriceMonth;
    }
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
    d.districts.forEach((dd,i)=>{ if(dd[1].includes(q)) matches.push({type:'dist', label:d.provinces[dd[0]]+' / '+dd[1], distIdx:i}); });
    results.innerHTML='';
    matches.slice(0,15).forEach(m=>{
      const div=document.createElement('div'); div.textContent=m.label;
      div.onclick=()=>{
        results.style.display='none'; searchInput.value=m.label;
        if(m.type==='prov'){ setProvinceFilter(m.prov); openProvinceSidebar(m.prov); }
        else { setDistrictFilter(m.distIdx); openDistrictSidebar(m.distIdx); }
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

  document.querySelectorAll('.tab-btn').forEach(btn=>{
    btn.onclick = ()=>{
      document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
      btn.classList.add('active');
      $('page-'+btn.dataset.page).classList.add('active');
      const isVolPage = btn.dataset.page==='volume' || btn.dataset.page==='share';
      $('wrapDay').style.display = isVolPage ? 'none' : '';
      $('wrapDistrict').style.display = isVolPage ? 'none' : '';
      $('productIconRow').style.display = isVolPage ? 'none' : '';
      
      // สลับค่า filter ปี/เดือน ให้ตรงกับหน้าที่ดูอยู่
      if(isVolPage){
        $('fYear').value = state.filterVolYear || String(initY);
        $('fMonth').value = state.filterVolMonth || '6';
      } else {
        $('fYear').value = state.filterPriceYear || String(initY);
        $('fMonth').value = state.filterPriceMonth || String(initM);
      }

      if(isVolPage && state.volData) renderVolumeAll();
      else renderAll(); // ให้รีเฟรชหน้าราคาด้วยกรณีสลับกลับมา
      
      setTimeout(()=>Object.values(charts).forEach(c=>c.resize()), 50);
    };
  });

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

function computeRegionBBoxCenterZoom(region){
  if(!state.geo || !state.geo.features) return null;
  const names = REGIONS[region] || [];
  const feats = state.geo.features.filter(f=>names.includes(f.properties && f.properties.name));
  if(!feats.length) return null;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  const walk = coords=>{
    if(typeof coords[0]==='number'){
      const [x,y]=coords; if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y;
    } else coords.forEach(walk);
  };
  feats.forEach(f=>{ if(f.geometry && f.geometry.coordinates) walk(f.geometry.coordinates); });
  if(!isFinite(minX)) return null;
  const center = [(minX+maxX)/2, (minY+maxY)/2];
  const span = Math.max(maxX-minX, maxY-minY, 0.6);
  const zoom = Math.max(1.4, Math.min(9, 11/span));
  return {center, zoom};
}

function avgAllProducts(getPrice){
  const d=state.data; let sum=0,n=0;
  d.products.forEach((_,pi)=>{ const v=getPrice(pi); if(v!=null){ sum+=v; n++; } });
  return n?+(sum/n).toFixed(2):null;
}
function avgBkkAll(cutoffISO){ return avgAllProducts(pi=>bkkAsOf(pi,cutoffISO)); }
function avgPriceAll(distIdx,cutoffISO){ return avgAllProducts(pi=>priceAsOf(distIdx,pi,cutoffISO)); }
function latestSnapshot(){
  const d = state.data, out=[];
  const cutoff = state.filterDateISO, prod = state.filterProduct;
  const isAll = prod === -1;
  const bkk = isAll ? avgBkkAll(cutoff) : bkkAsOf(prod, cutoff);
  d.districts.forEach((dd,i)=>{
    const price = isAll ? avgPriceAll(i, cutoff) : priceAsOf(i, prod, cutoff);
    if(price==null) return;
    const prov = d.provinces[dd[0]];
    if(state.filterRegion && regionOf(prov)!==state.filterRegion) return;
    if(state.filterProvince && prov!==state.filterProvince) return;
    if(state.filterDistrictIdx!=='' && String(i)!==String(state.filterDistrictIdx)) return;
    const transport = transportOf(i);
    const ref = (bkk!=null && transport!=null) ? bkk+transport : null;
    const diff = ref!=null ? +(price-ref).toFixed(2) : null;
    out.push({distIdx:i, provIdx:dd[0], prov, dist:dd[1], price, bkk, transport, ref, diff, region:regionOf(prov), compliant: diff!=null && Math.abs(diff)<=0.001});
  });
  if(bkk!=null && state.filterDistrictIdx==='' && (!state.filterProvince || state.filterProvince==='กรุงเทพมหานคร') && (!state.filterRegion || state.filterRegion==='กรุงเทพและปริมณฑล')){
    out.push({distIdx:null, provIdx:null, prov:'กรุงเทพมหานคร', dist:'ราคากลาง (กทม.)', price:bkk, transport:0, ref:bkk, diff:0, region:regionOf('กรุงเทพมหานคร'), compliant:true, isBangkokBaseline:true});
  }
  return out;
}
function provinceAverages(snapshot){
  const map = {};
  snapshot.forEach(r=>{ (map[r.prov] ||= []).push(r.price); });
  return Object.entries(map).map(([prov, arr])=>({prov, avg:+(arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(2), n:arr.length}));
}

function renderAll(){
  if(!state.data) return;
  if(state.sidebarState.type==null) $('sidebar').classList.remove('open');
  renderKPI();
  renderRegionOverview();
  renderMap();
  renderTopBottom();
  renderRegionPie();
  renderMomChart();
  renderProductMonthlyTrend();
  renderTransport();
  renderRanking();
  renderCompare();
  {
    const activeTab = document.querySelector('.tab-btn.active')?.dataset.page;
    if((activeTab==='volume' || activeTab==='share') && state.volData) renderVolumeAll();
  }
  if(state.sidebarState.type==='province') openProvinceSidebar(state.sidebarState.key);
  else if(state.sidebarState.type==='district') openDistrictSidebar(state.sidebarState.key);
  else if(state.sidebarState.type==='vol_province') openVolProvinceSidebar(state.sidebarState.key);
}

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

function computeRegionStats(){
  const savedR=state.filterRegion, savedP=state.filterProvince, savedD=state.filterDistrictIdx;
  state.filterRegion=''; state.filterProvince=''; state.filterDistrictIdx='';
  const snap = latestSnapshot();
  state.filterRegion=savedR; state.filterProvince=savedP; state.filterDistrictIdx=savedD;
  const byRegion = {};
  snap.forEach(r=>{ (byRegion[r.region] ||= []).push(r.price); });
  return Object.keys(REGIONS).map(r=>{
    const arr = byRegion[r]||[];
    return {
      region:r, provCount:REGIONS[r].length,
      min: arr.length? Math.min(...arr).toFixed(2): null,
      max: arr.length? Math.max(...arr).toFixed(2): null,
      avg: arr.length? (arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(2): null
    };
  });
}
function computeProvinceStatsForRegion(region){
  const savedR=state.filterRegion, savedP=state.filterProvince, savedD=state.filterDistrictIdx;
  state.filterRegion=region; state.filterProvince=''; state.filterDistrictIdx='';
  const snap = latestSnapshot();
  state.filterRegion=savedR; state.filterProvince=savedP; state.filterDistrictIdx=savedD;
  const byProv = {};
  snap.forEach(r=>{ (byProv[r.prov] ||= []).push(r); });
  return Object.entries(byProv).map(([prov,rows])=>{
    const arr = rows.map(r=>r.price);
    const transports = rows.filter(r=>r.transport!=null).map(r=>r.transport);
    const compliantN = rows.filter(r=>r.compliant).length;
    return {
      prov, n:arr.length,
      min:Math.min(...arr).toFixed(2), max:Math.max(...arr).toFixed(2),
      avg:(arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(2),
      avgTransport: transports.length? (transports.reduce((a,b)=>a+b,0)/transports.length).toFixed(2): null,
      compliantN, total: rows.length
    };
  }).sort((a,b)=>a.prov.localeCompare(b.prov,'th'));
}
function renderRegionOverview(){
  const el = $('regionOverview'); if(!el) return;
  if(!state.filterRegion){
    const stats = computeRegionStats();
    el.innerHTML = `<h3 style="margin-top:0">ราคาน้ำมันขายปลีก <span class="hint">(บาท/ลิตร) · คลิกภาคเพื่อดูรายจังหวัด</span></h3><div class="legend-col-grid">` + stats.map(s=>`
        <div class="legend-list-item" data-region="${s.region}">
          <span class="dot" style="background:${REGION_COLORS[s.region]||'#54747C'}"></span>
          <div class="body">
            <div class="name">${s.region} · ${s.provCount} จังหวัด</div>
            <div class="stats">
              <div><span class="l">ต่ำสุด</span><span class="v">${s.min??'-'}</span></div>
              <div><span class="l">เฉลี่ย</span><span class="v hl">${s.avg??'-'}</span></div>
              <div><span class="l">สูงสุด</span><span class="v">${s.max??'-'}</span></div>
            </div>
          </div>
        </div>`).join('') + `</div>`;
    el.querySelectorAll('.legend-list-item').forEach(c=>{
      c.onclick = ()=>{
        state.filterRegion = c.dataset.region; $('fRegion').value = state.filterRegion;
        state.filterProvince=''; state.filterDistrictIdx='';
        refreshProvinceOptions(); refreshDistrictOptions(); renderAll();
      };
    });
  } else {
    const provs = computeProvinceStatsForRegion(state.filterRegion);
    el.innerHTML = `<div class="back-row">
        <button class="small-btn" id="regionBackBtn">← ย้อนกลับ</button>
        <h3 style="margin:0">${state.filterRegion} <span class="hint">(บาท/ลิตร) · คลิกจังหวัดเพื่อดูรายอำเภอ</span></h3>
      </div><div class="legend-col-grid">` + provs.map(p=>`
        <div class="legend-list-item province-card" data-prov="${p.prov}">
          <span class="dot" style="background:${REGION_COLORS[state.filterRegion]||'#54747C'}"></span>
          <div class="body">
            <div class="name">${p.prov} (${p.n})</div>
            <div class="stats">
              <div><span class="l">ต่ำสุด</span><span class="v">${p.min}</span></div>
              <div><span class="l">เฉลี่ย</span><span class="v hl">${p.avg}</span></div>
              <div><span class="l">สูงสุด</span><span class="v">${p.max}</span></div>
            </div>
            <div class="stats" style="margin-top:4px;">
              <div><span class="l">ค่าขนส่งเฉลี่ย</span><span class="v">${p.avgTransport??'-'}</span></div>
              <div><span class="l">ตรงสนพ.</span><span class="v" style="color:${p.compliantN===p.total?'var(--down)':'var(--up)'}">${p.compliantN}/${p.total}</span></div>
            </div>
          </div>
        </div>`).join('') + `</div>`;
    $('regionBackBtn').onclick = ()=>{
      state.filterRegion=''; $('fRegion').value=''; state.filterProvince=''; state.filterDistrictIdx='';
      refreshProvinceOptions(); refreshDistrictOptions(); renderAll();
    };
    el.querySelectorAll('.province-card').forEach(c=>{
      c.onclick = ()=>{
        state.filterProvince = c.dataset.prov; $('fProvince').value = state.filterProvince;
        refreshDistrictOptions(); renderAll(); openProvinceSidebar(state.filterProvince);
      };
    });
  }
}

function renderKPI(){
  const snap = latestSnapshot();
  if(!snap.length){ $('kpiRow').innerHTML = '<div class="kpi-card">ไม่มีข้อมูลตามตัวกรอง</div>'; $('dataFreshness').innerHTML=''; return; }
  $('dataFreshness').innerHTML = `<span class="dot"></span>ข้อมูลล่าสุด ณ ${thDate(state.filterDateISO,'full')}`;
  const stationSnap = snap.filter(r=>!r.isBangkokBaseline); 
  const prices = stationSnap.map(r=>r.price);
  const avg = prices.length ? prices.reduce((a,b)=>a+b,0)/prices.length : null;
  const max = stationSnap.length ? stationSnap.reduce((a,b)=>b.price>a.price?b:a) : null;
  const min = stationSnap.length ? stationSnap.reduce((a,b)=>b.price<a.price?b:a) : null;
  const transports = stationSnap.filter(r=>r.transport!=null).map(r=>r.transport);
  const avgTransport = transports.length? transports.reduce((a,b)=>a+b,0)/transports.length : null;
  const diffs = stationSnap.filter(r=>r.diff!=null).map(r=>r.diff);
  const avgDiff = diffs.length? diffs.reduce((a,b)=>a+b,0)/diffs.length : null;
  const provinceCount = new Set(stationSnap.map(r=>r.prov)).size;
  const isAllProd = state.filterProduct === -1;
  const bkkNow = isAllProd ? avgBkkAll(state.filterDateISO) : bkkAsOf(state.filterProduct, state.filterDateISO);
  const compliantCount = stationSnap.filter(r=>r.compliant).length;
  const productName = isAllProd ? 'ทุกผลิตภัณฑ์ (เฉลี่ย)' : dispName(state.data.products[state.filterProduct]);

  const scopeIsStation = state.filterDistrictIdx !== '' && stationSnap.length===1;
  const scopeIsProvince = !scopeIsStation && !!state.filterProvince;
  const cards = [];
  let heroHtml = '';

  if(scopeIsStation){
    const r = stationSnap[0];
    cards.push(['ราคาที่เลือก', r.price.toFixed(2)+' ฿', r.prov+' / '+r.dist+' · '+productName]);
    cards.push(['ราคากลาง (กทม.)', bkkNow!=null? bkkNow.toFixed(2)+' ฿':'-', 'ฐานคำนวณราคาอ้างอิงทั่วประเทศ']);
    cards.push(['ค่าขนส่ง สนพ.', r.transport!=null? r.transport.toFixed(2)+' ฿':'-', 'อำเภอที่เลือก']);
    cards.push(['ส่วนต่างจากราคาอ้างอิง (กลาง+ขนส่ง)', r.diff!=null? `<span style="color:${r.diff>=0?'var(--up)':'var(--down)'}">${r.diff>=0?'+':''}${r.diff.toFixed(2)} ฿</span>`:'-', r.compliant? '✓ ตรงตามเกณฑ์ สนพ.' : (r.diff>0?'สูงกว่าราคาอ้างอิง':'ต่ำกว่าราคาอ้างอิง')]);
  } else {
    const avgLabel = scopeIsProvince ? 'ราคาเฉลี่ย · '+state.filterProvince : 'ราคาเฉลี่ยประเทศ';
    cards.push([avgLabel, avg!=null? avg.toFixed(2)+' ฿':'-', productName]);
    cards.push(['ราคากลาง (กทม.)', bkkNow!=null? bkkNow.toFixed(2)+' ฿':'-', 'ฐานคำนวณราคาอ้างอิงทั่วประเทศ']);
    if(max) cards.push(['ราคาสูงสุด'+(scopeIsProvince?' ในจังหวัด':''), max.price.toFixed(2)+' ฿', max.prov+' / '+max.dist+(max.compliant? ' · <span style="color:var(--down)">✓ตรงตามเกณฑ์ สนพ.</span>' : (max.diff!=null? ` · <span style="color:${max.diff>0?'var(--up)':'var(--down)'}">${max.diff>0?'+':''}${max.diff.toFixed(2)}฿ จากราคาอ้างอิง</span>`:''))]);
    if(min) cards.push(['ราคาต่ำสุด'+(scopeIsProvince?' ในจังหวัด':''), min.price.toFixed(2)+' ฿', min.prov+' / '+min.dist+(min.compliant? ' · <span style="color:var(--down)">✓ตรงตามเกณฑ์ สนพ.</span>' : (min.diff!=null? ` · <span style="color:${min.diff>0?'var(--up)':'var(--down)'}">${min.diff>0?'+':''}${min.diff.toFixed(2)}฿ จากราคาอ้างอิง</span>`:''))]);
    if(!scopeIsProvince){
      const provAvg = provinceAverages(stationSnap);
      const provMax = provAvg.reduce((a,b)=>b.avg>a.avg?b:a);
      const provMin = provAvg.reduce((a,b)=>b.avg<a.avg?b:a);
      cards.push(['จังหวัดแพงสุด (เฉลี่ย)', provMax.avg.toFixed(2)+' ฿', provMax.prov]);
      cards.push(['จังหวัดถูกสุด (เฉลี่ย)', provMin.avg.toFixed(2)+' ฿', provMin.prov]);
    }
    cards.push(['ค่าขนส่งเฉลี่ย สนพ.', avgTransport!=null? avgTransport.toFixed(2)+' ฿':'-', 'จาก '+transports.length+' อำเภอ']);
    const aboveCountTop = diffs.filter(v=>v>0.001).length;
    const belowCountTop = diffs.filter(v=>v<-0.001).length;
    cards.push(['ส่วนต่างเฉลี่ยจากราคากลาง', avgDiff!=null? `<span style="color:${avgDiff>=0?'var(--up)':'var(--down)'}">${avgDiff>=0?'+':''}${avgDiff.toFixed(2)} ฿</span>`:'-', `▲${aboveCountTop} สูงกว่า · ▼${belowCountTop} ต่ำกว่า`]);
    cards.push(['อำเภอที่ราคาตรงตามเกณฑ์ สนพ.', compliantCount+' / '+stationSnap.length, ((compliantCount/stationSnap.length*100)||0).toFixed(0)+'% ของอำเภอในตัวกรอง (เกณฑ์ = ราคากลาง+ค่าขนส่งอ้างอิง)']);
    cards.push(['จำนวนจังหวัด/อำเภอ', provinceCount+' / '+stationSnap.length, 'ในตัวกรองปัจจุบัน']);

    const pct = (compliantCount/stationSnap.length*100)||0;
    const statusClass = pct>=90 ? '' : 'status-bad';
    heroHtml = `<div class="kpi-card kpi-hero ${statusClass}" title="อำเภอ 'ตรงตามเกณฑ์' คือราคาขายจริง = ราคากลาง กทม. + ค่าขนส่งอ้างอิง สนพ. ปี 2549">
      <div style="flex:1;">
        <div class="label">% ความสอดคล้องราคากับสนพ.${scopeIsProvince?' · '+state.filterProvince:'ทั่วประเทศ'}</div>
        <div class="value">${pct.toFixed(1)}%</div>
        <div class="sub">${compliantCount} / ${stationSnap.length} อำเภอ ราคาขาย = ราคากลาง+ค่าขนส่งอ้างอิง พอดี · ไม่ตรง ${stationSnap.length-compliantCount} อำเภอ</div>
      </div>
      <div class="hero-badge">${pct>=90?'✓ ปกติ':'⚠ ต้องตรวจสอบ'}</div>
    </div>`;
  }
  $('kpiRow').innerHTML = heroHtml + cards.map(([l,v,s])=>`<div class="kpi-card"><div class="label">${l}</div><div class="value">${v}</div><div class="sub">${s}</div></div>`).join('');
}

function renderMap(){
  const mode = document.querySelector('#mapColorSwitch .chip.active')?.dataset.mode || 'diff';
  const snap = latestSnapshot();
  const t = chartTheme();
  const chart = getChart('mapChart');
  const HL = '#60A5FA'; 

  const byProv = {};
  snap.forEach(r=>{ (byProv[r.prov] ||= []).push(r); });
  const mapData = Object.entries(byProv).map(([name, rows])=>{
    const avg = arr=>+(arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(2);
    const price = avg(rows.map(r=>r.price));
    const transportVals = rows.map(r=>r.transport).filter(v=>v!=null);
    const diffVals = rows.map(r=>r.diff).filter(v=>v!=null);
    const transport = transportVals.length? avg(transportVals) : null;
    const diff = diffVals.length? avg(diffVals) : null;
    const region = regionOf(name);
    const isSelected = state.filterProvince && state.filterProvince===name;
    const districtCount = rows.filter(r=>!r.isBangkokBaseline).length;
    const compliantCount = rows.filter(r=>r.compliant&&!r.isBangkokBaseline).length;
    const compliantRate = districtCount? +((compliantCount/districtCount)*100).toFixed(1) : 0;
    const maxRow = rows.filter(r=>!r.isBangkokBaseline).sort((a,b)=>b.price-a.price)[0];
    const minRow = rows.filter(r=>!r.isBangkokBaseline).sort((a,b)=>a.price-b.price)[0];
    const base = {
      name, value: mode==='region' ? price : (diff!=null? diff : 0),
      price, transport, diff, region, isSelected, districtCount, compliantCount, compliantRate,
      maxPrice: maxRow?.price, maxDist: maxRow?.dist,
      minPrice: minRow?.price, minDist: minRow?.dist
    };
    if(mode==='region'){
      base.itemStyle = isSelected ? {color:REGION_COLORS[region], borderColor:HL, borderWidth:3} : {color:REGION_COLORS[region], borderColor: t.border, borderWidth: 0.6};
    } else if(isSelected){
      base.itemStyle = {borderColor:HL, borderWidth:3};
    }
    if(state.filterRegion && region!==state.filterRegion){
      base.itemStyle = {...(base.itemStyle||{}), opacity:0.12};
    }
    return base;
  });

  const tooltipFmt = p => {
    if(!p.data) return `${p.name}<br>ไม่มีข้อมูล`;
    const dd = p.data;
    const diffStr = dd.diff!=null? (dd.diff>0?'+':'')+dd.diff.toFixed(2)+' ฿' : '-';
    const diffColor = dd.diff!=null? (dd.diff>0.001?'#E04040':dd.diff<-0.001?'#23A27B':'#94A3B8') : '#94A3B8';
    const statusStr = dd.diff==null? '—' : Math.abs(dd.diff)<=0.001? '✓ ตรงตามเกณฑ์ สนพ.' : dd.diff>0.001? 'สูงกว่าราคาอ้างอิง' : 'ต่ำกว่าราคาอ้างอิง';
    return `<div style="min-width:220px;">`
      + `<div style="font-size:14px;font-weight:600;margin-bottom:6px;">${p.name}${dd.isSelected? ' <span style="color:#60A5FA">★</span>':''}</div>`
      + `<div style="font-size:11px;color:#94A3B8;margin-bottom:8px;">${dd.region} · ${dd.districtCount} อำเภอ</div>`
      + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;font-size:12px;">`
      + `<div>ราคาเฉลี่ย</div><div style="text-align:right;font-weight:600;">${dd.price?.toFixed?.(2) ?? '-'} ฿</div>`
      + `<div>ค่าขนส่ง สนพ.</div><div style="text-align:right;">${dd.transport!=null? dd.transport.toFixed(2)+' ฿' : '-'}</div>`
      + `<div>ส่วนต่างจากราคาอ้างอิง</div><div style="text-align:right;color:${diffColor};font-weight:600;">${diffStr}</div>`
      + `<div>สถานะ</div><div style="text-align:right;"><span style="color:${diffColor}">${statusStr}</span></div>`
      + `</div>`
      + `<div style="margin-top:8px;padding-top:6px;border-top:1px solid #34496A;font-size:11px;color:#94A3B8;">`
      + `ตรงตามเกณฑ์ สนพ.: ${dd.compliantCount}/${dd.districtCount} (${dd.compliantRate}%)`
      + (dd.maxPrice? `<br>แพงสุด: ${dd.maxDist} ${dd.maxPrice.toFixed(2)}฿` : '')
      + (dd.minPrice? `<br>ถูกสุด: ${dd.minDist} ${dd.minPrice.toFixed(2)}฿` : '')
      + `</div></div>`;
  };

  const baseOption = {
    backgroundColor:'transparent',
    tooltip:{ trigger:'item', formatter: tooltipFmt },
    series:[{
      type:'map', map:'thailand', roam:false, aspectScale:0.95, layoutCenter:['50%', '50%'], layoutSize:'98%', label:{show:false},
      emphasis:{ label:{show:true, color:'#fff'}, itemStyle:{areaColor:t.blue} },
      itemStyle:{ borderColor:t.border, borderWidth:.6 },
      data: mapData,
      selectedMode:false
    }]
  };

  if(mode==='region'){
    chart.setOption({
      ...baseOption,
      visualMap:{show:false},
      legend:{show:false}
    }, true);
  } else {
    const diffVals = mapData.map(x=>x.diff).filter(v=>v!=null);
    const maxAbs = Math.max(0.3, ...diffVals.map(v=>Math.abs(v)));
    chart.setOption({
      ...baseOption,
      legend:{show:false},
      visualMap:{
        show:false, type:'piecewise',
        pieces:[
          {min:0.20, max:maxAbs+1, color:'#E04040'},
          {min:0.05, max:0.20, color:'#F87171'},
          {min:0.001, max:0.05, color:'#FCA5A5'},
          {min:-0.001, max:0.001, color:'#2563EB'},
          {min:-0.05, max:-0.001, color:'#6EE7B7'},
          {min:-0.20, max:-0.05, color:'#34D399'},
          {min:-maxAbs-1, max:-0.20, color:'#23A27B'}
        ]
      }
    }, true);
  }

  const bubble = $('mapRegionBubble');
  if(bubble){
    chart.off('mouseover', chart.__regionBubbleOver);
    chart.off('mousemove', chart.__regionBubbleMove);
    chart.off('mouseout', chart.__regionBubbleOut);
    chart.off('globalout', chart.__regionBubbleOut);
    chart.__regionBubbleOver = (params)=>{
      if(mode!=='region' || !params.data) { bubble.style.display='none'; return; }
      bubble.textContent = params.data.region;
      bubble.style.borderColor = REGION_COLORS[params.data.region]||'#60A5FA';
      bubble.style.display='block';
    };
    chart.__regionBubbleMove = (params)=>{
      if(mode!=='region' || bubble.style.display==='none') return;
      const ev = params.event?.event;
      if(!ev) return;
      const rect = bubble.parentElement.getBoundingClientRect();
      bubble.style.left = (ev.clientX - rect.left) + 'px';
      bubble.style.top = (ev.clientY - rect.top) + 'px';
    };
    chart.__regionBubbleOut = ()=>{ bubble.style.display='none'; };
    chart.on('mouseover', chart.__regionBubbleOver);
    chart.on('mousemove', chart.__regionBubbleMove);
    chart.on('mouseout', chart.__regionBubbleOut);
    chart.on('globalout', chart.__regionBubbleOut);
  }

  if(state.filterRegion){
    const bz = computeRegionBBoxCenterZoom(state.filterRegion);
    if(bz) chart.setOption({series:[{center:bz.center, zoom:bz.zoom}]});
    else chart.dispatchAction({type:'restore'});
  } else {
    chart.dispatchAction({type:'restore'});
  }
  chart.off('click'); chart.on('click', p=>{
    if(!p.name) return;
    if(!state.filterRegion){
      state.filterRegion = regionOf(p.name); $('fRegion').value = state.filterRegion;
      state.filterProvince=''; state.filterDistrictIdx='';
      refreshProvinceOptions(); refreshDistrictOptions(); renderAll();
      return;
    }
    const cleared = setProvinceFilter(p.name);
    if(cleared){ $('sidebar').classList.remove('open'); state.sidebarState = {type:null, key:null}; }
    else { openProvinceSidebar(p.name); }
  });
}

function diffBadgeHtml(diff, compliant){
  if(diff==null) return '';
  const tip = 'เทียบราคาขายจริงกับราคาอ้างอิง (ราคากลาง กทม. + ค่าขนส่ง สนพ.)';
  if(compliant) return `<span class="badge compliant" title="${tip}">✓ ตรงตามเกณฑ์ สนพ.</span>`;
  const cls = diff>0 ? 'diffpos':'diffneg';
  const sign = diff>0 ? '+':'';
  return `<span class="badge ${cls}" title="${tip}">${sign}${diff.toFixed(2)} ฿ ${diff>0?'สูงกว่าราคาอ้างอิง':'ต่ำกว่าราคาอ้างอิง'}</span>`;
}

function openProvinceSidebar(prov){
  state.sidebarState = {type:'province', key:prov};
  const d = state.data;
  const cutoff = state.filterDateISO, prod = state.filterProduct;
  const isAllProd = prod === -1;
  const bkk = isAllProd ? avgBkkAll(cutoff) : bkkAsOf(prod, cutoff);

  if(prov==='กรุงเทพมหานคร'){
    $('sbTitle').textContent = 'กรุงเทพมหานคร (ราคากลาง) — '+(isAllProd?'ทุกผลิตภัณฑ์ (เฉลี่ย)':dispName(d.products[prod]));
    let html = `<div style="font-size:12px;color:var(--text-dim);margin-bottom:10px;">ณ ${thDate(state.filterDateISO,'full')}</div>`;
    html += `<div class="kpi-card"><div class="label">ราคากลาง (ราคา กทม. — ฐานสำหรับคำนวณราคาอ้างอิงทั่วประเทศ)</div><div class="value">${bkk!=null? bkk.toFixed(2)+' ฿' : '-'}</div><div class="sub">ค่าขนส่ง สนพ. ไม่มีผล (ระยะทาง 0)</div></div>`;
    html += `<div style="margin-top:10px;"><h4 style="font-size:12px;margin-bottom:6px;">ราคาทุกผลิตภัณฑ์ล่าสุด</h4>`;
    sortedProdIdx(d.products).forEach(pi=>{
      const p = d.products[pi];
      const val = bkkAsOf(pi, cutoff);
      if(val!=null) html += `<div class="district-row"><span>${dispName(p)}</span><span>${val.toFixed(2)} ฿</span></div>`;
    });
    html += '</div>';
    if(charts['sbProvTrend']){ echarts.dispose(charts['sbProvTrend']); delete charts['sbProvTrend']; }
  if(charts['sbTrend']){ echarts.dispose(charts['sbTrend']); delete charts['sbTrend']; }
  $('sbBody').innerHTML = html;
  $('sidebar').classList.add('open');

  const provDistIdxs = distIdxs.slice(0, 30);
    return;
  }

  const provIdx = d.provinces.indexOf(prov);
  const distIdxs = d._provDists[provIdx] || [];
  const rows = distIdxs.map(i=>{
    const price = isAllProd ? avgPriceAll(i, cutoff) : priceAsOf(i, prod, cutoff);
    const transport = transportOf(i);
    const ref = (bkk!=null && transport!=null) ? bkk+transport : null;
    const diff = (price!=null && ref!=null) ? +(price-ref).toFixed(2) : null;
    return {name:d.districts[i][1], price, transport, ref, diff, compliant: diff!=null && Math.abs(diff)<=0.001, distIdx:i};
  }).filter(r=>r.price!=null).sort((a,b)=>b.price-a.price);

  const region = regionOf(prov);
  const avgPrice = rows.length? +(rows.reduce((a,r)=>a+r.price,0)/rows.length).toFixed(2) : 0;
  const avgTransport = rows.filter(r=>r.transport!=null).length? +(rows.filter(r=>r.transport!=null).reduce((a,r)=>a+r.transport,0)/rows.filter(r=>r.transport!=null).length).toFixed(2) : 0;
  const avgDiff = rows.filter(r=>r.diff!=null).length? +(rows.filter(r=>r.diff!=null).reduce((a,r)=>a+r.diff,0)/rows.filter(r=>r.diff!=null).length).toFixed(2) : 0;
  const compliantCount = rows.filter(r=>r.compliant).length;
  const aboveCount = rows.filter(r=>r.diff!=null && r.diff>0.001).length;
  const belowCount = rows.filter(r=>r.diff!=null && r.diff<-0.001).length;

  $('sbTitle').textContent = 'จังหวัด'+prov;
  let html = `<div style="font-size:12px;color:var(--text-dim);margin-bottom:4px;">${region} · ${rows.length} อำเภอ · ณ ${thDate(state.filterDateISO,'full')}</div>`;
  html += `<div style="font-size:11.5px;color:var(--text-dim);margin-bottom:10px;">${isAllProd?'ทุกผลิตภัณฑ์ (เฉลี่ย)':dispName(d.products[prod])} · ราคากลาง กทม.: <b style="color:var(--text)">${bkk!=null? bkk.toFixed(2)+' ฿':'-'}</b></div>`;

  html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;">`;
  html += `<div class="kpi-card" style="padding:10px;"><div class="label">ราคาเฉลี่ย</div><div class="value" style="font-size:15px;">${avgPrice} ฿</div></div>`;
  html += `<div class="kpi-card" style="padding:10px;"><div class="label">ค่าขนส่งเฉลี่ย</div><div class="value" style="font-size:15px;">${avgTransport} ฿</div></div>`;
  html += `<div class="kpi-card" style="padding:10px;"><div class="label">ส่วนต่างเฉลี่ย</div><div class="value" style="font-size:15px;color:${avgDiff>0.001?'var(--up)':avgDiff<-0.001?'var(--down)':'var(--text-dim)'};">${avgDiff>=0?'+':''}${avgDiff} ฿</div><div class="sub" style="font-size:10px;"><span style="color:var(--up)">▲${aboveCount} สูงกว่า</span> · <span style="color:var(--down)">▼${belowCount} ต่ำกว่า</span></div></div>`;
  html += `<div class="kpi-card" style="padding:10px;" title="อำเภอที่ราคาขายจริง = ราคากลาง กทม. + ค่าขนส่งอ้างอิง สนพ. (คลาดเคลื่อนไม่เกิน 0.01 บาท)"><div class="label">ราคาตรงตามเกณฑ์ สนพ.</div><div class="value" style="font-size:15px;">${compliantCount}/${rows.length} (${rows.length?((compliantCount/rows.length*100).toFixed(0)):0}%)</div><div class="sub" style="font-size:9.5px;">= ราคากลาง กทม. + ค่าขนส่งอ้างอิง</div></div>`;
  html += `</div>`;

  if(d._zeroTransportProvinces.has(prov)){
    html += `<div style="font-size:11.5px;color:var(--blue-400);margin-bottom:10px;">ℹ ค่าขนส่ง สนพ. = 0 บาททุกอำเภอ (ราคาเท่า กทม.)</div>`;
  }
  if(rows.length){
    const maxRow = rows[0], minRow = rows[rows.length-1];
    html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;">
      <div class="kpi-card" style="padding:10px;"><div class="label">แพงสุด</div><div class="value" style="font-size:14px">${maxRow.price.toFixed(2)} ฿</div><div class="sub">${maxRow.name}</div>${diffBadgeHtml(maxRow.diff, maxRow.compliant)}</div>
      <div class="kpi-card" style="padding:10px;"><div class="label">ถูกสุด</div><div class="value" style="font-size:14px">${minRow.price.toFixed(2)} ฿</div><div class="sub">${minRow.name}</div>${diffBadgeHtml(minRow.diff, minRow.compliant)}</div>
    </div>`;
  }

  html += `<div id="sbProvTrend" class="echart short" style="margin-bottom:10px;"></div>`;

  html += `<h4 style="font-size:12px;margin-bottom:6px;">ราคาทุกผลิตภัณฑ์ล่าสุด (อำเภอเฉลี่ย) <span style="color:var(--text-dim);font-weight:400;">— ตัวเลข +/- คือส่วนต่างจากราคาอ้างอิงสนพ.</span></h4>`;
  sortedProdIdx(d.products).forEach(pi=>{
    const p = d.products[pi];
    const prodDiffs = distIdxs.map(i=>{
      const price = priceAsOf(i, pi, cutoff);
      const transport = transportOf(i);
      const bkkV = bkkAsOf(pi, cutoff);
      if(price==null || transport==null || bkkV==null) return null;
      return +(price-(bkkV+transport)).toFixed(2);
    }).filter(v=>v!=null);
    let sum=0,n=0;
    distIdxs.forEach(i=>{
      const price = priceAsOf(i, pi, cutoff);
      if(price!=null){ sum+=price; n++; }
    });
    const avgVal = n? +(sum/n).toFixed(2) : null;
    if(avgVal!=null){
      const prodDiff = prodDiffs.length? +(prodDiffs.reduce((a,b)=>a+b,0)/prodDiffs.length).toFixed(2) : null;
      const status = prodDiff==null? '' : prodDiff===0? '<span style="color:var(--down);font-size:10px;">✓ ตรงสนพ.</span>' : prodDiff>0? `<span style="color:var(--up);font-size:10px;">+${prodDiff}</span>` : `<span style="color:var(--down);font-size:10px;">${prodDiff}</span>`;
      html += `<div class="district-row"><span>${dispName(p)}</span><span>${avgVal.toFixed(2)} ฿ ${status}</span></div>`;
    }
  });

  html += `<h4 style="font-size:12px;margin:10px 0 6px;">รายชื่ออำเภอ (${rows.length} แห่ง)</h4>`;
  rows.forEach(r=>{
    html += `<div class="district-row" style="cursor:pointer; flex-direction:column; align-items:stretch; gap:3px;" onclick="if(setDistrictFilter(${r.distIdx})){ $('sidebar').classList.remove('open'); state.sidebarState={type:null,key:null}; } else { openDistrictSidebar(${r.distIdx}); }">
      <div style="display:flex;justify-content:space-between;"><span>${r.name}</span><span>${r.price.toFixed(2)} ฿ ${r.transport!=null? '<small style=\"color:var(--text-dim)\">(ขนส่ง '+r.transport.toFixed(2)+')</small>':''}</span></div>
      <div>${diffBadgeHtml(r.diff, r.compliant)}</div>
    </div>`;
  });
  if(charts['sbProvTrend']){ echarts.dispose(charts['sbProvTrend']); delete charts['sbProvTrend']; }
  if(charts['sbTrend']){ echarts.dispose(charts['sbTrend']); delete charts['sbTrend']; }
  $('sbBody').innerHTML = html;
  $('sidebar').classList.add('open');

  const provDistIdxs = distIdxs.slice(0, 30);
  const trendPoints = isAllProd ? dailyForwardFillAvgAll(provDistIdxs) : dailyForwardFillAvg(provDistIdxs, prod);
  if(trendPoints.length > 1){
    const chartT = chartTheme();
    getChart('sbProvTrend').setOption({
      backgroundColor:'transparent',
      grid:{left:40,right:10,top:10,bottom:60},
      xAxis:{type:'category', data:trendPoints.map(p=>thDate(p[0],'short')), axisLabel:{color:chartT.dim,fontSize:SC(10),rotate:35, margin:14}},
      yAxis:{type:'value', scale:true, axisLabel:{color:chartT.dim,fontSize:SC(8)}, splitLine:{lineStyle:{color:chartT.border}}},
      tooltip:{trigger:'axis'},
      series:[{type:'line', data:trendPoints.map(p=>p[1]), smooth:true, areaStyle:{opacity:.1}, itemStyle:{color:chartT.blue}, lineStyle:{color:chartT.blue,width:1.5}, showSymbol:false}]
    }, true);
  }
}

function openDistrictSidebar(distIdx){
  state.sidebarState = {type:'district', key:distIdx};
  const d = state.data;
  const dist = d.districts[distIdx];
  const prov = d.provinces[dist[0]];
  const prod = state.filterProduct;
  const isAllProd = prod === -1;
  const cutoff = state.filterDateISO;
  const bkk = isAllProd ? avgBkkAll(cutoff) : bkkAsOf(prod, cutoff);
  const curPrice = isAllProd ? avgPriceAll(distIdx, cutoff) : priceAsOf(distIdx, prod, cutoff);
  const transport = transportOf(distIdx);
  const ref = (bkk!=null && transport!=null) ? bkk+transport : null;
  const diff = (curPrice!=null && ref!=null) ? +(curPrice-ref).toFixed(2) : null;
  const compliant = diff!=null && Math.abs(diff)<=0.001;
  const prodLabel = isAllProd ? 'ทุกผลิตภัณฑ์ (เฉลี่ย)' : dispName(d.products[prod]);

  $('sbTitle').textContent = prov+' / '+dist[1];
  let html = `<div style="font-size:12px;color:var(--text-dim);margin-bottom:8px;">${prodLabel} · ณ ${thDate(cutoff,'full')}</div>`;
  if(curPrice != null){
    html += `<div class="kpi-card" style="margin-bottom:10px;"><div class="label">ราคาล่าสุด</div>
      <div class="value">${curPrice.toFixed(2)} ฿</div>
      ${transport!=null? `<div class="sub">ค่าขนส่ง สนพ.: ${transport.toFixed(2)} ฿</div>`:''}
    </div>`;
    html += `<div class="kpi-card" style="margin-bottom:10px;">
      <div class="label">ราคากลาง (กทม.) + ค่าขนส่ง สนพ. = ราคาอ้างอิง</div>
      <div class="value" style="font-size:16px;">${bkk!=null?bkk.toFixed(2):'-'} + ${transport!=null?transport.toFixed(2):'-'} = ${ref!=null?ref.toFixed(2):'-'} ฿</div>
      <div style="margin-top:6px;">${diffBadgeHtml(diff, compliant)}</div>
    </div>`;
    if(!isAllProd){
      const series = (d._byDistProd[distIdx+'-'+prod]||[]);
      if(series.length){
        html += `<div id="sbTrend" class="echart short"></div>`;
      }
    } else {
      html += `<div id="sbTrend" class="echart short"></div>`;
    }
  } else {
    html += '<div>ไม่มีข้อมูลราคาในตัวกรองปัจจุบัน</div>';
  }
  html += `<h4 style="margin:14px 0 6px;font-size:13px;">ราคาทุกผลิตภัณฑ์ล่าสุด</h4>`;
  sortedProdIdx(d.products).forEach(pi=>{
    const p = d.products[pi];
    const val = priceAsOf(distIdx, pi, state.filterDateISO);
    if(val!=null) html += `<div class="district-row"><span>${dispName(p)}</span><span>${val.toFixed(2)} ฿</span></div>`;
  });
  if(charts['sbTrend']){ echarts.dispose(charts['sbTrend']); delete charts['sbTrend']; }
  $('sbBody').innerHTML = html;
  $('sidebar').classList.add('open');
  if(curPrice != null){
    const t = chartTheme();
    let trendData;
    if(isAllProd){
      trendData = dailyForwardFillAvgAll([distIdx]);
    } else {
      trendData = dailyForwardFillAvg([distIdx], prod);
    }
    if(trendData.length){
      getChart('sbTrend').setOption({
        backgroundColor:'transparent',
        grid:{left:40,right:16,top:16,bottom:60},
        xAxis:{type:'category', data:trendData.map(s=>thDate(s[0],'short')), axisLabel:{color:t.dim, fontSize:SC(10), rotate:45, margin:14}},
        yAxis:{type:'value', scale:true, axisLabel:{color:t.dim, fontSize:SC(9)}, splitLine:{lineStyle:{color:t.border}}},
        tooltip:{trigger:'axis'},
        series:[{type:'line', data:trendData.map(s=>s[1]), smooth:true, areaStyle:{opacity:.15}, itemStyle:{color:t.blue}, lineStyle:{color:t.blue,width:2}}]
      }, true);
    }
  }
}

function barAxisRange(vals){
  if(!vals.length) return {min:undefined, max:undefined};
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = Math.max(1, (hi-lo)*0.15);
  return {min:Math.floor(lo-pad), max:Math.ceil(hi+pad)};
}
function renderTopBottom(){
  const snap = latestSnapshot();
  const provAvg = provinceAverages(snap).sort((a,b)=>b.avg-a.avg);
  const top5 = provAvg.slice(0,5);
  const bottom5 = provAvg.slice(-5).reverse();
  const t = chartTheme();
  const allVals = [...top5,...bottom5].map(x=>x.avg);
  const {min:axisMin, max:axisMax} = barAxisRange(allVals);
  getChart('topBottomChart').setOption({
    backgroundColor:'transparent',
    tooltip:{trigger:'axis', axisPointer:{type:'shadow'}},
    legend:{data:['สูงสุด','ต่ำสุด'], textStyle:{color:t.dim, fontSize:SC(14)}, itemWidth:22, itemHeight:14, itemGap:20, top:0},
    grid:{left:70,right:36,top:30,bottom:20},
    xAxis:{type:'value', min:axisMin, max:axisMax, axisLabel:{color:t.dim,fontSize:SC(9)}, splitLine:{lineStyle:{color:t.border}}},
    yAxis:{type:'category', data:[...top5.map(x=>x.prov),...bottom5.map(x=>x.prov)].reverse(), axisLabel:{color:t.text,fontSize:SC(10)}},
    series:[{
      type:'bar', barMaxWidth:22, data:[...top5.map(x=>({value:x.avg,itemStyle:{color:t.up}})),...bottom5.map(x=>({value:x.avg,itemStyle:{color:t.down}}))].reverse(),
      label:{show:true, position:'right', color:t.text, fontSize:SC(9), formatter:p=>p.value.toFixed(2)}
    }]
  }, true);
}
function renderRegionPie(){
  const snap = latestSnapshot();
  const m = {};
  snap.forEach(r=>{ (m[r.region] ||= []).push(r.price); });
  const data = Object.entries(m).map(([name,arr])=>({name, value:+(arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(2)}))
    .sort((a,b)=>b.value-a.value);
  const t = chartTheme();
  const {min:axisMin, max:axisMax} = barAxisRange(data.map(x=>x.value));
  getChart('regionPie').setOption({
    backgroundColor:'transparent',
    tooltip:{trigger:'axis', axisPointer:{type:'shadow'}, formatter:p=>`${p[0].name}: ${p[0].value.toFixed(2)} ฿`},
    grid:{left:150,right:36,top:10,bottom:20},
    xAxis:{type:'value', min:axisMin, max:axisMax, axisLabel:{color:t.dim,fontSize:SC(9)}, splitLine:{lineStyle:{color:t.border}}},
    yAxis:{type:'category', data:data.map(x=>x.name).reverse(), axisLabel:{color:t.text, fontSize:SC(10)}},
    series:[{
      type:'bar', barMaxWidth:22,
      data:data.map(x=>({value:x.value, itemStyle:{color:REGION_COLORS[x.name]||'#54747C'}})).reverse(),
      label:{show:true, position:'right', color:t.text, fontSize:SC(9), formatter:p=>p.value.toFixed(2)}
    }]
  }, true);
}

function renderProductMonthlyTrend(){
  const d = state.data;
  const t = chartTheme();
  let distIdxs;
  if(state.filterProvince){
    const provIdx = d.provinces.indexOf(state.filterProvince);
    distIdxs = d._provDists[provIdx] || [];
  } else {
    distIdxs = d.districts.map((_,i)=>i);
  }
  const distSet = new Set(distIdxs);

  const byMonth = {}; 
  d.district_prices.forEach(([di, distIdx, prodIdx, price])=>{
    if(!distSet.has(distIdx)) return;
    const ym = d.dates[di].slice(0,7);
    byMonth[ym] ||= { sum: new Array(d.products.length).fill(0), count: new Array(d.products.length).fill(0) };
    byMonth[ym].sum[prodIdx] += price;
    byMonth[ym].count[prodIdx]++;
  });
  const months = Object.keys(byMonth).sort();
  const allMonths = months;
  const series = [];
  sortedProdIdx(d.products).forEach(pi=>{
    const p = d.products[pi];
    const actual = months.map(ym=>{
      const c = byMonth[ym].count[pi];
      return c? +(byMonth[ym].sum[pi]/c).toFixed(2) : null;
    });
    const color = prodColor(p);
    series.push({
      name:dispName(p), type:'line', smooth:false, showSymbol:false, connectNulls:false,
      lineStyle:{width:2, color}, itemStyle:{color},
      data:actual
    });
  });
  const chart = getChart('productMonthlyTrend');
  chart.setOption({
    backgroundColor:'transparent',
    tooltip:{trigger:'axis'},
    legend:{show:false},
    grid:{left:50,right:20,top:20,bottom:85},
    dataZoom:[{type:'inside'},{type:'slider', textStyle:{color:t.dim}}],
    xAxis:{type:'category', data:allMonths.map(ym=>{ const [y,m]=ym.split('-'); return THAI_MONTHS_SHORT[+m-1]+' '+(+y+543); }), axisLabel:{color:t.dim, fontSize:SC(10), rotate:35, margin:14}},
    yAxis:{type:'value', scale:true, axisLabel:{color:t.dim}, splitLine:{lineStyle:{color:t.border}}},
    series
  }, true);

  const legendEl = $('productTrendLegend');
  if(legendEl){
    legendEl.innerHTML = sortedProdIdx(d.products).map(pi=>{ const p = d.products[pi]; return `
      <div class="product-icon small" data-name="${dispName(p)}" title="${dispName(p)}" style="background:${prodColor(p)}; color:${prodTextColor(p)};">
        ${LOGO_FILE[p] ? `<img src="assets/Logo/${LOGO_FILE[p]}" alt="" style="width:118%;height:118%;object-fit:cover;border-radius:50%;display:block;" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">` : ''}
        <span style="display:${LOGO_FILE[p]?'none':'block'};">${dispName(p)}</span>
      </div>`;}).join('');
    legendEl.querySelectorAll('.product-icon').forEach(el=>{
      el.classList.add('active');
      el.onclick = ()=>{
        el.classList.toggle('dimmed');
        chart.dispatchAction({type:'legendToggleSelect', name:el.dataset.name});
      };
    });
  }
}

function renderTransport(){
  const snap = latestSnapshot().filter(r=>r.transport!=null && !r.isBangkokBaseline);
  const t = chartTheme();
  const d0 = state.data;
  const cutoff0 = state.filterDateISO;

  const allRows = [];
  d0.products.forEach((prodName, pi)=>{
    const bkkVal = bkkAsOf(pi, cutoff0);
    if(bkkVal==null) return;
    const rows = [];
    d0.districts.forEach((dd,i)=>{
      const prov = d0.provinces[dd[0]];
      if(state.filterProvince && prov!==state.filterProvince) return;
      if(state.filterDistrictIdx!=='' && String(i)!==String(state.filterDistrictIdx)) return;
      const transport = transportOf(i);
      if(transport==null) return;
      const price = priceAsOf(i, pi, cutoff0) ?? 0;
      const diff = +(price-(bkkVal+transport)).toFixed(2);
      rows.push({prov, dist:dd[1], product:prodName, price, bkk:bkkVal, transport, diff});
    });
    if(!rows.length) return;
    const diffs = rows.map(r=>r.diff);
    const mean = diffs.reduce((a,b)=>a+b,0)/diffs.length;
    const std = Math.sqrt(diffs.reduce((a,b)=>a+(b-mean)**2,0)/diffs.length) || 1;
    rows.forEach(r=>{ r.z = (r.diff-mean)/std; r.isOutlier = Math.abs(r.z)>1.8; allRows.push(r); });
  });
  allRows.sort((a,b)=>Math.abs(b.z)-Math.abs(a.z));
  state._outlierAllRows = allRows;
  renderOutlierTable();

  const d = state.data;
  const regionNames = Object.keys(REGIONS);
  const cutoff = state.filterDateISO;
  const cells = [];
  const prodOrder = sortedProdIdx(d.products); 
  regionNames.forEach((region, ri)=>{
    prodOrder.forEach((pi, xi)=>{
      const p = d.products[pi];
      const bkkVal = bkkAsOf(pi, cutoff);
      let total=0, nonCompliant=0; const nonCompliantDiffs=[];
      d.districts.forEach((dd,i)=>{
        if(regionOf(d.provinces[dd[0]])!==region) return;
        if(state.filterProvince && d.provinces[dd[0]]!==state.filterProvince) return;
        const price = priceAsOf(i, pi, cutoff); 
        const transport = transportOf(i);
        if(price==null || transport==null || bkkVal==null) return;
        total++;
        const diff = price - (bkkVal+transport);
        if(Math.abs(diff) > 0.001){ nonCompliant++; nonCompliantDiffs.push(diff); }
      });
      if(total>0){
        const rate = +(nonCompliant/total*100).toFixed(1);
        const avgNonCompliantDiff = nonCompliantDiffs.length? +(nonCompliantDiffs.reduce((a,b)=>a+b,0)/nonCompliantDiffs.length).toFixed(2) : 0;
        cells.push({value:[xi, ri, rate], total, nonCompliant, avgNonCompliantDiff});
      } else {
        cells.push({value:[xi, ri, null], total:0, nonCompliant:0, avgNonCompliantDiff:0}); 
      }
    });
  });
  getChart('transportHeatmap').setOption({
    backgroundColor:'transparent',
    tooltip:{ position:'top', formatter:p=>{
      const c = p.data;
      const prodName = dispName(d.products[prodOrder[p.value[0]]]);
      if(c.total===0) return `${regionNames[p.value[1]]} / ${prodName}<br>ไม่มีข้อมูลในตัวกรองปัจจุบัน`;
      return `${regionNames[p.value[1]]} / ${prodName}<br>`
        + `ไม่ตรงเกณฑ์ สนพ.: ${c.nonCompliant} / ${c.total} อำเภอ (${c.value[2]}%)<br>`
        + (c.nonCompliant? `ส่วนต่างเฉลี่ยจากราคาอ้างอิง (กลาง+ขนส่ง): ${c.avgNonCompliantDiff>0?'+':''}${c.avgNonCompliantDiff} ฿` : 'ราคาตรงตามราคาอ้างอิง สนพ. ทั้งหมด');
    }},
    grid:{left:80,right:20,top:20,bottom:82},
    xAxis:{type:'category', data:prodOrder.map(pi=>dispName(d.products[pi])), axisLabel: productAxisLabelOption(prodOrder, d, 46), splitArea:{show:true}},
    yAxis:{type:'category', data:regionNames, axisLabel:{color:t.text, fontSize:SC(13)}, splitArea:{show:true}},
    visualMap:{
      show:false, min:0, max:100, type:'piecewise',
      pieces:[
        {min:0, max:0, color:'#23A27B'},
        {min:0.001, max:5, color:'#2563EB'},
        {min:5, max:15, color:'#F59E0B'},
        {min:15, max:30, color:'#EA580C'},
        {min:30, max:60, color:'#E04040'},
        {min:60, max:100, color:'#991B1B'}
      ]
    },
    series:[{
      type:'heatmap', data:cells,
      label:{show:true, color:'#fff', fontSize:SC(16), fontWeight:700, formatter:p=>p.data.total? p.data.value[2]+'%' : '–',
        textBorderColor:'rgba(0,0,0,.65)', textBorderWidth:2.5},
      itemStyle:{ borderColor:t.border, borderWidth:1,
        color: p=> p.data.total===0 ? '#17263D' : undefined }
    }]
  }, true);
}

function renderOutlierTable(){
  const q = ($('outlierSearch')?.value || '').trim().toLowerCase();
  const showAll = $('outlierShowAll')?.checked || false;
  const all = state._outlierAllRows || [];
  let rows = showAll ? all : all.filter(r=>r.isOutlier);
  if(q) rows = rows.filter(r=> r.prov.toLowerCase().includes(q) || r.dist.toLowerCase().includes(q) || r.product.toLowerCase().includes(q));

  const sortState = state.outlierSort || (state.outlierSort = {key:null, dir:null});
  if(sortState.key==='diff'){
    rows = [...rows].sort((a,b)=> sortState.dir==='asc' ? a.diff-b.diff : b.diff-a.diff);
  }
  const arrow = sortState.key==='diff' ? (sortState.dir==='asc'?' ▲':' ▼') : ' ⇅';

  $('outlierTable').innerHTML = `<thead><tr>
      <th>จังหวัด</th><th>อำเภอ</th><th>ผลิตภัณฑ์</th><th>ราคาต้นทาง (กทม.)</th><th>ราคาปลายทาง</th>
      <th>ค่าขนส่ง สนพ.</th><th title="ราคาปลายทาง − ราคาต้นทาง (กทม.)">ส่วนต่างเฉลี่ยที่พบ</th>
      <th id="outlierSortHeader" style="cursor:pointer; user-select:none;" title="ค่าความคลาดเคลื่อน = ส่วนต่างเฉลี่ยที่พบ − ค่าขนส่ง สนพ. (ยิ่งห่างจาก 0 ยิ่งผิดปกติ) · คลิกเพื่อเรียงจากน้อย→มาก / มาก→น้อย">ค่าความคลาดเคลื่อน${arrow}</th>
      <th>สถานะ</th>
    </tr></thead><tbody>` +
    (rows.length? rows.map(r=>{
      const foundDiff = +(r.price-r.bkk).toFixed(2); 
      const status = r.diff>0.001 ? 'ขายแพงกว่าเกณฑ์' : r.diff<-0.001 ? 'ขายถูกกว่าเกณฑ์' : 'ตรงตามเกณฑ์ สนพ.';
      const statusColor = r.diff>0.001 ? 'var(--up)' : r.diff<-0.001 ? 'var(--down)' : 'var(--text-dim)';
      return `<tr>
        <td>${r.prov}</td><td>${r.dist}</td><td>${r.product}</td>
        <td>${r.bkk.toFixed(2)}</td>
        <td>${r.price.toFixed(2)}</td>
        <td>${r.transport.toFixed(2)}</td>
        <td>${foundDiff>0?'+':''}${foundDiff.toFixed(2)}</td>
        <td style="color:${r.diff>=0?'var(--up)':'var(--down)'};font-weight:500;">${r.diff>=0?'+':''}${r.diff.toFixed(2)}</td>
        <td style="color:${statusColor};font-weight:600;">${status}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="9" style="text-align:center;color:var(--text-dim);padding:16px;">ไม่พบรายการที่ตรงกับคำค้นหา</td></tr>`) +
    `</tbody>`;

  $('outlierSortHeader').onclick = ()=>{
    sortState.key = 'diff';
    sortState.dir = sortState.dir==='asc' ? 'desc' : 'asc';
    renderOutlierTable();
  };
}

function renderRanking(){
  const snap = latestSnapshot();
  const provAvg = provinceAverages(snap).sort((a,b)=>b.avg-a.avg);
  const t = chartTheme();
  const top20 = provAvg.slice(0,20).reverse();
  const bottom20 = provAvg.slice(-20);
  const topRange = barAxisRange(top20.map(x=>x.avg));
  const bottomRange = barAxisRange(bottom20.map(x=>x.avg));
  getChart('rankTop').setOption({
    backgroundColor:'transparent', tooltip:{trigger:'axis', axisPointer:{type:'shadow'}},
    grid:{left:90,right:36,top:10,bottom:20},
    xAxis:{type:'value', min:topRange.min, max:topRange.max, axisLabel:{color:t.dim}, splitLine:{lineStyle:{color:t.border}}},
    yAxis:{type:'category', data:top20.map(x=>x.prov), axisLabel:{color:t.text, fontSize:SC(10)}},
    series:[{type:'bar', barMaxWidth:16, data:top20.map(x=>x.avg), itemStyle:{color:t.up}, label:{show:true,position:'right',color:t.text,fontSize:SC(9),formatter:p=>p.value.toFixed(2)}}]
  }, true);
  getChart('rankBottom').setOption({
    backgroundColor:'transparent', tooltip:{trigger:'axis', axisPointer:{type:'shadow'}},
    grid:{left:90,right:36,top:10,bottom:20},
    xAxis:{type:'value', min:bottomRange.min, max:bottomRange.max, axisLabel:{color:t.dim}, splitLine:{lineStyle:{color:t.border}}},
    yAxis:{type:'category', data:bottom20.map(x=>x.prov).reverse(), axisLabel:{color:t.text, fontSize:SC(10)}},
    series:[{type:'bar', barMaxWidth:16, data:bottom20.map(x=>x.avg).reverse(), itemStyle:{color:t.down}, label:{show:true,position:'right',color:t.text,fontSize:SC(9),formatter:p=>p.value.toFixed(2)}}]
  }, true);
}

function renderCompare(){
  const d = state.data, t = chartTheme();
  const items = state.compareItems || [];
  if(!items.length) { getChart('compareBar').clear(); return; }
  const cutoff = state.filterDateISO;
  const colors = COMPARE_COLORS;

  const prodOrder = sortedProdIdx(d.products);
  const avgOf = (distIdxs, pi) => {
    const vals = distIdxs.map(i=>priceAsOf(i,pi,cutoff)).filter(v=>v!=null);
    return vals.length? +(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(2) : 0; 
  };
  const seriesBkk = prodOrder.map(pi=>bkkAsOf(pi,cutoff) ?? 0);

  const series = items.map((it,i)=>({
    name:it.label, type:'bar', data:prodOrder.map(pi=>avgOf(it.distIdxs,pi)),
    itemStyle:{color:colors[i%colors.length]},
    label:{show:true, position:'top', color:t.text, fontSize:SC(8), rotate:90, align:'left', verticalAlign:'middle', formatter:p=>p.value.toFixed(2)}
  }));
  series.push({name:'ราคากลาง กทม.', type:'bar', data:seriesBkk, itemStyle:{color:t.dim}, label:{show:true, position:'top', color:t.text, fontSize:SC(8), rotate:90, align:'left', verticalAlign:'middle', formatter:p=>p.value.toFixed(2)}});

  getChart('compareBar').setOption({
    backgroundColor:'transparent',
    tooltip:{trigger:'axis', axisPointer:{type:'shadow'}},
    legend:{data:[...items.map(it=>it.label),'ราคากลาง กทม.'], textStyle:{color:t.dim, fontSize:SC(14)}, itemWidth:22, itemHeight:14, itemGap:20, top:0, type:'scroll'},
    grid:{left:50,right:20,top:44,bottom:115},
    xAxis:{type:'category', data:prodOrder.map(pi=>dispName(d.products[pi])), axisLabel: productAxisLabelOption(prodOrder, d)},
    yAxis:{type:'value', scale:true, axisLabel:{color:t.dim}, splitLine:{lineStyle:{color:t.border}}},
    series
  }, true);
}

function renderMomChart(){
  const d = state.data;
  const t = chartTheme();
  let distIdxs;
  if(state.filterProvince){
    const provIdx = d.provinces.indexOf(state.filterProvince);
    distIdxs = d._provDists[provIdx] || [];
  } else {
    distIdxs = d.districts.map((_,i)=>i);
  }
  const distSet = new Set(distIdxs);
  const byMonth = {};
  d.district_prices.forEach(([di, distIdx, prodIdx, price])=>{
    if(!distSet.has(distIdx)) return;
    const ym = d.dates[di].slice(0,7);
    byMonth[ym] = byMonth[ym] || { sum: new Array(d.products.length).fill(0), count: new Array(d.products.length).fill(0) };
    byMonth[ym].sum[prodIdx] += price;
    byMonth[ym].count[prodIdx]++;
  });
  const months = Object.keys(byMonth).sort();
  const momMonths = months.slice(1);
  if(!momMonths.length){
    getChart('momChart').clear(); return;
  }
  const series = sortedProdIdx(d.products).map(pi=>{ const p = d.products[pi];
    const color = prodColor(p);
    const data = momMonths.map((ym, i)=>{
      const prev = byMonth[months[i]];
      const cur = byMonth[ym];
      if(!prev || !cur || prev.count[pi]===0 || cur.count[pi]===0) return null;
      const prevAvg = prev.sum[pi] / prev.count[pi];
      const curAvg = cur.sum[pi] / cur.count[pi];
      return +(curAvg - prevAvg).toFixed(2);
    });
    return {
      name: dispName(p), type: 'bar', data,
      itemStyle: { color, borderRadius: [3,3,0,0] },
      barMaxWidth: 16,
      label: { show: false }
    };
  });
  getChart('momChart').setOption({
    backgroundColor:'transparent',
    tooltip:{ trigger:'axis', axisPointer:{type:'shadow'}, formatter: params => {
      let s = `<b>${params[0]?.axisValue || ''}</b><br>`;
      params.forEach(p => {
        if(p.value != null) s += `${p.marker} ${p.seriesName}: <b style="color:${p.value >= 0 ? '#E04040' : '#23A27B'}">${p.value >= 0 ? '+' : ''}${p.value} ฿</b><br>`;
      });
      return s;
    }},
    legend:{ ...productLegendOption(sortedProdIdx(d.products), d, 20), textStyle:{color:t.dim, fontSize:SC(11)}, itemGap:12 },
    grid:{left:50,right:20,top:56,bottom:85},
    dataZoom:[{type:'inside'},{type:'slider', textStyle:{color:t.dim}}],
    xAxis:{ type:'category', data:momMonths.map(ym=>{ const [y,m]=ym.split('-'); return THAI_MONTHS_SHORT[+m-1]+' '+(+y+543); }), axisLabel:{color:t.dim, fontSize:SC(10), rotate:35, margin:14} },
    yAxis:{ type:'value', axisLabel:{color:t.dim, formatter:v=>(v>=0?'+':'')+v+' ฿'}, splitLine:{lineStyle:{color:t.border}},
      name:'เปลี่ยนแปลง (฿)', nameTextStyle:{color:t.dim, fontSize:SC(10)} },
    series
  }, true);
}

function exportCurrentCsv(){
  const snap = latestSnapshot();
  const rows = [['จังหวัด','อำเภอ','ผลิตภัณฑ์','ราคา','ค่าขนส่งสนพ.','ส่วนต่างอ้างอิง']];
  const prodName = state.filterProduct===-1 ? 'ทุกผลิตภัณฑ์ (เฉลี่ย)' : dispName(state.data.products[state.filterProduct]);
  snap.forEach(r=> rows.push([r.prov, r.dist, prodName, r.price, r.transport ?? '', r.diff ?? '']));
  const csv = '\uFEFF' + rows.map(r=>r.map(v=>`"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'pttor-price-export.csv'; a.click();
}

loadData();
$('refreshData').onclick = async ()=>{
  const db = await idbOpen();
  await new Promise((res)=>{
    const tx = db.transaction(CACHE_STORE,'readwrite');
    tx.objectStore(CACHE_STORE).delete(CACHE_KEY);
    tx.objectStore(CACHE_STORE).delete('or-volume-dataset-v1');
    tx.oncomplete = res;
  });
  location.reload();
};
