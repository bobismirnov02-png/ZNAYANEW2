const CACHE='znaya-public-dark-theme';
const ASSETS=['./','./index.html','./app.css','./app.js','./znaya-ai.js','./manifest.json','./assets/favicon.ico','./assets/favicon-16.png','./assets/favicon-32.png','./assets/favicon-48.png','./assets/favicon-64.png','./assets/znaya-64.png','./assets/znaya-192.png','./assets/znaya-512.png','./assets/znaya-symbol.png','./assets/znaya-lockup.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const req=event.request;if(req.method!=='GET')return;
  const url=new URL(req.url);if(url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
  if(req.mode==='navigate'){
    event.respondWith(fetch(req).then(async res=>{if(res.ok){const cache=await caches.open(CACHE);cache.put('./index.html',res.clone());}return res;}).catch(async()=>await caches.match('./index.html')));
    return;
  }
  event.respondWith(fetch(req).then(async res=>{if(res.ok&&res.type==='basic'){const cache=await caches.open(CACHE);cache.put(req,res.clone());}return res;}).catch(async()=>await caches.match(req)||new Response('Offline resource unavailable',{status:503})));
});
