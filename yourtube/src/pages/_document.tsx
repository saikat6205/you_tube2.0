import { Html, Head, Main, NextScript } from "next/document";

// Applies the stored theme before React hydrates so there is no flash of the
// wrong colours. The account value from the server takes over once the app mounts.
const themeBootstrap = `(function(){try{
var p=localStorage.getItem('yourtube.theme');
if(p!=='light'&&p!=='dark'){
var h=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Kolkata',hourCycle:'h23',hour:'2-digit'}).formatToParts(new Date()).find(function(x){return x.type==='hour'}).value)%24;
p=(h>=10&&h<12)?'light':'dark';
}
if(p==='dark')document.documentElement.classList.add('dark');
else document.documentElement.classList.remove('dark');
document.documentElement.style.colorScheme=p;
}catch(e){}})();`;

export default function Document() {
  return (
    <Html lang="en">
      <Head />
      <body className="antialiased">
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}