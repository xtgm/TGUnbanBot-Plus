// Mini App 浏览器端到端检查：真 Chrome 打开页面，把 11 个接口全部 mock 掉。
// 覆盖登录态、四个标签页、写操作确认弹窗、部分失败提示、明暗主题、XSS 文本化、
// 401 掉线回到鉴权页、320px 窄屏不横向溢出。
//
// 依赖本机有 playwright-core 与 Chrome（不进 package.json，项目其余测试都是纯 Node）：
//   NODE_PATH=<playwright-core 所在目录> node miniapp_browser_check.cjs
//   CHROME_PATH 可选，默认 Windows 的 Chrome 安装路径。
// 截图与预览文件是产物，跑完即删。
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const ctx = vm.createContext({console:{log(){},warn(){},error(){}},URL,URLSearchParams,Request,Response,Headers,TextEncoder,TextDecoder,AbortController,crypto:globalThis.crypto,setTimeout,clearTimeout,fetch:async()=>{throw new Error('Unexpected network call');}});
new vm.Script(fs.readFileSync('_worker.js', 'utf8').replace('export default {', 'globalThis.__handler = {')).runInContext(ctx);
const html = ctx.renderMiniAppHtml();
const calls = [];
const errors = [];
let groups = [{chatId:'-1001111111111',title:'读书会 · 南岸',source:'dynamic'},{chatId:'-1002222222222',title:'<img src=x onerror="window.injected=true">',source:'static'}];
let blacklist = [{id:'123456789',reason:'广告推广 <script>window.injected=true</script>',note:'重复发布',by:'10001',at:1780000000},{id:'987654321',reason:'骚扰',note:'',by:'10001',at:1780000010}];
let pending = [{seq:42,userId:'123456789',chatId:'-1001111111111',score:92,reasons:['联系方式命中','重复广告'],snapshot:{name:'林海',username:'linhai',bio:'个人简介',text:'<img src=x onerror="window.injected=true">广告内容'},createdAt:1780000000}];
let blacklistFails = 0;
let unbanDelay = 0;
let denyRefresh = false;
let userErrors = false;
function userData(id) { return {userId:id,profile:{name:id==='123456789'?'林海':'另一位用户',username:'member_'+id},blacklist:blacklist.find(row=>row.id===id)||null,events:[{kind:'join',at:1780000000,chatId:'-1001111111111'}],cases:id==='123456789'?[{seq:42,chatId:'-1001111111111',score:92,reasons:['联系方式命中'],snapshot:{name:'林海',bio:'判定时简介',text:'判定时内容'},createdAt:1780000000,processed:'banned'}]:[],speech:{count:23,first:1780000000,last:1780000010},gky:{success:true,banned:false,tgid:id,message:'无封禁记录'},gkyError:null,...(userErrors?{errors:{speech:'发言记录读取失败'}}:{})}; }
async function fixture(route) {
  const url = route.request().url();
  if (url === 'https://telegram.org/js/telegram-web-app.js') return route.fulfill({status:200,contentType:'application/javascript',body:''});
  if (url === 'https://miniapp.test/app') return route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html});
  if (!url.startsWith('https://miniapp.test/app/api/')) throw new Error('Unexpected network request: '+url);
  const action = url.split('/app/api/')[1];
  const body = route.request().postDataJSON();
  assert.equal(body.initData,'mock-telegram-signed-data');
  assert.equal(route.request().method(),'POST');
  calls.push({action,body});
  let data;
  if (denyRefresh && action==='groups/list') return route.fulfill({status:401,json:{success:false,error:'连接已过期，请重新打开'}});
  switch (action) {
    case 'bootstrap': data={user:{id:'10001',name:'管理员 · 阿林'},primaryOwner:true,groups,counts:{blacklist:blacklist.length,pending:pending.length,groups:groups.length}}; break;
    case 'groups/list': data=groups; break;
    case 'groups/add': groups.push({chatId:body.chatId,title:'新加入的群组',source:'dynamic'});data={message:'已添加治理群组',complete:true};break;
    case 'groups/remove': groups=groups.filter(row=>row.chatId!==body.chatId);data={message:'已停止治理该群组',complete:true};break;
    case 'groups/leave': groups=groups.filter(row=>row.chatId!==body.chatId);data={message:'已退出群组',complete:true};break;
    case 'blacklist/list': {
      if (blacklistFails) { blacklistFails--; return route.fulfill({status:503,json:{success:false,error:'黑名单暂时不可用'}}); }
      const rows=blacklist.filter(row=>!body.query||row.id.includes(body.query)||row.reason.includes(body.query));
      const page=Number(body.page)||1;
      data={items:rows.slice(page-1,page),page,total:rows.length,totalPages:Math.max(1,rows.length)};
      break;
    }
    case 'blacklist/unban': if(unbanDelay)await new Promise(resolve=>setTimeout(resolve,unbanDelay));blacklist=blacklist.filter(row=>row.id!==body.userId);data={userId:body.userId,removed:true,complete:false,message:'已移除黑名单；1个群组未能解封',results:[{groupId:'-1001111111111',ok:true},{groupId:'-1002222222222',ok:false,error:'机器人权限不足'}]};break;
    case 'ads/summary': data={counts:{fingerprints:137,samples:54,observing:8,pending:pending.length},config:{scoreThreshold:80,observationScore:50,aiEnabled:true,llmDaily:100},visionModel:'视觉识别'};break;
    case 'ads/pending': data={items:pending,page:1,total:pending.length,totalPages:1};break;
    case 'ads/ignore': pending=[];data={complete:false,message:'已标为误报，部分撤销未完成',rollback:{blacklistRemoved:true,unbanResults:[{groupId:'-1002222222222',ok:false,error:'权限不足'}]}};break;
    case 'users/query': data=userData(body.userId);break;
    default: throw new Error('Unexpected action '+action);
  }
  await route.fulfill({status:200,json:{success:true,data}});
}
async function waitText(page,id,needle) { await page.waitForFunction(([id,needle])=>document.getElementById(id).textContent.includes(needle),[id,needle]); }
async function run() {
  const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try {
    const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
    await context.route('**/*',fixture);
    await context.addInitScript(()=>{window.Telegram={WebApp:{initData:'mock-telegram-signed-data',colorScheme:'light',isFullscreen:false,handlers:{},ready(){},expand(){},onEvent(type,cb){this.handlers[type]=cb;},requestFullscreen(){this.isFullscreen=true;if(this.handlers.fullscreenChanged)this.handlers.fullscreenChanged();},exitFullscreen(){this.isFullscreen=false;if(this.handlers.fullscreenChanged)this.handlers.fullscreenChanged();},BackButton:{show(){},hide(){},onClick(){}}}};});
    const page=await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto('https://miniapp.test/app');
    await page.waitForSelector('#app:not([hidden])');
    assert.equal(await page.locator('#groups-content .card').count(),2);
    assert.equal(await page.locator('#groups-content img').count(),0);
    await page.screenshot({path:'miniapp_groups_light.png',fullPage:true});
    // 全屏按钮：点一次进全屏、再点一次退出，图标随状态切换（data-full 由事件驱动）
    assert.equal(await page.locator('#fullscreen').isVisible(),true,'Fullscreen button should be visible');
    assert.equal(await page.locator('#fullscreen').getAttribute('data-full'),'0');
    await page.locator('#fullscreen').click();
    await page.waitForFunction(()=>document.getElementById('fullscreen').dataset.full==='1');
    assert.equal(await page.evaluate(()=>window.Telegram.WebApp.isFullscreen),true,'Click should enter fullscreen');
    await page.locator('#fullscreen').click();
    await page.waitForFunction(()=>document.getElementById('fullscreen').dataset.full==='0');
    assert.equal(await page.evaluate(()=>window.Telegram.WebApp.isFullscreen),false,'Second click should exit fullscreen');
    await page.locator('#refresh').click();
    await page.waitForSelector('#refresh:not([disabled])');
    assert.equal(await page.locator('#refresh svg').count(),1,'Refresh icon lost');
    await page.locator('#groups-content .card').first().getByRole('button',{name:'停止治理'}).click();
    await page.locator('#confirm-cancel').click();
    assert.equal(calls.filter(row=>row.action==='groups/remove').length,0,'Cancel executed write');
    await page.locator('#add-group').click();
    await page.locator('#add-chat-id').fill('-1003333333333');
    await page.locator('#add-submit').click();
    await waitText(page,'groups-count','3 个群组');
    assert.equal(calls.filter(row=>row.action==='groups/add').length,1);
    await page.locator('#tab-blacklist').click();
    await waitText(page,'blacklist-content','123456789');
    await page.locator('#blacklist-pager').getByRole('button',{name:'下一页'}).click();
    await waitText(page,'blacklist-content','987654321');
    await page.locator('#blacklist-query').fill('广告');
    await page.locator('#blacklist-search').getByRole('button',{name:'搜索',exact:true}).click();
    await waitText(page,'blacklist-content','123456789');
    assert.equal(calls.at(-1).body.page,1);
    assert.equal(calls.at(-1).body.query,'广告');
    assert.equal(await page.locator('#blacklist-content script').count(),0);
    await page.locator('#blacklist-content').getByRole('button',{name:'查询用户'}).click();
    await waitText(page,'users-content','广告评分 92');
    await waitText(page,'users-content','联系方式命中');
    await page.locator('#users-content details').getByText('查看判定时的资料与内容').click();
    await page.screenshot({path:'miniapp_user_light.png',fullPage:true});
    userErrors=true;
    await page.locator('#refresh').click();
    await waitText(page,'users-content','发言记录读取失败');
    userErrors=false;
    unbanDelay=800;
    await page.locator('#users-content').getByRole('button',{name:'解除封禁'}).click();
    await page.locator('#confirm-submit').click();
    await page.waitForFunction(()=>document.querySelector('#users-content button.danger').disabled===true);
    await page.locator('#user-query').fill('987654321');
    await page.locator('#user-search').getByRole('button',{name:'查询',exact:true}).click();
    await waitText(page,'users-content','另一位用户');
    await waitText(page,'confirm-title','部分群组未能解封');
    assert.equal(await page.locator('#toast').getAttribute('data-kind'),'error');
    await page.locator('#confirm-submit').click();
    await page.waitForTimeout(100);
    assert((await page.locator('#users-content').textContent()).includes('987654321'),'Old unban overwrote new user');
    await page.locator('#tab-ads').click();
    await waitText(page,'ads-content','联系方式命中');
    await page.evaluate(()=>{window.Telegram.WebApp.colorScheme='dark';document.body.dataset.theme='dark';});
    await page.screenshot({path:'miniapp_ads_dark.png',fullPage:true});
    assert.equal(await page.locator('#ads-content img').count(),0);
    await page.locator('#ads-content').getByRole('button',{name:'标为误报'}).click();
    await page.locator('#confirm-submit').click();
    await waitText(page,'confirm-title','误报处理结果');
    assert.equal(await page.locator('#toast').getAttribute('data-kind'),'error');
    await page.locator('#confirm-submit').click();
    await waitText(page,'ads-content','暂无待复核记录');
    blacklistFails=1;
    await page.locator('#tab-blacklist').click();
    await waitText(page,'blacklist-content','黑名单加载失败');
    await page.locator('#blacklist-content').getByRole('button',{name:'重试'}).click();
    await waitText(page,'blacklist-content','没有匹配的记录');
    await page.locator('#tab-groups').click();
    await page.locator('#groups-content .card').first().getByRole('button',{name:'退出群组'}).click();
    await page.locator('#confirm-submit').click();
    await waitText(page,'groups-count','2 个群组');
    denyRefresh=true;
    await page.locator('#refresh').click();
    await waitText(page,'auth-title','连接已失效');
    assert.equal(await page.locator('#app').isVisible(),false);
    await context.close();
    const noAuth=await browser.newContext({viewport:{width:320,height:640}});
    let noAuthRequests=0;
    await noAuth.route('**/*',async route=>{if(route.request().url()==='https://telegram.org/js/telegram-web-app.js')return route.fulfill({status:200,contentType:'application/javascript',body:''});if(route.request().url()==='https://miniapp.test/app')return route.fulfill({status:200,contentType:'text/html',body:html});noAuthRequests++;throw new Error('Unauthenticated page called API');});
    const noAuthPage=await noAuth.newPage();
    await noAuthPage.goto('https://miniapp.test/app');
    await waitText(noAuthPage,'auth-title','请从 Telegram 打开');
    assert.equal(noAuthRequests,0);
    assert.equal(await noAuthPage.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,'Overflow on 320px');
    await noAuth.close();
    // 宽屏自适应：1280px 下群组铺成三列，且不横向溢出
    const wide = await browser.newContext({viewport:{width:1280,height:900}});
    await wide.route('**/*',fixture);
    await wide.addInitScript(()=>{window.Telegram={WebApp:{initData:'mock-telegram-signed-data',colorScheme:'light',isFullscreen:false,handlers:{},ready(){},expand(){},onEvent(type,cb){this.handlers[type]=cb;},requestFullscreen(){this.isFullscreen=true;if(this.handlers.fullscreenChanged)this.handlers.fullscreenChanged();},exitFullscreen(){this.isFullscreen=false;if(this.handlers.fullscreenChanged)this.handlers.fullscreenChanged();},BackButton:{show(){},hide(){},onClick(){}}}};});
    const widePage = await wide.newPage();
    widePage.on('pageerror',error=>errors.push(error.message));
    await widePage.goto('https://miniapp.test/app');
    await widePage.waitForSelector('#app:not([hidden])');
    const columns = await widePage.evaluate(()=>getComputedStyle(document.getElementById('groups-content')).gridTemplateColumns.split(' ').length);
    assert.equal(columns,3,'Wide screen should lay groups out in 3 columns');
    assert.equal(await widePage.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,'Overflow on 1280px');
    await widePage.waitForTimeout(350);
    await widePage.screenshot({path:'miniapp_wide_light.png',fullPage:true});
    await wide.close();
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({passed:true,apiCalls:calls.length,actions:[...new Set(calls.map(row=>row.action))],mobile:'390x844 and 320x640',themes:'light/dark',xss:'text only',network:'fully mocked',errors}));
  } finally {await browser.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
