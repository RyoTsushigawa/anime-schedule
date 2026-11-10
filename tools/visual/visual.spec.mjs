import {test,expect} from '@playwright/test';
for(const view of ['week','services','settings','delay','catchup'])test(view,async({page})=>{
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.goto('/'+view+'.html');await page.evaluate(()=>document.fonts.ready);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 if(view==='delay'){
  await expect(page.locator('#delayDlg')).toBeVisible();
  expect(await page.locator('#delayDlg').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 }
 if(view==='week')await expect(page.locator('.stream-alternatives').first()).toBeHidden();
 if(view==='services')await expect(page.locator('.stream-alternatives a').first()).toBeVisible();
 await expect(page).toHaveScreenshot(view+'.png');
});
