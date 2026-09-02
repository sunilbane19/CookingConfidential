const recipes=[
 {id:1,name:"Chicken Chettinad",cuisine:"South Indian",course:"Main course",ingredients:["chicken","coconut","curry leaves","fennel","black pepper"],rating:5,note:"My preferred version — less chilli than the original."},
 {id:2,name:"Lamb Biryani",cuisine:"Hyderabadi",course:"Main course",ingredients:["lamb","basmati rice","saffron","mint","yoghurt"],rating:5,note:"Great for a dinner party; can be prepared ahead."},
 {id:3,name:"Prawn Moilee",cuisine:"Kerala",course:"Main course",ingredients:["prawns","coconut milk","ginger","green chilli","curry leaves"],rating:4,note:"Light, fragrant and quick."},
 {id:4,name:"Paneer Tikka",cuisine:"North Indian",course:"Starter",ingredients:["paneer","yoghurt","capsicum","garam masala"],rating:4,note:"Useful make-ahead starter."},
 {id:5,name:"Roasted Eggplant",cuisine:"Mediterranean",course:"Side",ingredients:["eggplant","tomato","garlic","olive oil"],rating:5,note:"Excellent alongside grilled meat."},
 {id:6,name:"Gulab Jamun",cuisine:"Indian",course:"Dessert",ingredients:["khoya","flour","sugar","cardamom","rose water"],rating:5,note:"A family favourite."}
];
let menus=[
 {name:"Diwali Dinner — 2024",guests:14,items:["Chicken Chettinad","Paneer Tikka","Lamb Biryani","Gulab Jamun"]},
 {name:"Sunday Lunch — 2024",guests:8,items:["Prawn Moilee","Roasted Eggplant","Gulab Jamun"]},
 {name:"Birthday Dinner — 2023",guests:10,items:["Paneer Tikka","Lamb Biryani","Roasted Eggplant"]}
];
let view="recipes";
const content=document.querySelector("#content"), search=document.querySelector("#searchInput");
function recipeCard(r){return `<article class="card" data-id="${r.id}"><div class="card-image">🍽</div><div class="card-body"><span class="tag">${r.cuisine}</span><h3>${r.name}</h3><div class="meta">${r.course} · ${"★".repeat(r.rating)}</div></div></article>`}
function render(){
 const q=search.value.trim().toLowerCase();
 if(view==="menus") return renderMenus(q);
 let list=recipes.filter(r=>view==="favourites"?r.rating>=5:true).filter(r=>(r.name+" "+r.cuisine+" "+r.course+" "+r.ingredients.join(" ")).toLowerCase().includes(q));
 content.innerHTML=`<div class="section-head"><h2>${view==="favourites"?"Favourites":"Your recipes"}</h2><span class="count">${list.length} recipes</span></div>${list.length?`<div class="grid">${list.map(recipeCard).join("")}</div>`:'<div class="empty">No recipes found. Try another ingredient, cuisine or dish.</div>'}`;
 content.querySelectorAll(".card").forEach(c=>c.onclick=()=>showRecipe(+c.dataset.id));
}
function renderMenus(q){
 const list=menus.filter(m=>(m.name+" "+m.items.join(" ")).toLowerCase().includes(q));
 content.innerHTML=`<div class="section-head"><h2>Your menus</h2><span class="count">${list.length} menus</span></div><button class="primary" id="newMenuBtn">＋ New menu</button><div style="margin-top:18px">${list.map((m,i)=>`<article class="menu-card"><span class="tag">Hosted · ${m.guests} guests</span><h3>${m.name}</h3><div class="menu-items">${m.items.join(" · ")}</div><button class="tab" onclick="copyMenu(${i})">Copy & modify</button></article>`).join("")}</div>`;
 document.querySelector("#newMenuBtn").onclick=()=>alert("Menu editor is the next V1 build step.");
}
function showRecipe(id){
 const r=recipes.find(x=>x.id===id);
 document.querySelector("#detailContent").innerHTML=`<button class="close" onclick="detailDialog.close()">×</button><span class="tag">${r.cuisine} · ${r.course}</span><h2 class="detail-title">${r.name}</h2><div class="meta">${"★".repeat(r.rating)}</div><div class="detail-section"><h4>Ingredients</h4><ul>${r.ingredients.map(i=>`<li>${i}</li>`).join("")}</ul></div><div class="detail-section"><h4>My notes</h4><p>${r.note}</p></div>`;
 detailDialog.showModal();
}
function copyMenu(i){const copy={...menus[i],name:menus[i].name+" — Copy",items:[...menus[i].items]};menus.push(copy);view="menus";render();}
document.querySelectorAll(".tab").forEach(t=>t.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));t.classList.add("active");view=t.dataset.view;render()});
search.oninput=render;
const recipeDialog=document.querySelector("#recipeDialog"),detailDialog=document.querySelector("#detailDialog");
document.querySelector("#addRecipeBtn").onclick=()=>recipeDialog.showModal();
document.querySelector("#recipeForm").onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);recipes.unshift({id:Date.now(),name:f.get("name"),cuisine:f.get("cuisine")||"Uncategorised",course:"Recipe",ingredients:String(f.get("ingredients")).split("\n").filter(Boolean),rating:0,note:f.get("method")||""});recipeDialog.close();e.target.reset();view="recipes";render();};
render();
