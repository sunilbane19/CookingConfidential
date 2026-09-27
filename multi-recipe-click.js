// Only intercept an explicitly marked multi-recipe review action.
// Ordinary Import Inbox Review buttons must continue through the normal reviewer.
window.addEventListener('click',event=>{
  const button=event.target.closest('.review-btn[data-multi="1"]');
  if(!button||typeof window.ccMultiReview!=='function')return;
  event.preventDefault();
  event.stopImmediatePropagation();
  window.ccMultiReview(Number(button.dataset.id));
},true);
