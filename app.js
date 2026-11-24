const students = [];
const $ = (selector) => document.querySelector(selector);
const dialog = $('#studentDialog');
const form = $('#studentForm');
function renderStudents(query = '') {
  const filtered = students.filter(s => (s.fullName + ' ' + s.matricNo).toLowerCase().includes(query.toLowerCase()));
  $('#studentList').innerHTML = filtered.map((s, i) => `<div class="student-row"><div class="avatar">${s.fullName.split(/\\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase()}</div><div class="student-meta"><strong>${escapeHtml(s.fullName)}</strong><small>${escapeHtml(s.matricNo || 'Matric number not added')} · ${escapeHtml(s.department || 'Department not added')}</small></div><button type="button" data-student="${i}">Open profile</button></div>`).join('');
  $('#studentEmpty').hidden = filtered.length > 0;
  $('#studentCount').textContent = String(students.length);
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function openForm(){ dialog.showModal(); }
$('#addStudentBtn').addEventListener('click', openForm);
$('#emptyAddBtn').addEventListener('click', openForm);
$('#studentSearch').addEventListener('input', e => renderStudents(e.target.value));
form.addEventListener('submit', e => {
  e.preventDefault();
  const data = new FormData(form);
  students.push({fullName:data.get('fullName').trim(),matricNo:data.get('matricNo').trim(),department:data.get('department').trim(),institution:data.get('institution').trim()});
  form.reset(); dialog.close(); renderStudents($('#studentSearch').value);
});
$('#resultFile').addEventListener('change', e => {
  const file = e.target.files[0];
  $('#fileName').textContent = file ? `${file.name} selected. Database and secure storage connection are pending.` : 'Documents will require review before results are marked verified.';
});
$('#menuBtn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
renderStudents();
// This is a UI foundation only. Connect Supabase Auth, PostgreSQL, Storage and OCR before using real student records.
