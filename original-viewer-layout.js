// Improve the original-file viewer without changing authentication, storage, or extraction logic.
const style=document.createElement('style');
style.id='ccOriginalViewerLayout';
style.textContent=`
#detailDialog{max-width:min(1100px,96vw);width:min(1100px,96vw);max-height:92vh}
#detailDialog .dialog-card{padding:28px 32px;max-height:92vh;overflow:auto}
#detailDialog #detailContent>h2{margin-bottom:18px}
#detailDialog .original-pdf{display:block;width:100%;height:min(72vh,760px);min-height:520px;border:1px solid var(--line);border-radius:12px;background:#fff}
#detailDialog .original-viewer{width:100%;height:min(72vh,760px);min-height:420px;display:flex;align-items:center;justify-content:center;overflow:auto;padding:18px;border:1px solid var(--line);border-radius:12px;background:#f2eee6}
#detailDialog .original-image{display:block;max-width:100%;max-height:calc(min(72vh,760px) - 36px);width:auto;height:auto;object-fit:contain;border-radius:6px;box-shadow:0 3px 16px rgba(30,25,18,.10)}
#detailDialog .original-open-link{margin-top:12px;display:inline-block}
@media(max-width:760px){#detailDialog{max-width:96vw;width:96vw}#detailDialog .dialog-card{padding:22px 16px}#detailDialog .original-pdf{height:70vh;min-height:420px}#detailDialog .original-viewer{height:70vh;min-height:360px;padding:10px}#detailDialog .original-image{max-height:calc(70vh - 20px)}}
`;
document.head.appendChild(style);