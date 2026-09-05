import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase=createClient('https://yiwmtfbqbynimqvwxosu.supabase.co','sb_publishable_EG30cid4BV1Uvr6EeM3f9g_hztA7Wpu');
const esc=s=>String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
let recipes=[];

function ensureBuilderStyles(){
 if(document.querySelector('#ccMenuBuilderStyles'))return;
 const s=document.createElement('style');s.id='ccMenuBuilderStyles';s.textContent=`
 .cc-menu-actions{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 18px}
 .cc-menu-builder{max-width:760px}
 .cc-menu-intro{font:14px/1.5 Arial;color:var(--muted);margin-bottom:18px}
 .cc-menu-picker{border:1px solid var(--line);border-radius:14px;overflow:hidden;background:#fff}
 .cc-menu-picker-head{padding:12px 14px;border-bottom:1px solid var(--line);font:600 12px Arial;color:var(--muted);display:flex;justify-content:space-between}
 .cc-menu-recipe{display:flex;align-items:center;gap:12px;padding:13px 14px;border-bottom:1px solid var(--line);font:14px Arial}
 .cc-menu-recipe:last-child{border-bottom:0}
 .cc-menu-recipe input{width:20px;height:20px;accent-color:var(--accent);flex:none}
 .cc-menu-recipe strong{display:block;color:var(--ink)}
 .cc-menu-recipe small{display:block;color:var(--muted);margin-top:3px}
 .cc-menu-builder .detail-actions{margin-top:20px}
 @media(max-width:760px){.cc-menu-actions{display:grid;grid-template-columns:1fr}.cc-menu-actions button{width:100%}}
 `;document.head.appendChild(s);
}

function addMenuButton(){
 const content=document.querySelector('#content');
 if(!content || !content.querySelector('.section-head h2')?.textContent.includes('Your menus'))return;
 if(document.querySelector('#ccCreateMenuFromRecipes'))return;
 const old=document.querySelector('#newMenuBtn');
 const wrap=document.createElement('div');wrap.className='cc-menu-actions';
 const b=document.createElement('button');b.className='primary';b.id='ccCreateMenuFromRecipes';b.textContent='＋ Create menu from recipes';b.onclick=openMenuBuilder;
 wrap.appendChild(b);
 if(old){old.className='secondary';old.textContent='＋ Blank menu';old.replaceWith(wrap);}
 else content.insertBefore(wrap,content.querySelector('div[style*="margin-top"]')||content.firstChild);
}

function renderBuilder(){
 const d=document.querySelector('#detailDialog');
 d.querySelector('#detailContent').innerHTML=`<button class="close" type="button" id="ccMenuClose" aria-label="Close">×</button><p class="eyebrow">CREATE MENU</p><h2>Build a menu from your recipes</h2><p class="cc-menu-intro">Choose recipes already in your private library. The menu stores references to the recipes, so your recipe records are never duplicated.</p><form id="ccMenuBuilderForm"><label>Menu name<input name="name" required placeholder="e.g. Sunday lunch"></label><div class="two-col"><label>Date<input type="date" name="date"></label><label>Guests<input type="number" min="1" name="guests"></label></div><label>Occasion<input name="occasion" placeholder="Lunch, dinner, family gathering…"></label><label>Notes<textarea name="notes" rows="3"></textarea></label><div class="cc-menu-picker"><div class="cc-menu-picker-head"><span>Recipes in your library</span><span id="ccRecipeCount">0 selected</span></div><div id="ccRecipeList"></div></div><div class="detail-actions"><button class="secondary" type="button" id="ccMenuCancel">Cancel</button><button class="primary" type="submit">Create menu</button></div></form>`;
 d.showModal();
 document.querySelector('#ccMenuClose').onclick=()=>d.close();document.querySelector('#ccMenuCancel').onclick=()=>d.close();
 const list=document.querySelector('#ccRecipeList');
 const sorted=[...recipes].sort((a,b)=>String(a.name).localeCompare(String(b.name)));
 list.innerHTML=sorted.length?sorted.map(r=>`<label class="cc-menu-recipe"><input type="checkbox" name="recipe" value="${r.id}"><span><strong>${esc(r.name)}</strong><small>${esc([r.cuisine,r.course,r.recipe_type].filter(Boolean).join(' · ')||'Recipe')}</small></span></label>`).join(''):'<div class="empty compact">No recipes in your library yet.</div>';
 const count=()=>document.querySelectorAll('#ccRecipeList input[name="recipe"]:checked').length;
 list.addEventListener('change',()=>document.querySelector('#ccRecipeCount').textContent=`${count()} selected`);
 document.querySelector('#ccMenuBuilderForm').onsubmit=saveBuiltMenu;
}

async function openMenuBuilder(){
 const {data:{user}}=await supabase.auth.getUser();if(!user)return;
 const {data,error}=await supabase.from('cc_recipes').select('*').order('name');if(error)return alert(error.message);recipes=data||[];renderBuilder();
}

async function saveBuiltMenu(e){
 e.preventDefault();
 const f=new FormData(e.target),{data:{user}}=await supabase.auth.getUser();if(!user)return;
 const ids=[...document.querySelectorAll('#ccRecipeList input[name="recipe"]:checked')].map(x=>Number(x.value));
 if(!ids.length)return alert('Please select at least one recipe for the menu.');
 const menu={name:String(f.get('name')).trim(),menu_date:f.get('date')||null,guest_count:f.get('guests')?Number(f.get('guests')):null,occasion:String(f.get('occasion')||'').trim()||null,notes:String(f.get('notes')||'').trim()||null,visibility:'private',created_by:user.id};
 const {data:m,error}=await supabase.from('cc_menus').insert(menu).select().single();
 if(error)return alert(error.message);
 const rows=ids.map((recipe_id,i)=>({menu_id:m.id,recipe_id,section:null,sort_order:i,custom_label:null}));
 const ins=await supabase.from('cc_menu_items').insert(rows);
 if(ins.error){await supabase.from('cc_menus').delete().eq('id',m.id);return alert(ins.error.message);}
 e.target.reset();document.querySelector('#detailDialog').close();alert('Menu created from your selected recipes.');window.location.reload();
}

function repairDialogButtons(){
 const recipe=document.querySelector('#recipeDialog');
 const menu=document.querySelector('#menuDialog');
 [recipe,menu].forEach(d=>{
   if(!d)return;
   const close=d.querySelector('.close');
   if(close){close.type='button';close.onclick=e=>{e.preventDefault();e.stopPropagation();d.close();};}
   const cancel=d.querySelector('.dialog-actions button.secondary');
   if(cancel){cancel.type='button';cancel.onclick=e=>{e.preventDefault();e.stopPropagation();d.close();};}
 });
}

ensureBuilderStyles();
const observer=new MutationObserver(()=>{addMenuButton();repairDialogButtons();});observer.observe(document.body,{subtree:true,childList:true});
addMenuButton();
repairDialogButtons();
