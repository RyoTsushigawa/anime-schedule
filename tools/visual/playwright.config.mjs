import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'.',testMatch:'visual.spec.mjs',workers:1,retries:0,
 reporter:[['list'],['html',{open:'never'}]],
 use:{...(process.env.PW_CHROMIUM&&{launchOptions:{executablePath:process.env.PW_CHROMIUM}}),baseURL:'http://127.0.0.1:4187',browserName:'chromium',locale:'de-DE',timezoneId:'Europe/Berlin',reducedMotion:'reduce',serviceWorkers:'block'},
 projects:[
  {name:'phone-dark',use:{viewport:{width:390,height:844},colorScheme:'dark'}},
  {name:'desktop-dark',use:{viewport:{width:1280,height:850},colorScheme:'dark'}},
  {name:'phone-light',use:{viewport:{width:390,height:844},colorScheme:'light'}}
 ],
 webServer:{command:'node build.mjs && node server.mjs',url:'http://127.0.0.1:4187/week.html',reuseExistingServer:false}
});
