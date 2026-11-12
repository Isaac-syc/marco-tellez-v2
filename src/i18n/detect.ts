/**
 * Render-blocking language detection, inlined as the first thing in <head>.
 * Kept as a plain ES5 string (no imports, no build transforms) so it can also be
 * evaluated in tests. Runs on full page loads only: ClientRouter swaps never
 * re-execute it, and all internal links already carry the visitor's locale.
 *
 *  - device language wins on the first entry of a visit (es / cs / sk→cs / en, else en);
 *  - a same-origin referrer means we are already inside the site: no redirect;
 *  - sessionStorage guarantees at most one decision per visit (no loops).
 */
export const detectSource = `(function(){
  function pick(a){
    for(var i=0;i<a.length;i++){
      var p=String(a[i]||'').toLowerCase().split(/[-_]/)[0];
      if(p==='es'||p==='cs'||p==='en')return p;
      if(p==='sk')return 'cs';
    }
    return 'en';
  }
  if(typeof module!=='undefined'&&module.exports){module.exports=pick;return;}
  try{
    var n=navigator,l=n.languages&&n.languages.length?n.languages:[n.language];
    var want=pick(l),path=location.pathname,m=/^\\/(es|cs)(?=\\/|$)/.exec(path),cur=m?m[1]:'en';
    var seen=false;
    try{seen=!!sessionStorage.getItem('lang-checked');sessionStorage.setItem('lang-checked','1');}catch(e){}
    var inside=false;
    try{inside=!!document.referrer&&new URL(document.referrer).origin===location.origin;}catch(e){}
    if(seen||inside||want===cur)return;
    var rest=m?path.slice(m[0].length)||'/':path;
    location.replace((want==='en'?'':'/'+want)+rest+location.search+location.hash);
  }catch(e){}
})();`;
