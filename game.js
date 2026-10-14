import { hostRoom, joinRoom as connectRoom, inviteUrl, roomCodeFromUrl } from './multiplayer.js';

(() => {
  'use strict';

  const canvas = document.querySelector('#game-canvas');
  const ctx = canvas.getContext('2d');
  const W = 1000;
  const H = 680;
  const colors = ['#f0ba58', '#79b8e6', '#dc7774', '#91c589', '#bd8dd7', '#e1e5dd'];
  const consolePoints = [
    { id: 'lab', x: 162, y: 154, room: 'BİYOLOJİ LABORATUVARI', name: 'Numuneyi eşleştir', icon: '◉', tint: '#b69adc' },
    { id: 'oxygen', x: 503, y: 115, room: 'YAŞAM DESTEĞİ', name: 'Oksijeni dengele', icon: '◌', tint: '#7ac5dc' },
    { id: 'bridge', x: 835, y: 160, room: 'KÖPRÜ', name: 'Rotayı kalibre et', icon: '⌖', tint: '#e2c16d' },
    { id: 'engine', x: 176, y: 516, room: 'MOTOR DAİRESİ', name: 'Güç akışını bağla', icon: 'ϟ', tint: '#e58e72' },
    { id: 'comms', x: 821, y: 507, room: 'HABERLEŞME', name: 'Sinyali eşleştir', icon: '⌁', tint: '#7dc5a5' }
  ];
  const names = ['Mika', 'Atlas', 'Vega', 'Neri', 'Pax'];
  const suits = ['#f18b67', '#70b7de', '#d8bc58', '#ad8bd2', '#8bc587'];
  const mapStars = Array.from({ length: 65 }, (_, index) => ({
    x: (index * 179 + 31) % W,
    y: (index * 293 + 53) % H,
    r: index % 5 === 0 ? 1.6 : 0.7,
    a: 0.09 + (index % 4) * 0.035
  }));
  const directions = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const held = new Set();
  const keysDown = new Set();
  const ui = {
    intro: document.querySelector('#intro-overlay'),
    task: document.querySelector('#task-overlay'),
    meeting: document.querySelector('#meeting-overlay'),
    result: document.querySelector('#result-overlay'),
    room: document.querySelector('#room-overlay'),
    taskList: document.querySelector('#task-list'),
    crewList: document.querySelector('#crew-list'),
    log: document.querySelector('#event-log'),
    toast: document.querySelector('#toast'),
    roleAction: document.querySelector('#role-action'),
    use: document.querySelector('#use-button'),
    report: document.querySelector('#report-button'),
    emergency: document.querySelector('#emergency-button'),
    canvas,
    onlineName: document.querySelector('#online-name'),
    createRoom: document.querySelector('#create-room'),
    joinCode: document.querySelector('#join-code'),
    joinRoom: document.querySelector('#join-room'),
    onlineStatus: document.querySelector('#online-status'),
    roomCode: document.querySelector('#room-code-display'),
    roomStatus: document.querySelector('#room-status'),
    roomRoster: document.querySelector('#room-roster'),
    roomStart: document.querySelector('#room-start'),
    roomShare: document.querySelector('#room-share'),
    roomLeave: document.querySelector('#room-leave'),
    leaveOnline: document.querySelector('#leave-online-game')
  };
  const network = {
    mode: 'offline',
    room: null,
    guest: null,
    localId: 'host',
    players: new Map(),
    nextId: 1,
    snapshotClock: 0,
    inputClock: 0,
    lastInput: '',
    meetingVotes: new Map(),
    meetingTimer: 0
  };
  const game = {
    running: false,
    ended: false,
    meeting: false,
    taskOpen: false,
    requestedRole: 'random',
    role: null,
    player: { x: 500, y: 335, color: '#8de1bf', alive: true, name: 'SEN', facing: 1 },
    crew: [],
    tasks: [],
    bodies: [],
    complete: 0,
    seconds: 180,
    killCooldown: 0,
    reportCooldown: 0,
    emergencyUsed: false,
    sabotage: 0,
    sabotageActive: false,
    sequence: [],
    sequenceInput: [],
    nearestConsole: null,
    nearestBody: null,
    toastTimeout: 0,
    hudClock: 0,
    lastTime: 0,
    lastLocation: ''
  };

  function show(element) { element.classList.remove('hidden'); }
  function hide(element) { element.classList.add('hidden'); }
  function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function randomItem(items) { return items[Math.floor(Math.random() * items.length)]; }
  function livingCrew() { return game.crew.filter(member => member.alive); }

  function addLog(message, alert = false) {
    const entry = document.createElement('div');
    entry.className = `log-entry${alert ? ' alert' : ''}`;
    entry.textContent = message;
    ui.log.prepend(entry);
    while (ui.log.children.length > 5) ui.log.lastElementChild.remove();
  }

  function toast(message) {
    ui.toast.textContent = message;
    ui.toast.classList.add('visible');
    clearTimeout(game.toastTimeout);
    game.toastTimeout = setTimeout(() => ui.toast.classList.remove('visible'), 1900);
  }

  function cleanPlayerName(value) {
    return String(value || '').replace(/[<>\x00-\x1f]/g, '').trim().slice(0, 16) || 'Oyuncu';
  }

  function updateRoomRoster(players = network.lobbyPlayers || []) {
    ui.roomRoster.replaceChildren();
    for (const player of players) {
      const row = document.createElement('div');
      row.className = `room-player${player.host ? ' host' : ''}`;
      row.textContent = `${player.name}${player.host ? ' · ODA SAHİBİ' : ''}`;
      ui.roomRoster.append(row);
    }
    const canStart = network.mode === 'host' && network.players.size > 0;
    ui.roomStart.classList.toggle('hidden', network.mode !== 'host');
    ui.roomStart.disabled = !canStart;
    if (network.mode === 'host') {
      ui.roomStatus.textContent = canStart ? `${players.length}/6 oyuncu · Hazırsan başlat.` : 'En az bir arkadaşın katılınca başlayabilirsin.';
    }
  }

  function broadcastLobby() {
    const players = [
      { id: 'host', name: network.hostName, host: true },
      ...[...network.players.values()].map(player => ({ id: player.id, name: player.name, host: false }))
    ];
    network.lobbyPlayers = players;
    network.room?.broadcast({ type: 'lobby', players });
    updateRoomRoster(players);
  }

  function acceptPeer(link) {
    if (network.mode !== 'host' || network.room?.links.size > 5) {
      link.send({ type: 'error', message: 'Oda dolu.' });
      link.close();
      return;
    }
    const player = { id: '', name: '', color: suits[(network.players.size + 1) % suits.length], link, input: null };
    const joinTimeout = setTimeout(() => { if (!player.id) link.close(); }, 10000);
    link.onMessage = packet => {
      if (!packet || typeof packet !== 'object' || Array.isArray(packet)) return;
      if (packet.type === 'join' && !player.id) {
        if (network.players.size >= 5 || game.running) {
          link.send({ type: 'error', message: game.running ? 'Maç başladı; yeni oyuncu alınmıyor.' : 'Oda dolu.' });
          link.close();
          return;
        }
        player.id = `crew-${network.nextId++}`;
        clearTimeout(joinTimeout);
        player.name = cleanPlayerName(packet.name);
        player.x = 455 + network.players.size * 18;
        player.y = 335;
        player.alive = true;
        player.facing = 1;
        player.human = true;
        player.isImpostor = false;
        player.windowStart = Date.now();
        player.messageCount = 0;
        network.players.set(player.id, player);
        link.send({ type: 'joined', id: player.id, code: network.room.code, host: network.hostName });
        broadcastLobby();
        return;
      }
      if (player.id) handleHostPacket(player, packet);
    };
    link.onClose = () => {
      clearTimeout(joinTimeout);
      network.room?.links.delete(link);
      if (!player.id || !network.players.delete(player.id)) return;
      game.crew = game.crew.filter(member => member.id !== player.id);
      if (game.running) {
        updateRoster();
        checkImpostorWin();
      }
      broadcastLobby();
    };
  }

  async function createOnlineRoom() {
    if (network.mode !== 'offline') return;
    ui.createRoom.disabled = true;
    ui.joinRoom.disabled = true;
    ui.onlineStatus.textContent = 'Oda oluşturuluyor…';
    ui.onlineStatus.dataset.tone = 'info';
    network.hostName = cleanPlayerName(ui.onlineName.value);
    ui.onlineName.value = network.hostName;
    try {
      network.room = await hostRoom({ onConnection: acceptPeer });
      network.mode = 'host';
      ui.roomCode.textContent = network.room.code;
      ui.roomStatus.textContent = 'Oda açıldı. Kodu arkadaşlarınla paylaş.';
      hide(ui.intro);
      show(ui.room);
      broadcastLobby();
    } catch (error) {
      ui.onlineStatus.textContent = error.message || 'Oda kurulamadı. Tekrar dene.';
      ui.onlineStatus.dataset.tone = 'error';
    } finally {
      ui.createRoom.disabled = false;
      ui.joinRoom.disabled = false;
    }
  }

  async function joinOnlineRoom() {
    if (network.mode !== 'offline') return;
    const code = ui.joinCode.value;
    ui.createRoom.disabled = true;
    ui.joinRoom.disabled = true;
    ui.onlineStatus.textContent = 'Oda aranıyor…';
    ui.onlineStatus.dataset.tone = 'info';
    network.hostName = cleanPlayerName(ui.onlineName.value);
    ui.onlineName.value = network.hostName;
    try {
      network.guest = await connectRoom(code);
      network.mode = 'guest';
      network.localId = '';
      ui.roomCode.textContent = code.trim().toUpperCase();
      ui.roomStatus.textContent = 'Odaya bağlandın. Bilgiler bekleniyor…';
      ui.roomStart.classList.add('hidden');
      network.guest.link.onMessage = handleGuestPacket;
      network.guest.link.onClose = () => leaveOnlineRoom('Bağlantı koptu.');
      network.guest.link.send({ type: 'join', name: network.hostName });
      hide(ui.intro);
      show(ui.room);
    } catch (error) {
      ui.onlineStatus.textContent = error.message || 'Odaya bağlanılamadı. Kodu kontrol et.';
      ui.onlineStatus.dataset.tone = 'error';
    } finally {
      ui.createRoom.disabled = false;
      ui.joinRoom.disabled = false;
    }
  }

  function handleGuestPacket(packet) {
    if (!packet || typeof packet !== 'object') return;
    if (packet.type === 'error') {
      leaveOnlineRoom(packet.message || 'Odaya katılınamadı.');
      return;
    }
    if (packet.type === 'joined') {
      network.localId = packet.id;
      ui.roomCode.textContent = packet.code;
      ui.roomStatus.textContent = `Oda sahibi: ${packet.host} · Başlatması bekleniyor.`;
    } else if (packet.type === 'lobby') {
      network.lobbyPlayers = Array.isArray(packet.players) ? packet.players : [];
      updateRoomRoster(network.lobbyPlayers);
      if (network.mode === 'guest') ui.roomStatus.textContent = `${network.lobbyPlayers.length}/6 oyuncu · Oda sahibinin başlaması bekleniyor.`;
    } else if (packet.type === 'start') {
      startGuestGame(packet);
    } else if (packet.type === 'snapshot') {
      applyGuestSnapshot(packet.state);
    } else if (packet.type === 'meeting') {
      openMeeting(packet.reason || 'Acil toplantı');
    } else if (packet.type === 'meeting-result') {
      hide(ui.meeting);
      game.meeting = false;
      applyGuestSnapshot(packet.state);
    } else if (packet.type === 'ended') {
      endGame(packet.winner, packet.message);
    } else if (packet.type === 'closed') {
      leaveOnlineRoom('Oda sahibi odayı kapattı.');
    }
  }

  function handleHostPacket(player, packet) {
    const now = Date.now();
    if (now - player.windowStart >= 1000) { player.windowStart = now; player.messageCount = 0; }
    if (++player.messageCount > 150) return;
    if (packet.type === 'input' && packet.input && typeof packet.input === 'object') {
      const x = Number(packet.input.x);
      const y = Number(packet.input.y);
      player.input = {
        x: Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0,
        y: Number.isFinite(y) ? Math.max(-1, Math.min(1, y)) : 0
      };
      player.lastInput = now;
    } else if (packet.type === 'action') {
      handleRemoteAction(player, packet.action, packet.targetId, packet.sequence);
    }
  }

  function publicCharacter(member, id) {
    return {
      id,
      name: member.name,
      x: member.x,
      y: member.y,
      color: member.color,
      alive: member.alive,
      facing: member.facing || 1,
      human: !!member.human,
      killCooldown: member.killCooldown || 0
    };
  }

  function exportGameState() {
    return {
      player: { ...publicCharacter(game.player, 'host'), killCooldown: game.killCooldown },
      crew: game.crew.map(member => publicCharacter(member, member.id || `bot-${member.name}`)),
      tasks: game.tasks.map(task => ({ ...task })),
      bodies: game.bodies.map(body => ({ ...body })),
      complete: game.complete,
      seconds: game.seconds,
      sabotage: game.sabotage,
      sabotageActive: game.sabotageActive,
      emergencyUsed: game.emergencyUsed,
      running: game.running,
      ended: game.ended
    };
  }

  function applyGuestSnapshot(state) {
    if (!state || network.mode !== 'guest') return;
    const own = state.crew?.find(member => member.id === network.localId);
    if (own) {
      Object.assign(game.player, own);
      game.killCooldown = own.killCooldown || 0;
    }
    const host = { ...state.player, isHost: true, isImpostor: false };
    game.crew = [host, ...(state.crew || []).filter(member => member.id !== network.localId)
      .map(member => ({ ...member, isImpostor: false }))];
    game.tasks = (state.tasks || []).map(task => ({ ...task }));
    game.bodies = (state.bodies || []).map(body => ({ ...body }));
    game.complete = state.complete || 0;
    game.seconds = state.seconds ?? game.seconds;
    game.sabotage = state.sabotage || 0;
    game.sabotageActive = !!state.sabotageActive;
    game.emergencyUsed = !!state.emergencyUsed;
    game.running = !!state.running;
    game.ended = !!state.ended;
    const minutes = String(Math.floor(game.seconds / 60)).padStart(2, '0');
    const seconds = String(Math.max(0, Math.floor(game.seconds % 60))).padStart(2, '0');
    document.querySelector('#round-time').textContent = `${minutes}:${seconds}`;
    updateProgress();
    updateRoster();
    updateActions();
  }

  function startGuestGame(packet) {
    network.localRole = packet.role === 'impostor' ? 'impostor' : 'crew';
    game.role = network.localRole;
    game.online = true;
    game.running = true;
    game.ended = false;
    game.meeting = false;
    game.taskOpen = false;
    game.player = { ...packet.state.crew.find(member => member.id === network.localId), isPlayer: true };
    game.player.name = network.hostName;
    game.player.isImpostor = game.role === 'impostor';
    game.tasks = packet.state.tasks.map(task => ({ ...task }));
    game.crew = [];
    game.bodies = [];
    game.complete = 0;
    game.seconds = packet.state.seconds;
    game.sabotage = 0;
    game.sabotageActive = false;
    createTaskList(game.tasks);
    applyGuestSnapshot(packet.state);
    document.querySelector('#status-text').textContent = game.role === 'crew' ? 'MÜRETTEBAT · ÇEVRİMİÇİ' : 'GİZLİ ROL · ÇEVRİMİÇİ';
    document.querySelector('#state-icon').textContent = game.role === 'crew' ? '◇' : '✳';
    hide(ui.room);
    hide(ui.intro);
    hide(ui.result);
    ui.leaveOnline.classList.remove('hidden');
    if (game.role === 'impostor') toast('GİZLİ ROL: SABOTAJCI');
    else toast('GÖREVLERİ TAMAMLA, EKİBİ KORU');
  }

  function beginOnlineMatch() {
    if (network.mode !== 'host' || network.players.size < 1) return;
    startGame();
    hide(ui.room);
    for (const player of network.players.values()) {
      player.link.send({
        type: 'start',
        role: player.isImpostor ? 'impostor' : 'crew',
        state: exportGameState()
      });
    }
  }

  function leaveOnlineRoom(message = 'Odadan çıktın.') {
    clearTimeout(network.meetingTimer);
    game.running = false;
    game.online = false;
    const mode = network.mode;
    if (mode === 'host') {
      network.room?.broadcast({ type: 'closed' });
      network.room?.close();
    } else if (mode === 'guest') {
      network.guest?.link.send({ type: 'leave' });
      network.guest?.close();
    }
    network.mode = 'offline';
    network.room = null;
    network.guest = null;
    network.players.clear();
    network.localId = 'host';
    network.lobbyPlayers = [];
    hide(ui.room);
    hide(ui.result);
    hide(ui.task);
    hide(ui.meeting);
    ui.leaveOnline.classList.add('hidden');
    show(ui.intro);
    ui.onlineStatus.textContent = message;
  }

  function createTaskList(sharedTasks = null) {
    const selected = sharedTasks ?? [...consolePoints].sort(() => Math.random() - 0.5).slice(0, 3);
    game.tasks = selected.map(point => ({
      ...point,
      done: !!point.done,
      code: point.code ?? Array.from({ length: 3 }, () => 1 + Math.floor(Math.random() * 3))
    }));
    ui.taskList.replaceChildren();
    for (const task of game.tasks) {
      const row = document.createElement('div');
      row.className = 'task-row';
      row.id = `task-${task.id}`;
      row.innerHTML = `<span class="task-check">✓</span><span class="task-name"></span><span class="task-room"></span>`;
      row.querySelector('.task-name').textContent = task.name;
      row.querySelector('.task-room').textContent = task.room.split(' ')[0];
      ui.taskList.append(row);
    }
    updateProgress();
  }

  function updateProgress() {
    const total = game.tasks.length || 3;
    document.querySelector('#task-count').textContent = `${game.complete} / ${total}`;
    document.querySelector('#task-progress-bar').style.width = `${(game.complete / total) * 100}%`;
    for (const task of game.tasks) {
      const row = document.querySelector(`#task-${task.id}`);
      if (row) row.classList.toggle('done', task.done);
    }
  }

  function updateRoster() {
    const players = [{ ...game.player, isPlayer: true }, ...game.crew];
    ui.crewList.replaceChildren();
    for (const member of players) {
      const row = document.createElement('div');
      row.className = `crew-member${member.alive ? '' : ' dead'}`;
      row.innerHTML = '<span class="suit-dot"></span><span class="crew-name"></span>';
      row.style.setProperty('--suit', member.color);
      row.querySelector('.crew-name').textContent = member.name;
      if (member.isPlayer) {
        const tag = document.createElement('span');
        tag.className = 'you-tag';
        tag.textContent = 'SEN';
        row.append(tag);
      }
      ui.crewList.append(row);
    }
    const living = livingCrew().length + (game.player.alive ? 1 : 0);
    document.querySelector('#crew-count').textContent = String(living).padStart(2, '0');
    document.querySelector('#roster-count').textContent = `${String(living).padStart(2, '0')} YAŞIYOR`;
  }

  function updateActions() {
    if (!game.running || game.ended || game.meeting) return;
    const closeConsole = consolePoints.find(point => distance(game.player, point) < 62);
    game.nearestConsole = closeConsole;
    game.nearestBody = game.bodies.find(body => distance(game.player, body) < 63) || null;
    const repairPoint = { x: 500, y: 335 };
    const canRepair = game.role === 'crew' && game.sabotageActive && distance(game.player, repairPoint) < 72;
    ui.use.disabled = !(closeConsole && (game.role === 'impostor' || game.tasks.some(task => task.id === closeConsole.id && !task.done))) && !canRepair;
    ui.use.querySelector('span:last-child').textContent = canRepair ? 'ONAR' : closeConsole ? 'ETKİLEŞ' : 'ETKİLEŞ';
    ui.report.disabled = !game.nearestBody || game.reportCooldown > 0;

    if (game.role === 'impostor') {
      const target = livingCrew().find(member => distance(game.player, member) < 65);
      ui.roleAction.disabled = !target || game.killCooldown > 0 || game.sabotageActive;
      ui.roleAction.querySelector('span:last-child').textContent = game.sabotageActive ? 'SABOTAJ' : game.killCooldown > 0 ? `${Math.ceil(game.killCooldown)} SN` : 'ETKİSİZLEŞTİR';
      ui.roleAction.querySelector('.action-icon').textContent = '✳';
      ui.emergency.disabled = game.sabotageActive;
      ui.emergency.querySelector('span:first-child').textContent = 'ϟ';
      ui.emergency.childNodes[1].textContent = ' SABOTAJ ';
    } else {
      ui.roleAction.disabled = !game.sabotageActive;
      ui.roleAction.querySelector('span:last-child').textContent = game.sabotageActive ? 'SABOTAJI ONAR' : '—';
      ui.roleAction.querySelector('.action-icon').textContent = 'ϟ';
      ui.emergency.disabled = game.emergencyUsed;
      ui.emergency.querySelector('span:first-child').textContent = '＋';
      ui.emergency.childNodes[1].textContent = ' ACİL TOPLANTI ';
    }
  }

  function startGame() {
    game.role = game.requestedRole === 'random' ? (Math.random() < 0.5 ? 'crew' : 'impostor') : game.requestedRole;
    game.online = network.mode === 'host';
    game.running = true;
    game.ended = false;
    game.meeting = false;
    game.taskOpen = false;
    game.complete = 0;
    game.seconds = 180;
    game.killCooldown = 0;
    game.reportCooldown = 0;
    game.emergencyUsed = false;
    game.sabotage = 0;
    game.sabotageActive = false;
    game.bodies = [];
    game.player.x = 500;
    game.player.y = 335;
    game.player.facing = 1;
    game.player.color = '#8de1bf';
    game.player.name = game.online ? network.hostName : 'SEN';
    game.player.id = 'host';
    game.player.isImpostor = game.role === 'impostor';
    game.player.alive = true;
    game.player.suspicion = 0;
    const onlinePlayers = game.online ? [...network.players.values()] : [];
    onlinePlayers.forEach((member, index) => {
      member.x = 455 + index * 18;
      member.y = 335;
      member.alive = true;
      member.facing = 1;
      member.isImpostor = false;
      member.input = { x: 0, y: 0 };
      member.wander = 0;
      member.speed = 182;
      member.suspicion = 0;
      member.killCooldown = 0;
      if (game.role === 'crew' && index === 0) member.isImpostor = true;
    });
    const botCount = Math.max(0, 5 - onlinePlayers.length);
    const bots = names.slice(0, botCount).map((name, index) => ({
      id: `bot-${index}`,
      name,
      x: 410 + index * 34,
      y: 294 + (index % 2) * 42,
      color: suits[index],
      alive: true,
      facing: 1,
      human: false,
      isImpostor: !game.online && game.role === 'crew' && index === 0,
      target: randomItem(consolePoints),
      wander: Math.random() * 3,
      speed: 47 + Math.random() * 20,
      suspicion: 0
    }));
    game.crew = [...onlinePlayers, ...bots];
    createTaskList();
    ui.log.replaceChildren();
    addLog('İletişim kuruldu. Görev kayıtları yüklendi.');
    addLog(game.role === 'crew' ? 'Rol: mürettebat. Sabotajcıyı bul.' : 'Gizli rol aktif. Görev panelinden sabotaj başlat.');
    document.querySelector('#status-text').textContent = game.role === 'crew' ? 'MÜRETTEBAT' : 'GİZLİ ROL AKTİF';
    document.querySelector('#state-icon').textContent = game.role === 'crew' ? '◇' : '✳';
    hide(ui.intro);
    hide(ui.result);
    ui.leaveOnline.classList.toggle('hidden', !game.online);
    updateRoster();
    updateActions();
    if (game.role === 'impostor') toast('GİZLİ ROL: SABOTAJCI');
    else toast('GÖREVLERİ TAMAMLA, EKİBİ KORU');
  }

  function endGame(winner, message) {
    if (game.ended) return;
    game.ended = true;
    game.running = false;
    if (network.mode === 'host') network.room?.broadcast({ type: 'ended', winner, message });
    hide(ui.task);
    hide(ui.meeting);
    const crewWon = winner === 'crew';
    const dialog = ui.result.querySelector('.result-dialog');
    dialog.classList.toggle('loss', !crewWon);
    document.querySelector('#result-mark').textContent = crewWon ? '✓' : '×';
    document.querySelector('#result-kicker').textContent = crewWon ? 'TUR TAMAMLANDI · KEPLER-09' : 'GEMİ SİSTEMLERİ ÇÖKTÜ';
    document.querySelector('#result-title').textContent = crewWon ? 'GEMİ GÜVENDE' : 'SABOTAJ BAŞARILI';
    document.querySelector('#result-copy').textContent = message;
    show(ui.result);
    document.querySelector('#status-text').textContent = crewWon ? 'EKİP KAZANDI' : 'SABOTAJCI KAZANDI';
  }

  function nearestRoom() {
    let nearest = consolePoints[0];
    for (const point of consolePoints) if (distance(game.player, point) < distance(game.player, nearest)) nearest = point;
    return distance(game.player, nearest) < 130 ? nearest.room : 'ANA GEÇİŞ';
  }

  function drawFloor() {
    ctx.fillStyle = '#15242a';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    for (const star of mapStars) {
      ctx.globalAlpha = star.a;
      ctx.fillStyle = '#b7d5c9';
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = '#192a30';
    ctx.fillRect(33, 33, 934, 614);
    const roomPanels = [
      [43, 43, 286, 286], [337, 43, 326, 286], [671, 43, 286, 286],
      [43, 331, 286, 306], [337, 331, 326, 306], [671, 331, 286, 306]
    ];
    roomPanels.forEach(([x, y, width, height], index) => {
      ctx.fillStyle = index % 2 ? '#1b2d32' : '#1d3035';
      ctx.fillRect(x, y, width, height);
      ctx.strokeStyle = '#263b40';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 5, y + 5, width - 10, height - 10);
    });
    ctx.save();
    ctx.strokeStyle = '#d2e5d0';
    ctx.globalAlpha = .035;
    ctx.lineWidth = 1;
    for (let x = 56; x < 950; x += 48) {
      ctx.beginPath(); ctx.moveTo(x, 45); ctx.lineTo(x, 635); ctx.stroke();
    }
    for (let y = 58; y < 635; y += 48) {
      ctx.beginPath(); ctx.moveTo(45, y); ctx.lineTo(955, y); ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = '#30444a';
    ctx.lineWidth = 2;
    ctx.strokeRect(33, 33, 934, 614);
    ctx.strokeStyle = '#263b40';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 9]);
    ctx.beginPath();
    ctx.moveTo(329, 43); ctx.lineTo(329, 637);
    ctx.moveTo(665, 43); ctx.lineTo(665, 637);
    ctx.moveTo(44, 329); ctx.lineTo(956, 329);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#33494c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(330, 185); ctx.lineTo(330, 250);
    ctx.moveTo(330, 428); ctx.lineTo(330, 493);
    ctx.moveTo(665, 185); ctx.lineTo(665, 250);
    ctx.moveTo(665, 430); ctx.lineTo(665, 492);
    ctx.moveTo(453, 329); ctx.lineTo(548, 329);
    ctx.stroke();
    const rooms = [
      { x: 55, y: 61, text: 'BİYOLOJİ LABORATUVARI', sub: 'ARŞİV / ÖRNEKLER', align: 'left' },
      { x: 490, y: 66, text: 'YAŞAM DESTEĞİ', sub: 'O₂ SİSTEMİ', align: 'center' },
      { x: 945, y: 61, text: 'KÖPRÜ', sub: 'NAVİGASYON', align: 'right' },
      { x: 55, y: 374, text: 'MOTOR DAİRESİ', sub: 'GÜÇ HÜCRESİ', align: 'left' },
      { x: 944, y: 374, text: 'HABERLEŞME', sub: 'UZUN MENZİL', align: 'right' }
    ];
    for (const room of rooms) {
      ctx.textAlign = room.align;
      ctx.fillStyle = '#738a83';
      ctx.font = '700 13px "Barlow Condensed", sans-serif';
      ctx.fillText(room.text, room.x, room.y);
      ctx.fillStyle = '#4f6862';
      ctx.font = '600 9px "DM Sans", sans-serif';
      ctx.fillText(room.sub, room.x, room.y + 15);
    }
    drawRoomDetails();
  }

  function drawRoomDetails() {
    const details = [
      [72, 99, 110, 33], [176, 99, 124, 33], [68, 221, 45, 52], [267, 221, 42, 52],
      [365, 85, 68, 42], [563, 83, 68, 47], [386, 225, 95, 39], [524, 223, 92, 41],
      [701, 92, 76, 42], [856, 98, 69, 34], [710, 213, 45, 51], [880, 220, 46, 48],
      [78, 412, 81, 37], [223, 408, 81, 37], [68, 565, 65, 40], [251, 560, 52, 42],
      [700, 409, 73, 40], [858, 411, 71, 37], [704, 561, 71, 40], [856, 558, 75, 41],
      [400, 385, 71, 35], [531, 387, 71, 35], [427, 531, 51, 46], [526, 530, 52, 47]
    ];
    for (let index = 0; index < details.length; index++) {
      const [x, y, width, height] = details[index];
      ctx.fillStyle = index % 3 === 0 ? '#20353a' : '#1d3036';
      ctx.strokeStyle = '#344a4d';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x, y, width, height, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#3a5756';
      ctx.fillRect(x + 7, y + 7, Math.max(10, width * .32), 3);
      ctx.fillStyle = '#2f494a';
      ctx.fillRect(x + 7, y + 15, Math.max(7, width * .19), 3);
      ctx.fillStyle = '#b6d980';
      ctx.globalAlpha = .65;
      ctx.beginPath();
      ctx.arc(x + width - 9, y + 10, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    for (const [x, y] of [[488, 242], [497, 242], [506, 242], [515, 242], [484, 445], [493, 445], [502, 445], [511, 445]]) {
      ctx.fillStyle = '#466261';
      ctx.fillRect(x, y, 5, 27);
    }
    ctx.strokeStyle = '#293e42';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(500, 335, 43, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(500, 335, 32, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#91bcb0';
    ctx.font = '700 9px "Barlow Condensed", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TRANSİT', 500, 339);
  }

  function drawConsole(point, active) {
    const pulse = 1 + Math.sin(performance.now() / 260) * .07;
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.fillStyle = `${point.tint}16`;
    ctx.beginPath();
    ctx.arc(0, 0, active ? 31 * pulse : 23, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#17282c';
    ctx.strokeStyle = point.tint;
    ctx.lineWidth = active ? 2 : 1;
    ctx.beginPath();
    ctx.roundRect(-15, -15, 30, 30, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = point.tint;
    ctx.font = '700 17px "DM Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(point.icon, 0, 1);
    ctx.restore();
  }

  function drawCharacter(member, isPlayer = false) {
    if (!member.alive) return;
    ctx.save();
    ctx.translate(member.x, member.y);
    const bob = Math.sin(performance.now() / 150 + member.x) * 1.3;
    ctx.translate(0, bob);
    ctx.fillStyle = '#07101480';
    ctx.beginPath();
    ctx.ellipse(0, 19, 19, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    if (isPlayer) {
      ctx.fillStyle = '#b7eecc20';
      ctx.beginPath();
      ctx.ellipse(0, 0, 28, 29, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.scale(member.facing || 1, 1);
    ctx.fillStyle = '#111a1e';
    ctx.beginPath();
    ctx.roundRect(-20, -12, 12, 25, 5);
    ctx.fill();
    ctx.strokeStyle = '#070e12';
    ctx.lineWidth = 2;
    ctx.stroke();
    const suit = ctx.createLinearGradient(-15, -23, 14, 14);
    suit.addColorStop(0, '#ffffff35');
    suit.addColorStop(.28, member.color);
    suit.addColorStop(1, '#10191c55');
    ctx.fillStyle = suit;
    ctx.beginPath();
    ctx.roundRect(-15, -24, 30, 40, 13);
    ctx.fill();
    ctx.strokeStyle = '#11191c';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = member.color;
    ctx.beginPath();
    ctx.roundRect(-13, 7, 11, 16, 5);
    ctx.fill();
    ctx.strokeStyle = '#11191c';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = member.color;
    ctx.beginPath();
    ctx.roundRect(2, 7, 11, 16, 5);
    ctx.fill();
    ctx.stroke();
    const visor = ctx.createLinearGradient(-1, -19, 9, -4);
    visor.addColorStop(0, '#e7ffff');
    visor.addColorStop(.3, '#9be4f1');
    visor.addColorStop(1, '#3b8198');
    ctx.fillStyle = '#101a20';
    ctx.beginPath();
    ctx.roundRect(-1, -19, 22, 14, 7);
    ctx.fill();
    ctx.fillStyle = visor;
    ctx.beginPath();
    ctx.roundRect(0, -18, 19, 11, 6);
    ctx.fill();
    ctx.fillStyle = '#ffffffa8';
    ctx.beginPath();
    ctx.ellipse(5, -15, 4, 1.7, -.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.scale(member.facing || 1, 1);
    if (isPlayer) {
      ctx.fillStyle = '#d9fa8a';
      ctx.font = '700 10px "Barlow Condensed", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SEN', 0, -31);
    } else if (game.role === 'impostor' && member.alive) {
      ctx.fillStyle = '#d0d9d3';
      ctx.font = '600 9px "DM Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(member.name, 0, -31);
    }
    ctx.restore();
  }

  function drawBody(body) {
    ctx.save();
    ctx.translate(body.x, body.y);
    ctx.rotate(-.2);
    ctx.fillStyle = '#2a1d22';
    ctx.beginPath(); ctx.ellipse(0, 5, 16, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = body.color;
    ctx.beginPath(); ctx.roundRect(-10, -8, 18, 19, 6); ctx.fill();
    ctx.fillStyle = '#111a1e';
    ctx.fillRect(-11, 4, 20, 4);
    ctx.strokeStyle = '#ff7770';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-7, -7); ctx.lineTo(-2, -1); ctx.lineTo(-7, 5); ctx.moveTo(6, -7); ctx.lineTo(1, -1); ctx.lineTo(7, 5); ctx.stroke();
    ctx.restore();
  }

  function render() {
    const rect = canvas.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * pixelRatio));
    const height = Math.max(1, Math.round(rect.height * pixelRatio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.setTransform(width / W, 0, 0, height / H, 0, 0);
    drawFloor();
    const taskIds = new Set(game.tasks.filter(task => !task.done).map(task => task.id));
    for (const point of consolePoints) drawConsole(point, taskIds.has(point.id) || (game.sabotageActive && point.id === 'oxygen'));
    for (const body of game.bodies) drawBody(body);
    for (const member of game.crew) drawCharacter(member);
    drawCharacter(game.player, true);
    if (game.sabotageActive) {
      ctx.fillStyle = `rgba(216, 83, 72, ${.09 + Math.sin(performance.now() / 190) * .025})`;
      ctx.fillRect(33, 33, 934, 614);
      ctx.fillStyle = '#ff9b8c';
      ctx.font = '800 17px "Barlow Condensed", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`O₂ ARIZASI · ${Math.ceil(game.sabotage)} SN`, 500, 58);
    }
  }

  function startTask(task) {
    if (game.taskOpen || task.done || game.role !== 'crew') return;
    game.taskOpen = true;
    game.sequence = task.code;
    game.sequenceInput = [];
    document.querySelector('#task-room').textContent = task.room;
    document.querySelector('#task-title').textContent = task.name.toLocaleUpperCase('tr-TR');
    document.querySelector('#task-description').textContent = 'Sistemi eşitlemek için bağlantı sırasını gir.';
    document.querySelector('#task-feedback').textContent = 'SIRAYI GİR';
    const display = document.querySelector('#sequence-display');
    display.replaceChildren();
    task.code.forEach((number, index) => {
      const token = document.createElement('span');
      token.className = 'sequence-token';
      token.textContent = String(number);
      token.style.borderColor = task.tint;
      display.append(token);
      if (index < task.code.length - 1) {
        const arrow = document.createElement('span');
        arrow.className = 'sequence-token';
        arrow.textContent = '→';
        arrow.style.borderColor = 'transparent';
        display.append(arrow);
      }
    });
    const pad = document.querySelector('#sequence-pad');
    pad.replaceChildren();
    for (let number = 1; number <= 3; number++) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sequence-key';
      button.textContent = String(number);
      button.style.setProperty('--key-color', task.tint);
      button.addEventListener('click', () => enterSequence(number, task));
      pad.append(button);
    }
    show(ui.task);
  }

  function enterSequence(number, task) {
    if (!game.taskOpen) return;
    const expected = game.sequence[game.sequenceInput.length];
    if (number !== expected) {
      game.sequenceInput = [];
      document.querySelector('#task-feedback').textContent = 'SIRA HATALI · YENİDEN DENE';
      document.querySelector('#task-feedback').style.color = '#ff9184';
      document.querySelectorAll('.sequence-token').forEach(token => token.classList.remove('complete'));
      return;
    }
    game.sequenceInput.push(number);
    const tokens = document.querySelectorAll('.sequence-token');
    for (let index = 0; index < game.sequenceInput.length; index++) tokens[index * 2].classList.add('complete');
    document.querySelector('#task-feedback').style.color = 'var(--mint)';
    if (game.sequenceInput.length < game.sequence.length) return;
    if (network.mode === 'guest') {
      network.guest?.link.send({ type: 'action', action: 'task', targetId: task.id, sequence: game.sequenceInput });
      game.taskOpen = false;
      hide(ui.task);
      toast('GÖREV HOSTA İLETİLDİ');
      return;
    }
    task.done = true;
    game.complete++;
    game.taskOpen = false;
    hide(ui.task);
    updateProgress();
    addLog(`${task.room}: görev tamamlandı.`);
    toast('BAĞLANTI SAĞLANDI');
    if (game.complete >= game.tasks.length) endGame('crew', 'Tüm sistem görevleri tamamlandı. Kepler-09 yeniden güvenli.');
  }

  function handleRemoteAction(player, action, targetId, sequence) {
    if (!game.running || game.ended || (game.meeting && action !== 'vote') || !player.alive) return;
    if (action === 'task') {
      const task = game.tasks.find(item => item.id === targetId && !item.done);
      const point = consolePoints.find(item => item.id === targetId);
      if (player.isImpostor || !task || !point || distance(player, point) >= 62
        || !Array.isArray(sequence) || sequence.length !== task.code.length
        || sequence.some((value, index) => value !== task.code[index])) return;
      task.done = true;
      game.complete++;
      addLog(`${player.name}: ${task.room} görevi tamamlandı.`);
      updateProgress();
      if (game.complete >= game.tasks.length) endGame('crew', 'Tüm sistem görevleri tamamlandı. Kepler-09 yeniden güvenli.');
    } else if (action === 'kill') {
      const target = targetId === 'host' ? game.player : game.crew.find(member => member.id === targetId);
      if (!player.isImpostor || game.sabotageActive || player.killCooldown > 0 || !target?.alive || target.isImpostor || distance(player, target) >= 65) return;
      target.alive = false;
      target.id ||= target === game.player ? 'host' : `bot-${target.name}`;
      game.bodies.push({ id: `body-${Date.now()}-${game.bodies.length}`, x: target.x, y: target.y, color: target.color, name: target.name });
      player.killCooldown = 18;
      addLog(`${target.name} ile bağlantı kesildi.`, true);
      updateRoster();
      checkImpostorWin();
    } else if (action === 'sabotage') {
      if (!player.isImpostor || game.sabotageActive) return;
      game.sabotageActive = true;
      game.sabotage = 22;
      addLog('Oksijen sistemi arızalandı. Sayaç başladı.', true);
    } else if (action === 'repair') {
      if (player.isImpostor || !game.sabotageActive || distance(player, { x: 500, y: 335 }) >= 72) return;
      game.sabotageActive = false;
      game.sabotage = 0;
      addLog('Oksijen sabotajı durduruldu.', true);
    } else if (action === 'report') {
      const body = game.bodies.find(item => item.id === targetId);
      if (!body || distance(player, body) >= 63) return;
      openMeeting(`${body.name} adlı ekip üyesi bulundu`);
    } else if (action === 'emergency') {
      if (player.isImpostor || game.emergencyUsed) return;
      game.emergencyUsed = true;
      openMeeting('Acil toplantı çağrısı');
    } else if (action === 'vote') {
      registerOnlineVote(player.id, targetId ?? null);
    }
  }

  function interact() {
    if (game.taskOpen || game.meeting || game.ended) return;
    const repairPoint = { x: 500, y: 335 };
    if (game.role === 'crew' && game.sabotageActive && distance(game.player, repairPoint) < 72) {
      if (network.mode === 'guest') {
        network.guest?.link.send({ type: 'action', action: 'repair' });
        return;
      }
      game.sabotageActive = false;
      game.sabotage = 0;
      addLog('Oksijen sabotajı durduruldu.', true);
      toast('OKSİJEN DENGESİ SAĞLANDI');
      return;
    }
    const point = consolePoints.find(item => distance(game.player, item) < 62);
    if (!point) { toast('BİR KONSOLA YAKLAŞ'); return; }
    const task = game.tasks.find(item => item.id === point.id && !item.done);
    if (game.role === 'crew' && task) startTask(task);
    else if (game.role === 'impostor') {
      toast('GÖREV PANELİNE UZAKTAN ERİŞİLEMİYOR');
    } else {
      toast('BU GÖREV ZATEN TAMAM');
    }
  }

  function activateRoleAction() {
    if (network.mode === 'guest') {
      if (game.role === 'impostor') {
        const target = game.crew.find(member => member.alive && !member.isPlayer && distance(game.player, member) < 65);
        if (target && game.killCooldown <= 0 && !game.sabotageActive) {
          network.guest?.link.send({ type: 'action', action: 'kill', targetId: target.id });
          game.killCooldown = 18;
        }
      } else if (game.sabotageActive && distance(game.player, { x: 500, y: 335 }) < 72) {
        network.guest?.link.send({ type: 'action', action: 'repair' });
      }
      return;
    }
    if (game.role === 'impostor') {
      const target = livingCrew().find(member => distance(game.player, member) < 65);
      if (!target || game.killCooldown > 0 || game.sabotageActive) return;
      const observers = livingCrew().filter(member => member !== target && distance(member, game.player) < 155);
      if (observers.length) game.player.suspicion += 2;
      target.alive = false;
      game.bodies.push({ id: `body-${Date.now()}-${game.bodies.length}`, x: target.x, y: target.y, color: target.color, name: target.name });
      game.killCooldown = 18;
      addLog(`${target.name} ile bağlantı kesildi.`, true);
      toast(observers.length ? 'BİRİSİ SENİ GÖRMÜŞ OLABİLİR' : 'KİMSE GÖRMEDİ');
      updateRoster();
      checkImpostorWin();
    } else if (game.sabotageActive && distance(game.player, { x: 500, y: 335 }) < 72) {
      game.sabotageActive = false;
      game.sabotage = 0;
      addLog('Oksijen sabotajı durduruldu.', true);
      toast('OKSİJEN DENGESİ SAĞLANDI');
    } else if (game.sabotageActive) {
      toast('REAKTÖR KONSOLUNA GİT');
    }
  }

  function sabotage() {
    if (network.mode === 'guest') {
      if (game.role === 'impostor' && !game.sabotageActive) network.guest?.link.send({ type: 'action', action: 'sabotage' });
      return;
    }
    if (game.role !== 'impostor' || game.sabotageActive || game.ended) return;
    game.sabotageActive = true;
    game.sabotage = 22;
    addLog('Oksijen sistemi arızalandı. Sayaç başladı.', true);
    toast('O₂ SABOTAJI · MERKEZE GİT');
  }

  function killPlayer() {
    if (!game.player.alive) return;
    game.player.alive = false;
    addLog('Sana saldırıldı. İletişim kesildi.', true);
    updateRoster();
    if (game.online) { checkImpostorWin(); return; }
    endGame('impostor', 'Sabotajcı seni etkisiz hale getirdi. Kepler-09 artık onların kontrolünde.');
  }

  function reportBody() {
    if (!game.nearestBody || game.reportCooldown > 0) return;
    const body = game.nearestBody;
    if (network.mode === 'guest') {
      network.guest?.link.send({ type: 'action', action: 'report', targetId: body.id });
      return;
    }
    game.reportCooldown = 8;
    addLog(`${body.name} bulundu. Toplantı çağrıldı.`, true);
    openMeeting(`${body.name} adlı ekip üyesi bulundu`);
  }

  function callEmergency() {
    if (network.mode === 'guest') {
      if (game.role === 'crew' && !game.emergencyUsed) network.guest?.link.send({ type: 'action', action: 'emergency' });
      return;
    }
    if (game.role !== 'crew' || game.emergencyUsed || game.ended) return;
    game.emergencyUsed = true;
    addLog('Acil toplantı çağrısı kullanıldı.', true);
    openMeeting('Acil toplantı çağrısı');
  }

  function openMeeting(reason) {
    if (game.meeting || game.ended) return;
    game.meeting = true;
    if (network.mode === 'host') {
      network.meetingVotes.clear();
      clearTimeout(network.meetingTimer);
      network.meetingTimer = setTimeout(resolveOnlineMeeting, 15000);
      network.room?.broadcast({ type: 'meeting', reason });
    }
    document.querySelector('#meeting-reason').textContent = reason;
    document.querySelector('.meeting-copy').textContent = 'Bir ekip üyesine oy ver. En çok oyu alan kişi gemiden çıkarılır.';
    const list = document.querySelector('#voting-list');
    list.replaceChildren();
    for (const member of livingCrew()) {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'vote-option';
      option.innerHTML = '<span class="suit-dot"></span><b></b><small>OY VER</small>';
      option.style.setProperty('--suit', member.color);
      option.querySelector('b').textContent = member.name;
      option.addEventListener('click', () => castVote(member));
      list.append(option);
    }
    show(ui.meeting);
  }

  function castVote(target) {
    if (network.mode === 'guest') {
      network.guest?.link.send({ type: 'action', action: 'vote', targetId: target?.id ?? null });
      document.querySelectorAll('#voting-list .vote-option, #skip-vote').forEach(button => { button.disabled = true; });
      document.querySelector('.meeting-copy').textContent = 'Oyun kaydedildi. Diğer oyuncular bekleniyor…';
      toast('OYUN HOSTA GÖNDERİLDİ');
      return;
    }
    if (network.mode === 'host' && game.online) {
      registerOnlineVote('host', target?.id ?? null);
      return;
    }
    const votes = new Map();
    const cast = (member, suspect) => votes.set(suspect, (votes.get(suspect) || 0) + 1);
    cast(game.player, target);
    for (const member of livingCrew()) {
      if (member.isImpostor) continue;
      let suspect = target;
      if (game.role === 'impostor') {
        suspect = game.player.suspicion >= 2 ? game.player : randomItem(livingCrew());
      } else {
        const impostor = livingCrew().find(candidate => candidate.isImpostor);
        suspect = impostor && impostor.suspicion > 0 ? impostor : (Math.random() < .42 ? impostor : randomItem(livingCrew()));
      }
      if (suspect) cast(member, suspect);
    }
    let ejected = null;
    let highest = 0;
    for (const [member, count] of votes) if (count > highest) { ejected = member; highest = count; }
    concludeVote(ejected, highest);
  }

  function registerOnlineVote(voterId, targetId) {
    if (network.mode !== 'host' || !game.meeting || network.meetingVotes.has(voterId)) return;
    const voter = voterId === 'host' ? game.player : network.players.get(voterId);
    const target = targetId === null ? null : targetId === 'host' ? game.player : game.crew.find(member => member.id === targetId);
    if (!voter?.alive || (targetId !== null && !target?.alive)) return;
    network.meetingVotes.set(voterId, target?.id ?? null);
    if (voterId === 'host') {
      document.querySelectorAll('#voting-list .vote-option, #skip-vote').forEach(button => { button.disabled = true; });
      document.querySelector('.meeting-copy').textContent = 'Oyun kaydedildi. Diğer oyuncular bekleniyor…';
    }
    const livingHumans = [game.player, ...network.players.values()].filter(member => member.alive);
    if (livingHumans.every(member => network.meetingVotes.has(member.id || 'host'))) resolveOnlineMeeting();
  }

  function resolveOnlineMeeting() {
    if (network.mode !== 'host' || !game.meeting) return;
    clearTimeout(network.meetingTimer);
    const tally = new Map();
    const addVote = targetId => {
      if (targetId) tally.set(targetId, (tally.get(targetId) || 0) + 1);
    };
    for (const targetId of network.meetingVotes.values()) addVote(targetId);
    const candidates = [game.player, ...livingCrew()];
    const impostor = candidates.find(member => member.isImpostor);
    for (const bot of game.crew.filter(member => member.alive && !member.human && !member.isImpostor)) {
      const suspect = impostor && Math.random() < .42 ? impostor : randomItem(candidates);
      addVote(suspect?.id || 'host');
    }
    let highest = 0;
    let leaders = [];
    for (const [id, count] of tally) {
      if (count > highest) { highest = count; leaders = [id]; }
      else if (count === highest) leaders.push(id);
    }
    const ejected = leaders.length === 1
      ? (leaders[0] === 'host' ? game.player : game.crew.find(member => member.id === leaders[0]))
      : null;
    concludeVote(ejected, highest);
  }

  function concludeVote(ejected, highest) {
    hide(ui.meeting);
    game.meeting = false;
    game.seconds = Math.max(game.seconds, 75);
    if (network.mode === 'host') {
      clearTimeout(network.meetingTimer);
      network.meetingVotes.clear();
    }
    if (!ejected || highest === 0) {
      addLog('Oylama sonuçsuz kaldı.');
      toast('KİMSE GEMİDEN ÇIKARILMADI');
      if (network.mode === 'host') network.room?.broadcast({ type: 'meeting-result', state: exportGameState() });
      return;
    }
    if (ejected === game.player) {
      game.player.alive = false;
      updateRoster();
      if (network.mode === 'host') network.room?.broadcast({ type: 'meeting-result', state: exportGameState() });
      if (game.online) checkImpostorWin();
      else endGame('crew', 'Mürettebat şüphesinde haklı çıktı. Sabotajcı gemiden çıkarıldı.');
      return;
    }
    ejected.alive = false;
    const roleLabel = ejected.isImpostor ? 'sabotajcıydı' : 'mürettebattandı';
    addLog(`${ejected.name} gemiden çıkarıldı. ${ejected.name} ${roleLabel}.`, ejected.isImpostor);
    toast(`${ejected.name.toUpperCase()} GEMİDEN ÇIKARILDI`);
    updateRoster();
    if (network.mode === 'host') network.room?.broadcast({ type: 'meeting-result', state: exportGameState() });
    if (ejected.isImpostor) endGame('crew', 'Sabotajcı bulundu ve gemiden çıkarıldı. Kepler-09 güvende.');
    else checkImpostorWin();
  }

  function checkImpostorWin() {
    if (game.online) {
      const alive = [game.player, ...game.crew].filter(member => member.alive);
      const impostors = alive.filter(member => member.isImpostor);
      const crew = alive.filter(member => !member.isImpostor);
      if (!impostors.length) endGame('crew', 'Sabotajcı bulundu. Kepler-09 güvende.');
      else if (impostors.length >= crew.length) endGame('impostor', 'Mürettebat etkisiz hale getirildi. Kepler-09 artık onların kontrolünde.');
      return;
    }
    if (game.role !== 'impostor') return;
    if (livingCrew().length <= 1) endGame('impostor', 'Mürettebat etkisiz hale getirildi. Kepler-09 artık sana ait.');
  }

  function movementVector() {
    let x = 0;
    let y = 0;
    for (const key of held) {
      const vector = directions[key];
      if (vector) { x += vector[0]; y += vector[1]; }
    }
    if (keysDown.has('ArrowUp') || keysDown.has('w')) y--;
    if (keysDown.has('ArrowDown') || keysDown.has('s')) y++;
    if (keysDown.has('ArrowLeft') || keysDown.has('a')) x--;
    if (keysDown.has('ArrowRight') || keysDown.has('d')) x++;
    const length = Math.hypot(x, y) || 1;
    return { x: x / length, y: y / length };
  }

  function movePlayer(dt) {
    if (!game.player.alive) return;
    const input = movementVector();
    const x = input.x;
    const y = input.y;
    const length = Math.hypot(x, y) || 1;
    if (x) game.player.facing = Math.sign(x);
    game.player.x = Math.max(48, Math.min(952, game.player.x + x / length * 182 * dt));
    game.player.y = Math.max(49, Math.min(631, game.player.y + y / length * 182 * dt));
  }

  function moveNetworkPlayers(dt) {
    for (const member of game.crew) {
      if (!member.human || !member.alive || !member.input) continue;
      const inputFresh = Date.now() - (member.lastInput || 0) < 300;
      const x = inputFresh ? member.input.x || 0 : 0;
      const y = inputFresh ? member.input.y || 0 : 0;
      const length = Math.hypot(x, y) || 1;
      if (x) member.facing = Math.sign(x);
      member.x = Math.max(48, Math.min(952, member.x + x / length * 182 * dt));
      member.y = Math.max(49, Math.min(631, member.y + y / length * 182 * dt));
    }
  }

  function moveBots(dt) {
    for (const member of game.crew) {
      if (!member.alive || member.human) continue;
      if (member.isImpostor && game.player.alive && !game.sabotageActive) {
        member.target = game.player;
        const gap = distance(member, game.player);
        if (gap < 34 && game.killCooldown <= 0 && Math.random() < .012) {
          game.killCooldown = 11;
          killPlayer();
          return;
        }
      } else if (distance(member, member.target) < 22 || !member.target) {
        member.wander -= dt;
        if (member.wander <= 0) {
          member.target = randomItem(consolePoints);
          member.wander = 3 + Math.random() * 5;
        }
      }
      const dx = member.target.x - member.x;
      const dy = member.target.y - member.y;
      const gap = Math.hypot(dx, dy) || 1;
      if (gap > 15) {
        if (Math.abs(dx) > 1) member.facing = Math.sign(dx);
        member.x = Math.max(48, Math.min(952, member.x + dx / gap * member.speed * dt));
        member.y = Math.max(49, Math.min(631, member.y + dy / gap * member.speed * dt));
      }
    }
  }

  function update(dt) {
    if (!game.running || game.ended) return;
    if (network.mode === 'guest') {
      network.inputClock += dt;
      if (network.inputClock >= .05 && network.guest?.link.open) {
        network.inputClock = 0;
        const input = game.meeting || game.taskOpen || !game.player.alive ? { x: 0, y: 0 } : movementVector();
        network.guest.link.send({ type: 'input', input });
      }
      return;
    }
    if (game.meeting || game.taskOpen) return;
    game.killCooldown = Math.max(0, game.killCooldown - dt);
    game.reportCooldown = Math.max(0, game.reportCooldown - dt);
    for (const member of game.crew) member.killCooldown = Math.max(0, (member.killCooldown || 0) - dt);
    game.hudClock += dt;
    if (game.hudClock >= .2) {
      game.hudClock = 0;
      const minutes = String(Math.floor(game.seconds / 60)).padStart(2, '0');
      const seconds = String(Math.max(0, Math.floor(game.seconds % 60))).padStart(2, '0');
      document.querySelector('#round-time').textContent = `${minutes}:${seconds}`;
      const room = nearestRoom();
      if (room !== game.lastLocation) {
        game.lastLocation = room;
        document.querySelector('#room-label').innerHTML = `${room} <span>·</span> KEPLER-09`;
      }
      updateActions();
    }
    if (game.role === 'impostor' || game.role === 'crew') {
      game.seconds -= dt;
      if (game.seconds <= 0) {
        endGame(game.role === 'crew' ? 'crew' : 'impostor', game.role === 'crew' ? 'Sabotajcı tur süresi dolmadan bulunamadı.' : 'Mürettebat seni zamanında durduramadı.');
        return;
      }
    }
    if (game.sabotageActive) {
      game.sabotage -= dt;
      if (game.sabotage <= 0) {
        endGame('impostor', 'Oksijen sistemi onarılamadı. Kepler-09 iletişimi kaybetti.');
        return;
      }
    }
    movePlayer(dt);
    moveBots(dt);
    moveNetworkPlayers(dt);
    if (network.mode === 'host') {
      network.snapshotClock += dt;
      if (network.snapshotClock >= .05) {
        network.snapshotClock = 0;
        network.room?.broadcast({ type: 'snapshot', state: exportGameState() });
      }
    }
    if (game.role === 'crew' && livingCrew().some(member => member.isImpostor && distance(member, game.player) < 32)) {
      game.player.suspect = true;
    }
  }

  function frame(time) {
    const dt = Math.min(.05, game.lastTime ? (time - game.lastTime) / 1000 : 0);
    game.lastTime = time;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  function setMovement(button, active) {
    const direction = button.dataset.dir;
    if (active) held.add(direction);
    else held.delete(direction);
    button.classList.toggle('pressed', active);
  }

  document.querySelectorAll('.move-button').forEach(button => {
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      setMovement(button, true);
    });
    const release = () => setMovement(button, false);
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
  });
  window.addEventListener('keydown', event => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(key)) event.preventDefault();
    keysDown.add(key);
    if (event.repeat) return;
    if (key === 'e' || key === ' ') interact();
    if (key === 'q') activateRoleAction();
    if (key === 'r') {
      if (game.role === 'impostor') sabotage();
      else game.nearestBody ? reportBody() : callEmergency();
    }
  });
  window.addEventListener('keyup', event => keysDown.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key));
  window.addEventListener('blur', () => { held.clear(); keysDown.clear(); document.querySelectorAll('.move-button').forEach(button => button.classList.remove('pressed')); });
  ui.use.addEventListener('click', interact);
  ui.roleAction.addEventListener('click', () => game.role === 'impostor' ? activateRoleAction() : activateRoleAction());
  ui.report.addEventListener('click', reportBody);
  ui.emergency.addEventListener('click', callEmergency);
  ui.createRoom.addEventListener('click', createOnlineRoom);
  ui.joinRoom.addEventListener('click', joinOnlineRoom);
  ui.joinCode.addEventListener('input', () => {
    ui.joinCode.value = ui.joinCode.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  });
  ui.joinCode.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); joinOnlineRoom(); }
  });
  ui.roomStart.addEventListener('click', beginOnlineMatch);
  ui.roomLeave.addEventListener('click', () => leaveOnlineRoom());
  ui.leaveOnline.addEventListener('click', () => leaveOnlineRoom());
  ui.roomShare.addEventListener('click', async () => {
    const code = network.room?.code ?? network.guest?.code;
    if (!code) return;
    const url = inviteUrl(code);
    try {
      await navigator.clipboard.writeText(url);
      ui.roomStatus.textContent = 'Davet bağlantısı kopyalandı.';
    } catch {
      ui.roomStatus.textContent = url;
    }
  });
  document.querySelectorAll('.role-choice').forEach(button => button.addEventListener('click', () => {
    game.requestedRole = button.dataset.role;
    document.querySelectorAll('.role-choice').forEach(choice => choice.classList.toggle('selected', choice === button));
  }));
  document.querySelector('#start-button').addEventListener('click', startGame);
  document.querySelector('#restart-button').addEventListener('click', () => {
    hide(ui.result);
    if (network.mode === 'offline') show(ui.intro);
    else { show(ui.room); updateRoomRoster(); }
  });
  document.querySelector('#skip-vote').addEventListener('click', () => castVote(null));
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.close === 'task-overlay') { game.taskOpen = false; hide(ui.task); }
  }));
  document.querySelector('#map-toggle').addEventListener('click', () => document.querySelector('#map-key').classList.toggle('visible'));
  document.querySelector('#map-key').innerHTML = '<b>GÖREV KONUMU</b><span>Haritadaki renkli konsollar görev noktalarıdır.</span>';
  document.querySelector('#emergency-button').addEventListener('click', () => game.role === 'impostor' ? sabotage() : callEmergency());

  const invitedCode = roomCodeFromUrl();
  if (invitedCode) {
    ui.joinCode.value = invitedCode;
    ui.onlineStatus.textContent = `${invitedCode} kodlu oda için katıl'a bas.`;
  }

  updateRoster();
  createTaskList();
  requestAnimationFrame(frame);
})();
