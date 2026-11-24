'use strict';
const http=require('node:http'),{Pool}=require('pg');
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:3});
const origin='https://to-tameio-mou.onrender.com';
const send=(res,status,obj)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj))};
async function main(){
await pool.query('CREATE TABLE IF NOT EXISTS encrypted_vaults (id text PRIMARY KEY, rev integer NOT NULL, payload text NOT NULL, updated_at timestamptz DEFAULT now())');
http.createServer(async(req,res)=>{
if(req.headers.origin===origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, PUT, OPTIONS')}
if(req.method==='OPTIONS'){res.writeHead(req.headers.origin===origin?204:403);return res.end()}
if(req.url==='/health'&&req.method==='GET')return send(res,200,{ok:true});
if(req.url!=='/vault'||!['GET','PUT'].includes(req.method))return send(res,404,{error:'not_found'});
const id=(req.headers.authorization||'').match(/^Bearer ([a-f0-9]{64})$/)?.[1];
if(!id)return send(res,401,{error:'unauthorized'});
try{
if(req.method==='GET'){const r=await pool.query('SELECT rev,payload FROM encrypted_vaults WHERE id=$1',[id]);return send(res,200,r.rows[0]||{rev:0,payload:null})}
let body='',size=0;for await(const part of req){size+=part.length;if(size>1500000){send(res,413,{error:'too_large'});return}body+=part}
let x;try{x=JSON.parse(body)}catch{return send(res,400,{error:'invalid'})}
if(!Number.isSafeInteger(x.rev)||x.rev<0||x.rev>2147483645||typeof x.payload!=='string'||x.payload.length>1400000||!/^[A-Za-z0-9+/=]+$/.test(x.payload))return send(res,400,{error:'invalid'});
const r=x.rev===0?await pool.query('INSERT INTO encrypted_vaults(id,rev,payload) VALUES($1,1,$2) ON CONFLICT DO NOTHING RETURNING rev',[id,x.payload]):await pool.query('UPDATE encrypted_vaults SET rev=rev+1,payload=$3,updated_at=now() WHERE id=$1 AND rev=$2 RETURNING rev',[id,x.rev,x.payload]);
return r.rowCount?send(res,200,r.rows[0]):send(res,409,{error:'conflict'});
}catch(e){return send(res,503,{error:'unavailable'})}
}).listen(Number(process.env.PORT||3000),'0.0.0.0');
}
main().catch(()=>{console.error('Database initialization failed');process.exit(1)});