import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'.',testMatch:'visual.spec.mjs',workers:1,retries:0,
 snapshotPathTemplate:'{testDir}/baselines/{projectName}/{arg}{ext}',
 updateSnapshots:process.env.UPDATE_VISUAL==='1'?'all':'none',
 reporter:[['list'],['html',{open:'never'}]],
 use:{baseURL:'http://127.0.0.1:4187',browserName:'chromium',locale:'de-DE',timezoneId:'Europe/Berlin',reducedMotion:'reduce',serviceWorkers:'block'},
 expect:{toHaveScreenshot:{animations:'disabled',maxDiffPixelRatio:0.002}},
 projects:[
  {name:'phone-dark',use:{viewport:{width:390,height:844},colorScheme:'dark'}},
  {name:'small-phone-dark',use:{viewport:{width:320,height:740},colorScheme:'dark'}},
  {name:'desktop-dark',use:{viewport:{width:1280,height:850},colorScheme:'dark'}},
  {name:'phone-light',use:{viewport:{width:390,height:844},colorScheme:'light'}}
 ],
 webServer:{command:'node build.mjs && node server.mjs',url:'http://127.0.0.1:4187/week.html',reuseExistingServer:false}
});
