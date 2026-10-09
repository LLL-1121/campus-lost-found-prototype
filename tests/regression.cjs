const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

(async()=>{
  const started=new Date();
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const results=[];
  const check=async(id,name,fn)=>{await fn();results.push({id,name,result:'通过'});console.log(`${id} PASS ${name}`);};
  const imageDir=path.resolve(__dirname,'../images');fs.mkdirSync(imageDir,{recursive:true});
  const go=async(name)=>page.locator(`.bottom-nav [data-page="${name}"]`).click();
  const fill=async(title)=>{await page.locator('[name=title]').fill(title);await page.locator('[name=description]').fill('蓝色外壳，演示数据');await page.locator('[name=contact]').fill('demo_contact_only');};
  try{
    await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
    await check('T01','首页浏览与详情',async()=>{assert.equal(await page.locator('#feed .item').count(),4);await page.screenshot({path:path.join(imageDir,'home.png')});await page.locator('#feed .item').first().click();assert.equal(await page.locator('#detail-title').textContent(),'黑色无线耳机');assert.equal(await page.locator('#detail-status').textContent(),'待认领');assert.equal(await page.locator('#resolve-btn').isVisible(),false);await page.screenshot({path:path.join(imageDir,'detail.png')});});
    await check('T02','搜索名称与地点',async()=>{await go('search');await page.locator('#search-input').fill('耳机');assert.equal(await page.locator('#search-results .item').count(),1);await page.screenshot({path:path.join(imageDir,'search.png')});await page.locator('#search-input').fill('图书馆');assert.equal(await page.locator('#search-results .item').count(),1);});
    await check('T03','无结果与清空搜索',async()=>{await page.locator('#search-input').fill('不存在的演示物品');assert.equal(await page.locator('#search-results .item').count(),0);assert.equal(await page.locator('#search-results .empty').isVisible(),true);await page.locator('#clear-search').click();assert.equal(await page.locator('#search-results .item').count(),4);});
    await check('T04','空表单阻止提交',async()=>{await go('publish');await page.screenshot({path:path.join(imageDir,'publish.png')});await page.locator('[type=submit]').click();assert.equal(await page.locator('#publish').isVisible(),true);assert.equal(await page.locator('[name=title]').evaluate(el=>el.validity.valueMissing),true);});
    await check('T05','全空格输入拒绝',async()=>{await fill('   ');await page.locator('[type=submit]').click();assert.equal(await page.locator('#publish').isVisible(),true);assert.match(await page.locator('#toast').textContent(),/不能只输入空格/);});
    await check('T06','发布成功与默认日期恢复',async()=>{await fill('回归测试蓝色水杯');await page.locator('[type=submit]').click();assert.equal(await page.locator('#success').isVisible(),true);assert.equal(await page.locator('.bottom-nav').isVisible(),false);await page.screenshot({path:path.join(imageDir,'success.png')});assert.notEqual(await page.locator('[name=date]').inputValue(),'');await page.locator('#success [data-page=mine]').click();assert.equal(await page.locator('#mine-feed .item').count(),2);});
    await check('T07','联系方式与本人状态操作',async()=>{await page.locator('#mine-feed .item').first().click();await page.locator('#contact-btn').click();assert.match(await page.locator('#toast').textContent(),/demo_contact_only/);await page.locator('#resolve-btn').click();assert.equal(await page.locator('#detail-status').textContent(),'已找到');await page.locator('#resolve-btn').click();assert.equal(await page.locator('#detail-status').textContent(),'寻找中');});
    await check('T08','招领筛选发布后保持一致',async()=>{await go('home');await page.locator('[data-filter=found]').click();assert.equal(await page.locator('#feed .item').count(),2);await go('publish');await page.locator('[name=type][value=found]').check();await fill('演示招领钥匙');await page.locator('[type=submit]').click();await page.locator('#success [data-page=home]').click();assert.equal(await page.locator('#feed .item').count(),3);await page.locator('#feed .item').first().click();await page.locator('#resolve-btn').click();assert.equal(await page.locator('#detail-status').textContent(),'已归还');});
    await check('T09','HTML 输入按文本显示',async()=>{await go('publish');await fill('<img src=x onerror=alert(1)>');await page.locator('[type=submit]').click();await page.locator('#success [data-page=mine]').click();assert.equal(await page.locator('#mine-feed h3').first().textContent(),'<img src=x onerror=alert(1)>');assert.equal(await page.locator('#mine-feed img').count(),0);});
    await check('T10','320/390/768/1440 宽度布局',async()=>{for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});for(const name of ['home','search','publish','mine']){await go(name);const fits=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);if(!fits)console.log(await page.evaluate(()=>[...document.querySelectorAll('*')].filter(el=>el.getBoundingClientRect().right>innerWidth).map(el=>({tag:el.tagName,cls:el.className,width:el.getBoundingClientRect().width})).slice(-12)));assert.equal(fits,true,`${width} ${name}`);}}await page.screenshot({path:path.join(imageDir,'desktop.png')});await page.setViewportSize({width:320,height:844});await go('publish');await page.screenshot({path:path.join(imageDir,'mobile-320.png')});});
    await check('T11','刷新后恢复示例数据及无脚本错误',async()=>{await page.reload();assert.equal(await page.locator('#feed .item').count(),4);assert.deepEqual(errors,[]);});
    fs.writeFileSync(path.resolve(__dirname,'results.json'),JSON.stringify({startedAt:started.toISOString(),finishedAt:new Date().toISOString(),engine:'Microsoft Edge headless',note:'浏览器自动化；未进行真机触摸测试。数据仅存本次会话。',results},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
