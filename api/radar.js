const VERSION = 'radar-1.0.0';
const PNCP_BASE = 'https://pncp.gov.br/api/consulta/v1';
const MAX_MODALITIES = 30;
const MAX_PAGES_PER_MODALITY = 12;
const TIMEOUT_MS = 12000;

function clean(v=''){ return String(v ?? '').replace(/\s+/g,' ').trim(); }
function fold(v=''){ return clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function clamp(n,a,b){ n=Number(n); return Number.isFinite(n)?Math.max(a,Math.min(b,n)):a; }
function date8(v){
  const d = v ? new Date(v) : new Date();
  if(Number.isNaN(d.getTime())) return '';
  return String(d.getFullYear())+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0');
}
function iso(v){
  if(!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? clean(v) : d.toISOString();
}
function portalKey(rawLink='', rawName=''){
  const x = fold(rawName+' '+rawLink);
  if(/compras\.gov|comprasnet|gov\.br\/compras|siag/.test(x)) return 'comprasgov';
  if(/\bbll\b|bolsa de licitacoes/.test(x)) return 'bll';
  if(/licitanet/.test(x)) return 'licitanet';
  if(/banrisul|pregaoonlinebanrisul/.test(x)) return 'banrisul';
  if(/licitacoes-e|bb\.com\.br|banco do brasil/.test(x)) return 'bb';
  if(/contrata brasil|contratabrasil/.test(x)) return 'contratabrasil';
  if(/\bm2a\b/.test(x)) return 'm2a';
  if(/senac|senai|sesc|sesi|sistema s/.test(x)) return 'sistemas';
  return 'pncp';
}
function portalLabel(key, fallback=''){
  const m={pncp:'PNCP / origem não identificada',comprasgov:'Compras.gov / ComprasNet',bll:'BLL',licitanet:'Licitanet',banrisul:'Banrisul',bb:'Banco do Brasil / Licitações-e',contratabrasil:'Contrata Brasil',m2a:'M2A',sistemas:'Sistema S'};
  return m[key] || fallback || key;
}
async function fetchJson(url){
  const c=new AbortController(), t=setTimeout(()=>c.abort(),TIMEOUT_MS);
  try{
    const r=await fetch(url,{signal:c.signal,headers:{accept:'application/json','user-agent':'LicitaGestao-Radar/'+VERSION}});
    if(!r.ok) throw new Error('HTTP '+r.status);
    return await r.json();
  }finally{ clearTimeout(t); }
}
function listPayload(data){
  if(Array.isArray(data)) return data;
  return arr(data?.data).length ? data.data :
    arr(data?.items).length ? data.items :
    arr(data?.content).length ? data.content :
    arr(data?.resultado).length ? data.resultado :
    arr(data?.contratacoes).length ? data.contratacoes : [];
}
function totalPages(data){
  const n = Number(data?.totalPaginas ?? data?.totalPages ?? data?.page?.totalPages ?? 1);
  return Number.isFinite(n) && n>0 ? n : 1;
}
function idOf(x){
  return clean(x.numeroControlePNCP || x.numeroControlePncp || x.id || [x.orgaoEntidade?.cnpj,x.anoCompra,x.sequencialCompra].filter(Boolean).join('-'));
}
function linkOf(x){
  const direct=clean(x.linkSistemaOrigem || x.linkProcessoEletronico || x.link || x.url);
  if(direct) return direct;
  const cnpj=clean(x.orgaoEntidade?.cnpj || x.cnpjOrgao);
  const ano=clean(x.anoCompra || x.anoContratacao);
  const seq=clean(x.sequencialCompra || x.sequencialContratacao);
  if(cnpj && ano && seq) return 'https://pncp.gov.br/app/editais/'+encodeURIComponent(cnpj)+'/'+encodeURIComponent(ano)+'/'+encodeURIComponent(seq);
  return 'https://pncp.gov.br/app/editais';
}
function textParts(x){
  return {
    object:clean(x.objetoCompra || x.objeto || x.descricaoObjeto || x.descricao),
    extra:clean(x.informacaoComplementar || x.justificativaPresencial || x.amparoLegal?.descricao || ''),
    organ:clean(x.orgaoEntidade?.razaoSocial || x.orgaoEntidade?.nome || x.unidadeOrgao?.nomeUnidade || x.nomeOrgao || ''),
    modality:clean(x.modalidadeNome || x.modalidadeContratacaoNome || x.modalidade?.nome || ''),
    number:clean(x.numeroCompra || x.numeroContratacao || x.numeroAviso || '')
  };
}
function phraseHit(text, phrase){
  const t=fold(text), p=fold(phrase);
  if(!p) return 0;
  if(t.includes(p)) return 1;
  const words=p.split(/\s+/).filter(w=>w.length>2);
  if(!words.length) return 0;
  const matched=words.filter(w=>t.includes(w)).length;
  return matched/words.length;
}
function relevance(x, keywords){
  const p=textParts(x);
  if(!keywords.length) return 100;
  let best=0, sum=0;
  for(const kw of keywords){
    const objectHit=phraseHit(p.object,kw);
    const extraHit=phraseHit(p.extra,kw);
    const organHit=phraseHit(p.organ,kw);
    const modeHit=phraseHit(p.modality,kw);
    const score=Math.round(70*objectHit+20*extraHit+5*organHit+5*modeHit);
    best=Math.max(best,score);
    sum+=score;
  }
  const secondary = keywords.length>1 ? Math.round((sum/keywords.length)*0.22) : 0;
  return clamp(best+secondary,0,100);
}
function excluded(x, terms){
  if(!terms.length) return false;
  const p=textParts(x), hay=fold([p.object,p.extra,p.organ,p.modality].join(' '));
  return terms.some(t=>hay.includes(fold(t)));
}
function normalize(x){
  const p=textParts(x), link=linkOf(x);
  const portal=portalKey(link, x.usuarioNome || x.nomeUsuario || x.sistemaOrigem || '');
  const orgao=clean(x.orgaoEntidade?.razaoSocial || x.orgaoEntidade?.nome || x.nomeOrgao || '');
  const unidade=clean(x.unidadeOrgao?.nomeUnidade || x.unidadeOrgao?.nome || x.nomeUnidade || '');
  const municipio=clean(x.unidadeOrgao?.municipioNome || x.municipioNome || x.municipio || '');
  const uf=clean(x.unidadeOrgao?.ufSigla || x.uf || '');
  return {
    id:idOf(x) || link,
    numero:p.number || clean(x.numeroControlePNCP || ''),
    titulo:(p.object || p.number || 'Oportunidade').slice(0,160),
    objeto:p.object,
    complemento:p.extra,
    orgao,
    unidade,
    municipio,
    uf,
    modalidade:p.modality,
    valor:Number(x.valorTotalEstimado ?? x.valorTotalHomologado ?? x.valorEstimado ?? 0) || null,
    publicacao:iso(x.dataPublicacaoPncp || x.dataPublicacao || x.dataInclusao),
    dataAbertura:iso(x.dataAberturaProposta || x.dataInicioProposta || x.dataSessao),
    dataEncerramento:iso(x.dataEncerramentoProposta || x.dataFimProposta || x.dataFinalProposta),
    portal,
    portalNome:portalLabel(portal, clean(x.usuarioNome || '')),
    link,
    numeroControlePNCP:clean(x.numeroControlePNCP || '')
  };
}
async function modalities(){
  const sources=[
    'https://pncp.gov.br/api/pncp/v1/modalidades?statusAtivo=true',
    PNCP_BASE+'/modalidades?statusAtivo=true'
  ];
  for(const url of sources){
    try{
      const data=await fetchJson(url);
      const list=listPayload(data);
      const ids=list.map(x=>Number(x.id)).filter(Number.isFinite).slice(0,MAX_MODALITIES);
      if(ids.length) return ids;
    }catch{}
  }
  return [1,2,3,4,5,6,7,8,9,10,11,12,13];
}
async function collectPublished(from,to){
  const mods=await modalities();
  const collected=[], warnings=[];
  let cursor=0;
  const workers=Array.from({length:Math.min(4,mods.length)},async()=>{
    while(cursor<mods.length){
      const mod=mods[cursor++];
      try{
        let page=1, pages=1;
        do{
          const qs=new URLSearchParams({dataInicial:from,dataFinal:to,codigoModalidadeContratacao:String(mod),pagina:String(page)});
          const data=await fetchJson(PNCP_BASE+'/contratacoes/publicacao?'+qs.toString());
          collected.push(...listPayload(data));
          pages=Math.min(totalPages(data),MAX_PAGES_PER_MODALITY);
          page++;
        }while(page<=pages);
      }catch(e){
        warnings.push('Modalidade '+mod+': '+clean(e.message));
      }
    }
  });
  await Promise.all(workers);
  return {collected,warnings};
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('X-Radar-Version',VERSION);
  if(req.method==='OPTIONS') return res.status(204).end();
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'Método não permitido.'});
  try{
    const body=req.body || {};
    const keywords=clean(body.keywords).split(/[,;\n]+/).map(clean).filter(Boolean).slice(0,30);
    const exclude=clean(body.exclude).split(/[,;\n]+/).map(clean).filter(Boolean).slice(0,30);
    const minScore=clamp(body.minScore ?? 70,0,100);
    const portals=arr(body.portals).map(clean).filter(Boolean);
    const allPortals=!portals.length || portals.includes('all');
    const days=clamp(body.days ?? 7,1,30);
    const toDate=body.to ? new Date(body.to) : new Date();
    const fromDate=body.from ? new Date(body.from) : new Date(toDate.getTime()-days*86400000);
    const from=date8(fromDate), to=date8(toDate);
    if(!from || !to) return res.status(400).json({ok:false,error:'Período inválido.'});
    const {collected,warnings}=await collectPublished(from,to);
    const seen=new Set(), items=[];
    for(const raw of collected){
      const id=idOf(raw);
      if(!id || seen.has(id)) continue;
      seen.add(id);
      if(excluded(raw,exclude)) continue;
      const n=normalize(raw);
      if(!allPortals && !portals.includes(n.portal)) continue;
      const score=relevance(raw,keywords);
      if(score<minScore) continue;
      n.score=score;
      items.push(n);
    }
    items.sort((a,b)=>(b.score-a.score)||String(b.publicacao).localeCompare(String(a.publicacao)));
    return res.status(200).json({
      ok:true,
      version:VERSION,
      queried:{from,to,days,keywords,exclude,minScore,portals:allPortals?['all']:portals},
      count:items.length,
      items:items.slice(0,250),
      warnings:[...new Set(warnings)].slice(0,10),
      fetchedAt:new Date().toISOString(),
      coverage:{
        primary:'PNCP',
        note:'O PNCP centraliza publicações da Lei 14.133/2021 e informa o sistema de origem quando disponível. Portais que não publicam dados no PNCP ou exigem autenticação podem precisar de conector próprio.'
      }
    });
  }catch(e){
    return res.status(500).json({ok:false,version:VERSION,error:clean(e?.message)||'Falha ao executar o radar.'});
  }
}
