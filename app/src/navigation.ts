import type { DashboardTab } from "./workspace";

export const DASHBOARD_PATHS: Record<DashboardTab,string> = {feed:"/dashboard/calls",post:"/dashboard/create",portfolio:"/dashboard/vault",board:"/dashboard/record",profile:"/dashboard/profile",funding:"/dashboard/funding"};
export function canonicalPath(path:string):string {
 if(path.startsWith("#/call/")) return "/dashboard/calls/"+path.slice(7);
 if(path.startsWith("#/caller/")) return "/dashboard/traders/"+path.slice(9);
 if(path === "#/" || path === "#" || path === "/dashboard" || path === "/dashboard/") return DASHBOARD_PATHS.feed;
 if(path.startsWith("#/")) return "/"+path.slice(2);
 return path || DASHBOARD_PATHS.feed;
}
export function currentRoute():string {
 return location.hash.startsWith("#/") && location.hash !== "#/" ? canonicalPath(location.hash) : canonicalPath(location.pathname === "/" ? "/" : location.pathname.replace(/\/$/,""));
}
export function navigate(path:string,replace=false) {
 const url=new URL(canonicalPath(path),location.origin);
 if(url.origin!==location.origin)return;
 history[replace?"replaceState":"pushState"](null,"",url.pathname+url.search+url.hash);
 window.dispatchEvent(new Event("upside:navigate"));
}
export function tabForPath(path:string):DashboardTab|undefined {
 return (Object.entries(DASHBOARD_PATHS) as [DashboardTab,string][]).find(([,route])=>route===path)?.[0];
}
export function returnPath():string {
 const next=new URLSearchParams(location.search).get("next") ?? DASHBOARD_PATHS.feed;
 // Only local dashboard paths can become a post-login destination.
 return /^\/dashboard\/[a-zA-Z0-9/_-]+$/.test(next) ? next : DASHBOARD_PATHS.feed;
}
export function installNavigation(onChange:()=>void) {
 const click=(event:MouseEvent)=>{
  if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const link=(event.target as Element)?.closest<HTMLAnchorElement>("a[href]");
  if(!link||link.target||link.hasAttribute("download")||link.getAttribute("href")?.startsWith("#"))return;
  const url=new URL(link.href,location.origin);if(url.origin!==location.origin)return;
  event.preventDefault();navigate(url.pathname+url.search+url.hash);
 };
 document.addEventListener("click",click);window.addEventListener("popstate",onChange);window.addEventListener("upside:navigate",onChange);
 const legacy=()=>{if(location.hash.startsWith("#/"))navigate(canonicalPath(location.hash),true);};
 window.addEventListener("hashchange",legacy);
 if(location.hash.startsWith("#/"))legacy();else if(location.pathname !== currentRoute())navigate(currentRoute()+location.search+location.hash,true);
 return ()=>{document.removeEventListener("click",click);window.removeEventListener("popstate",onChange);window.removeEventListener("upside:navigate",onChange);window.removeEventListener("hashchange",legacy);};
}
