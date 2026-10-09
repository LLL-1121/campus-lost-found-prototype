const $=id=>document.getElementById(id);
const demo=location.hostname.endsWith('github.io')||location.protocol==='file:';
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const statusLabel=i=>i.closed?'已关闭':i.resolved?(i.type==='lost'?'已找到':'已归还'):(i.type==='lost'?'寻找中':'待认领');
const visible=i=>!i.closed&&!i.resolved;
let items=[],selected=null,editing=null,photos=[],filter='all',busy=false,token;
const seed=[
{id:1,type:'found',title:'黑色无线耳机',place:'图书馆三楼',category:'电子设备',description:'黑色充电盒，盖上有一处划痕。'},
{id:2,type:'lost',title:'蓝色校园卡套',place:'一食堂附近',category:'校园卡',description:'蓝色卡套，深蓝色挂绳。'},
{id:3,type:'found',title:'米白色折叠伞',place:'西三教学楼',category:'生活用品',description:'米白色折叠伞，木纹手柄。'},
{id:4,type:'lost',title:'高等数学教材',place:'田径场看台',category:'书籍',description:'同济版高等数学上册。'}
].map(i=>({...i,date:'2026-10-09',mine:false,images:[],contact:'demo_contact_only',closed:false,resolved:false}));
function toast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('show'),3500);}
function localDate(){const now=new Date();return new Date(now-now.getTimezoneOffset()*60000).toISOString().slice(0,10);}
async function request(method='GET',id='',data){
 const response=await fetch('api/items'+(id?'/'+id:''),{method,headers:{'Content-Type':'application/json','X-Owner-Token':token},...(data?{body:JSON.stringify(data)}:{})});
 const result=await response.json();if(!response.ok)throw Error(result.error||'请求失败');return result;
}
async function load(){items=demo?JSON.parse(localStorage.getItem('lf-demo-v2')||'null')||seed:await request();refresh();}
async function save(data,id){
 if(!demo)return request(id?'PUT':'POST',id,data);
 const old=id?items.find(i=>i.id===id):null;if(id&&!old?.mine)throw Error('只能管理本人信息');
 const item={...old,...data,id:id||Date.now(),mine:true};
 const next=id?items.map(i=>i.id===id?item:i):[item,...items];
 localStorage.setItem('lf-demo-v2',JSON.stringify(next));items=next;return item;
}
async function remove(id){
 if(!demo)return request('DELETE',id);if(!items.find(i=>i.id===id)?.mine)throw Error('只能管理本人信息');
 const next=items.filter(i=>i.id!==id);localStorage.setItem('lf-demo-v2',JSON.stringify(next));items=next;
}
function showPage(id){document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id===id));document.querySelectorAll('.bottom-nav [data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===id));document.querySelector('.bottom-nav').hidden=id==='success';window.scrollTo(0,0);}
function card(i){
 const thumb=i.images?.[0]?'<img src="'+escapeHTML(i.images[0])+'" alt="'+escapeHTML(i.title)+'照片" loading="lazy">':'<span class="placeholder-label">'+escapeHTML(i.category)+'</span>';
 return '<button class="item" data-id="'+i.id+'"><span class="item-visual">'+thumb+'</span><span><span class="item-top"><span class="tag '+i.type+'">'+(i.type==='lost'?'寻物':'招领')+'</span><time>'+escapeHTML(i.date)+'</time></span><h3>'+escapeHTML(i.title)+'</h3><p>'+escapeHTML(i.place)+' · '+statusLabel(i)+'</p></span></button>';
}
function renderFeed(list,target){$(target).innerHTML=list.length?list.map(card).join(''):'<div class="empty"><p>暂无相关信息</p><button class="secondary" data-page="publish">发布一条信息</button></div>';}
function search(){
 const q=$('search-input').value.trim().toLowerCase(),type=$('filter-type').value,category=$('filter-category').value,place=$('filter-place').value.trim(),from=$('filter-from').value,to=$('filter-to').value;
 $('search-error').textContent=from&&to&&from>to?'开始日期不能晚于结束日期。':'';
 const result=from&&to&&from>to?[]:items.filter(i=>visible(i)&&(!type||i.type===type)&&(!category||i.category===category)&&(!place||i.place.includes(place))&&(!from||i.date>=from)&&(!to||i.date<=to)&&(i.title+' '+i.place+' '+i.description).toLowerCase().includes(q));
 $('search-meta').textContent='找到 '+result.length+' 条信息';renderFeed(result,'search-results');
}
function refresh(){renderFeed(items.filter(i=>visible(i)&&(filter==='all'||i.type===filter)),'feed');renderFeed(items.filter(i=>i.mine),'mine-feed');search();}
function showDetail(id){
 const i=items.find(i=>i.id===Number(id));if(!i){toast('这条信息已不存在');return;}selected=i;
 for(const [target,key]of [['detail-title','title'],['detail-description','description'],['detail-place','place'],['detail-date','date'],['detail-contact','contact']])$(target).textContent=i[key];
 $('detail-time').textContent=i.category;$('detail-status').textContent=statusLabel(i);$('detail-type').textContent=i.type==='lost'?'寻物信息':'招领信息';$('detail-type').className='status-tag tag '+i.type;
 $('detail-symbol').textContent=i.images.length?'':i.category;
 $('detail-gallery').innerHTML=i.images.map((src,n)=>'<button data-photo="'+n+'" aria-label="放大第 '+(n+1)+' 张照片"><img src="'+escapeHTML(src)+'" alt="'+escapeHTML(i.title)+'第 '+(n+1)+' 张照片"></button>').join('');
 $('manage-actions').hidden=!i.mine;$('resolve-btn').textContent=i.resolved?'恢复未完成':i.type==='lost'?'标记已找到':'标记已归还';$('close-btn').textContent=i.closed?'重新公开':'关闭信息';showPage('detail');
}
function renderPhotos(){$('photo-preview').innerHTML=photos.map((src,n)=>'<div><img src="'+escapeHTML(src)+'" alt="待发布照片 '+(n+1)+'"><button type="button" data-remove-photo="'+n+'" aria-label="删除第 '+(n+1)+' 张照片">删除</button></div>').join('');}
function startPublish(type='lost',item=null){
 editing=item?.id||null;photos=item?[...item.images]:[];const form=$('publish-form');form.reset();
 for(const name of ['title','place','category','date','description','contact'])form.elements[name].value=item?.[name]||(name==='date'?localDate():name==='category'?'其他':'');
 form.elements.type.value=item?.type||type;$('publish-title').textContent=item?'编辑信息':'发布信息';$('submit-btn').textContent=item?'保存修改':'确认发布';renderPhotos();showPage('publish');
}
async function compressed(file){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)throw Error('请选择 10MB 以内的 JPG、PNG 或 WebP 图片');
 const bitmap=await createImageBitmap(file),scale=Math.min(1,1000/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
 const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();return canvas.toDataURL('image/jpeg',.78);
}
async function updateState(patch){if(busy||!selected?.mine)return;busy=true;try{await save(patch,selected.id);await load();showDetail(selected.id);toast('状态已保存');}catch(e){toast(e.message);}finally{busy=false;}}
document.addEventListener('click',e=>{
 const page=e.target.closest('[data-page]');if(page){if(page.dataset.page==='publish')startPublish();else showPage(page.dataset.page);}
 const pub=e.target.closest('[data-publish-type]');if(pub)startPublish(pub.dataset.publishType);
 const item=e.target.closest('.item');if(item)showDetail(item.dataset.id);
 const chip=e.target.closest('.chips button');if(chip){$('search-input').value=chip.textContent;search();}
 const photo=e.target.closest('[data-photo]');if(photo){$('large-photo').src=selected.images[Number(photo.dataset.photo)];$('photo-dialog').showModal();}
 const del=e.target.closest('[data-remove-photo]');if(del){photos.splice(Number(del.dataset.removePhoto),1);renderPhotos();}
});
document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));refresh();}));
for(const id of ['search-input','filter-type','filter-category','filter-place','filter-from','filter-to'])$(id).addEventListener('input',search);
$('clear-search').onclick=()=>{$('search-input').value='';search();};
$('reset-filters').onclick=()=>{for(const id of ['search-input','filter-type','filter-category','filter-place','filter-from','filter-to'])$(id).value='';search();};
$('photo-input').onchange=async e=>{if(busy)return;busy=true;$('submit-btn').disabled=true;const previous=[...photos];try{if(photos.length+e.target.files.length>6)throw Error('最多上传 6 张照片');for(const file of e.target.files)photos.push(await compressed(file));renderPhotos();}catch(error){photos=previous;renderPhotos();toast(error.message);}finally{e.target.value='';busy=false;$('submit-btn').disabled=false;}};
$('publish-form').onsubmit=async e=>{
 e.preventDefault();if(busy)return;const form=e.currentTarget,data=Object.fromEntries(new FormData(form));delete data.photo;data.images=photos;
 for(const name of ['title','place','description','contact']){data[name]=data[name].trim();if(!data[name]){toast('必填内容不能只输入空格');return;}}
 busy=true;$('submit-btn').disabled=true;
 try{const item=await save({...data,...(!editing?{resolved:false,closed:false}:{})},editing);await load();selected=items.find(i=>i.id===item.id);$('success-title').textContent=editing?'修改已保存':'发布成功';form.reset();photos=[];renderPhotos();editing=null;showPage('success');}
 catch(error){toast(error.message||'无法保存，请检查网络后重试');}finally{busy=false;$('submit-btn').disabled=false;}
};
$('contact-btn').onclick=async()=>{try{await navigator.clipboard.writeText(selected.contact);toast('联系方式已复制');}catch{toast('无法自动复制，请选中上方联系方式手动复制');}};
$('resolve-btn').onclick=()=>updateState({resolved:!selected.resolved});$('close-btn').onclick=()=>updateState({closed:!selected.closed});
$('edit-btn').onclick=()=>startPublish('lost',selected);
$('delete-btn').onclick=async()=>{if(busy||!selected?.mine||!confirm('确定删除这条信息？删除后不可恢复。'))return;busy=true;try{await remove(selected.id);await load();showPage('mine');toast('信息已删除');}catch(e){toast(e.message);}finally{busy=false;}};
$('close-photo').onclick=()=>$('photo-dialog').close();$('photo-dialog').onclick=e=>{if(e.target===$('photo-dialog'))$('photo-dialog').close();};
$('success-detail').onclick=()=>{if(selected)showDetail(selected.id);};$('retry-load').onclick=()=>boot();
async function boot(){
 try{token=localStorage.getItem('lf-owner-v1');if(!token){token=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');localStorage.setItem('lf-owner-v1',token);}
 $('mode-note').textContent=demo?'在线体验：数据保存在此浏览器；运行 Python 版本可共享信息。':'服务已连接 · 信息保存到 SQLite 数据库';
 await load();$('load-error').hidden=true;
 }catch(e){$('load-error').hidden=false;$('load-message').textContent='无法载入：'+e.message+'。请检查服务或浏览器存储权限后重试。';}
}
boot();
