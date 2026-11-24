'use strict';
const http=require('node:http'),crypto=require('node:crypto'),{Pool}=require('pg');
if(!process.env.DATABASE_URL)throw Error('Missing database configuration');
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:4,connectionTimeoutMillis:12000,statement_timeout:12000});
const origin='https://to-tameio-mou.onrender.com',LIMIT=4100000;
function reply(res,status,body){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body))}
async function read(req,limit=LIMIT){let n=0,parts=[];for await(const part of req){n+=part.length;if(n>limit)throw Object.assign(Error('Too large'),{status:413});parts.push(part)}try{return JSON.parse(Buffer.concat(parts).toString('utf8'))}catch{throw Object.assign(Error('Invalid JSON'),{status:400})}}
// Account login protects the existing random vault key, not a new ledger.
// The password itself never reaches the server. Store only the hash of the derived login secret.
const attempts=new Map();
function throttle(key,max){const now=Date.now();if(attempts.size>10000){for(const [k,v] of attempts)if(v.end<=now)attempts.delete(k);if(attempts.size>10000&&!attempts.has(key))return false}let a=attempts.get(key);if(!a||a.end<=now){a={count:0,end:now+600000};attempts.set(key,a)}return ++a.count<=max}
function sha(x){return crypto.createHash('sha256').update(x).digest('hex')}
async function account(req,res){
 let db;
 try{
  if(req.method!=='POST')return reply(res,405,{error:'method'});
  const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',').pop().trim();
  if(!throttle('ip:'+ip,60))return reply(res,429,{error:'rate'});
  const x=await read(req,8192);
  if(!x||typeof x.id!=='string'||typeof x.proof!=='string'||!(/^[a-f0-9]{64}$/.test(x.id)&&/^[a-f0-9]{64}$/.test(x.proof)))return reply(res,400,{error:'invalid'});
  if(!throttle('account:'+x.id,12))return reply(res,429,{error:'rate'});
  const registration=req.url==='/account/register';
  if(registration&&(typeof x.wrapped!=='string'||x.wrapped.length!==124||!/^[A-Za-z0-9+/=]+$/.test(x.wrapped)))return reply(res,400,{error:'invalid'});
  const verifier=sha('tameio-login-v1:'+x.proof);
  db=await pool.connect();await db.query('BEGIN');await db.query("SELECT set_config('app.account_id',$1,true)",[x.id]);
  if(registration){
   const r=await db.query('INSERT INTO private_sync.accounts(account_id,verifier,wrapped_key) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING account_id',[x.id,verifier,x.wrapped]);await db.query('COMMIT');
   return r.rowCount?reply(res,201,{ok:true}):reply(res,409,{error:'unavailable username'});
  }
  const r=await db.query('SELECT verifier,wrapped_key FROM private_sync.accounts WHERE account_id=$1',[x.id]);await db.query('COMMIT');
  const row=r.rows[0],stored=Buffer.from(row?.verifier||'0'.repeat(64),'hex'),incoming=Buffer.from(verifier,'hex');
  if(!crypto.timingSafeEqual(stored,incoming)||!row)return reply(res,401,{error:'invalid login'});
  return reply(res,200,{wrapped:row.wrapped_key});
 }catch(e){if(db)await db.query('ROLLBACK').catch(()=>{});return reply(res,e.status||503,{error:'unavailable'})}finally{if(db)db.release()}
}
const server=http.createServer(async(req,res)=>{
 const requestOrigin=req.headers.origin;if(requestOrigin&&requestOrigin!==origin)return reply(res,403,{error:'origin'});
 if(requestOrigin===origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Methods','GET, PUT, POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Max-Age','600')}
 if(req.method==='OPTIONS'){res.writeHead(204);return res.end()}
 if(req.url==='/health'&&req.method==='GET'){try{await pool.query('SELECT 1');return reply(res,200,{ok:true})}catch{return reply(res,503,{ok:false})}}
 if(req.url==='/account/register'||req.url==='/account/login')return account(req,res);
 if(req.url!=='/vault'||!['GET','PUT'].includes(req.method))return reply(res,404,{error:'not found'});
 const token=/^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization||'');if(!token)return reply(res,401,{error:'unauthorized'});
 const id=crypto.createHash('sha256').update(token[1]).digest('hex');
 let db;
 try{
  let body;if(req.method==='PUT'){body=await read(req);if(!body||!Number.isSafeInteger(body.version)||body.version<0||typeof body.ciphertext!=='string'||body.ciphertext.length<40||body.ciphertext.length>4000000||!/^[A-Za-z0-9+/=]+$/.test(body.ciphertext))return reply(res,400,{error:'invalid payload'})}
  db=await pool.connect();await db.query('BEGIN');await db.query("SELECT set_config('app.vault_id',$1,true)",[id]);
  let result;if(req.method==='GET'){result=await db.query('SELECT version,ciphertext FROM private_sync.vaults WHERE vault_id=$1',[id]);await db.query('COMMIT');return reply(res,200,result.rowCount?{version:Number(result.rows[0].version),ciphertext:result.rows[0].ciphertext}:{version:0})}
  if(body.version===0){result=await db.query('INSERT INTO private_sync.vaults(vault_id,version,ciphertext) VALUES($1,1,$2) ON CONFLICT DO NOTHING RETURNING version',[id,body.ciphertext])}
  else{result=await db.query('UPDATE private_sync.vaults SET version=version+1,ciphertext=$2,updated_at=now() WHERE vault_id=$1 AND version=$3 RETURNING version',[id,body.ciphertext,body.version])}
  await db.query('COMMIT');return result.rowCount?reply(res,200,{version:Number(result.rows[0].version)}):reply(res,409,{error:'version conflict'});
 }catch(e){if(db)await db.query('ROLLBACK').catch(()=>{});return reply(res,e.status||503,{error:e.status?'invalid request':'temporarily unavailable'})}finally{if(db)db.release()}
});server.requestTimeout=30000;server.listen(Number(process.env.PORT||10000),'0.0.0.0');
