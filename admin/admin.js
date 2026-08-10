const $ = s => document.querySelector(s);
const state = { feedback: [], guests: [], subscribers: [] };

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
    await refresh();
  } catch { $('#loginView').hidden = false; $('#dashboardView').hidden = true; }
}
async function refresh(){
  const [f,g,s] = await Promise.all([
    api('/api/admin/feedback'), api('/api/admin/guests'), api('/api/admin/subscribers')
  ]);
  state.feedback=f.feedback; state.guests=g.guests; state.subscribers=s.subscribers;
  renderStats(); renderAll();
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
  ['feedback','guests','subscribers'].forEach(x=>$('#'+x+'Panel').hidden=x!==tab.dataset.tab);
}));
checkAuth();
