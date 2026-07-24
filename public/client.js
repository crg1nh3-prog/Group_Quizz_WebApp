const socket = io();

const $ = id => document.getElementById(id);
const qs = new URLSearchParams(location.search);

let roomId = (qs.get('room') || '').toUpperCase();
let role = qs.get('role') || '';
let selected = null;
let latest = null;

let hostQuestions = JSON.parse(
  localStorage.getItem('quizQuestions') || '[]'
);

let editingIndex = null;

function saveQuestionsLocally() {
  localStorage.setItem(
    'quizQuestions',
    JSON.stringify(hostQuestions)
  );
}

function show(id) {
  ['home', 'namePanel', 'hostPanel', 'playerPanel'].forEach(x => {
    $(x).classList.add('hidden');
  });

  $(id).classList.remove('hidden');
}

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));
}

function letter(i) {
  return String.fromCharCode(65 + i);
}

function setStatus(message, type = '') {
  const el = $('qmStatus');
  el.textContent = message;
  el.className = `small-status ${type}`;
}

function cleanForm() {
  $('qmQuestion').value = '';
  $('qmOption0').value = '';
  $('qmOption1').value = '';
  $('qmOption2').value = '';
  $('qmOption3').value = '';
  $('qmAnswer').value = '0';
  $('qmExplanation').value = '';

  editingIndex = null;
  $('saveQuestion').textContent = 'Add Question';
  setStatus('');
}

function getFormQuestion() {
  const question = $('qmQuestion').value.trim();

  const options = [
    $('qmOption0').value.trim(),
    $('qmOption1').value.trim(),
    $('qmOption2').value.trim(),
    $('qmOption3').value.trim()
  ].filter(Boolean);

  const answer = Number($('qmAnswer').value);
  const explanation = $('qmExplanation').value.trim();

  if (!question) {
    setStatus('Please enter a question.', 'error-text');
    return null;
  }

  if (options.length < 2) {
    setStatus('Please enter at least two options.', 'error-text');
    return null;
  }

  if (answer < 0 || answer >= options.length) {
    setStatus('Correct answer must match an available option.', 'error-text');
    return null;
  }

  return { question, options, answer, explanation };
}

function syncQuestionsToServer() {
  socket.emit(
    'host:loadQuestions',
    { roomId, questions: hostQuestions },
    res => {
      if (!res.ok) {
        setStatus(res.error || 'Unable to save questions.', 'error-text');
        return;
      }

      setStatus('Questions saved successfully.', 'success-text');

      hostQuestions = res.summary.questions || hostQuestions;
      saveQuestionsLocally();

      renderQuestionManager();
      render(res.summary);
    }
  );
}

$('createHost').onclick = () => {
  socket.emit('host:create', {}, async res => {
    if (!res.ok) return;

    roomId = res.summary.roomId;
    role = 'host';

    history.replaceState(null, '', `/?room=${roomId}&role=host`);

    show('hostPanel');

    $('roomPill').textContent = `Room ${roomId}`;
    $('hostRoomCode').textContent = roomId;

    const qr = await fetch(`/api/room/${roomId}/qr`).then(r => r.json());

    $('qr').src = qr.dataUrl;
    $('joinLink').href = qr.joinUrl;
    $('joinLink').textContent = qr.joinUrl;

    if (hostQuestions.length > 0) {
      syncQuestionsToServer();
    } else {
      hostQuestions = res.summary.questions || [];
      saveQuestionsLocally();
      render(res.summary);
      renderQuestionManager();
    }
  });
};

$('joinManual').onclick = () => {
  roomId = $('manualRoom').value.trim().toUpperCase();

  if (roomId) {
    role = 'player';
    history.replaceState(null, '', `/?room=${roomId}&role=player`);
    show('namePanel');
  }
};

$('confirmJoin').onclick = () => joinPlayer();

if (roomId && role === 'player') {
  show('namePanel');
}

function joinPlayer() {
  const name = $('playerName').value.trim() || 'Guest';

  socket.emit('player:join', { roomId, name }, res => {
    if (!res.ok) {
      $('joinError').textContent = res.error;
      return;
    }

    show('playerPanel');
    $('roomPill').textContent = `Room ${roomId}`;
    render(res.summary);
  });
}

$('startQuiz').onclick = () => {
  socket.emit('host:start', { roomId });
};

$('revealAnswer').onclick = () => {
  socket.emit('host:reveal', { roomId });
};

$('nextQuestion').onclick = () => {
  socket.emit('host:next', { roomId });
};

$('clearForm').onclick = cleanForm;

$('saveQuestion').onclick = () => {
  const q = getFormQuestion();

  if (!q) return;

  if (editingIndex === null) {
    hostQuestions.push(q);
  } else {
    hostQuestions[editingIndex] = q;
  }

  saveQuestionsLocally();
  cleanForm();
  syncQuestionsToServer();
};

socket.on('room:update', summary => {
  latest = summary;

  if (role === 'host') {
    hostQuestions = summary.questions || hostQuestions;
    saveQuestionsLocally();
    renderQuestionManager();
  }

  render(summary);
});

function render(summary) {
  if (!summary) return;

  const q = summary.question;
  selected = summary.responses?.[socket.id] ?? selected;

  if (role === 'host') {
    renderHost(summary, q);
  } else {
    renderPlayer(summary, q);
  }
}

function renderHost(summary, q) {
  if (summary.quizEnded) {
    $('progress').textContent = `${summary.totalQuestions}/${summary.totalQuestions}`;
    $('hostQuestion').textContent = '🎉 Quiz Completed!';
    $('hostOptions').innerHTML = `
      <div class="explanation">
        The quiz is completed. Scores are saved for this round.
      </div>
    `;

    $('bars').innerHTML = '';
    $('hostExplanation').classList.add('hidden');

    $('participants').innerHTML =
      summary.participants
        .map(p => {
          const score = summary.scores?.[p.id] || 0;

          return `
            <span class="chip">
              ${esc(p.name)} - ${score}/${summary.totalQuestions}
            </span>
          `;
        })
        .join('') || '<p class="muted">No participants yet.</p>';

    return;
  }

  $('progress').textContent 
