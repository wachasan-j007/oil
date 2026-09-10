/* ============================================================
   volume.js — ปริมาณจำหน่าย + สัดส่วนตลาด (share).
   Depends on app.js (must load after it).
   ============================================================ */

function volFmt(n, digits=1){
  const v = Number(n);
  if(!Number.isFinite(v)) return '-';
  return v.toLocaleString('th-TH',{minimumFractionDigits:0, maximumFractionDigits:digits});
}
function pctFmt(n, digits=1){
  const v = Number(n);
  if(!Number.isFinite(v)) return '-';
  return v.toLocaleString('th-TH',{minimumFractionDigits:digits, maximumFractionDigits:digits})+'%';
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
  if(!state.volumeReady){ void ensureVolumeData(); return; }
  // FAST: สร้างเฉพาะกราฟของ tab ที่กำลังเปิด
  const activeTab=document.querySelector('.tab-btn.active')?.dataset.page || 'volume';
  if(activeTab==='share'){
    renderShareCharts();
    return;
  }
  renderVolKPI();
  renderVolMap();
  renderVolTopBottomRegion();
  renderVolTrend();
  renderVolCompare();
  renderVolRanking();
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
    backgroundColor:'transparent', tooltip:{trigger:'axis', axisPointer:{type:'shadow'}, valueFormatter:v=>volFmt(v,1)+' ล้านลิตร'},
    legend:{top:0, textStyle:{fontSize:10, color:t.dim}, type:'scroll'},
    grid:{left:70,right:24,top:40,bottom:40},
    xAxis:{type:'category', data:items.map(it=>it.label), axisLabel:{fontSize:10.5, color:t.dim}},
    yAxis:{type:'value', name:'ล้านลิตร', nameLocation:'middle', nameGap:58, axisLabel:{color:t.dim, formatter:v=>volFmt(v,0)}, splitLine:{lineStyle:{color:t.border}}, nameTextStyle:{color:t.dim}},
    series: items.length? series : []
  }, true);
  const prod = currentVolProdIdx();
  const keys = state.volIdx.monthKeys;
  const trendSeries = items.map((it,i)=>({
    name:it.label, type:'line', smooth:true, itemStyle:{color:colors[i%colors.length]}, lineStyle:{width:2.2},
    data: keys.map(k=>{ const [ky,km]=k.split('-').map(Number); return Math.round(volOf(it.provIdx,ky,km,prod)*10)/10; })
  }));
  getChart('volCompareTrend').setOption({
    backgroundColor:'transparent', tooltip:{trigger:'axis', valueFormatter:v=>volFmt(v,1)+' ล้านลิตร'},
    legend:{top:0, textStyle:{fontSize:10, color:t.dim}, type:'scroll'},
    grid:{left:60,right:24,top:40,bottom:50},
    xAxis:{type:'category', data:keys.map(k=>{ const [ky,km]=k.split('-').map(Number); return THAI_MONTHS_SHORT[km-1]+' '+String(ky).slice(2); }), axisLabel:{fontSize:10, rotate:45, color:t.dim}},
    yAxis:{type:'value', name:'ล้านลิตร', nameLocation:'middle', nameGap:58, axisLabel:{color:t.dim, formatter:v=>volFmt(v,0)}, splitLine:{lineStyle:{color:t.border}}, nameTextStyle:{color:t.dim}},
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
async function exportVolExcel(){
  const button=$('volExportExcel');
  button.disabled=true;
  try{
    await loadXlsx();
  const rows = (state._volRankExport||[]).map((r,i)=>({'อันดับ':i+1, 'จังหวัด':r.prov, 'ปริมาณ (ล้านลิตร)':r.v}));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ปริมาณจำหน่าย');
  XLSX.writeFile(wb, 'pttor-volume-ranking.xlsx');
  }catch(error){
    alert(error.message || String(error));
  }finally{
    button.disabled=false;
  }
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
        <span>${volFmt(r.v,2)} <span style="color:var(--text-dim);font-size:10px;">(${pct}%)</span></span>
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
      tooltip:{trigger:'axis', valueFormatter:v=>volFmt(v,2)+' ล้านลิตร'},
      xAxis:{type:'category', data:trendData.map(x=>x[0]), axisLabel:{color:t.dim, fontSize:SC(9), rotate:35}},
      yAxis:{type:'value', axisLabel:{color:t.dim, fontSize:SC(9), formatter:v=>volFmt(v,0)}, splitLine:{lineStyle:{color:t.border}}},
      series:[{type:'line', data:trendData.map(x=>x[1]), smooth:true, areaStyle:{opacity:0.15}, itemStyle:{color:'#60A5FA'}, lineStyle:{width:2}}]
    }, true);

    if(isAllProd){
      const pieChart = getChart('sbVolPie');
      const pData = sortedProdIdx(vd.products).map(pi=>({name:dispName(vd.products[pi]), value:Math.round(volOf(provIdx,y,m,pi)*10)/10, itemStyle:{color:prodColor(vd.products[pi])}})).filter(x=>x.value>0);
      pieChart.setOption({
        backgroundColor:'transparent', tooltip:{trigger:'item', formatter:p=>`${p.name}: ${volFmt(p.value,1)} ล้านลิตร (${pctFmt(p.percent,1)})`},
        series:[{type:'pie', radius:['40%','75%'], center:['50%','50%'], label:{color:t.text, fontSize:SC(10), formatter:'{b}\n{d}%'}, data:pData}]
      }, true);
    }
  }, 50);
}

function renderVolTopBottomRegion(){
  const vd = state.volData, {y,m} = volYearMonth();
  const prod = currentVolProdIdx();
  const arr = vd.provinces.map((p,i)=>({name:p, v:volOf(i,y,m,prod)})).filter(x=>x.v>0).sort((a,b)=>b.v-a.v);
  const total = arr.reduce((a,b)=>a+b.v,0);
  const top5 = arr.slice(0,5), bottom5 = arr.slice(-5).reverse();
  const combined = top5.concat(bottom5.filter(b=>!top5.find(t=>t.name===b.name)))
    .map((x,i)=>({...x, pct: total>0 ? x.v/total*100 : 0, group:i<top5.length?'top':'bottom'}));
  const t = chartTheme();
  const chartData = combined.slice().reverse().map(x=>({value:x.v, pct:x.pct, group:x.group, name:x.name}));
  getChart('volTopBottomChart').setOption({
    backgroundColor:'transparent',
    tooltip:{trigger:'axis', axisPointer:{type:'shadow'}, formatter:params=>{
      const p=params?.[0]; if(!p) return '';
      const d=p.data || {};
      return `<b>${p.name}</b><br>ปริมาณ: ${volFmt(p.value,1)} ล้านลิตร<br>สัดส่วนจากทั้งหมด: ${pctFmt(d.pct,1)}`;
    }},
    grid:{left:100,right:150,top:12,bottom:34},
    xAxis:{
      type:'value', name:'ล้านลิตร', nameLocation:'middle', nameGap:30,
      axisLabel:{fontSize:10.5, color:t.dim, formatter:v=>volFmt(v,0)},
      splitLine:{lineStyle:{color:t.border, type:'dashed'}}, nameTextStyle:{color:t.dim}
    },
    yAxis:{type:'category', data:chartData.map(x=>x.name), axisLabel:{fontSize:10.5, color:t.text}},
    series:[{
      type:'bar', data:chartData,
      itemStyle:{
        color:p=> p.data.group==='top'
          ? new echarts.graphic.LinearGradient(0,0,1,0,[{offset:0,color:'#5B6EE1'},{offset:1,color:'#8B5CF6'}])
          : new echarts.graphic.LinearGradient(0,0,1,0,[{offset:0,color:'#334155'},{offset:1,color:'#64748B'}]),
        borderRadius:[0,8,8,0]
      },
      showBackground:true, backgroundStyle:{color:'rgba(148,163,184,.08)', borderRadius:[0,8,8,0]},
      barMaxWidth:18,
      label:{
        show:true, position:'right', distance:10, color:t.text, fontSize:SC(10), fontWeight:600,
        formatter:p=>`${volFmt(p.value,1)}  •  ${pctFmt(p.data.pct,1)}`
      }
    }]
  }, true);

  const regions = Object.keys(REGIONS);
  const byRegion = regions.map(r=>({
    name:r,
    value:Math.round(vd.provinces.reduce((a,p,i)=> regionOf(p)===r ? a+volOf(i,y,m,prod) : a, 0)*10)/10,
    itemStyle:{color:REGION_COLORS[r]}
  })).filter(x=>x.value>0);
  getChart('volRegionPie').setOption({
    backgroundColor:'transparent',
    tooltip:{trigger:'item', formatter:p=>`${p.name}: ${volFmt(p.value,1)} ล้านลิตร (${pctFmt(p.percent,1)})`},
    legend:{bottom:4, left:'center', textStyle:{fontSize:10, color:t.dim}, itemWidth:12, itemHeight:12, itemGap:10, padding:[10,0,0,0], type:'scroll'},
    series:[{
      type:'pie', radius:['40%','66%'], center:['50%','40%'],
      labelLine:{lineStyle:{color:t.dim}}, data:byRegion,
      label:{fontSize:10, color:t.text, formatter:p=>`${p.name}\n${volFmt(p.value,1)} ล้านลิตร · ${pctFmt(p.percent,1)}`},
      itemStyle:{borderColor:t.surface, borderWidth:2, borderRadius:4}
    }]
  }, true);
}
function renderVolTrend(){
  const vd = state.volData;
  const prod = currentVolProdIdx();
  const scope = volScopeProvIdxs();
  const keys = state.volIdx.monthKeys;
  const t = chartTheme();
  const vals = keys.map(k=>{ const [y,m]=k.split('-').map(Number); return Math.round(scope.reduce((a,i)=>a+volOf(i,y,m,prod),0)*10)/10; });
  getChart('volTrendChart').setOption({
    backgroundColor:'transparent', tooltip:{trigger:'axis', valueFormatter:v=>volFmt(v,1)+' ล้านลิตร'},
    grid:{left:70,right:24,top:20,bottom:50},
    xAxis:{type:'category', data:keys.map(k=>{ const [ky,km]=k.split('-').map(Number); return THAI_MONTHS_SHORT[km-1]+' '+String(ky).slice(2); }), axisLabel:{fontSize:10, rotate:45, color:t.dim}},
    yAxis:{type:'value', name:'ล้านลิตร', nameLocation:'middle', nameGap:58, axisLabel:{color:t.dim, formatter:v=>volFmt(v,0)}, splitLine:{lineStyle:{color:t.border}}, nameTextStyle:{color:t.dim}},
    dataZoom:[{type:'inside'},{type:'slider', height:16, bottom:10}],
    series:[{type:'line', data:vals, smooth:true, areaStyle:{opacity:.12}, itemStyle:{color:'#3763A5'}, lineStyle:{width:2.4}}]
  });
}
function renderShareCharts(){
  const vd = state.volData, {y,m} = volYearMonth();
  const LOGO_ORDER = Object.keys(LOGO_FILE);
  const prodSortIndex = name => { const i = LOGO_ORDER.indexOf(name); return i===-1? 999 : i; };
  const prodOrderIdx = vd.products.map((p,pi)=>pi).sort((a,b)=> prodSortIndex(vd.products[a]) - prodSortIndex(vd.products[b]));
  const data = prodOrderIdx.map(pi=>({
    name:dispName(vd.products[pi]),
    value:Math.round(vd.provinces.reduce((a,_,i)=>a+volOf(i,y,m,pi),0)*10)/10,
    itemStyle:{color:prodColor(vd.products[pi])}
  })).filter(x=>x.value>0);
  const t = chartTheme();
  getChart('shareProductPie').setOption({
    backgroundColor:'transparent',
    tooltip:{trigger:'item', formatter:p=>`${p.name}: ${volFmt(p.value,1)} ล้านลิตร (${pctFmt(p.percent,1)})`},
    legend:{bottom:4, left:'center', textStyle:{fontSize:10, color:t.dim}, itemWidth:12, itemHeight:12, itemGap:10, padding:[10,0,0,0], type:'scroll'},
    series:[{
      type:'pie', radius:['40%','66%'], center:['50%','40%'],
      labelLine:{lineStyle:{color:t.dim}}, data,
      label:{fontSize:10.5, color:t.text, formatter:p=>`${p.name}\n${volFmt(p.value,1)} ล้านลิตร · ${pctFmt(p.percent,1)}`},
      itemStyle:{borderColor:t.surface, borderWidth:2, borderRadius:4}
    }]
  }, true);

  const regions = Object.keys(REGIONS);
  const prod = currentVolProdIdx();
  const byRegion = regions.map(r=>({
    name:r,
    value:Math.round(vd.provinces.reduce((a,p,i)=> regionOf(p)===r ? a+volOf(i,y,m,prod) : a, 0)*10)/10,
    itemStyle:{color:REGION_COLORS[r]}
  })).filter(x=>x.value>0);
  getChart('shareRegionPie').setOption({
    backgroundColor:'transparent',
    tooltip:{trigger:'item', formatter:p=>`${p.name}: ${volFmt(p.value,1)} ล้านลิตร (${pctFmt(p.percent,1)})`},
    legend:{bottom:4, left:'center', textStyle:{fontSize:10.5, color:t.dim}, itemWidth:12, itemHeight:12, itemGap:10, padding:[10,0,0,0], type:'scroll'},
    series:[{
      type:'pie', radius:['40%','66%'], center:['50%','40%'],
      labelLine:{lineStyle:{color:t.dim}}, data:byRegion,
      label:{fontSize:10.5, color:t.text, formatter:p=>`${p.name}\n${volFmt(p.value,1)} ล้านลิตร · ${pctFmt(p.percent,1)}`},
      itemStyle:{borderColor:t.surface, borderWidth:2, borderRadius:4}
    }]
  }, true);

  // 100% stacked: เปลี่ยนจากปริมาณดิบเป็นเปอร์เซ็นต์ เพื่อให้คำว่า “สัดส่วน” อ่านตรงความหมาย
  const rawByRegion = regions.map(r=>prodOrderIdx.map(pi=>
    Math.round(vd.provinces.reduce((a,p,i)=> regionOf(p)===r ? a+volOf(i,y,m,pi) : a, 0)*10)/10
  ));
  const regionTotals = rawByRegion.map(vals=>vals.reduce((a,b)=>a+b,0));
  const series = prodOrderIdx.map((pi,prodPos)=>({
    name:dispName(vd.products[pi]), type:'bar', stack:'total',
    itemStyle:{color:prodColor(vd.products[pi]), borderColor:t.surface, borderWidth:.6},
    emphasis:{focus:'series'},
    data: regions.map((r,ri)=>{
      const raw = rawByRegion[ri][prodPos];
      const pct = regionTotals[ri] > 0 ? +(raw/regionTotals[ri]*100).toFixed(1) : 0;
      return {value:pct, raw};
    }),
    label:{
      show:true, position:'inside', color:'#fff', fontSize:SC(9), fontWeight:600,
      formatter:p=>p.value>=8 ? pctFmt(p.value,1) : ''
    }
  }));
  getChart('shareByRegionChart').setOption({
    backgroundColor:'transparent',
    tooltip:{trigger:'axis', axisPointer:{type:'shadow'}, formatter:params=>{
      if(!params?.length) return '';
      const ri=params[0].dataIndex;
      let html=`<b>${params[0].axisValue}</b><br><span style="color:${t.dim}">รวม ${volFmt(regionTotals[ri],1)} ล้านลิตร</span><br>`;
      params.filter(p=>p.data?.raw>0).forEach(p=>{
        html += `${p.marker} ${p.seriesName}: <b>${pctFmt(p.value,1)}</b> <span style="color:${t.dim}">(${volFmt(p.data.raw,1)} ล้านลิตร)</span><br>`;
      });
      return html;
    }},
    legend:{top:0, textStyle:{fontSize:10, color:t.dim}, type:'scroll'},
    grid:{left:70,right:24,top:46,bottom:88},
    xAxis:{type:'category', data:regions, axisLabel:{fontSize:10.5, color:t.dim, rotate:24, interval:0, margin:14}},
    yAxis:{
      type:'value', min:0, max:100, interval:20,
      name:'สัดส่วน (%)', nameLocation:'middle', nameGap:48,
      axisLabel:{color:t.dim, formatter:v=>v+'%'},
      splitLine:{lineStyle:{color:t.border, type:'dashed'}}, nameTextStyle:{color:t.dim}
    },
    series
  }, true);
}
