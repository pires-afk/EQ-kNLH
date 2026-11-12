const pathParts = location.pathname.split("/");
const roomId = pathParts[pathParts.length - 1];
const role = new URLSearchParams(location.search).get("role");

const statusEl = document.querySelector("#status");
const messageEl = document.querySelector("#message");
const shareControls = document.querySelector("#shareControls");
const viewControls = document.querySelector("#viewControls");
const startButton = document.querySelector("#start");
const stopButton = document.querySelector("#stop");
const remoteVideo = document.querySelector("#remoteVideo");

let socket;
let pc;
let localStream;
let stopped = false;

function status(text) {
  statusEl.textContent = text;
}

function send(data) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(data));
  }
}

function connect() {
  if (!/^[a-f0-9]{48}$/.test(roomId) || !["share", "view"].includes(role)) {
    status("Link inválido.");
    return;
  }

  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(
    `${protocol}//${location.host}/signal?room=${roomId}&role=${role}`
  );

  socket.onopen = () => {
    status("Conectado. Aguardando o outro aparelho...");
    if (role === "share") shareControls.classList.remove("hidden");
    if (role === "view") viewControls.classList.remove("hidden");
  };

  socket.onmessage = async event => {
    const data = JSON.parse(event.data);

    if (data.type === "peer-ready") {
      status("Outro aparelho conectado.");
      return;
    }

    if (data.type === "offer" && role === "view") {
      await createPeer();
      await pc.setRemoteDescription(data.offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      send({ type: "answer", answer });
      status("Conectado. Recebendo transmissão...");
      return;
    }

    if (data.type === "answer" && role === "share" && pc) {
      await pc.setRemoteDescription(data.answer);
      status("Transmissão iniciada.");
      return;
    }

    if (data.type === "ice" && pc && data.candidate) {
      try {
        await pc.addIceCandidate(data.candidate);
      } catch (error) {
        console.error("Erro ICE:", error);
      }
      return;
    }

    if (data.type === "peer-left") {
      status("O outro aparelho saiu da sessão.");
      endSession(false);
    }
  };

  socket.onclose = () => {
    if (!stopped) status("Conexão encerrada.");
  };

  socket.onerror = () => {
    status("Erro de conexão. Verifique o servidor.");
  };
}

async function createPeer() {
  if (pc) return;

  pc = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" }
    ]
  });

  pc.onicecandidate = event => {
    if (event.candidate) {
      send({ type: "ice", candidate: event.candidate });
    }
  };

  pc.ontrack = event => {
    remoteVideo.srcObject = event.streams[0];
    status("Você está visualizando a tela.");
  };

  pc.onconnectionstatechange = () => {
    if (pc?.connectionState === "failed") {
      status("Não foi possível estabelecer a conexão.");
    }
  };
}

startButton.addEventListener("click", async () => {
  try {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error("Este navegador não oferece compartilhamento de tela.");
    }

    startButton.disabled = true;
    status("Solicitando autorização para compartilhar...");

    localStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false
    });

    await createPeer();

    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream);
      track.onended = () => endSession();
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    send({ type: "offer", offer });

    stopButton.classList.remove("hidden");
    status("Compartilhando a tela.");
    messageEl.textContent = "Para encerrar, use o botão abaixo ou pare o compartilhamento no navegador.";
  } catch (error) {
    status("Não foi possível iniciar o compartilhamento.");
    messageEl.textContent = error.message;
    startButton.disabled = false;
  }
});

function endSession(notify = true) {
  if (stopped) return;
  stopped = true;

  if (notify) send({ type: "stop" });

  localStream?.getTracks().forEach(track => track.stop());
  pc?.close();
  pc = null;

  if (remoteVideo) remoteVideo.srcObject = null;

  stopButton.classList.add("hidden");
  startButton.disabled = false;
  status("Sessão encerrada.");

  if (socket?.readyState === WebSocket.OPEN) socket.close();
}

stopButton.addEventListener("click", () => endSession());

connect();
