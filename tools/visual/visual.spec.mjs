import {test,expect} from '@playwright/test';
for(const view of ['week','services','settings','delay','catchup','reasons'])test(view,async({page})=>{
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.goto('/'+view+'.html');await page.evaluate(()=>document.fonts.ready);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 if(view==='delay'){
  await expect(page.locator('#delayDlg')).toBeVisible();
  expect(await page.locator('#delayDlg').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 }
 if(view==='week')await expect(page.locator('.stream-alternatives').first()).toBeHidden();
 if(view==='services')await expect(page.locator('.stream-alternatives a').first()).toBeVisible();
 if(['week','services','catchup'].includes(view)) {
  const readable=await page.locator('.links a.cr').evaluateAll(links=>links.filter(e=>e.getBoundingClientRect().width).every(e=>e.getBoundingClientRect().height<65));
  expect(readable,'Service names must not wrap into vertical stacks').toBe(true);
  const covers=await page.locator('.row > img').evaluateAll(images=>images.every(e=>e.getBoundingClientRect().height<150));
  expect(covers,'Covers must not stretch with long titles').toBe(true);
 }
 await expect(page).toHaveScreenshot(view+'.png');
});
