const socket = io();

const $ = id => document.getElementById(id);
const qs = new URLSearchParams(location.search);

let roomId = (qs.get('room') || '').toUpperCase();
let role = qs.get('role') || '';
let selected = null;
let latest = null;
let hostQuestions =2  JSON.parse(3    localStorage.getItem('quizQuestions') || '[]'4  );
let editingIndex = null;

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
  socket.emit('host:loadQuestions', { roomId, questions: hostQuestions }, res => {
    if (!res.ok) {
      setStatus(res.error || 'Unable to save questions.', 'error-text');
      return;
    }

    setStatus('Questions saved successfully.', 'success-text');
    hostQuestions = res.summary.questions || hostQuestions;
    renderQuestionManager();
    render(res.summary);
  });
}

$('createHost').onclick = () => {
  socket.emit('host:create', {}, async res => {
    if (!res.ok) return;

    roomId = res.summary.roomId;
    role = 'host';
    if (hostQuestions.length > 0) {2  syncQuestionsToServer();3} else {4  hostQuestions =5    res.summary.questions || [];6}

    history.replaceState(null, '', `/?room=${roomId}&role=host`);

    show('hostPanel');

    $('roomPill').textContent = `Room ${roomId}`;
    $('hostRoomCode').textContent = roomId;

    const qr = await fetch(`/api/room/${roomId}/qr`).then(r => r.json());

    $('qr').src = qr.dataUrl;
    $('joinLink').href = qr.joinUrl;
    $('joinLink').textContent = qr.joinUrl;

    render(res.summary);
    renderQuestionManager();
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
   localStorage.setItem(2  'quizQuestions',3  JSON.stringify(hostQuestions)4);
  } else {
   localStorage.setItem(2  'quizQuestions',3  JSON.stringify(hostQuestions)4);
  }

  cleanForm();
  syncQuestionsToServer();
};

socket.on('room:update', summary => {
  latest = summary;

  if (role === 'host') {
    hostQuestions = summary.questions || hostQuestions;
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
  $('progress').textContent = `${summary.currentIndex + 1}/${summary.totalQuestions}`;
  $('hostQuestion').textContent = q.question;
  $('participantCount').textContent = `(${summary.participants.length})`;

  $('hostOptions').innerHTML = q.options
    .map((o, i) => {
      const correctClass = summary.revealed && i === q.answer ? 'correct' : '';

      return `
        <div class="option ${correctClass}">
          <span class="option-letter">${letter(i)}</span>
          <span>${esc(o)}</span>
        </div>
      `;
    })
    .join('');

  const total = Math.max(1, Object.keys(summary.responses).length);

  $('bars').innerHTML = q.options
    .map((o, i) => {
      const count = summary.counts[i] || 0;
      const pct = Math.round((count / total) * 100);

      return `
        <div class="barRow">
          <div class="barLabel">
            <span>${letter(i)}. ${esc(o)}</span>
            <b>${count} (${pct}%)</b>
          </div>
          <div class="bar">
            <div class="barFill" style="width:${pct}%"></div>
          </div>
        </div>
      `;
    })
    .join('');

  $('participants').innerHTML =
    summary.participants
      .map(p => {
        const answered = summary.responses[p.id] !== undefined ? ' ✓' : '';

        return `<span class="chip">${esc(p.name)}${answered}</span>`;
      })
      .join('') || '<p class="muted">No participants yet.</p>';

  $('hostExplanation').classList.toggle('hidden', !summary.revealed);

  $('hostExplanation').innerHTML = summary.revealed
    ? `
      <b>Correct answer: ${letter(q.answer)}. ${esc(q.options[q.answer])}</b>
      <br />
      ${esc(q.explanation || 'No explanation added.')}
    `
    : '';
}

function renderPlayer(summary, q) {

  if (summary.quizEnded) {

    const score =
      summary.scores?.[socket.id] || 0;

    $('playerRoom').textContent =
      `Room ${summary.roomId}`;

    $('playerQuestion').innerHTML =
      '🎉 Quiz Completed!';

    $('playerOptions').innerHTML = `
      <div style="
        text-align:center;
        padding:20px;
      ">

        <h2>Your Score</h2>

        <h1 style="
          font-size:64px;
          color:#0078d4;
          margin:20px 0;
        ">
          ${score}/${summary.totalQuestions}
        </h1>

        <button id="retakeQuizBtn">
          Retake Quiz
        </button>

      </div>
    `;

    document
      .getElementById('retakeQuizBtn')
      ?.addEventListener('click', () => {

        selected = null;

        socket.emit(
          'player:retake',
          { roomId }
        );

      });

    return;
  }

  $('playerRoom').textContent =
    `Room ${summary.roomId} • Question ${
      summary.currentIndex + 1
    }/${summary.totalQuestions}`;

  $('playerQuestion').textContent =
    summary.started
      ? q.question
      : 'Waiting for host to start...';

  if (!summary.started) {
    $('playerOptions').innerHTML = '';
    return;
  }

  $('playerOptions').innerHTML = q.options
    .map((o, i) => {

      const selectedClass =
        selected === i ? 'selected' : '';

      const correctClass =
        summary.revealed && i === q.answer
          ? 'correct'
          : '';

      return `
        <button
          class="playerOption ${selectedClass} ${correctClass}"
          data-i="${i}"
          ${summary.revealed ? 'disabled' : ''}
        >
          <span class="option-letter">
            ${letter(i)}
          </span>

          <span>${esc(o)}</span>
        </button>
      `;
    })
    .join('');

  document
    .querySelectorAll('.playerOption')
    .forEach(btn => {

      btn.onclick = () => {

        selected = Number(btn.dataset.i);

        socket.emit(
          'player:answer',
          {
            roomId,
            optionIndex: selected
          }
        );

        renderPlayer(latest, q);
      };

    });

  $('playerExplanation')
    .classList.toggle(
      'hidden',
      !summary.revealed
    );

  $('playerExplanation').innerHTML =
    summary.revealed
      ? `
        <b>
          Correct answer:
          ${letter(q.answer)}.
          ${esc(q.options[q.answer])}
        </b>
        <br />
        ${esc(
          q.explanation ||
          'No explanation added.'
        )}
      `
      : '';
}

function renderQuestionManager() {
  $('questionCountBadge').textContent =
    `${hostQuestions.length} question${hostQuestions.length === 1 ? '' : 's'}`;

  if (!hostQuestions.length) {
    $('questionList').innerHTML = `
      <div class="empty-list">
        No questions yet. Add your first question using the form above.
      </div>
    `;
    return;
  }

  $('questionList').innerHTML = hostQuestions
    .map((q, i) => {
      return `
        <div class="question-item">
          <div class="question-item-main">
            <div class="question-number">${i + 1}</div>
            <div>
              <h4>${esc(q.question)}</h4>
              <p>
                Correct: <b>${letter(q.answer)}. ${esc(q.options[q.answer])}</b>
              </p>
            </div>
          </div>

          <div class="question-actions">
            <button class="tiny secondary" onclick="moveQuestion(${i}, -1)">↑</button>
            <button class="tiny secondary" onclick="moveQuestion(${i}, 1)">↓</button>
            <button class="tiny" onclick="editQuestion(${i})">Edit</button>
            <button class="tiny danger" onclick="deleteQuestion(${i})">Delete</button>
          </div>
        </div>
      `;
    })
    .join('');
}

window.editQuestion = function (index) {
  const q = hostQuestions[index];

  $('qmQuestion').value = q.question;
  $('qmOption0').value = q.options[0] || '';
  $('qmOption1').value = q.options[1] || '';
  $('qmOption2').value = q.options[2] || '';
  $('qmOption3').value = q.options[3] || '';
  $('qmAnswer').value = String(q.answer);
  $('qmExplanation').value = q.explanation || '';

  editingIndex = index;
  $('saveQuestion').textContent = 'Update Question';

  setStatus(`Editing question ${index + 1}`, 'success-text');

  document.querySelector('.manager-card').scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
};

window.deleteQuestion = function (index) {
  if (hostQuestions.length === 1) {
    setStatus('At least one question is required.', 'error-text');
    return;
  }

 JavaScript1localStorage.setItem(2  'quizQuestions',3  JSON.stringify(hostQuestions)4);
  cleanForm();
  syncQuestionsToServer();
};

window.moveQuestion = function (index, direction) {
  const newIndex = index + direction;

  if (newIndex < 0 || newIndex >= hostQuestions.length) return;

  const temp = hostQuestions[index];
  hostQuestions[index] = hostQuestions[newIndex];
 localStorage.setItem(2  'quizQuestions',3  JSON.stringify(hostQuestions)4);

  syncQuestionsToServer();
};
