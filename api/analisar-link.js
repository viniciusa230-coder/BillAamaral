import * as cheerio from 'cheerio';
import pdfParse from 'pdf-parse';
import { lookup } from 'node:dns/promises';
import net from 'node:net';

const VERSION = 'universal-7.6';
const HTML_LIMIT = 5 * 1024 * 1024;
const PDF_LIMIT = 28 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const MAX_LINKED_DOCS = 5;
const TIMEOUT_MS = 15000;

function clean(v='') { return String(v).replace(/\u00a0/g,' ').replace(/[\t\r ]+/g,' ').replace(/\n{3,}/g,'\n\n').trim(); }
function stripAccents(v=''){ return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
function norm(v=''){ return stripAccents(clean(v)).toLowerCase(); }
function isPrivateIp(ip){
  if(!net.isIP(ip)) return true;
  if(net.isIP(ip)===4){
    const [a,b]=ip.split('.').map(Number);
    return a===10 || a===127 || a===0 || (a===169&&b===254) || (a===172&&b>=16&&b<=31) || (a===192&&b===168) || (a===100&&b>=64&&b<=127);
  }
  const x=ip.toLowerCase();
  return x==='::1' || x==='::' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe80:');
}
async function assertPublicUrl(raw){
  let u; try{u=new URL(raw);}catch{throw Object.assign(new Error('Link inválido.'),{status:400,code:'INVALID_URL'});}
  if(!['http:','https:'].includes(u.protocol)) throw Object.assign(new Error('Use um link http ou https.'),{status:400,code:'INVALID_PROTOCOL'});
  if(['localhost','0.0.0.0'].includes(u.hostname.toLowerCase())) throw Object.assign(new Error('Endereço local não é permitido.'),{status:400,code:'PRIVATE_HOST'});
  const resolved=await lookup(u.hostname,{all:true,verbatim:true}).catch(()=>[]);
  if(!resolved.length) throw Object.assign(new Error('Não foi possível localizar esse endereço.'),{status:422,code:'DNS_NOT_FOUND'});
  if(resolved.some(r=>isPrivateIp(r.address))) throw Object.assign(new Error('Endereço de rede privada não é permitido.'),{status:400,code:'PRIVATE_HOST'});
  return u;
}
async function fetchPublic(raw,{limit=HTML_LIMIT,accept='text/html,application/xhtml+xml,application/pdf,text/plain;q=0.9,*/*;q=0.2'}={}){
  let current=await assertPublicUrl(raw);
  for(let i=0;i<=MAX_REDIRECTS;i++){
    const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),TIMEOUT_MS);
    let r;
    try{
      r=await fetch(current,{redirect:'manual',signal:controller.signal,headers:{'user-agent':'Mozilla/5.0 (compatible; LicitaGestao/7.6; +https://licita-gestao.vercel.app)','accept':accept,'accept-language':'pt-BR,pt;q=0.9,en;q=0.5'}});
    }catch(e){ clearTimeout(timer); if(e?.name==='AbortError') throw Object.assign(new Error('O portal demorou a responder.'),{status:504,code:'TIMEOUT'}); throw Object.assign(new Error('Não foi possível acessar o portal público.'),{status:502,code:'FETCH_FAILED'}); }
    clearTimeout(timer);
    if([301,302,303,307,308].includes(r.status)){
      const loc=r.headers.get('location'); if(!loc) throw Object.assign(new Error('Redirecionamento inválido.'),{status:502,code:'BAD_REDIRECT'});
      current=await assertPublicUrl(new URL(loc,current).href); continue;
    }
    if(!r.ok) throw Object.assign(new Error(`O portal respondeu HTTP ${r.status}.`),{status:r.status===404?404:502,code:'UPSTREAM_HTTP'});
    const declared=Number(r.headers.get('content-length')||0); if(declared>limit) throw Object.assign(new Error('O documento é maior que o limite de leitura automática.'),{status:413,code:'TOO_LARGE'});
    const ab=await r.arrayBuffer(); if(ab.byteLength>limit) throw Object.assign(new Error('O documento é maior que o limite de leitura automática.'),{status:413,code:'TOO_LARGE'});
    return {url:current.href,status:r.status,headers:r.headers,buffer:Buffer.from(ab)};
  }
  throw Object.assign(new Error('Muitos redirecionamentos.'),{status:502,code:'TOO_MANY_REDIRECTS'});
}
function decode(buf,contentType=''){
  const m=/charset=([^;]+)/i.exec(contentType); const enc=(m?.[1]||'utf-8').toLowerCase();
  try{return new TextDecoder(enc).decode(buf);}catch{return new TextDecoder('utf-8').decode(buf);}
}
function dateIsoFromPt(raw){
  const s=norm(raw); let m;
  if((m=s.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2})\b/))) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  const months={janeiro:1,fevereiro:2,marco:3,abril:4,maio:5,junho:6,julho:7,agosto:8,setembro:9,outubro:10,novembro:11,dezembro:12};
  if((m=s.match(/\b(\d{1,2})\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(20\d{2})\b/))) return `${m[3]}-${String(months[m[2]]).padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  return '';
}
function timeFrom(raw){ const m=String(raw).match(/\b([01]?\d|2[0-3])\s*(?::|h(?:oras?)?)\s*([0-5]\d)?(?:\s*min)?\b/i); return m?`${m[1].padStart(2,'0')}:${(m[2]||'00').padStart(2,'0')}`:''; }
function firstMatch(text,patterns){ for(const p of patterns){const m=text.match(p); if(m?.[1]) return clean(m[1]);} return ''; }
function numberFrom(text,url){
  const s=clean(text);
  const direct=firstMatch(s,[/(?:preg[aã]o(?:\s+eletr[oô]nico)?|concorr[eê]ncia|dispensa|inexigibilidade|edital|licita[cç][aã]o)\s*(?:n[º°o.]?\s*)?(\d{1,7}\s*[\/.-]\s*20\d{2})/i,/\b(?:n[º°o.]?\s*)?(\d{4,7}\s*\/\s*20\d{2})\b/i]);
  if(direct) return direct.replace(/\s/g,'').replace(/-/g,'/').replace(/\.(?=20\d{2}$)/,'/');
  const u=new URL(url); const m=u.pathname.match(/(\d{3,7})-(20\d{2})(?:\/|$)/); return m?`${m[1]}/${m[2]}`:'';
}
function modalityFrom(text){
  const n=norm(text);
  const choices=[['pregao eletronico','Pregão Eletrônico'],['pregao','Pregão'],['concorrencia eletronica','Concorrência Eletrônica'],['concorrencia','Concorrência'],['dispensa com disputa','Dispensa com Disputa'],['dispensa','Dispensa'],['inexigibilidade','Inexigibilidade'],['leilao','Leilão'],['dialogo competitivo','Diálogo Competitivo'],['concurso','Concurso']];
  return choices.find(([k])=>n.includes(k))?.[1]||'';
}
function objectFrom(text){
  const flat=clean(text).replace(/\n/g,' ');
  let m=flat.match(/(?:objeto(?:\s+da\s+contrata[cç][aã]o)?|objeto\s*[:\-])\s*[:\-]?\s*(.{25,1400}?)(?=\s+(?:valor\s+total|data\s+da\s+sess[aã]o|sess[aã]o\s+p[uú]blica|edital\s+a\s+partir|endere[cç]o|telefone|entrega\s+da\s+proposta|participa[cç][aã]o|habilita[cç][aã]o)\b|$)/i);
  let out=clean(m?.[1]||'');
  if(out.length>900) out=out.slice(0,900).replace(/\s+\S*$/,'')+'…';
  return out;
}
function sessionFrom(text){
  const flat=clean(text).replace(/\n/g,' ');
  const labels='(?:data\s+da\s+sess[aã]o(?:\s+p[uú]blica)?|sess[aã]o\s+p[uú]blica|data\s+de\s+realiza[cç][aã]o|realiza[cç][aã]o|abertura\s+da\s+sess[aã]o|in[ií]cio\s+da\s+sess[aã]o)';
  const re=new RegExp(labels+'\\s*[:\\-]?\\s*([^.;|]{0,140})','i'); const m=flat.match(re); const snippet=m?.[1]||'';
  let date=dateIsoFromPt(snippet), time=timeFrom(snippet);
  if(!date){
    const alt=flat.match(/(?:dia\s+)?(\d{1,2}[\/.-]\d{1,2}[\/.-]20\d{2})\s*(?:,|\s)+(?:[aà]s?\s*)?([0-2]?\d(?::|h)[0-5]?\d?)/i);
    if(alt){date=dateIsoFromPt(alt[1]);time=timeFrom(alt[2]);}
  }
  return {date,time,snippet:clean(snippet)};
}
function publicationFrom(text){
  const flat=clean(text).replace(/\n/g,' '); const m=flat.match(/(?:publicad[oa]\s+em|data\s+de\s+publica[cç][aã]o|divulga[cç][aã]o)\s*[:\-]?\s*([^.;|]{0,80})/i); return dateIsoFromPt(m?.[1]||'');
}
function htmlExtract(html,url){
  const $=cheerio.load(html); $('script,style,noscript,svg,nav,footer').remove();
  const json=[]; $('script[type="application/ld+json"]').each((_,el)=>{try{json.push(JSON.parse($(el).text()))}catch{}});
  const title=clean($('title').first().text()); const h1=clean($('h1').first().text());
  const main=$('main').first().text()||$('article').first().text()||$('body').text(); const text=clean([title,h1,main].filter(Boolean).join('\n'));
  const links=[]; $('a[href]').each((_,el)=>{try{const href=new URL($(el).attr('href'),url).href;const label=clean($(el).text());const n=norm(href+' '+label);if(/\.pdf(?:$|[?#])/.test(href.toLowerCase())||/(edital|termo de referencia|aviso|anexo|documento|licitacao)/.test(n))links.push({href,label});}catch{}});
  return {text,json,links:[...new Map(links.map(x=>[x.href,x])).values()].slice(0,20)};
}
function mergeData(parts){ const out={}; for(const p of parts){for(const [k,v] of Object.entries(p||{})){if(v!==''&&v!=null&&!out[k])out[k]=v;}} return out; }
function extractFromText(text,url){
  const sess=sessionFrom(text); const numero=numberFrom(text,url); const modalidade=modalityFrom(text); const objeto=objectFrom(text); const publicacao=publicationFrom(text);
  const data={link:url,numero,modalidade,objeto,resumoObjeto:objeto,publicacao};
  if(sess.date){data.dataLicitacao=sess.date; data.dataSessao=sess.date;}
  if(sess.time){data.horaLicitacao=sess.time; data.horarioSessao=sess.time;}
  if(sess.date&&sess.time)data.sessao=`${sess.date}T${sess.time}`;
  return Object.fromEntries(Object.entries(data).filter(([,v])=>v!==''&&v!=null));
}
async function parseResource(raw){
  const first=await fetchPublic(raw,{limit:PDF_LIMIT}); const ct=(first.headers.get('content-type')||'').toLowerCase();
  if(ct.includes('application/pdf')||first.url.toLowerCase().includes('.pdf')){
    const parsed=await pdfParse(first.buffer); return {url:first.url,text:clean(parsed.text),links:[],documents:[{url:first.url,titulo:'Documento PDF informado'}]};
  }
  const html=decode(first.buffer,ct); const parsed=htmlExtract(html,first.url); return {url:first.url,text:parsed.text,links:parsed.links,documents:[]};
}
async function readLinkedPdfs(base){
  const docs=[]; let combined='';
  for(const item of base.links.filter(x=>/\.pdf(?:$|[?#])/i.test(x.href)).slice(0,MAX_LINKED_DOCS)){
    try{const f=await fetchPublic(item.href,{limit:PDF_LIMIT,accept:'application/pdf,*/*;q=0.2'}); const p=await pdfParse(f.buffer); const txt=clean(p.text); if(txt){combined+='\n'+txt;docs.push({url:f.url,titulo:item.label||'PDF encontrado'});}}catch{/* best effort */}
  }
  return {text:combined,documents:docs};
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store'); res.setHeader('Access-Control-Allow-Origin','*'); res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS'); res.setHeader('Access-Control-Allow-Headers','Content-Type'); res.setHeader('X-Import-Version',VERSION);
  if(req.method==='OPTIONS') return res.status(204).end();
  if(!['GET','POST'].includes(req.method)) return res.status(405).json({ok:false,error:'Método não permitido.'});
  const raw=clean(req.method==='GET'?req.query?.url:req.body?.url);
  if(!raw) return res.status(400).json({ok:false,error:'Informe o link da licitação.',code:'MISSING_URL'});
  try{
    const base=await parseResource(raw); const linked=await readLinkedPdfs(base); const allText=clean(base.text+'\n'+linked.text); const data=extractFromText(allText,base.url);
    const warnings=[]; const found=['numero','modalidade','dataLicitacao','horaLicitacao','objeto'].filter(k=>data[k]);
    if(!data.modalidade)warnings.push('Modalidade não localizada na página ou nos PDFs públicos encontrados.');
    if(!data.dataLicitacao)warnings.push('Data da sessão não localizada na fonte pública.');
    if(!data.horaLicitacao)warnings.push('Horário da sessão não localizado na fonte pública.');
    if(!data.objeto)warnings.push('Objeto não localizado na fonte pública.');
    if(found.length===0)warnings.push('O link foi acessado, mas a página não expõe os campos do edital em texto legível. Você pode anexar o edital e completar manualmente.');
    return res.status(200).json({ok:true,version:VERSION,origem:raw,data,camposEncontrados:found.length,consultadoEm:new Date().toISOString(),avisos:warnings,documentos:[...base.documents,...linked.documents],anexosLidos:linked.documents.map(d=>d.url),evidencias:{fonte:{url:base.url,tipo:'Página pública / documentos vinculados'}}});
  }catch(e){
    const status=Number(e.status)||500; return res.status(status).json({ok:false,version:VERSION,code:e.code||'IMPORT_ERROR',error:e.message||'Falha ao interpretar o link.'});
  }
}
