import"./modulepreload-polyfill-B5Qt9EMX.js";import{$ as t}from"./dom-DVBP1AyA.js";const l="https://remiclassic.github.io/ares-cyber-games/",o=[{id:"title",kind:"title",html:`
      <p class="kicker">Ares Cyber Games · Briefing</p>
      <h1>Judgement under constraints</h1>
      <p class="lede">Two flagship games, and why they teach what missions test.</p>
      <div class="pair"><span>Blast Radius</span><i>+</i><span>Defense in Depth</span></div>
      <p class="byline">Rémi Couture</p>`,say:"This briefing covers two games from the Ares Cyber Games set: Blast Radius, and Defense in Depth. Between them they cover both halves of security judgement. One is the analyst's judgement during an incident. The other is the architect's judgement before one."},{id:"thesis",kind:"content",html:`
      <p class="kicker">The thesis</p>
      <h2>Most security training checks recall.<br><em>These check decisions.</em></h2>
      <div class="cols2">
        <div class="card"><b>The game can't be won without the knowledge</b><p>No timing, no reflexes, no lucky clicking. The mechanic <em>is</em> the skill.</p></div>
        <div class="card"><b>The lazy strategy provably loses</b><p>Automated tests show that “isolate everything” and “block everything” score badly, every time.</p></div>
      </div>
      <blockquote>These aren't quizzes with graphics. Each one is a small simulation where the scoring rule is the lesson.</blockquote>`,say:"Most security training checks whether people know something. These games check whether people can decide, with incomplete information and limited resources, which is the actual job. Two principles sit under both. First, the game cannot be won without the knowledge: there is no timing, no reflex, no lucky clicking. Second, the lazy strategy provably loses. Isolating everything, or blocking everything, scores badly, and there are automated tests that prove it. In short, these are not quizzes with graphics. Each one is a small simulation in which the scoring rule is the lesson."},{id:"br-section",kind:"section",video:{loop:"videos/briefing/br-a.mp4",broll:"blast-radius",start:14},html:`
      <p class="kicker">Game one</p>
      <h2 class="big">Blast Radius</h2>
      <p class="lede">Scoping before containment.</p>`,say:"Game one. Blast Radius. It teaches the step that sits between “we have an alert”, and “pull the plug”. That step is scoping."},{id:"br-loop",kind:"content",video:{loop:"videos/briefing/br-b.mp4",broll:"blast-radius",start:26},html:`
      <p class="kicker">Blast Radius · The loop</p>
      <h2>A stolen account is beaconing. How far has it spread?</h2>
      <ul class="steps">
        <li><b>Cheap sensors</b> · DNS forwarders, proxy pools, network IDS, VPN logs. They report <em>how many</em> hosts show the indicator, never <em>which</em>.</li>
        <li><b>Expensive triage</b> · confirms one host, for 20 minutes of a fixed case budget.</li>
        <li><b>Decide every host</b> · Isolate, Keep online, or Watch.</li>
      </ul>`,say:"A stolen service account is beaconing to a command and control domain. The player has two kinds of evidence. Cheap sensors, such as DNS forwarders, proxy pools and network intrusion detection, report how many hosts behind them show the indicator, but never which ones. And expensive host triage confirms a single machine, at twenty minutes against a fixed budget. Then every host must be decided: isolate it, keep it online, or watch it."},{id:"br-inference",kind:"content",html:`
      <p class="kicker">Blast Radius · Why it is serious</p>
      <h2>It teaches inference, not detection.</h2>
      <div class="diagram">
        <div class="sensor">DNS forwarder<b>counts 1</b></div>
        <div class="hosts"><span>Laptop</span><span>Laptop</span><span class="shared">Front desk PC</span><span>Scanner</span><span>Office PC</span></div>
        <div class="sensor">Proxy NAT<b>counts 1</b></div>
      </div>
      <p class="note">Which single host explains both counts? Real telemetry is often aggregate: NAT hides the source, forwarders hide the client, logs roll over.</p>`,say:"The core skill is inference from partial, aggregate data. If the DNS forwarder counts one, and the proxy counts one, which single host explains both? That is constraint reasoning, and it mirrors real scoping, where network address translation hides the source, forwarders hide the client, and logs roll over before you need them."},{id:"br-justified",kind:"content",html:`
      <p class="kicker">Blast Radius · Graded on justification</p>
      <h2>It separates being right from being justified.</h2>
      <div class="stats">
        <div><b>100</b><span>a correct answer the evidence proves</span></div>
        <div><b>70</b><span>the same answer, reached by guessing</span></div>
        <div><b>×3</b><span>cost of wrongly isolating a clean domain controller or payroll database</span></div>
      </div>
      <ul class="points">
        <li>“Known” is exact: the game checks <em>every</em> arrangement of compromised hosts consistent with the evidence.</li>
        <li>“Watch” earns credit only when the evidence truly can't decide, <em>and</em> the sensors covering that host were read.</li>
      </ul>`,say:"Here is the point to stress. The game defines what is known exactly. It checks every possible arrangement of compromised hosts that fits the evidence, and a host counts as known only if all of them agree. That lets the scoring separate a right answer you proved from a right answer you guessed. A correct deduction scores one hundred. The same answer by guessing scores seventy. Honest uncertainty is rewarded too, but only after you have looked. And over-containment is a real failure: wrongly isolating a clean domain controller costs three times as much as a workstation."},{id:"br-proof",kind:"content",video:{loop:"videos/briefing/br-c.mp4",broll:"blast-radius",start:52},html:`
      <p class="kicker">Blast Radius · Information has a price</p>
      <h2>Which check would settle the most?</h2>
      <ul class="points">
        <li><b>Value of information.</b> Triage is scarce, so the learner must choose the host whose answer settles the most.</li>
        <li><b>Proved by tests.</b> Isolate-all, keep-all and watch-all each stay under 60. Every case is solvable within its budget.</li>
        <li><b>Anchored in practice.</b> The detection, analysis and containment phases of NIST incident-handling guidance.</li>
        <li class="limit"><b>Honest limit.</b> Sensors are perfectly accurate today. A noisy sensor, to teach corroboration, is next.</li>
      </ul>`,say:"Information also has a price. Triage is scarce, so the learner has to ask which host would settle the most if checked. That is value of information thinking, a core analyst skill that is rarely taught directly. The balance is proved by tests: isolating everything, keeping everything, or watching everything each stay under sixty. The honest limit is that the sensors are perfectly accurate. A noisy sensor, to teach corroboration, is the natural next step."},{id:"did-section",kind:"section",video:{loop:"videos/briefing/did-a.mp4",broll:"defense-in-depth",start:11},html:`
      <p class="kicker">Game two</p>
      <h2 class="big">Defense in Depth</h2>
      <p class="lede">Resilience against an adaptive attacker.</p>`,say:"Game two. Defense in Depth. If Blast Radius is the analyst during an incident, this is the architect before one."},{id:"did-loop",kind:"content",video:{loop:"videos/briefing/did-b.mp4",broll:"defense-in-depth",start:42},html:`
      <p class="kicker">Defense in Depth · The loop</p>
      <h2>Three waves. One budget. Five stages to defend.</h2>
      <ul class="steps">
        <li><b>Place controls</b> across initial access, execution, credential access, lateral movement and impact.</li>
        <li><b>Each control has a stated effect</b> on named techniques: it blocks, detects, or helps you recover.</li>
        <li><b>Run the wave</b> and watch every campaign move through the stages.</li>
      </ul>`,say:"Over three waves, Monday, Wednesday and Friday, the player spends a limited budget placing controls across a five stage attack chain: initial access, execution, credential access, lateral movement, and impact. Every control has a stated effect on named techniques. It blocks, it detects, or it helps you recover. Then the campaigns run, step by step."},{id:"did-n1",kind:"content",html:`
      <p class="kicker">Defense in Depth · The slogan, made testable</p>
      <h2>What still holds if this control fails?</h2>
      <div class="flow"><span>Stop found</span><i>→</i><span>Remove the control that made it</span><i>→</i><span>Re-run the attack</span><i>→</i><span class="ok">Still stopped? Resilient.</span></div>
      <p class="note">The N-1 principle from reliability engineering: the system must survive the failure of any single component.</p>
      <blockquote>“If Block macros in files from the internet failed, what would stop the invoice lure?”</blockquote>`,say:"This is what turns defence in depth from a slogan into a test. After every wave, each stop is checked by re-running the attack without the control that made it. If the attack now gets through, that control was a single point of failure. It is the N minus one principle from reliability engineering: survive the failure of any one component. And the reasoning check asks the learner exactly that question, then answers it by simulation, not by opinion."},{id:"did-adapt",kind:"content",video:{loop:"videos/briefing/did-c.mp4",broll:"defense-in-depth",start:69},html:`
      <p class="kicker">Defense in Depth · The attacker adapts</p>
      <h2>Monday rewards a checklist.<br><em>Wednesday punishes anyone who only has one.</em></h2>
      <ul class="points">
        <li>Block the first choice, and the actor takes the next: a disk-image lure once macros are blocked, a relay sign-in page once passwords stop working.</li>
        <li>The defender commits first; the attacker responds. Static plans fail against that.</li>
        <li>A perimeter-only plan scores <b>74</b>. A layered one scores <b>100</b>.</li>
      </ul>`,say:"The attacker adapts. From Wednesday, when a control blocks the first choice, the actor takes the next one: a disk image lure once macros are blocked, a relay sign in page once passwords stop working. In game theory terms, the defender commits first, and the attacker best responds. A perimeter only plan scores seventy four. A layered plan scores one hundred. Monday rewards a good checklist. Wednesday punishes anyone who only has a checklist."},{id:"did-distinctions",kind:"content",html:`
      <p class="kicker">Defense in Depth · Three distinctions people blur</p>
      <h2>Detection, recovery and cost, kept honest.</h2>
      <div class="cols3">
        <div class="card"><b>Detection is not protection</b><p>An alert does nothing without 24×7 response, and containment lands one stage later.</p></div>
        <div class="card"><b>Recovery is not prevention</b><p>Offline backups limit ransomware damage. The encryption still happens.</p></div>
        <div class="card"><b>Footholds always cost</b><p>Any successful initial access costs damage, so stopping early matters.</p></div>
      </div>
      <p class="note"><b>Friction is a budget too.</b> Each control carries a business cost with a reason. Controls people work around protect nothing.</p>`,say:"The game also encodes three distinctions people routinely blur. Detection is not protection: an alert does nothing without someone to respond, and even then, containment lands one stage later. Recovery is not prevention: backups limit ransomware damage, but the encryption still happens. And footholds always cost something, so stopping attacks early matters. Finally, friction is a budget. Every control carries a business cost with a reason, because, as usable security research has long shown, controls that people work around protect nothing."},{id:"did-proof",kind:"content",html:`
      <p class="kicker">Defense in Depth · Validated, and reviewable</p>
      <h2>How do we know the scoring is right?</h2>
      <div class="stats four">
        <div><b>25</b><span>do nothing</span></div>
        <div><b>74</b><span>perimeter only</span></div>
        <div><b>88</b><span>interior only</span></div>
        <div><b>100</b><span>the layered reference plan, in both attacker behaviours</span></div>
      </div>
      <ul class="points">
        <li>Every effect is an explicit technique-to-control table, using MITRE ATT&amp;CK ids, that an expert can approve line by line.</li>
        <li>Anchored in ATT&amp;CK and D3FEND, NIST cyber-resiliency engineering, and the protect, detect, respond, recover functions.</li>
        <li class="limit"><b>Honest limit.</b> The attacker always knows what is blocked. Effects and timings await expert review.</li>
      </ul>`,say:"How do we know the scoring is right? Each wave has a hand built reference plan that scores one hundred under both attacker behaviours. Doing nothing scores twenty five, perimeter only seventy four, interior only eighty eight, and buying everything is impossible on the budget. All of that is automated tests. And every effect is an explicit technique to control table, using MITRE ATT and CK identifiers, that an expert can approve line by line. The honest limit: the attacker always knows what is blocked, and the effects still await expert review."},{id:"together",kind:"content",html:`
      <p class="kicker">Why these two, together</p>
      <h2>Two halves of security judgement.</h2>
      <table class="cmp">
        <tr><th></th><th>Blast Radius</th><th>Defense in Depth</th></tr>
        <tr><td>Role</td><td>Analyst, during an incident</td><td>Architect, before one</td></tr>
        <tr><td>Core judgement</td><td>What does the evidence prove?</td><td>What still holds if this fails?</td></tr>
        <tr><td>Scarce resource</td><td>Triage time</td><td>Budget and business friction</td></tr>
        <tr><td>What it punishes</td><td>Guessing; over-containing</td><td>Single points of failure; detection with no response</td></tr>
        <tr><td>Built-in proof</td><td>Every possible arrangement checked</td><td>Each attack re-run without each control</td></tr>
      </table>`,say:"Put side by side, they are two halves of the same judgement. Blast Radius asks: what does the evidence prove? Defense in Depth asks: what still holds if this fails? One is limited by triage time, the other by budget and business friction. One punishes guessing and over-containment, the other single points of failure and detection with no response. And each carries its own built in proof."},{id:"close",kind:"close",html:`
      <p class="kicker">In one line</p>
      <h2 class="big">Judgement under constraints.<br><em>In a browser. In five minutes.</em></h2>
      <p class="lede">The thing missions are designed to test, with no range to spin up.</p>
      <div class="links"><a href="${l}blastradius.html" target="_blank" rel="noopener">Play Blast Radius ↗</a><a href="${l}defense.html" target="_blank" rel="noopener">Play Defense in Depth ↗</a></div>
      <p class="byline">remiclassic.github.io/ares-cyber-games</p>`,say:"Both games measure judgement under constraints, which is exactly what missions are designed to test. But they run in a browser, in about five minutes, with no range to spin up. Both are playable now, at the address on screen."}],u=new URLSearchParams(location.search),c=u.get("render"),d=t("#stage");let s=0;function h(e,a){const i=o[e],p=i.video?`<div class="vbox" id="vbox">${a?"":`<video src="${i.video.loop}" muted loop autoplay playsinline aria-hidden="true"></video>`}</div>`:"";return`<article class="slide ${i.kind}${i.video?" has-video":""}">
    <div class="body">${i.html}</div>${p}
    <footer class="foot"><span>Ares Cyber Games · Briefing</span><span>${e+1} / ${o.length}</span></footer>
  </article>`}function r(){const e=t("#viewport");d.style.transform=`scale(${e.clientWidth/1920})`}function n(e){s=Math.max(0,Math.min(o.length-1,e)),d.innerHTML=h(s,!1),t("#count").textContent=`${s+1} / ${o.length}`,t("#notes").textContent=o[s].say,t("#prev").disabled=s===0,t("#next").disabled=s===o.length-1,history.replaceState(null,"",`#${s+1}`)}c?(document.body.className="render",document.body.innerHTML=`<div class="stage">${h(Number(c)-1,!0)}</div>`):(t("#prev").addEventListener("click",()=>n(s-1)),t("#next").addEventListener("click",()=>n(s+1)),t("#full").addEventListener("click",()=>{var e,a;return void((a=(e=t("#viewport")).requestFullscreen)==null?void 0:a.call(e))}),t("#viewport").addEventListener("click",e=>{e.target.closest("a")||n(s+1)}),document.addEventListener("keydown",e=>{var a,i;e.target.closest("video, input")||(e.key==="ArrowRight"||e.key===" "||e.key==="PageDown"?(e.preventDefault(),n(s+1)):e.key==="ArrowLeft"||e.key==="PageUp"?(e.preventDefault(),n(s-1)):e.key==="Home"?n(0):e.key==="End"?n(o.length-1):e.key.toLowerCase()==="f"&&((i=(a=t("#viewport")).requestFullscreen)==null||i.call(a)))}),new ResizeObserver(r).observe(t("#viewport")),document.addEventListener("fullscreenchange",r),n(Number(location.hash.slice(1))-1||0),r());
