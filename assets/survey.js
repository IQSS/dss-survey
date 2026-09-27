// survey.js: checks the form and sends it to the receiver (a Google Apps Script web app) as JSON.
// The body is sent as text/plain, which the browser posts without a CORS preflight; Apps Script
// answers through a redirect that fetch follows, and the reply says whether the row was saved.
// Apps Script is slow from cold (35 seconds has been seen for the first request after a quiet spell,
// 2 seconds once running), so the page wakes the receiver at the first answer, thanks the respondent as
// soon as they submit, and sends with keepalive so the request finishes even if they close the tab.
// If it fails while they are still here, the thanks gives way to a Try again button.
(() => {
  const form = document.getElementById('survey-form');
  if (!form) return;
  const thanks = document.getElementById('survey-thanks');
  const status = form.querySelector('.status');
  const button = form.querySelector('button[type="submit"]');
  const questions = [...form.querySelectorAll('.question')];

  // The clock starts at the first answer, so the Sheet records how long the survey really takes.
  // The first answer also wakes the receiver, so it is running by the time they press Submit.
  let started = null;
  const start = () => {
    if (started) return;
    started = Date.now();
    fetch(form.dataset.endpoint).catch(() => {});
  };
  form.addEventListener('input', start);
  form.addEventListener('change', start);

  const inputs = (q) => [...q.querySelectorAll(`input[name="${q.dataset.q}"]`)];

  questions.forEach((q) => {
    const other = q.querySelector('.other-text');
    const otherBox = other && q.querySelector('.opt-other input:not(.other-text)');
    // Typing in the Other box ticks Other; unticking Other empties the box.
    if (other) {
      other.addEventListener('input', () => {
        if (other.value.trim() && !otherBox.checked && !otherBox.disabled) {
          otherBox.checked = true;
          otherBox.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      otherBox.addEventListener('change', () => { if (!otherBox.checked) other.value = ''; });
    }

    // A cap on the number of boxes: once it is reached, the rest are disabled until one is unticked.
    const max = Number(q.dataset.max);
    if (max) {
      const counter = q.querySelector('.counter');
      const update = () => {
        const boxes = inputs(q);
        const n = boxes.filter((b) => b.checked).length;
        boxes.forEach((b) => { b.disabled = !b.checked && n >= max; });
        if (other) other.disabled = !otherBox.checked && n >= max;
        counter.textContent = n >= max ? `${n} of ${max} chosen. Untick one to change.` : `${n} of ${max} chosen`;
        counter.classList.toggle('full', n >= max);
      };
      q.addEventListener('change', update);
      update();
    }

    q.addEventListener('change', () => clearError(q));
  });

  // An exclusive box ("None of the above") and the other boxes in the same question clear each other.
  form.querySelectorAll('input[type="checkbox"][data-exclusive]').forEach((none) => {
    const q = none.closest('.question');
    q.addEventListener('change', (e) => {
      if (!e.target.checked || e.target.type !== 'checkbox') return;
      if (e.target === none) inputs(q).forEach((b) => { if (b !== none) b.checked = false; });
      else none.checked = false;
    });
  });

  function answer(q) {
    const type = q.dataset.type;
    const other = q.querySelector('.other-text');
    const withOther = (v) => (v === 'Other' && other && other.value.trim() ? `Other: ${other.value.trim()}` : v);
    if (type === 'radio') {
      const c = inputs(q).find((b) => b.checked);
      return c ? withOther(c.value) : '';
    }
    if (type === 'checkbox') return inputs(q).filter((b) => b.checked).map((b) => withOther(b.value));
    const el = q.querySelector(`[name="${q.dataset.q}"]`);
    return el ? el.value.trim() : '';
  }

  function setError(q, text) {
    q.classList.add('invalid');
    q.querySelector('.error').textContent = text;
  }
  function clearError(q) {
    q.classList.remove('invalid');
    q.querySelector('.error').textContent = '';
  }

  const isEmpty = (a) => (Array.isArray(a) ? a.length === 0 : a === '');
  const byId = (id) => questions.find((q) => q.dataset.q === id);

  function check() {
    let first = null;
    questions.forEach((q) => {
      clearError(q);
      const a = answer(q);
      const empty = isEmpty(a);
      // Required outright, or required because another question (named by data-required-if) has an answer.
      const other = q.dataset.requiredIf && byId(q.dataset.requiredIf);
      const required = q.dataset.required || (other && !isEmpty(answer(other)));
      if (required && empty) setError(q, q.dataset.requiredMessage || 'Please answer this question.');
      else if (q.dataset.type === 'email' && a && !q.querySelector('input').checkValidity()) {
        setError(q, 'Please enter an email address, or leave this blank.');
      }
      if (!first && q.classList.contains('invalid')) first = q;
    });
    return first;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const bad = check();
    if (bad) {
      status.textContent = 'Some answers need attention.';
      bad.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const focusable = bad.querySelector('input, select, textarea');
      if (focusable) focusable.focus({ preventScroll: true });
      return;
    }
    const answers = {};
    questions.forEach((q) => { answers[q.dataset.q] = answer(q); });
    const payload = {
      survey: form.dataset.survey,
      answers,
      seconds: started ? Math.round((Date.now() - started) / 1000) : null,
      website: form.querySelector('input[name="website"]').value,
    };
    const body = JSON.stringify(payload);
    form.hidden = true;
    form.previousElementSibling?.classList.contains('survey-meta') && (form.previousElementSibling.hidden = true);
    thanks.hidden = false;
    thanks.focus();
    window.scrollTo({ top: 0 });
    send(body);
  });

  const failure = document.createElement('div');
  failure.className = 'send-failure';
  failure.hidden = true;
  failure.innerHTML = '<p>Your answers have not reached us yet. Please try again, or ' +
    '<a href="https://www.iq.harvard.edu/data-science-services/contact-us">write to us</a>.</p>' +
    '<div class="actions"><button type="button" class="dss-btn">Try again</button><span class="status" role="status"></span></div>';
  thanks.append(failure);
  const retry = failure.querySelector('button');
  const retryStatus = failure.querySelector('.status');
  let pending = null;
  retry.addEventListener('click', () => send(pending));

  async function send(body) {
    pending = body;
    retry.disabled = true;
    retryStatus.textContent = failure.hidden ? '' : 'Sending…';
    try {
      const res = await fetch(form.dataset.endpoint, { method: 'POST', body, keepalive: true });
      const reply = await res.json();
      if (!reply.ok) throw new Error(reply.error || 'not saved');
      failure.hidden = true;
    } catch (err) {
      failure.hidden = false;
      retryStatus.textContent = '';
    } finally {
      retry.disabled = false;
    }
  }
})();
