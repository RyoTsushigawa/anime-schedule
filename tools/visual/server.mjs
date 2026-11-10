import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url)),fixtures=fileURLToPath(new URL('./fixtures/',import.meta.url));
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'};
createServer(async(req,res)=>{
 try{
  const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1);
  const base=/^(week|services|settings|delay|catchup|reasons)\.html$|^visual-cover\.svg$/.test(path)?fixtures:root;
  const file=resolve(base,path);if(!file.startsWith(resolve(base)+sep))throw Error('path');
  const content=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'});res.end(content);
 }catch{res.writeHead(404);res.end();}
}).listen(4187,'127.0.0.1');
