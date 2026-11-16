(async () => {
  try {
    const targets = await fetch("http://127.0.0.1:9229/json").then(r => r.json());
    console.log("targets count:", targets.length);
    for (const t of targets) {
      console.log("-", t.type, "|", t.title, "|", t.url);
    }
    const main = targets.find(t => t.type === "page" && !t.url.includes("splash"));
    if (!main) {
      console.log("no main page found");
      return;
    }
    const ws = new WebSocket(main.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = rej;
    });

    let msgId = 1;
    const send = (method, params = {}) => new Promise(res => {
      const cur = msgId++;
      const onmsg = (evt) => {
        const data = JSON.parse(evt.data);
        if (data.id === cur) {
          ws.removeEventListener("message", onmsg);
          res(data.result);
        }
      };
      ws.addEventListener("message", onmsg);
      ws.send(JSON.stringify({ id: cur, method, params }));
    });

    const evalRes = await send("Runtime.evaluate", {
      expression: "JSON.stringify({ title: document.title, url: location.href, text: document.body ? document.body.innerText : '', hasRetry: !!document.getElementById('retry-btn'), countdown: document.getElementById('countdown') ? document.getElementById('countdown').textContent : '' })",
      returnByValue: true
    });
    console.log("PAGE STATE:\n" + evalRes.result.value);
    ws.close();
  } catch (err) {
    console.error("CDP probe error:", err);
  }
})();
