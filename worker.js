const API_ROOT = 'https://api.ekispert.jp/v1/json';
let cachedIcCondition = null;

function cors(origin='*') {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store'
  };
}

function json(data, status=200, origin='*') {
  return new Response(JSON.stringify(data), {status, headers:{...cors(origin),'Content-Type':'application/json; charset=utf-8'}});
}

const arr = v => v == null ? [] : Array.isArray(v) ? v : [v];
const text = v => (v == null ? '' : String(v));
const compactDate = d => text(d).replaceAll('-','');
const compactTime = t => text(t).replace(':','').slice(0,4);
const hhmm = raw => {
  if (!raw) return '';
  const s = String(raw);
  const m = s.match(/T(\d{2}):(\d{2})/);
  if (m) return `${m[1]}:${m[2]}`;
  const m2 = s.match(/(\d{2}):(\d{2})/);
  return m2 ? `${m2[1]}:${m2[2]}` : s;
};

async function ek(path, params, key) {
  const u = new URL(API_ROOT + path);
  u.searchParams.set('key', key);
  for (const [k,v] of Object.entries(params||{})) {
    if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
  }
  const r = await fetch(u.toString(), {headers:{'Accept':'application/json'}});
  const body = await r.text();
  if (!r.ok) throw new Error(`Ekispert HTTP ${r.status}: ${body.slice(0,180)}`);
  let data;
  try { data = JSON.parse(body); } catch { throw new Error('駅すぱあとAPIの応答をJSONとして読めませんでした'); }
  if (data?.ResultSet?.Error) {
    const e = data.ResultSet.Error;
    throw new Error(e.Message || e.code || '駅すぱあとAPIエラー');
  }
  return data;
}

function parseStationList(rs) {
  return arr(rs?.Point).map(p => ({
    name: p?.Station?.Name || p?.Name || '',
    yomi: p?.Station?.Yomi || '',
    code: p?.Station?.code || '',
    prefecture: p?.Prefecture?.Name || '',
    type: typeof p?.Station?.Type === 'string' ? p.Station.Type : (p?.Station?.Type?.text || 'train')
  })).filter(x=>x.name);
}

function pickFare(course) {
  const prices = arr(course?.Price);
  let p = prices.find(x => x?.Type === 'FareICCard' && x?.selected === 'true') ||
          prices.find(x => x?.Type === 'FareICCard') ||
          prices.find(x => x?.kind === 'FareSummary') ||
          prices.find(x => x?.Type === 'Fare' && x?.selected === 'true');
  const n = Number(p?.Oneway);
  return Number.isFinite(n) ? n : null;
}

function normalizeLineType(t) {
  if (!t) return '';
  if (typeof t === 'string') return t;
  return t.text || t.detail || '';
}

function parseCourse(course, idx) {
  const route = course?.Route || {};
  const points = arr(route?.Point);
  const lines = arr(route?.Line);
  const legs = [];
  for (let i=0;i<lines.length;i++) {
    const line = lines[i] || {};
    const from = points[i] || {};
    const to = points[i+1] || {};
    const dep = line?.DepartureState || {};
    const arv = line?.ArrivalState || {};
    legs.push({
      from: from?.Station?.Name || from?.Name || '',
      to: to?.Station?.Name || to?.Name || '',
      line: line?.Name || line?.TypicalName || '',
      type: normalizeLineType(line?.Type),
      direction: (typeof line?.Destination === 'string' ? line.Destination : line?.Destination?.Name) || line?.Direction || line?.direction || '',
      departureTime: hhmm(dep?.Datetime),
      arrivalTime: hhmm(arv?.Datetime),
      departurePlatform: dep?.no ? `${dep.no}番線` : '',
      arrivalPlatform: arv?.no ? `${arv.no}番線` : '',
      minutes: Number(line?.timeOnBoard || 0),
      stopCount: Number(line?.stopStationCount || 0),
      color: line?.Color || '',
      cars: line?.cars || '',
      comment: arr(line?.Comment).map(c=>c?.text || c?.Text || c?.Comment || '').filter(Boolean).join(' / ')
    });
  }
  const first = legs[0];
  const last = legs[legs.length-1];
  return {
    id: idx + 1,
    departure: first?.departureTime || '',
    arrival: last?.arrivalTime || '',
    duration: Number(route?.timeOnBoard || 0) + Number(route?.timeWalk || 0) + Number(route?.timeOther || 0),
    transferCount: Number(route?.transferCount || 0),
    walkMinutes: Number(route?.timeWalk || 0),
    fare: pickFare(course),
    serializeData: course?.SerializeData || '',
    legs
  };
}

function parseTimetableList(rs) {
  return arr(rs?.TimeTable).map(t=>({
    code: t?.code || '',
    station: t?.Station?.Name || '',
    line: t?.Line?.Name || '',
    direction: t?.Line?.Direction || '',
    source: t?.Line?.Source || '',
    dateGroup: t?.dateGroup || '',
    color: t?.Line?.Color || ''
  })).filter(x=>x.code);
}

function parseTimetableDetail(rs) {
  const t = arr(rs?.TimeTable)[0] || rs?.TimeTable || {};
  const rows = [];
  for (const h of arr(t?.HourTable)) {
    const hour = String(h?.Hour ?? '').padStart(2,'0');
    for (const m of arr(h?.MinuteTable)) {
      const minute = String(m?.Minute ?? '').padStart(2,'0');
      rows.push({
        time:`${hour}:${minute}`,
        destinationCode:m?.Stop?.destinationCode || '',
        kindCode:m?.Stop?.kindCode || '',
        nameCode:m?.Stop?.nameCode || '',
        lineCode:m?.Stop?.lineCode || '',
        first:m?.Stop?.first === 'True' || m?.Stop?.first === true
      });
    }
  }
  return {
    station:t?.Station?.Name || '',
    line:t?.Line?.Name || '',
    direction:t?.Line?.Direction || '',
    rows
  };
}

function parseStatus(rs) {
  return arr(rs?.Information).map(i=>({
    status:i?.status || '',
    title:i?.Title || '',
    line:i?.Line?.Name || '',
    lineCode:i?.Line?.code || '',
    provider:i?.provider || '',
    datetime:i?.Datetime || '',
    comment: typeof i?.Comment === 'string' ? i.Comment : (i?.Comment?.text || i?.Comment?.Text || '')
  })).filter(x=>x.title || x.line);
}

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || '*';
    if (request.method === 'OPTIONS') return new Response(null,{headers:cors(origin)});
    if (request.method !== 'GET') return json({error:'GETのみ対応しています'},405,origin);
    if (!env.EKISPERT_KEY) return json({error:'EKISPERT_KEY が設定されていません'},500,origin);

    const u = new URL(request.url);
    try {
      if (u.pathname.endsWith('/health')) return json({ok:true,provider:'ekispert'},200,origin);

      if (u.pathname.endsWith('/stations')) {
        const q = (u.searchParams.get('q')||'').trim();
        if (!q) return json({stations:[]},200,origin);
        const d = await ek('/station', {name:q, type:'train'}, env.EKISPERT_KEY);
        return json({stations:parseStationList(d.ResultSet).slice(0,20)},200,origin);
      }

      if (u.pathname.endsWith('/route')) {
        const from=(u.searchParams.get('from')||'').trim();
        const to=(u.searchParams.get('to')||'').trim();
        const date=compactDate(u.searchParams.get('date')||'');
        const time=compactTime(u.searchParams.get('time')||'');
        const mode=u.searchParams.get('mode')||'departure';
        if (!from || !to) return json({error:'出発駅と到着駅を指定してください'},400,origin);
        const searchType = mode==='arrival' ? 'arrival' : mode==='first' ? 'firstTrain' : mode==='last' ? 'lastTrain' : 'departure';
        if (!cachedIcCondition) {
          try {
            const cd = await ek('/toolbox/course/condition',{ticketSystemType:'ic'},env.EKISPERT_KEY);
            cachedIcCondition = cd?.ResultSet?.Condition || null;
          } catch (_) { cachedIcCondition = null; }
        }
        const params={viaList:`${from}:${to}`,searchType,answerCount:5,resultDetail:'addCorporation'};
        if (cachedIcCondition) params.conditionDetail=cachedIcCondition;
        if (date) params.date=date;
        if (time && !['first','last'].includes(mode)) params.time=time;
        const d=await ek('/search/course/extreme',params,env.EKISPERT_KEY);
        const courses=arr(d?.ResultSet?.Course).map(parseCourse);
        return json({routes:courses,apiVersion:d?.ResultSet?.apiVersion||''},200,origin);
      }

      if (u.pathname.endsWith('/timetable/options')) {
        const station=(u.searchParams.get('station')||'').trim();
        const date=compactDate(u.searchParams.get('date')||'');
        if (!station) return json({error:'駅名を指定してください'},400,origin);
        const d=await ek('/operationLine/timetable',{stationName:station,date},env.EKISPERT_KEY);
        return json({options:parseTimetableList(d.ResultSet)},200,origin);
      }

      if (u.pathname.endsWith('/timetable/detail')) {
        const station=(u.searchParams.get('station')||'').trim();
        const code=(u.searchParams.get('code')||'').trim();
        const date=compactDate(u.searchParams.get('date')||'');
        if (!station || !code) return json({error:'駅名と方面コードを指定してください'},400,origin);
        const d=await ek('/operationLine/timetable',{stationName:station,code,date,addTrainInformation:'true'},env.EKISPERT_KEY);
        return json({timetable:parseTimetableDetail(d.ResultSet)},200,origin);
      }

      if (u.pathname.endsWith('/status')) {
        const prefectureCode=(u.searchParams.get('prefectureCode')||'').trim();
        const operationLineCode=(u.searchParams.get('operationLineCode')||'').trim();
        const params={};
        if(prefectureCode) params.prefectureCode=prefectureCode;
        if(operationLineCode) params.operationLineCode=operationLineCode;
        const d=await ek('/operationLine/service/rescuenow/information',params,env.EKISPERT_KEY);
        return json({information:parseStatus(d.ResultSet)},200,origin);
      }

      return json({error:'Unknown endpoint'},404,origin);
    } catch (e) {
      return json({error:e?.message||String(e)},502,origin);
    }
  }
};
