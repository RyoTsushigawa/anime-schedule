import {test,expect} from '@playwright/test';
for(const view of ['week','settings','delay','catchup'])test(view,async({page})=>{
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.goto('/'+view+'.html');await page.evaluate(()=>document.fonts.ready);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 if(view==='delay'){
  await expect(page.locator('#delayDlg')).toBeVisible();
  expect(await page.locator('#delayDlg').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 }
 // a picture for review, not compared: intended design changes shouldn't fail the check
 await page.screenshot({path:test.info().outputPath(view+'.png'),fullPage:true});
});
