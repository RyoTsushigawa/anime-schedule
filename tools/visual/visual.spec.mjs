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


test('the Anime Cover Quiz plays through five rounds without overflow',async({page})=>{
 const media=Array.from({length:20},(_,i)=>({
  idMal:1000+i,title:{english:'Test Anime '+(i+1)},
  coverImage:{large:'https://s4.anilist.co/test/'+(i+1)+'.svg'}
 }));
 await page.route('https://graphql.anilist.co/**',route=>route.fulfill({
  status:200,contentType:'application/json',body:JSON.stringify({data:{Page:{media}}})
 }));
 await page.route('https://s4.anilist.co/**',route=>route.fulfill({
  status:200,contentType:'image/svg+xml',
  body:'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="280"><rect width="200" height="280" fill="#d4a47e"/></svg>'
 }));
 await page.goto('/cover-game.html');
 await expect(page.locator('#coverPlay')).toBeVisible();
 for(let i=0;i<5;i++){
  await expect(page.locator('#coverChoices .cover-choice')).toHaveCount(4);
  await page.locator('#coverChoices .cover-choice').first().click();
  await expect(page.locator('#coverArt')).toHaveClass(/revealed/);
  await expect(page.locator('#coverNext')).toBeVisible();
  await page.locator('#coverNext').click();
 }
 await expect(page.locator('#coverResult')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:test.info().outputPath('cover-quiz-result.png'),fullPage:true});
});
