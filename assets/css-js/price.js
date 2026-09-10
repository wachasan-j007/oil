/* ============================================================
   price.js — ราคาขายปลีก: overview, trend, transport, ranking,
   compare. Depends on app.js (must load after it).
   ============================================================ */
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

