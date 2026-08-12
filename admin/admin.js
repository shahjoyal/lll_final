const $ = s => document.querySelector(s);
const state = { feedback: [], guests: [], subscribers: [], newsletters: [], mailEnabled: false };

async function api(url, options = {}) {
  const r = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }});
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.message || 'Request failed');
  return data;
}
function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
function date(v){return new Date(v).toLocaleString();}

async function checkAuth(){
  try {
    const me = await api('/api/admin/me');
    $('#adminEmail').textContent = me.email;
    $('#loginView').hidden = true; $('#dashboardView').hidden = false;
    initNewsletterPanel();
    await refresh();
  } catch { $('#loginView').hidden = false; $('#dashboardView').hidden = true; }
}
async function refresh(){
  const [f,g,s,n] = await Promise.all([
    api('/api/admin/feedback'), api('/api/admin/guests'), api('/api/admin/subscribers'), api('/api/admin/newsletters')
  ]);
  state.feedback=f.feedback; state.guests=g.guests; state.subscribers=s.subscribers;
  state.newsletters=n.newsletters; state.mailEnabled=n.mailEnabled;
  renderStats(); renderAll();
  updateNewsletterDynamic();
}
function renderStats(){
  $('#stats').innerHTML = [
    ['Feedback',state.feedback.length],['Guest requests',state.guests.length],
    ['Active subscribers',state.subscribers.filter(x=>x.active).length]
  ].map(([a,b])=>`<div class="stat"><b>${b}</b><span>${a}</span></div>`).join('');
}
function renderAll(){renderFeedback();renderGuests();renderSubscribers();}
function renderFeedback(){
  $('#feedbackPanel').innerHTML=`<h2>Feedback</h2><table><thead><tr><th>Date</th><th>Rating</th><th>Name</th><th>Feedback</th><th>Status</th><th>Actions</th></tr></thead><tbody>${
    state.feedback.map(x=>`<tr><td>${date(x.createdAt)}</td><td>${'★'.repeat(x.rating)}${'☆'.repeat(5-x.rating)}</td><td>${esc(x.name)}</td><td class="message">${esc(x.message)}</td><td><span class="badge ${x.approved?'good':''}">${x.approved?'Published':'Pending'}</span></td><td><div class="actions">
    <button class="small" onclick="toggleFeedback('${x._id}',${!x.approved})">${x.approved?'Hide':'Publish'}</button>
    <button class="small danger" onclick="deleteItem('feedback','${x._id}')">Delete</button></div></td></tr>`).join('')||'<tr><td colspan="6" class="muted">No feedback yet.</td></tr>'}</tbody></table>`;
}
function renderGuests(){
  $('#guestsPanel').innerHTML=`<h2>Guest Requests</h2><table><thead><tr><th>Date</th><th>Name</th><th>Email</th><th>Message</th><th>Status</th><th>Actions</th></tr></thead><tbody>${
    state.guests.map(x=>`<tr><td>${date(x.createdAt)}</td><td>${esc(x.name)}</td><td><a href="mailto:${esc(x.email)}">${esc(x.email)}</a></td><td class="message">${esc(x.message)}</td><td><span class="badge">${esc(x.status)}</span></td><td><div class="actions"><button class="small" onclick="setGuest('${x._id}','contacted')">Contacted</button><button class="small" onclick="setGuest('${x._id}','closed')">Close</button><button class="small danger" onclick="deleteItem('guests','${x._id}')">Delete</button></div></td></tr>`).join('')||'<tr><td colspan="6" class="muted">No guest requests yet.</td></tr>'}</tbody></table>`;
}
function renderSubscribers(){
  $('#subscribersPanel').innerHTML=`<h2>Newsletter Subscribers</h2><table><thead><tr><th>Date</th><th>Name</th><th>Email</th><th>Status</th><th>Actions</th></tr></thead><tbody>${
    state.subscribers.map(x=>`<tr><td>${date(x.createdAt)}</td><td>${esc(x.name)}</td><td>${esc(x.email)}</td><td><span class="badge ${x.active?'good':''}">${x.active?'Active':'Unsubscribed'}</span></td><td><div class="actions"><button class="small" onclick="toggleSubscriber('${x._id}',${!x.active})">${x.active?'Unsubscribe':'Reactivate'}</button><button class="small danger" onclick="deleteItem('subscribers','${x._id}')">Delete</button></div></td></tr>`).join('')||'<tr><td colspan="5" class="muted">No subscribers yet.</td></tr>'}</tbody></table>`;
}
async function toggleFeedback(id, approved){await api(`/api/admin/feedback/${id}`,{method:'PATCH',body:JSON.stringify({approved})});await refresh();}
async function setGuest(id,status){await api(`/api/admin/guests/${id}`,{method:'PATCH',body:JSON.stringify({status})});await refresh();}
async function toggleSubscriber(id,active){await api(`/api/admin/subscribers/${id}`,{method:'PATCH',body:JSON.stringify({active})});await refresh();}
async function deleteItem(type,id){
  if(!confirm('Delete this record permanently?')) return;
  const path=type==='feedback'?'feedback':type==='guests'?'guests':'subscribers';
  await api(`/api/admin/${path}/${id}`,{method:'DELETE'});await refresh();
}
window.toggleFeedback=toggleFeedback;window.setGuest=setGuest;window.toggleSubscriber=toggleSubscriber;window.deleteItem=deleteItem;

$('#loginForm').addEventListener('submit',async e=>{
  e.preventDefault(); $('#loginError').textContent='';
  try{
    await api('/api/admin/login',{method:'POST',body:JSON.stringify({email:e.target.email.value,password:e.target.password.value})});
    e.target.reset(); await checkAuth();
  }catch(err){$('#loginError').textContent=err.message;}
});
$('#logoutBtn').addEventListener('click',async()=>{await api('/api/admin/logout',{method:'POST'});location.reload();});
document.querySelectorAll('.tab').forEach(tab=>tab.addEventListener('click',()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));tab.classList.add('active');
  ['feedback','guests','subscribers','newsletter'].forEach(x=>$('#'+x+'Panel').hidden=x!==tab.dataset.tab);
}));

/* ---------- Newsletter composer ---------- */
function initNewsletterPanel(){
  $('#newsletterPanel').innerHTML = `
    <h2>Send Newsletter</h2>
    <div id="nlMailBanner"></div>
    <form id="nlForm" class="newsletter-form">
      <label>Subject
        <input type="text" id="nlSubject" maxlength="200" placeholder="e.g. New episode: Building resilient supply chains" required>
      </label>
      <label>Message
        <textarea id="nlBody" rows="10" maxlength="50000" placeholder="Write your update here. Leave a blank line between paragraphs." required></textarea>
      </label>
      <label class="checkbox-row">
        <input type="checkbox" id="nlRawHtml">
        <span>Advanced: I'm pasting my own HTML instead of plain text</span>
      </label>
      <div class="actions">
        <button type="button" id="nlPreviewBtn" class="secondary">Preview</button>
        <button type="submit" id="nlSendBtn">Send to <span id="nlRecipientCount">0</span> active subscriber(s)</button>
      </div>
      <p id="nlStatus" class="muted"></p>
      <p id="nlResult" class="muted"></p>
    </form>
    <div id="nlPreviewWrap" hidden>
      <h3>Preview</h3>
      <iframe id="nlPreviewFrame" title="Newsletter preview" sandbox=""></iframe>
    </div>
    <h3>Previously sent</h3>
    <div id="nlHistory"></div>
  `;

  $('#nlPreviewBtn').addEventListener('click', async () => {
    const subject = $('#nlSubject').value.trim();
    const body = $('#nlBody').value;
    const isRawHtml = $('#nlRawHtml').checked;
    if (!body.trim()) { $('#nlResult').textContent = 'Write a message first.'; return; }
    try {
      const { html } = await api('/api/admin/newsletter/preview', { method:'POST', body: JSON.stringify({ subject, body, isRawHtml }) });
      $('#nlPreviewWrap').hidden = false;
      $('#nlPreviewFrame').srcdoc = html;
      $('#nlResult').textContent = '';
    } catch (err) {
      $('#nlResult').textContent = err.message;
    }
  });

  $('#nlForm').addEventListener('submit', async e => {
    e.preventDefault();
    const subject = $('#nlSubject').value.trim();
    const body = $('#nlBody').value;
    const isRawHtml = $('#nlRawHtml').checked;
    const count = state.subscribers.filter(x=>x.active).length;
    if (!subject || !body.trim()) { $('#nlResult').textContent = 'Please fill in a subject and message.'; return; }
    if (!confirm(`Send "${subject}" to ${count} active subscriber(s)? This can't be undone.`)) return;
    const btn = $('#nlSendBtn');
    btn.disabled = true;
    $('#nlStatus').textContent = 'Sending… this can take a minute for larger lists, please don\'t close this tab.';
    $('#nlResult').textContent = '';
    try {
      const result = await api('/api/admin/newsletter/send', { method:'POST', body: JSON.stringify({ subject, body, isRawHtml }) });
      $('#nlResult').textContent = result.message + (result.failedEmails && result.failedEmails.length ? ` Failed: ${result.failedEmails.join(', ')}` : '');
      $('#nlForm').reset();
      $('#nlPreviewWrap').hidden = true;
      await refresh();
    } catch (err) {
      $('#nlResult').textContent = err.message;
    } finally {
      btn.disabled = false;
      $('#nlStatus').textContent = '';
    }
  });
}

function updateNewsletterDynamic(){
  const activeCount = state.subscribers.filter(x=>x.active).length;
  const countEl = $('#nlRecipientCount');
  if (countEl) countEl.textContent = activeCount;

  const banner = $('#nlMailBanner');
  if (banner) {
    banner.innerHTML = state.mailEnabled
      ? ''
      : `<div class="badge" style="background:#fff0ee;color:var(--danger);display:block;padding:12px 14px;margin-bottom:16px;">Email sending isn't configured yet. Add <code>SMTP_USER</code>, <code>SMTP_PASS</code> and <code>FROM_EMAIL</code> to your <code>.env</code> file (see README), then restart the server.</div>`;
  }

  const historyEl = $('#nlHistory');
  if (historyEl) {
    historyEl.innerHTML = state.newsletters.length
      ? `<table><thead><tr><th>Date</th><th>Subject</th><th>Sent</th><th>Failed</th></tr></thead><tbody>${
          state.newsletters.map(n=>`<tr><td>${date(n.sentAt)}</td><td>${esc(n.subject)}</td><td>${n.recipientCount}</td><td>${n.failedCount||0}</td></tr>`).join('')
        }</tbody></table>`
      : '<p class="muted">No newsletters sent yet.</p>';
  }
}

checkAuth();