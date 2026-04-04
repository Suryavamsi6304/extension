"use strict";var ge=Object.create;var H=Object.defineProperty;var me=Object.getOwnPropertyDescriptor;var ve=Object.getOwnPropertyNames;var fe=Object.getPrototypeOf,ye=Object.prototype.hasOwnProperty;var be=(r,e)=>{for(var t in e)H(r,t,{get:e[t],enumerable:!0})},de=(r,e,t,n)=>{if(e&&typeof e=="object"||typeof e=="function")for(let o of ve(e))!ye.call(r,o)&&o!==t&&H(r,o,{get:()=>e[o],enumerable:!(n=me(e,o))||n.enumerable});return r};var m=(r,e,t)=>(t=r!=null?ge(fe(r)):{},de(e||!r||!r.__esModule?H(t,"default",{value:r,enumerable:!0}):t,r)),we=r=>de(H({},"__esModule",{value:!0}),r);var Re={};be(Re,{activate:()=>Ee,deactivate:()=>Te});module.exports=we(Re);var a=m(require("vscode"));var b=m(require("vscode")),R=m(require("child_process")),C=m(require("path")),T=m(require("fs")),le=m(require("http")),pe=m(require("net")),G=class{constructor(e,t,n){this.process=null;this._isReady=!1;this.extensionPath=e,this.port=t,this.outputChannel=n,this.readyPromise=new Promise((o,s)=>{this.readyResolve=o,this.readyReject=s})}get isReady(){return this._isReady}get onReady(){return this.readyPromise}async ensureRunning(){if(await this.checkHealth()){this._isReady=!0,this.readyResolve(),this.outputChannel.appendLine(`[ServerManager] Backend already running on port ${this.port}`);return}if(await this.isPortInUse()){let n=`Port ${this.port} is already in use by another process. Stop it or change the port in settings.`;this.outputChannel.appendLine(`[ServerManager] ERROR: ${n}`),this.readyReject(new Error(n)),b.window.showErrorMessage(`GenAI Insights: ${n}`);return}await this.start()}async restart(){this.outputChannel.appendLine("[ServerManager] Restarting backend..."),this._isReady=!1,this.readyPromise=new Promise((e,t)=>{this.readyResolve=e,this.readyReject=t}),this.process?(process.platform==="win32"?this.process.kill():this.process.kill("SIGTERM"),this.process=null,await ce(500)):await this.killPortProcess(),await this.start()}isPortInUse(){return new Promise(e=>{let t=pe.createServer();t.once("error",n=>{e(n.code==="EADDRINUSE")}),t.once("listening",()=>{t.close(()=>e(!1))}),t.listen(this.port,"127.0.0.1")})}killPortProcess(){return new Promise(e=>{let t=R.spawn("cmd",["/c",`for /f "tokens=5" %a in ('netstat -aon ^| findstr :${this.port}') do taskkill /F /PID %a`]),n=setTimeout(e,2e3);t.on("close",()=>{clearTimeout(n),e()})})}verifyPython(e){try{return R.execFileSync(e,["--version"],{stdio:"ignore",timeout:5e3}),!0}catch{return!1}}async start(){let e=C.join(this.extensionPath,"backend");if(!T.existsSync(e)){let n=`Backend directory not found: ${e}`;this.outputChannel.appendLine(`[ServerManager] ERROR: ${n}`),this.readyReject(new Error(n));return}await this.ensureVenv(e);let t=this.resolvePython();if(!this.verifyPython(t)){let n=`Python not found (tried "${t}"). Install Python 3.9+ or set "genai.pythonPath" in VS Code settings.`;this.outputChannel.appendLine(`[ServerManager] ERROR: ${n}`),this.readyReject(new Error(n)),b.window.showErrorMessage(`GenAI Insights: ${n}`,"Open Settings").then(o=>{o==="Open Settings"&&b.commands.executeCommand("workbench.action.openSettings","genai.pythonPath")});return}this.outputChannel.appendLine(`[ServerManager] Starting backend: ${t} (port ${this.port})`),this.process=R.spawn(t,["-m","uvicorn","main:app","--host","127.0.0.1","--port",String(this.port),"--log-level","info"],{cwd:e,env:{...process.env},stdio:["ignore","pipe","pipe"]}),this.process.stdout?.on("data",n=>{let o=n.toString().trim();this.outputChannel.appendLine(`[Backend] ${o}`)}),this.process.stderr?.on("data",n=>{this.outputChannel.appendLine(`[Backend Error] ${n.toString().trim()}`)}),this.process.on("exit",n=>{this.outputChannel.appendLine(`[ServerManager] Backend exited with code ${n}`);let o=this._isReady;this._isReady=!1,this.process=null,o&&n!==0&&this.notifyUnexpectedExit(n)}),this.process.on("error",n=>{this.outputChannel.appendLine(`[ServerManager] Failed to start: ${n.message}`),this.readyReject(n)}),await this.waitForHealthy(10)}async waitForHealthy(e){for(let t=0;t<e;t++){if(!this.process)return;if(await this.checkHealth()){this._isReady=!0,this.readyResolve(),this.outputChannel.appendLine(`[ServerManager] Backend ready on port ${this.port}`);return}if(t<e-1){let o=Math.min(500*Math.pow(1.5,t),3e3);this.outputChannel.appendLine(`[ServerManager] Health check ${t+1}/${e} failed \u2014 retrying in ${Math.round(o)}ms`),await ce(o)}}if(this.process){this.outputChannel.appendLine(`[ServerManager] Backend did not respond after ${e} attempts \u2014 killing process`),this.process.kill(),this.process=null;let t=new Error(`Backend did not become healthy after ${e} attempts. Check the "GenAI Insights Backend" output channel.`);this.readyReject(t),b.window.showErrorMessage(`GenAI Insights: ${t.message}`)}}notifyUnexpectedExit(e){let t=`Backend process exited unexpectedly (code ${e??"unknown"}).`;this.outputChannel.appendLine(`[ServerManager] ${t}`),b.window.showErrorMessage(`GenAI Insights: ${t}`,"Show Logs").then(n=>{n==="Show Logs"&&this.outputChannel.show()})}checkHealth(){return new Promise(e=>{let t=le.get(`http://127.0.0.1:${this.port}/health`,{timeout:2e3},n=>{e(n.statusCode===200)});t.on("error",()=>e(!1)),t.on("timeout",()=>{t.destroy(),e(!1)})})}async ensureVenv(e){let t=b.workspace.getConfiguration("genai").get("pythonPath","");if(t&&t.trim())return;let n=C.join(e,".venv");if(T.existsSync(n))return;let o=C.join(e,"requirements.txt");if(!T.existsSync(o)){this.outputChannel.appendLine("[ServerManager] No requirements.txt found \u2014 skipping venv creation");return}if(await b.window.showInformationMessage("GenAI Insights needs to install Python dependencies (one-time setup).","Install Now","Cancel")!=="Install Now"){let c="Backend dependencies not installed. Install them manually or restart VS Code and accept the prompt.";this.outputChannel.appendLine(`[ServerManager] ${c}`),this.readyReject(new Error(c));return}let d=process.platform==="win32"?"python":"python3";this.outputChannel.appendLine("[ServerManager] Creating virtual environment...");try{await this.runCommand(d,["-m","venv",n])}catch(c){let l=`Failed to create virtualenv: ${c.message}`;this.outputChannel.appendLine(`[ServerManager] ERROR: ${l}`),this.readyReject(new Error(l));return}let i=process.platform==="win32"?C.join(n,"Scripts","pip.exe"):C.join(n,"bin","pip");this.outputChannel.appendLine("[ServerManager] Installing dependencies \u2014 this may take a minute...");try{await this.runCommand(i,["install","-r",o,"--quiet"]),this.outputChannel.appendLine("[ServerManager] Dependencies installed successfully")}catch(c){let l=`Failed to install dependencies: ${c.message}`;this.outputChannel.appendLine(`[ServerManager] ERROR: ${l}`),T.rmSync(n,{recursive:!0,force:!0}),this.readyReject(new Error(l));return}}runCommand(e,t){return new Promise((n,o)=>{let s=R.spawn(e,t,{stdio:["ignore","pipe","pipe"]});s.stdout?.on("data",d=>this.outputChannel.appendLine(`[Setup] ${d.toString().trim()}`)),s.stderr?.on("data",d=>this.outputChannel.appendLine(`[Setup] ${d.toString().trim()}`)),s.on("error",d=>o(d)),s.on("close",d=>d===0?n():o(new Error(`Command exited with code ${d}`)))})}resolvePython(){let e=b.workspace.getConfiguration("genai").get("pythonPath","");if(e&&e.trim())return e.trim();let t=C.join(this.extensionPath,"backend"),n=process.platform==="win32"?C.join(t,".venv","Scripts","python.exe"):C.join(t,".venv","bin","python");return T.existsSync(n)?n:process.platform==="win32"?"python":"python3"}dispose(){this.process&&(this.outputChannel.appendLine("[ServerManager] Stopping backend..."),process.platform==="win32"?this.process.kill():this.process.kill("SIGTERM"),this.process=null)}};function ce(r){return new Promise(e=>setTimeout(e,r))}var F=m(require("vscode")),z=m(require("http")),L=class L{constructor(e,t,n){this._activeStreamReq=null;this.baseUrl=`http://127.0.0.1:${e}`,this.outputChannel=t,this.secrets=n}getProvider(){return F.workspace.getConfiguration("genai").get("provider","groq")}async resolveApiKey(e){return await this.secrets.get(`${e}-api-key`)??""}async fetchJson(e,t,n){return new Promise((o,s)=>{let d=n?JSON.stringify(n):void 0,i=new URL(this.baseUrl+t),c={hostname:i.hostname,port:i.port,path:i.pathname+i.search,method:e,timeout:L.REQUEST_TIMEOUT_MS,headers:{"Content-Type":"application/json",Accept:"application/json",...d?{"Content-Length":Buffer.byteLength(d)}:{}}},l=z.request(c,p=>{let k="";p.on("data",v=>k+=v),p.on("end",()=>{try{let v=JSON.parse(k);p.statusCode&&p.statusCode>=400?s(new Error(v?.error??v?.detail??`HTTP ${p.statusCode}`)):o(v)}catch{s(new Error(`Invalid JSON response: ${k.slice(0,200)}`))}})});l.on("timeout",()=>{l.destroy(),s(new Error(`Request to ${e} ${t} timed out after ${L.REQUEST_TIMEOUT_MS/1e3}s`))}),l.on("error",s),d&&l.write(d),l.end()}).catch(o=>{let s=o instanceof Error?o.message:String(o);throw this.outputChannel.appendLine(`[BackendClient] ${e} ${t} failed: ${s}`),F.window.showErrorMessage(`GenAI Insights: ${s}`),o})}async health(){return this.fetchJson("GET","/health")}async getProviders(){return this.fetchJson("GET","/providers")}async scanProject(e){let t=this.getProvider()||null,n=t&&await this.resolveApiKey(t)||null;return this.fetchJson("POST","/project/scan",{workspace_path:e,provider:t,api_key:n})}async explainCode(e,t,n){let o=this.getProvider()||null,s=o&&await this.resolveApiKey(o)||null;return this.fetchJson("POST","/explain",{code:e,language:t,file_path:n,provider:o,api_key:s})}async getGitInsights(e){let t=this.getProvider()||null,n=t&&await this.resolveApiKey(t)||null;return this.fetchJson("POST","/git/insights",{workspace_path:e,provider:t,api_key:n})}async getActivity(e=50){return this.fetchJson("GET",`/activity/recent?limit=${e}`)}async startWatching(e){await this.fetchJson("POST",`/activity/watch?workspace_path=${encodeURIComponent(e)}`)}async getTodos(e){return this.fetchJson("POST","/todos/scan",{workspace_path:e})}async*chatStream(e,t,n){let o=this.getProvider()||null,s=o&&await this.resolveApiKey(o)||null,d=JSON.stringify({message:e,workspace_path:t,history:n,provider:o,api_key:s}),i=new URL(this.baseUrl+"/chat"),c={hostname:i.hostname,port:i.port,path:i.pathname,method:"POST",headers:{"Content-Type":"application/json",Accept:"text/event-stream","Content-Length":Buffer.byteLength(d)}},l=await new Promise((k,v)=>{let f=z.request(c,k);f.setTimeout(L.REQUEST_TIMEOUT_MS,()=>{f.destroy(),v(new Error("Chat stream connection timed out"))}),f.on("error",v),f.write(d),f.end()}),p="";for await(let k of l){p+=k.toString();let v=p.split(`
`);p=v.pop()||"";for(let f of v)if(f.startsWith("data: ")){let E=f.slice(6).trim();if(E==="[DONE]")return;let y=null;try{y=JSON.parse(E)}catch{continue}if(y?.error)throw new Error(y.error);y?.token&&(yield y.token)}}}chatStreamCallback(e,t,n,o,s,d){this._doStream(e,t,n,o,s,d).catch(d)}cancelChatStream(){this._activeStreamReq&&(this._activeStreamReq.destroy(),this._activeStreamReq=null)}async _doStream(e,t,n,o,s,d){let i=this.getProvider()||null,c=i&&await this.resolveApiKey(i)||null,l=JSON.stringify({message:e,workspace_path:t,history:n,provider:i,api_key:c}),p=new URL(this.baseUrl+"/chat"),k={hostname:p.hostname,port:p.port,path:p.pathname,method:"POST",headers:{"Content-Type":"application/json",Accept:"text/event-stream","Content-Length":Buffer.byteLength(l)}},v=!1,f=()=>{v||(v=!0,this._activeStreamReq=null,s())},E=z.request(k,y=>{let te="";y.on("data",ne=>{te+=ne.toString();let se=te.split(`
`);te=se.pop()||"";for(let ie of se)if(ie.startsWith("data: ")){let ae=ie.slice(6).trim();if(ae==="[DONE]"){f();return}try{let j=JSON.parse(ae);j.token?o(j.token):j.error&&d(new Error(j.error))}catch{}}}),y.on("end",f),y.on("error",ne=>{this._activeStreamReq=null,d(ne)})});E.on("error",y=>{this._activeStreamReq=null,d(y)}),this._activeStreamReq=E,E.write(l),E.end()}};L.REQUEST_TIMEOUT_MS=3e4;var q=L;var U=m(require("vscode")),N=class r{constructor(e){this.disposables=[];this.panel=e,this.panel.onDidDispose(()=>this.dispose(),null,this.disposables),this.panel.webview.html=this.getLoadingHtml()}static createOrShow(e){let t=U.ViewColumn.One;if(r.currentPanel)return r.currentPanel.panel.reveal(t),r.currentPanel;let n=U.window.createWebviewPanel("genai.overview","Project Overview",t,{enableScripts:!0,retainContextWhenHidden:!0});return r.currentPanel=new r(n),r.currentPanel}async loadData(e,t){this.panel.webview.html=this.getLoadingHtml("Analyzing project...");try{let n=await e.scanProject(t);this.panel.webview.html=this.getContentHtml(n,t)}catch(n){this.panel.webview.html=this.getErrorHtml(String(n))}}getLoadingHtml(e="Loading..."){return`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <style>
    body {
      font-family: var(--vscode-font-family);
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      display: flex; align-items: center; justify-content: center;
      height: 100vh; margin: 0;
    }
    .loading { text-align: center; }
    .spinner {
      width: 40px; height: 40px;
      border: 3px solid var(--vscode-progressBar-background);
      border-top-color: var(--vscode-button-background);
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 16px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="loading">
    <div class="spinner"></div>
    <p>${e}</p>
  </div>
</body>
</html>`}getErrorHtml(e){return`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <style>
    body { font-family: var(--vscode-font-family); background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); padding: 20px; }
    .error { background: var(--vscode-inputValidation-errorBackground); border: 1px solid var(--vscode-inputValidation-errorBorder); padding: 16px; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="error">
    <h3>Error loading project overview</h3>
    <pre>${S(e)}</pre>
  </div>
</body>
</html>`}getContentHtml(e,t){let n=Object.entries(e.language_breakdown).sort((d,i)=>i[1]-d[1]).map(([d,i])=>`<div class="lang-item"><span class="lang-name">${S(d)}</span><span class="lang-count">${i}</span></div>`).join(""),o=Object.entries(e.dependencies).map(([d,i])=>`
        <div class="dep-section">
          <h4>${S(d)}</h4>
          <div class="dep-list">${i.slice(0,15).map(c=>`<span class="dep-badge">${S(c)}</span>`).join("")}</div>
        </div>`).join(""),s=xe(e.summary);return`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      padding: 20px;
      max-width: 900px;
    }
    h1 { color: var(--vscode-titleBar-activeForeground); font-size: 1.4em; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 8px; }
    h2 { font-size: 1.1em; color: var(--vscode-textLink-foreground); margin-top: 24px; }
    h3 { font-size: 1em; margin: 12px 0 4px; color: var(--vscode-textLink-foreground); }
    h4 { font-size: 0.95em; margin: 10px 0 4px; }
    .meta { color: var(--vscode-descriptionForeground); font-size: 0.9em; margin-bottom: 16px; }
    .summary-box {
      background: var(--vscode-textBlockQuote-background);
      border-left: 3px solid var(--vscode-textLink-foreground);
      padding: 16px 20px;
      border-radius: 0 4px 4px 0;
      line-height: 1.7;
    }
    .summary-box p { margin: 4px 0; }
    .summary-box ul, .summary-box ol { padding-left: 20px; margin: 4px 0 8px; }
    .summary-box li { margin: 3px 0; }
    .summary-box h3 { margin-top: 14px; }
    .summary-box code { background: var(--vscode-textCodeBlock-background); padding: 1px 4px; border-radius: 3px; font-family: monospace; font-size: 0.9em; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px; }
    .card {
      background: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 16px;
    }
    .lang-item { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid var(--vscode-panel-border); }
    .lang-count { font-weight: bold; color: var(--vscode-textLink-foreground); }
    .dep-badge {
      display: inline-block;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 0.85em;
      margin: 2px;
    }
    .dep-section { margin-bottom: 12px; }
    .dep-section h4 { margin: 0 0 6px; text-transform: capitalize; }
    .tree-box {
      background: var(--vscode-terminal-background);
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.85em;
      padding: 12px;
      border-radius: 4px;
      overflow-x: auto;
      max-height: 300px;
      overflow-y: auto;
      white-space: pre;
    }
    .readme-box {
      background: var(--vscode-textBlockQuote-background);
      padding: 16px;
      border-radius: 4px;
      max-height: 200px;
      overflow-y: auto;
      font-size: 0.9em;
      white-space: pre-wrap;
    }
    li { margin: 3px 0; }
  </style>
</head>
<body>
  <h1>Project Overview</h1>
  <p class="meta">${S(t)} &nbsp;\u2022&nbsp; ${e.file_count} code files</p>

  <h2>AI Summary</h2>
  <div class="summary-box">${s}</div>

  <div class="grid">
    <div class="card">
      <h2>Languages</h2>
      ${n||'<p style="color:var(--vscode-descriptionForeground)">No code files found</p>'}
    </div>
    <div class="card">
      <h2>Dependencies</h2>
      ${o||'<p style="color:var(--vscode-descriptionForeground)">No dependency files found</p>'}
    </div>
  </div>

  ${e.tree?`
  <h2>Project Structure</h2>
  <div class="tree-box">${S(e.tree.split(`
`).slice(0,80).join(`
`))}</div>
  `:""}

  ${e.readme_preview?`
  <h2>README</h2>
  <div class="readme-box">${S(e.readme_preview)}</div>
  `:""}
</body>
</html>`}dispose(){r.currentPanel=void 0,this.panel.dispose(),this.disposables.forEach(e=>e.dispose())}};function S(r){return r.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function xe(r){let e=r.split(`
`),t=[],n=!1;for(let o of e){let s=o.trimEnd();/^## (.+)/.test(s)?(n&&(t.push("</ul>"),n=!1),t.push(`<h3>${O(s.replace(/^## /,""))}</h3>`)):/^### (.+)/.test(s)?(n&&(t.push("</ul>"),n=!1),t.push(`<h4>${O(s.replace(/^### /,""))}</h4>`)):/^[-*] (.+)/.test(s)?(n||(t.push("<ul>"),n=!0),t.push(`<li>${O(s.replace(/^[-*] /,""))}</li>`)):/^\d+\. (.+)/.test(s)?(n||(t.push("<ol>"),n=!0),t.push(`<li>${O(s.replace(/^\d+\. /,""))}</li>`)):s.trim()===""?(n&&(t.push(n?"</ul>":"</ol>"),n=!1),t.push("<br>")):(n&&(t.push("</ul>"),n=!1),t.push(`<p>${O(s)}</p>`))}return n&&t.push("</ul>"),t.join(`
`)}function O(r){return S(r).replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/\*(.+?)\*/g,"<em>$1</em>").replace(/`(.+?)`/g,"<code>$1</code>")}var V=m(require("vscode"));function ke(){let r="",e="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";for(let t=0;t<32;t++)r+=e.charAt(Math.floor(Math.random()*e.length));return r}var Ce=`
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
  background: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.header {
  padding: 10px 16px;
  background: var(--vscode-titleBar-activeBackground, var(--vscode-sideBarSectionHeader-background));
  color: var(--vscode-titleBar-activeForeground, var(--vscode-foreground));
  border-bottom: 1px solid var(--vscode-panel-border);
  flex-shrink: 0;
}
.header h2 { font-size: 0.95em; font-weight: 600; }
.header small { font-size: 0.8em; opacity: 0.7; }
.messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.message {
  max-width: 90%;
  padding: 10px 14px;
  border-radius: 8px;
  line-height: 1.55;
  word-wrap: break-word;
}
.message.user {
  white-space: pre-wrap;
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  align-self: flex-end;
  border-radius: 8px 8px 2px 8px;
}
.message.assistant {
  background: var(--vscode-sideBar-background, var(--vscode-editor-background));
  border: 1px solid var(--vscode-panel-border);
  align-self: flex-start;
  border-radius: 2px 8px 8px 8px;
}
.message.assistant p { margin: 4px 0; }
.message.assistant ul, .message.assistant ol { padding-left: 20px; margin: 4px 0 8px; }
.message.assistant li { margin: 3px 0; }
.message.assistant h3 { font-size: 1em; margin: 10px 0 4px; color: var(--vscode-textLink-foreground); }
.message.assistant h4 { font-size: 0.95em; margin: 8px 0 4px; }
.message.assistant code {
  background: var(--vscode-textCodeBlock-background);
  padding: 1px 4px; border-radius: 3px;
  font-family: monospace; font-size: 0.88em;
}
.message.assistant pre {
  background: var(--vscode-terminal-background, #1e1e1e);
  padding: 10px 12px; border-radius: 4px;
  overflow-x: auto; margin: 8px 0;
}
.message.assistant pre code { background: none; padding: 0; font-size: 0.85em; }
.message.error {
  background: var(--vscode-inputValidation-errorBackground);
  border: 1px solid var(--vscode-inputValidation-errorBorder);
  color: var(--vscode-inputValidation-errorForeground);
  align-self: flex-start;
}
.cursor {
  display: inline-block; width: 2px; height: 1em;
  background: currentColor; vertical-align: text-bottom;
  animation: blink 1s step-end infinite;
}
@keyframes blink { 50% { opacity: 0; } }
.welcome {
  text-align: center;
  color: var(--vscode-descriptionForeground);
  margin: auto;
  padding: 32px 24px;
}
.welcome h3 { margin-bottom: 8px; font-size: 1.05em; }
.welcome p { margin-bottom: 16px; font-size: 0.9em; }
.suggestions { display: flex; flex-direction: column; gap: 8px; }
.sbtn {
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  border: 1px solid var(--vscode-button-border, var(--vscode-panel-border));
  padding: 8px 12px; border-radius: 4px;
  cursor: pointer; text-align: left;
  font-size: 0.88em; font-family: inherit;
}
.sbtn:hover { background: var(--vscode-button-secondaryHoverBackground); }
.input-area {
  padding: 10px 16px;
  border-top: 1px solid var(--vscode-panel-border);
  display: flex; gap: 8px; flex-shrink: 0;
  background: var(--vscode-editor-background);
}
#inp {
  flex: 1;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
  border-radius: 4px; padding: 7px 10px;
  font-family: inherit; font-size: inherit;
  resize: none; outline: none;
  min-height: 36px; max-height: 120px; line-height: 1.4;
}
#inp:focus { border-color: var(--vscode-focusBorder); }
#sendBtn {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border: none; border-radius: 4px;
  padding: 7px 14px; cursor: pointer;
  font-size: 0.9em; font-family: inherit;
  align-self: flex-end; white-space: nowrap;
}
#sendBtn:hover { background: var(--vscode-button-hoverBackground); }
#sendBtn:disabled { opacity: 0.45; cursor: not-allowed; }
`,Pe=`
(function () {
  const vscode = acquireVsCodeApi();
  const msgList  = document.getElementById('messages');
  const inp      = document.getElementById('inp');
  const sendBtn  = document.getElementById('sendBtn');

  let current   = null;
  let streaming = false;
  let response  = '';

  function scrollEnd() { msgList.scrollTop = msgList.scrollHeight; }

  function hideWelcome() {
    const w = document.getElementById('welcome');
    if (w) w.remove();
  }

  function send() {
    const text = inp.value.trim();
    if (!text || streaming) return;
    vscode.postMessage({ type: 'send', text: text });
    inp.value = '';
    inp.style.height = 'auto';
  }

  inp.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });

  inp.addEventListener('input', function () {
    inp.style.height = 'auto';
    inp.style.height = Math.min(inp.scrollHeight, 120) + 'px';
  });

  sendBtn.addEventListener('click', send);

  document.querySelectorAll('.sbtn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (streaming) return;
      var text = btn.textContent.trim();
      if (text) { vscode.postMessage({ type: 'send', text: text }); hideWelcome(); }
    });
  });

  window.addEventListener('message', function (ev) {
    var msg = ev.data;
    switch (msg.type) {

      case 'userMessage':
        hideWelcome();
        var uEl = document.createElement('div');
        uEl.className = 'message user';
        uEl.textContent = msg.text;
        msgList.appendChild(uEl);
        scrollEnd();
        break;

      case 'assistantStart':
        streaming = true;
        response  = '';
        sendBtn.disabled = true;
        current = document.createElement('div');
        current.className = 'message assistant';
        current.innerHTML = '<span class="cursor"></span>';
        msgList.appendChild(current);
        scrollEnd();
        break;

      case 'token':
        if (!current) break;
        response += msg.text;
        var cursor = current.querySelector('.cursor');
        if (cursor) cursor.insertAdjacentText('beforebegin', msg.text);
        else current.insertAdjacentText('beforeend', msg.text);
        scrollEnd();
        break;

      case 'done':
        streaming = false;
        sendBtn.disabled = false;
        if (current) current.innerHTML = renderMarkdown(response);
        response = '';
        current  = null;
        scrollEnd();
        break;

      case 'error':
        streaming = false;
        sendBtn.disabled = false;
        current = null;
        var eEl = document.createElement('div');
        eEl.className = 'message error';
        eEl.textContent = 'Error: ' + (msg.text || 'unknown error');
        msgList.appendChild(eEl);
        scrollEnd();
        break;
    }
  });

  // \u2500\u2500 Markdown renderer \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;')
            .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function inline(text) {
    return escHtml(text)
      .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
      .replace(/\\*(.+?)\\*/g, '<em>$1</em>')
      .replace(/\`([^\`]+)\`/g, '<code>$1</code>');
  }

  function renderMarkdown(text) {
    var lines    = text.split('\\n');
    var out      = [];
    var inList   = false, listTag = 'ul';
    var inCode   = false, codeLines = [];

    function closeList() {
      if (inList) { out.push('</' + listTag + '>'); inList = false; }
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].replace(/\\s+$/, '');

      if (line.indexOf('\`\`\`') === 0) {
        if (!inCode) { closeList(); inCode = true; codeLines = []; }
        else {
          out.push('<pre><code>' + codeLines.map(escHtml).join('\\n') + '</code></pre>');
          inCode = false;
        }
        continue;
      }
      if (inCode) { codeLines.push(line); continue; }

      if (/^## ./.test(line))       { closeList(); out.push('<h3>'  + inline(line.slice(3))  + '</h3>'); }
      else if (/^### ./.test(line)) { closeList(); out.push('<h4>'  + inline(line.slice(4))  + '</h4>'); }
      else if (/^[-*] ./.test(line)) {
        if (!inList || listTag !== 'ul') { closeList(); out.push('<ul>'); inList = true; listTag = 'ul'; }
        out.push('<li>' + inline(line.slice(2)) + '</li>');
      } else if (/^\\d+\\. ./.test(line)) {
        if (!inList || listTag !== 'ol') { closeList(); out.push('<ol>'); inList = true; listTag = 'ol'; }
        out.push('<li>' + inline(line.replace(/^\\d+\\. /, '')) + '</li>');
      } else if (!line.trim()) {
        closeList();
      } else {
        closeList();
        out.push('<p>' + inline(line) + '</p>');
      }
    }
    if (inCode) out.push('<pre><code>' + codeLines.map(escHtml).join('\\n') + '</code></pre>');
    if (inList) out.push('</' + listTag + '>');
    return out.join('\\n');
  }
})();
`,W=class r{constructor(e,t,n){this._disposables=[];this._history=[];this._panel=e,this._client=t,this._workspacePath=n,this._panel.webview.html=this._buildHtml(),this._panel.onDidDispose(()=>this.dispose(),null,this._disposables),this._panel.webview.onDidReceiveMessage(o=>this._onMessage(o),null,this._disposables)}static createOrShow(e,t){let n=V.ViewColumn.Beside;if(r.currentPanel)return r.currentPanel._client=e,r.currentPanel._workspacePath=t,r.currentPanel._panel.reveal(n),r.currentPanel;let o=V.window.createWebviewPanel("genai.chat","GenAI Chat",n,{enableScripts:!0,retainContextWhenHidden:!0,localResourceRoots:[]});return r.currentPanel=new r(o,e,t),r.currentPanel}_onMessage(e){try{e.type==="send"&&e.text?.trim()&&this._chat(e.text.trim())}catch(t){this._post({type:"error",text:String(t)})}}_chat(e){this._history.push({role:"user",content:e}),this._post({type:"userMessage",text:e}),this._post({type:"assistantStart"});let t="";this._client.chatStreamCallback(e,this._workspacePath,this._history.slice(-10),n=>{t+=n,this._post({type:"token",text:n})},()=>{this._history.push({role:"assistant",content:t}),this._post({type:"done"})},n=>{this._post({type:"error",text:n.message})})}_post(e){this._panel.webview.postMessage(e)}_buildHtml(){let e=ke(),t=this._workspacePath.split(/[/\\]/).pop()??this._workspacePath;return`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${e}';">
  <style>${Ce}</style>
</head>
<body>
  <div class="header">
    <h2>Project Chat</h2>
    <small>${t}</small>
  </div>

  <div class="messages" id="messages">
    <div class="welcome" id="welcome">
      <h3>Ask anything about your project</h3>
      <p>I have full context of <strong>${t}</strong></p>
      <div class="suggestions">
        <button class="sbtn">What does this project do?</button>
        <button class="sbtn">What are the main entry points?</button>
        <button class="sbtn">What dependencies does this project use?</button>
        <button class="sbtn">Where should I look to understand the AI pipeline?</button>
      </div>
    </div>
  </div>

  <div class="input-area">
    <textarea id="inp" placeholder="Ask about your project..." rows="1"></textarea>
    <button id="sendBtn">Send</button>
  </div>

  <script nonce="${e}">${Pe}</script>
</body>
</html>`}dispose(){for(r.currentPanel=void 0,this._client.cancelChatStream(),this._panel.dispose();this._disposables.length;){let e=this._disposables.pop();e&&e.dispose()}}};var K=m(require("vscode")),J=class r{constructor(e){this.disposables=[];this.panel=e,this.panel.onDidDispose(()=>this.dispose(),null,this.disposables)}static createOrShow(){let e=K.ViewColumn.Beside;if(r.currentPanel)return r.currentPanel.panel.reveal(e),r.currentPanel;let t=K.window.createWebviewPanel("genai.explain","Code Explanation",e,{enableScripts:!1,retainContextWhenHidden:!0});return r.currentPanel=new r(t),r.currentPanel}async loadExplanation(e,t,n,o){this.panel.webview.html=this.getLoadingHtml(n,o);try{let s=await e.explainCode(t,n,o);this.panel.webview.html=this.getContentHtml(s,t,n,o)}catch(s){this.panel.webview.html=this.getErrorHtml(String(s))}}getLoadingHtml(e,t){let n=t.split(/[/\\]/).pop()||t;return`<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<style>
  body { font-family: var(--vscode-font-family); background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); display: flex; align-items: center; justify-content: center; height: 100vh; }
  .spinner { width: 32px; height: 32px; border: 3px solid var(--vscode-panel-border); border-top-color: var(--vscode-button-background); border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 12px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .loading { text-align: center; }
</style></head>
<body><div class="loading"><div class="spinner"></div><p>Explaining ${P(e)} code in ${P(n)}...</p></div></body></html>`}getErrorHtml(e){return`<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<style>body { font-family: var(--vscode-font-family); background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); padding: 20px; } .error { background: var(--vscode-inputValidation-errorBackground); padding: 16px; border-radius: 4px; }</style>
</head><body><div class="error"><h3>Error</h3><pre>${P(e)}</pre></div></body></html>`}getContentHtml(e,t,n,o){let s=o.split(/[/\\]/).pop()||o,d={Low:"var(--vscode-terminal-ansiGreen)",Medium:"var(--vscode-terminal-ansiYellow)",High:"var(--vscode-terminal-ansiRed)"}[e.complexity]||"var(--vscode-editor-foreground)",i=e.key_points.map(p=>`<li>${P(p)}</li>`).join(""),c=e.suggestions.map(p=>`<li>${P(p)}</li>`).join(""),l=t.split(`
`).slice(0,30).join(`
`);return`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      padding: 20px;
      max-width: 800px;
    }
    h1 { font-size: 1.2em; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 8px; }
    h2 { font-size: 1em; color: var(--vscode-textLink-foreground); margin: 20px 0 8px; }
    .meta { color: var(--vscode-descriptionForeground); font-size: 0.9em; margin-bottom: 16px; }
    .complexity {
      display: inline-block;
      color: ${d};
      font-weight: bold;
      padding: 2px 8px;
      border: 1px solid ${d};
      border-radius: 10px;
      font-size: 0.85em;
    }
    .explanation {
      background: var(--vscode-textBlockQuote-background);
      border-left: 3px solid var(--vscode-textLink-foreground);
      padding: 16px;
      border-radius: 0 4px 4px 0;
      line-height: 1.6;
      white-space: pre-wrap;
    }
    .code-preview {
      background: var(--vscode-terminal-background);
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.85em;
      padding: 12px;
      border-radius: 4px;
      overflow-x: auto;
      white-space: pre;
      max-height: 200px;
      overflow-y: auto;
    }
    ul { padding-left: 20px; }
    li { margin: 6px 0; line-height: 1.4; }
    .suggestions li { color: var(--vscode-terminal-ansiYellow); }
  </style>
</head>
<body>
  <h1>Code Explanation</h1>
  <p class="meta">
    <strong>${P(s)}</strong> &nbsp;\u2022&nbsp; ${P(n)}
    &nbsp;\u2022&nbsp; Complexity: <span class="complexity">${e.complexity}</span>
  </p>

  <h2>Code</h2>
  <div class="code-preview">${P(l)}${t.split(`
`).length>30?`
... (truncated)`:""}</div>

  <h2>Explanation</h2>
  <div class="explanation">${P(e.explanation)}</div>

  ${i?`
  <h2>Key Points</h2>
  <ul>${i}</ul>
  `:""}

  ${c?`
  <h2>Suggestions</h2>
  <ul class="suggestions">${c}</ul>
  `:""}
</body>
</html>`}dispose(){r.currentPanel=void 0,this.panel.dispose(),this.disposables.forEach(e=>e.dispose())}};function P(r){return r.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}var Q=m(require("vscode")),Y=class r{constructor(e){this.disposables=[];this.panel=e,this.panel.onDidDispose(()=>this.dispose(),null,this.disposables)}static createOrShow(){let e=Q.ViewColumn.One;if(r.currentPanel)return r.currentPanel.panel.reveal(e),r.currentPanel;let t=Q.window.createWebviewPanel("genai.git","Git Insights",e,{enableScripts:!1,retainContextWhenHidden:!0});return r.currentPanel=new r(t),r.currentPanel}async loadData(e,t){this.panel.webview.html=this.getLoadingHtml();try{let n=await e.getGitInsights(t);this.panel.webview.html=this.getContentHtml(n)}catch(n){this.panel.webview.html=this.getErrorHtml(String(n))}}getLoadingHtml(){return`<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<style>body { font-family: var(--vscode-font-family); background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); display: flex; align-items: center; justify-content: center; height: 100vh; }
.spinner { width: 32px; height: 32px; border: 3px solid var(--vscode-panel-border); border-top-color: var(--vscode-button-background); border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 12px; }
@keyframes spin { to { transform: rotate(360deg); } }
.loading { text-align: center; }</style></head>
<body><div class="loading"><div class="spinner"></div><p>Loading git insights...</p></div></body></html>`}getErrorHtml(e){return`<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<style>body { font-family: var(--vscode-font-family); background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); padding: 20px; } .error { background: var(--vscode-inputValidation-errorBackground); padding: 16px; border-radius: 4px; }</style>
</head><body><div class="error"><h3>Error</h3><pre>${$(e)}</pre></div></body></html>`}getContentHtml(e){if(e.error)return this.getErrorHtml(e.error);let t=e.commits.slice(0,15).map(s=>{let d=s.files_changed.slice(0,5).map(i=>`<span class="file-badge">${$(i)}</span>`).join("");return`
      <div class="commit">
        <div class="commit-header">
          <span class="commit-hash">${$(s.hash)}</span>
          <span class="commit-msg">${$(s.message.split(`
`)[0])}</span>
        </div>
        <div class="commit-meta">
          <span>${$(s.author)}</span>
          <span>${new Date(s.date).toLocaleDateString()}</span>
        </div>
        ${d?`<div class="commit-files">${d}</div>`:""}
      </div>`}).join(""),n=e.uncommitted_changes.slice(0,10).map(s=>`<div class="uncommitted-item">\u2022 ${$(s)}</div>`).join(""),o=e.ai_summary?Se(e.ai_summary):"";return`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      padding: 20px;
      max-width: 900px;
    }
    h1 { font-size: 1.2em; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 8px; }
    h2 { font-size: 1em; color: var(--vscode-textLink-foreground); margin: 20px 0 8px; }
    .branch-badge {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 3px 10px;
      border-radius: 10px;
      font-size: 0.9em;
      font-family: monospace;
    }
    .summary-box {
      background: var(--vscode-textBlockQuote-background);
      border-left: 3px solid var(--vscode-textLink-foreground);
      padding: 16px 20px;
      border-radius: 0 4px 4px 0;
      line-height: 1.7;
    }
    .summary-box p { margin: 4px 0; }
    .summary-box ul, .summary-box ol { padding-left: 20px; margin: 4px 0 8px; }
    .summary-box li { margin: 3px 0; }
    .summary-box h3 { margin-top: 14px; color: var(--vscode-textLink-foreground); }
    .summary-box code { background: var(--vscode-textCodeBlock-background); padding: 1px 4px; border-radius: 3px; font-family: monospace; font-size: 0.9em; }
    .commit {
      background: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 8px;
    }
    .commit-header { display: flex; gap: 10px; align-items: baseline; margin-bottom: 4px; }
    .commit-hash { font-family: monospace; color: var(--vscode-terminal-ansiCyan); font-size: 0.85em; flex-shrink: 0; }
    .commit-msg { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .commit-meta { color: var(--vscode-descriptionForeground); font-size: 0.85em; display: flex; gap: 16px; }
    .commit-files { margin-top: 6px; }
    .file-badge {
      display: inline-block;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 1px 6px;
      border-radius: 3px;
      font-size: 0.8em;
      font-family: monospace;
      margin: 2px;
    }
    .uncommitted-item { font-family: monospace; font-size: 0.9em; color: var(--vscode-terminal-ansiYellow); margin: 3px 0; }
  </style>
</head>
<body>
  <h1>Git Insights &nbsp;<span class="branch-badge">${$(e.branch)}</span></h1>

  ${e.uncommitted_changes.length>0?`
  <h2>Uncommitted Changes (${e.uncommitted_changes.length})</h2>
  <div>${n}</div>
  `:""}

  ${o?`
  <h2>AI Summary</h2>
  <div class="summary-box">${o}</div>
  `:""}

  <h2>Recent Commits (${e.commits.length})</h2>
  ${t||'<p style="color:var(--vscode-descriptionForeground)">No commits found</p>'}
</body>
</html>`}dispose(){r.currentPanel=void 0,this.panel.dispose(),this.disposables.forEach(e=>e.dispose())}};function $(r){return r.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function Se(r){let e=r.split(`
`),t=[],n=!1;for(let o of e){let s=o.trimEnd();/^## (.+)/.test(s)?(n&&(t.push("</ul>"),n=!1),t.push(`<h3>${M(s.replace(/^## /,""))}</h3>`)):/^### (.+)/.test(s)?(n&&(t.push("</ul>"),n=!1),t.push(`<h4>${M(s.replace(/^### /,""))}</h4>`)):/^[-*] (.+)/.test(s)?(n||(t.push("<ul>"),n=!0),t.push(`<li>${M(s.replace(/^[-*] /,""))}</li>`)):/^\d+\. (.+)/.test(s)?(n||(t.push("<ol>"),n=!0),t.push(`<li>${M(s.replace(/^\d+\. /,""))}</li>`)):s.trim()===""?(n&&(t.push("</ul>"),n=!1),t.push("<br>")):(n&&(t.push("</ul>"),n=!1),t.push(`<p>${M(s)}</p>`))}return n&&t.push("</ul>"),t.join(`
`)}function M(r){return $(r).replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/\*(.+?)\*/g,"<em>$1</em>").replace(/`(.+?)`/g,"<code>$1</code>")}var h=m(require("vscode")),$e={created:new h.ThemeIcon("diff-added",new h.ThemeColor("gitDecoration.addedResourceForeground")),modified:new h.ThemeIcon("edit",new h.ThemeColor("gitDecoration.modifiedResourceForeground")),deleted:new h.ThemeIcon("diff-removed",new h.ThemeColor("gitDecoration.deletedResourceForeground")),moved:new h.ThemeIcon("diff-renamed")},re=class extends h.TreeItem{constructor(e){let t=e.path.split(/[/\\]/).pop()||e.path,n=Ie(e.timestamp);super(`${t}`,h.TreeItemCollapsibleState.None),this.description=n,this.tooltip=`${e.event_type}: ${e.path}
${new Date(e.timestamp).toLocaleTimeString()}`,this.iconPath=$e[e.event_type]||new h.ThemeIcon("file"),this.command={command:"vscode.open",title:"Open File",arguments:[h.Uri.file(e.path)]}}},X=class{constructor(e){this._onDidChangeTreeData=new h.EventEmitter;this.onDidChangeTreeData=this._onDidChangeTreeData.event;this.items=[];this.refreshInterval=null;this.client=e}getTreeItem(e){return e}getChildren(){return this.items.slice().reverse().map(e=>new re(e))}startAutoRefresh(e=5e3){this.refreshInterval=setInterval(()=>this.refresh(),e)}stopAutoRefresh(){this.refreshInterval&&(clearInterval(this.refreshInterval),this.refreshInterval=null)}async refresh(){try{this.items=await this.client.getActivity(50),this._onDidChangeTreeData.fire()}catch{}}dispose(){this.stopAutoRefresh(),this._onDidChangeTreeData.dispose()}};function Ie(r){let e=Date.now()-new Date(r).getTime(),t=Math.floor(e/6e4);if(t<1)return"just now";if(t<60)return`${t}m ago`;let n=Math.floor(t/60);return n<24?`${n}h ago`:`${Math.floor(n/24)}d ago`}var u=m(require("vscode"));var ue={TODO:new u.ThemeColor("gitDecoration.modifiedResourceForeground"),FIXME:new u.ThemeColor("editorError.foreground"),HACK:new u.ThemeColor("editorWarning.foreground"),BUG:new u.ThemeColor("editorError.foreground"),NOTE:new u.ThemeColor("gitDecoration.addedResourceForeground"),XXX:new u.ThemeColor("editorWarning.foreground")},Z=class extends u.TreeItem{constructor(t,n){super(`${t} (${n.length})`,u.TreeItemCollapsibleState.Expanded);this.tag=t;this.children=n;this.iconPath=new u.ThemeIcon("symbol-constant",ue[t]),this.contextValue="tagGroup"}},oe=class extends u.TreeItem{constructor(t,n){let o=t.text||t.file;super(o||`line ${t.line}`,u.TreeItemCollapsibleState.None);this.raw=t;this.workspacePath=n;this.description=`${t.file}:${t.line}`,this.tooltip=t.context,this.iconPath=new u.ThemeIcon("circle-small-filled",ue[t.tag]),this.contextValue="todoItem";let s=u.Uri.file(`${n}/${t.file}`);this.command={command:"vscode.open",title:"Open",arguments:[s,{selection:new u.Range(t.line-1,0,t.line-1,0)}]}}},ee=class{constructor(e,t){this._onDidChangeTreeData=new u.EventEmitter;this.onDidChangeTreeData=this._onDidChangeTreeData.event;this.groups=[];this.totalCount=0;this.client=e,this.workspacePath=t}getTreeItem(e){return e}getChildren(e){return e?e instanceof Z?e.children:[]:this.groups}async refresh(){try{let e=await this.client.getTodos(this.workspacePath),t=e.by_tag;this.totalCount=e.total,this.groups=Object.entries(t).sort((n,o)=>o[1].length-n[1].length).map(([n,o])=>{let s=o.map(d=>new oe(d,this.workspacePath));return new Z(n,s)}),this._onDidChangeTreeData.fire()}catch{}}get count(){return this.totalCount}dispose(){this._onDidChangeTreeData.dispose()}};var w,x,_,A,g;async function Ee(r){let e=a.window.createOutputChannel("GenAI Insights Backend");r.subscriptions.push(e);let t=a.workspace.getConfiguration("genai"),n=t.get("backendPort",8765),o=t.get("autoStartBackend",!0),s=t.get("provider","groq");await he(r.secrets,s),x=new q(n,e,r.secrets),g=a.window.createStatusBarItem(a.StatusBarAlignment.Right,100),g.command="genai.pickProvider",I("starting"),g.show(),r.subscriptions.push(g),w=new G(r.extensionPath,n,e),r.subscriptions.push({dispose:()=>w?.dispose()}),o?w.ensureRunning().then(()=>{I("ready");let i=B();i&&(x?.startWatching(i).catch(()=>{}),_?.startAutoRefresh())}).catch(i=>{I("error"),e.appendLine(`[Extension] Backend start failed: ${i.message}`)}):I("stopped");let d=B();d&&x&&(_=new X(x),A=new ee(x,d),r.subscriptions.push(a.window.registerTreeDataProvider("genai.activityView",_),a.window.registerTreeDataProvider("genai.todoView",A)),r.subscriptions.push(_,A)),r.subscriptions.push(a.commands.registerCommand("genai.scanProject",async()=>{if(!D())return;let i=B();if(!i){a.window.showErrorMessage("GenAI: No workspace folder open.");return}await w?.onReady.catch(()=>{}),await N.createOrShow(r).loadData(x,i)})),r.subscriptions.push(a.commands.registerCommand("genai.explainCode",async()=>{if(!D())return;let i=a.window.activeTextEditor;if(!i){a.window.showInformationMessage("GenAI: Open a file and select code to explain.");return}let c=i.selection,l=i.document.getText(c.isEmpty?void 0:c);if(!l.trim()){a.window.showInformationMessage("GenAI: Select some code to explain.");return}await w?.onReady.catch(()=>{}),await J.createOrShow().loadExplanation(x,l,i.document.languageId,i.document.fileName)})),r.subscriptions.push(a.commands.registerCommand("genai.openChat",async()=>{if(!D())return;let i=B();if(!i){a.window.showErrorMessage("GenAI: No workspace folder open.");return}await w?.onReady.catch(()=>{}),W.createOrShow(x,i)})),r.subscriptions.push(a.commands.registerCommand("genai.gitInsights",async()=>{if(!D())return;let i=B();if(!i){a.window.showErrorMessage("GenAI: No workspace folder open.");return}await w?.onReady.catch(()=>{}),await Y.createOrShow().loadData(x,i)})),r.subscriptions.push(a.commands.registerCommand("genai.findTodos",async()=>{if(!D())return;if(!B()){a.window.showErrorMessage("GenAI: No workspace folder open.");return}await w?.onReady.catch(()=>{}),a.window.withProgress({location:a.ProgressLocation.Notification,title:"GenAI: Scanning for TODOs..."},async()=>{await A?.refresh();let c=A?.count??0;a.window.showInformationMessage(`GenAI: Found ${c} TODO/FIXME items. Check the sidebar.`)})})),r.subscriptions.push(a.commands.registerCommand("genai.pickProvider",async()=>{let i=["groq","gemini","pluralsight","anthropic","openai","ollama"],c=a.workspace.getConfiguration("genai").get("provider","groq"),l=await a.window.showQuickPick(i.map(p=>({label:p,description:p===c?"(current)":"",picked:p===c})),{title:"Select AI Provider",placeHolder:"Choose your AI provider"});l&&(await a.workspace.getConfiguration("genai").update("provider",l.label,a.ConfigurationTarget.Global),await he(r.secrets,l.label),I("ready"),a.window.showInformationMessage(`GenAI: Switched to ${l.label}`))})),r.subscriptions.push(a.commands.registerCommand("genai.startBackend",async()=>{I("starting");try{await w?.restart(),I("ready"),a.window.showInformationMessage("GenAI: Backend restarted successfully.")}catch(i){I("error"),a.window.showErrorMessage(`GenAI: Failed to start backend: ${i}`)}})),r.subscriptions.push(a.commands.registerCommand("genai.setApiKey",async()=>{let i=["groq","gemini","pluralsight","anthropic","openai"],c=await a.window.showQuickPick(i,{title:"GenAI: Set API Key",placeHolder:"Select a provider to set or rotate its API key"});if(!c)return;let l=await a.window.showInputBox({title:`GenAI: ${c} API Key`,prompt:`Enter your ${c} API key (it will be stored in VS Code SecretStorage, never in plaintext)`,password:!0,ignoreFocusOut:!0,placeHolder:`Paste your ${c} API key here`});l?.trim()&&(await r.secrets.store(`${c}-api-key`,l.trim()),a.window.showInformationMessage(`GenAI: ${c} API key saved securely.`))})),e.appendLine("[Extension] GenAI Project Insights activated.")}function Te(){w?.dispose(),_?.dispose(),A?.dispose()}function B(){return a.workspace.workspaceFolders?.[0]?.uri.fsPath}function D(){return x?!0:(a.window.showErrorMessage("GenAI: Extension not fully initialized."),!1)}async function he(r,e){if(e==="ollama"||await r.get(`${e}-api-key`))return;let n=await a.window.showInputBox({title:`GenAI: ${e} API Key Required`,prompt:`Enter your ${e} API key. It will be stored securely in VS Code SecretStorage.`,password:!0,ignoreFocusOut:!0,placeHolder:`Paste your ${e} API key here`});n?.trim()&&await r.store(`${e}-api-key`,n.trim())}function I(r){if(!g)return;let t=a.workspace.getConfiguration("genai").get("provider","groq");switch(r){case"starting":g.text="$(loading~spin) GenAI: starting...",g.tooltip="GenAI Insights backend is starting",g.backgroundColor=void 0;break;case"ready":g.text=`$(sparkle) GenAI: ${t}`,g.tooltip=`GenAI Insights ready \u2014 provider: ${t}
Click to switch provider`,g.backgroundColor=void 0;break;case"error":g.text="$(error) GenAI: error",g.tooltip="GenAI backend failed to start. Check output channel.",g.backgroundColor=new a.ThemeColor("statusBarItem.errorBackground");break;case"stopped":g.text="$(circle-slash) GenAI: stopped",g.tooltip="GenAI backend is not running. Run 'GenAI: Start Backend Server'.",g.backgroundColor=void 0;break}}0&&(module.exports={activate,deactivate});
