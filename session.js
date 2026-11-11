(() => {
  const parts = location.pathname.split("/");
  const room = parts[2];
  const role = new URLSearchParams(location.search).get("role");
  const status = document.querySelector("#status");
  const message = document.querySelector("#message");
  const shareControls = document.querySelector("#shareControls");
  const viewControls = document.querySelector("#viewControls");
  const start = document.querySelector("#start");
  const stop = document.querySelector("#stop");
  const video = document.querySelector("#remoteVideo");

  if (!room || !["share", "view"].includes(role)) {
    status.textContent = "Link inválido."; return;
  }

  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${location.host}/signal?room=${room}&role=${role}`);
  let pc = null;
  let localStream = null;
  let peerReady = false;

  const setStatus = text => status.textContent = text;
  const send = data => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data)); };

  function makePeer() {
    if (pc) return pc;
    pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });
    pc.onicecandidate = e => { if (e.candidate) send({ type: "ice", candidate: e.candidate }); };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setStatus(role === "share" ? "Tela compartilhada com segurança." : "Conectado — recebendo tela.");
        stop.classList.remove("hidden");
      } else if (["failed", "disconnected"].includes(pc.connectionState)) {
        setStatus("Conexão interrompida. Verifique a rede e tente novamente.");
      }
    };
    pc.ontrack = e => { video.srcObject = e.streams[0]; };
    return pc;
  }

  socket.onopen = () => {
    setStatus("Conectado ao serviço. Aguardando a outra pessoa…");
    if (role === "share") shareControls.classList.remove("hidden");
    else viewControls.classList.remove("hidden");
  };
  socket.onerror = () => setStatus("Não foi possível conectar ao serviço.");
  socket.onmessage = async event => {
    const data = JSON.parse(event.data);
    try {
      if (data.type === "peer-ready") {
        peerReady = true;
        setStatus(role === "share" ? "Visualizador conectado. Você decide quando compartilhar." : "A outra pessoa está conectada. Aguardando autorização para compartilhar.");
      }
      if (data.type === "offer" && role === "view") {
        const peer = makePeer();
        await peer.setRemoteDescription(data.description);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        send({ type: "answer", description: peer.localDescription });
      }
      if (data.type === "answer" && role === "share") await pc?.setRemoteDescription(data.description);
      if (data.type === "ice" && data.candidate && pc) await pc.addIceCandidate(data.candidate);
      if (data.type === "peer-left") setStatus("A outra pessoa encerrou a conexão.");
    } catch (e) {
      message.textContent = "Falha ao negociar a transmissão. Tente novamente em uma rede compatível.";
    }
  };

  start?.addEventListener("click", async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      message.textContent = "Este navegador não oferece captura de tela nesta plataforma. Tente outro navegador ou dispositivo compatível.";
      return;
    }
    if (!peerReady) {
      message.textContent = "Abra primeiro o link de visualização no outro aparelho.";
      return;
    }
    try {
      localStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const peer = makePeer();
      localStream.getTracks().forEach(track => {
        peer.addTrack(track, localStream);
        track.onended = () => endSession();
      });
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      send({ type: "offer", description: peer.localDescription });
      start.classList.add("hidden");
      setStatus("Compartilhamento iniciado. Você pode encerrar a qualquer momento.");
      stop.classList.remove("hidden");
    } catch (e) {
      message.textContent = e.name === "NotAllowedError"
        ? "Compartilhamento cancelado. Nenhuma tela foi transmitida."
        : "Não foi possível iniciar o compartilhamento neste navegador.";
    }
  });

  function endSession() {
    localStream?.getTracks().forEach(t => t.stop());
    pc?.close();
    send({ type: "stop" });
    socket.close();
    setStatus("Sessão encerrada.");
    stop.classList.add("hidden");
  }
  stop.addEventListener("click", endSession);
  window.addEventListener("beforeunload", () => {
    localStream?.getTracks().forEach(t => t.stop());
    pc?.close();
    socket.close();
  });
})();
