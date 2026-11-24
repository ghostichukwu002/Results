(() => {
  const $ = s => document.querySelector(s);
  const authView = $('#authView'), appView = $('#appView');
  const ADMIN_EMAIL = 'okaforanointing37@gmail.com';
  let supabaseClient, currentUser, isAdmin = false, authMode = 'login';
  let courseCache = [], gradeSettings = null;
  let performanceChart = null, gradeChart = null;
  // crypto.randomUUID() is only available in secure contexts (HTTPS/localhost), so provide a fallback.
  const newId = () => (window.crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10));
  const initials = name => (name || 'A').trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function authMessage(message,type=''){const el=$('#authMessage');el.textContent=message;el.className='notice '+type}
  function uploadMessage(message,type=''){const el=$('#uploadMessage');el.textContent=message;el.className='notice '+type}
  function setAuthMode(mode){authMode=mode;const signup=mode==='signup';$('#loginTab').classList.toggle('active',!signup);$('#signupTab').classList.toggle('active',signup);$('#nameField').classList.toggle('hidden',!signup);$('#fullName').required=signup;$('#password').autocomplete=signup?'new-password':'current-password';$('#authTitle').innerHTML=signup?'Create your <em>account.</em>':'Welcome <em>back.</em>';$('#authSubtitle').textContent=signup?'Use your own email address to create a private account.':'Sign in to access your academic records.';$('#authSubmit').textContent=signup?'Create account':'Sign in';authMessage('');}
  async function init(){
    if(!window.supabase||!window.SUPABASE_CONFIG?.url||!window.SUPABASE_CONFIG?.publishableKey){authMessage('Supabase configuration is missing. Please check config.js.','error');return;}
    supabaseClient=window.supabase.createClient(window.SUPABASE_CONFIG.url,window.SUPABASE_CONFIG.publishableKey);
    $('#loginTab').onclick=()=>setAuthMode('login');$('#signupTab').onclick=()=>setAuthMode('signup');
    $('#authForm').addEventListener('submit',handleAuth);
    const {data:{session}}=await supabaseClient.auth.getSession();
    if(session) await showApp(session.user);
    supabaseClient.auth.onAuthStateChange(async(event,session)=>{if(session&&event==='SIGNED_IN'&&currentUser?.id!==session.user.id) await showApp(session.user); if(!session){currentUser=null;appView.classList.add('hidden');authView.classList.remove('hidden');}});
  }
  async function handleAuth(e){
    e.preventDefault();const email=$('#email').value.trim(),password=$('#password').value;
    $('#authSubmit').disabled=true;authMessage(authMode==='signup'?'Creating your account…':'Signing you in…');
    try{
      if(authMode==='signup'){
        const full_name=$('#fullName').value.trim();
        const {data,error}=await supabaseClient.auth.signUp({email,password,options:{data:{full_name}}});if(error)throw error;
        if(data.session) await showApp(data.user); else authMessage('Account created. Check your email for the verification link, then return here to sign in.','success');
      }else{const {data,error}=await supabaseClient.auth.signInWithPassword({email,password});if(error)throw error;await showApp(data.user);}
    }catch(err){authMessage(err.message||'Could not complete sign-in.','error');}finally{$('#authSubmit').disabled=false;}
  }
  async function showApp(user){
    currentUser=user;authView.classList.add('hidden');appView.classList.remove('hidden');
    const name=user.user_metadata?.full_name||user.user_metadata?.name||user.email?.split('@')[0]||'Student';
    $('#sideName').textContent=name;$('#sideAvatar').textContent=initials(name);$('#accountShortcut').textContent=initials(name);
    $('#accountName').textContent=name;$('#accountEmail').textContent=user.email||'';$('#accountAvatar').textContent=initials(name);$('#accountId').textContent=user.id;
    const {data:adminFlag,error:adminError}=await supabaseClient.rpc('current_user_is_admin');
    isAdmin=!adminError&&adminFlag===true&&String(user.email||'').toLowerCase()===ADMIN_EMAIL;
    $('#sideRole').textContent=isAdmin?'Course administrator':'Student account';
    $('#roleBadge').textContent=isAdmin?'Course administrator':'Student account';$('#roleBadge').classList.toggle('admin',isAdmin);
    $('#coursesNav').classList.toggle('hidden',!isAdmin);
    $('#permissionTitle').textContent=isAdmin?'Course administrator + student':'Student access';
    $('#permissionCopy').textContent=isAdmin?'You can view and maintain the full departmental course list. Your own results remain private; admin access does not reveal another student’s grades or documents.':'You can upload and manage your own results, documents and academic history. Other users cannot access your records.';
    $('#studentAccessNote').classList.toggle('hidden',isAdmin);
    if(isAdmin){await seedDepartmentCourses();await loadCourses();}
    await loadGradeSettings();
    await loadCourseLookup();
    await refreshData();
    if(isAdmin) navigate('courses');
  }
  async function refreshData(){
    if(!currentUser)return;
    const [{data:results,error:rErr},{data:docs,error:dErr}]=await Promise.all([
      supabaseClient.from('results').select('id,course_code,course_title,credit_units,academic_session,semester,assignment_score,exam_score,total_score,score,grade_point,grade,created_at').eq('user_id',currentUser.id).order('created_at',{ascending:false}),
      supabaseClient.from('uploaded_documents').select('id,file_name,academic_session,semester,created_at').eq('user_id',currentUser.id).order('created_at',{ascending:false})
    ]);
    if(rErr||dErr){console.error(rErr||dErr);return;}
    const rs=results||[],ds=docs||[];$('#courseCount').textContent=rs.length;$('#uploadCount').textContent=ds.length;
    const totalUnits=rs.reduce((a,r)=>a+Number(r.credit_units||0),0),points=rs.reduce((a,r)=>a+Number(r.credit_units||0)*Number(r.grade_point||0),0);
    const cgpa=totalUnits?points/totalUnits:null;
    $('#cgpaValue').textContent=cgpa===null?'—':cgpa.toFixed(2);
    renderCharts(rs);
    const renderRows=arr=>arr.map(r=>`<div class="record-row result-record"><div><strong>${escapeHtml(r.course_code)}</strong><small>${escapeHtml(r.course_title)} · ${escapeHtml(r.academic_session)} · ${Number(r.semester)===2?'Second':'First'} semester</small><small class="score-detail">Assignment ${r.assignment_score??'—'} · Exam ${r.exam_score??'—'} · Total ${r.total_score??r.score??'—'}</small></div><div class="result-grade"><b>${escapeHtml(r.grade||'Pending')}</b><small>${Number(r.grade_point||0).toFixed(1)} GP</small></div></div>`).join('');
    $('#recentResults').innerHTML=rs.length?renderRows(rs.slice(0,5)):'<div class="empty-state"><div class="empty-icon">▤</div><h3>Your academic story starts here</h3><p>Enter a course code and add your first result.</p><button class="outline-btn" data-goto="uploads">Add a result</button></div>';
    $('#resultsList').innerHTML=rs.length?renderRows(rs):'<div class="empty-state"><div class="empty-icon">▤</div><h3>No results added yet</h3><p>Enter a course code to add your first result.</p><button class="outline-btn" data-goto="uploads">Add a result</button></div>';
    $('#recentResults').querySelectorAll('[data-goto]').forEach(b=>b.onclick=()=>navigate(b.dataset.goto));
    $('#resultsList').querySelectorAll('[data-goto]').forEach(b=>b.onclick=()=>navigate(b.dataset.goto));
  }
  function renderCharts(rows){
    const performanceCanvas=$('#performanceChart'),gradeCanvas=$('#gradeChart');
    if(!performanceCanvas||!gradeCanvas||!window.Chart)return;
    const semesterMap=new Map();
    rows.forEach(r=>{
      const key=(r.academic_session||'Session not set')+' · '+(Number(r.semester)===2?'Second':'First')+' semester';
      const units=Number(r.credit_units||0),gp=Number(r.grade_point||0);
      if(!semesterMap.has(key))semesterMap.set(key,{units:0,points:0,sort:(r.academic_session||'')+'-'+String(r.semester||'1')});
      const item=semesterMap.get(key);item.units+=units;item.points+=units*gp;
    });
    const semesters=[...semesterMap.entries()].sort((a,b)=>a[1].sort.localeCompare(b[1].sort));
    const hasPerformance=semesters.some(([,v])=>v.units>0);
    $('#performanceEmpty').classList.toggle('hidden',hasPerformance);
    if(performanceChart)performanceChart.destroy();
    performanceChart=new Chart(performanceCanvas,{type:'line',data:{labels:semesters.map(([label])=>label),datasets:[{label:'Semester GPA',data:semesters.map(([,v])=>v.units?Number((v.points/v.units).toFixed(2)):null),borderColor:'#df7738',backgroundColor:'rgba(223,119,56,.13)',fill:true,tension:.38,pointRadius:4,pointHoverRadius:6,pointBackgroundColor:'#df7738',pointBorderColor:'#fff',pointBorderWidth:2,spanGaps:true}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{backgroundColor:'#1d304b',padding:11,displayColors:false,callbacks:{label:c=>' GPA: '+(c.parsed.y??'—')}}},scales:{x:{grid:{display:false},ticks:{color:'#8a94a2',font:{size:10},maxRotation:0,autoSkip:true}},y:{beginAtZero:true,suggestedMax:4,grid:{color:'rgba(30,48,75,.07)'},ticks:{color:'#8a94a2',font:{size:10},precision:1}}}}});
    const gradeCounts=new Map();rows.forEach(r=>{const grade=String(r.grade||'').trim().toUpperCase();if(grade&&grade!=='UPLOADED')gradeCounts.set(grade,(gradeCounts.get(grade)||0)+1);});
    const gradeEntries=[...gradeCounts.entries()].sort((a,b)=>a[0].localeCompare(b[0]));const hasGrades=gradeEntries.length>0;
    $('#gradeEmpty').classList.toggle('hidden',hasGrades);if(gradeChart)gradeChart.destroy();
    gradeChart=new Chart(gradeCanvas,{type:'doughnut',data:{labels:gradeEntries.map(([g])=>g),datasets:[{data:gradeEntries.map(([,n])=>n),backgroundColor:['#df7738','#314d73','#6d9a83','#e8b46d','#8b91b0','#bd8d9c','#9aa8b6'],borderColor:'#fff',borderWidth:4,hoverOffset:5}]},options:{responsive:true,maintainAspectRatio:false,cutout:'70%',plugins:{legend:{display:false},tooltip:{backgroundColor:'#1d304b',padding:10}}}});
    $('#gradeLegend').innerHTML=gradeEntries.map(([grade,count],i)=>'<span class="legend-item"><i class="legend-dot" style="background:'+['#df7738','#314d73','#6d9a83','#e8b46d','#8b91b0','#bd8d9c','#9aa8b6'][i%7]+'"></i>'+escapeHtml(grade)+' <b>'+count+'</b></span>').join('');
  }
  async function handleUpload(e){
    e.preventDefault();const file=$('#resultFile').files[0];if(!file)return;
    if(file.size>20*1024*1024){uploadMessage('That file is larger than 20 MB.','error');return;}
    // Some phones (and some file managers) report an empty MIME type, so fall back to the file extension.
    const extension=(file.name.split('.').pop()||'').toLowerCase();
    const extensionMime={pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp'}[extension];
    const mime=file.type||extensionMime||'';
    const allowed=['application/pdf','image/jpeg','image/png','image/webp'];if(!allowed.includes(mime)){uploadMessage('Please choose a PDF, JPG, PNG or WEBP file.','error');return;}
    const session=$('#sessionInput').value.trim(),semester=Number($('#semesterInput').value),safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_'),path=`${currentUser.id}/${newId()}-${safeName}`;
    uploadMessage('Uploading your document securely…');
    try{
      const {error:storageError}=await supabaseClient.storage.from('result-documents').upload(path,file,{contentType:mime,upsert:false});if(storageError)throw storageError;
      const {error:rowError}=await supabaseClient.from('uploaded_documents').insert({user_id:currentUser.id,file_name:file.name,storage_path:path,mime_type:mime,file_size:file.size,academic_session:session,semester,processing_status:'review_required'});
      if(rowError){await supabaseClient.storage.from('result-documents').remove([path]);throw rowError;}
      $('#uploadForm').reset();$('#fileLabel').textContent='Choose a result document';uploadMessage('Upload complete. The document is saved privately; results still need to be entered and reviewed.','success');await refreshData();
    }catch(err){uploadMessage(err.message||'Upload failed. Please try again.','error');}
  }
  const DEPARTMENT_COURSES = [
    ['PHY 101','General Physics I',2],['MTH 101','Elementary Mathematics I',2],['STA 111','Descriptive Statistics',3],['PHY 107','General Physics Practical',1],['CSC 101','Introduction to Computer Science',2],['CHM 101','General Chemistry I',2],['GST 111','Communication in English',2],['CHM 107','General Chemistry Practical',1],
    ['PHY 108','General Physics Practical II',1],['MTH 102','Elementary Mathematics II',2],['CSC 112','Computer Application and Software',2],['COS 102','Problem Solving',3],['MAT 116','Logic and Sets',2],['STA 112','Inference',2],['GST 121','Uses of Library',2],['PHY 102','General Physics II',2],['CHM 102','General Chemistry II',2],['GST 112','Nigeria Peoples and Culture',2],['CHM 108','General Chemistry Practical II',1],
    ['SEW 2151','Introduction to Software Engineering',2],['MTH 201','Mathematical Methods I',2],['EDU 205','Introduction to Online Learning',2],['CSC 224','System Analysis and Design',2],['COS 201','Computer Programming I',3],['CSC 203','Discrete Structures',2],['PHY 215','Modern Physics',3],['IFT 211','Digital Logic',2],
    ['CSC 222','Introduction to Computer Hardware',2],['GST 212','Philosophy',2],['ENV 202','Environmental Awareness',1],['COS 212','Structured Programming',2],['IFT 212','Computer Architecture',2],['CSC 264','Data Structures',2],['MTH 205','Linear Algebra',2],['ENT 211','Entrepreneurship',2],['PHY 202','Electric Circuits and Electronics',1],['MTH 202','Differential Equation',2],['CSC 202','Computer Programming',2],['GST-FPS 241','Applied Physical Sciences',1]
  ];
  const COURSE_GROUPS = [
    {title:'100 Level · First Semester',codes:['PHY 101','MTH 101','STA 111','PHY 107','CSC 101','CHM 101','GST 111','CHM 107']},
    {title:'100 Level · Second Semester',codes:['PHY 108','MTH 102','CSC 112','COS 102','MAT 116','STA 112','GST 121','PHY 102','CHM 102','GST 112','CHM 108']},
    {title:'200 Level · First Semester',codes:['SEW 2151','MTH 201','EDU 205','CSC 224','COS 201','CSC 203','PHY 215','IFT 211']},
    {title:'200 Level · Second Semester',codes:['CSC 222','GST 212','ENV 202','COS 212','IFT 212','CSC 264','MTH 205','ENT 211','PHY 202','MTH 202','CSC 202','GST-FPS 241']}
  ];
  async function seedDepartmentCourses(){
    if(!isAdmin||!currentUser)return;
    const {data:existing,error:readError}=await supabaseClient.from('courses').select('course_code');
    if(readError){console.error('Could not check the course catalogue:',readError);return;}
    const known=new Set((existing||[]).map(c=>String(c.course_code||'').trim().toUpperCase()));
    const missing=DEPARTMENT_COURSES.filter(([code])=>!known.has(code.toUpperCase()));
    if(!missing.length)return;
    const rows=missing.map(([course_code,course_title,credit_units])=>{const info=courseInfoFor(course_code);return {course_code,course_title,credit_units,level:info.level,semester:info.semester,created_by:currentUser.id};});
    const {error}=await supabaseClient.from('courses').insert(rows);
    if(error)console.error('Could not add the starter course catalogue:',error);
  }
  function courseInfoFor(code){const normalized=String(code||'').trim().toUpperCase();for(const group of COURSE_GROUPS){if(group.codes.some(c=>c.toUpperCase()===normalized)){const level=group.title.startsWith('100')?'100 Level':'200 Level';const semester=group.title.includes('First')?1:2;return {level,semester};}}return {level:'',semester:''};}
  async function loadCourseLookup(){
    const {data,error}=await supabaseClient.from('courses').select('id,course_code,course_title,credit_units,level,semester').eq('is_active',true).order('course_code');
    if(error){console.error('Course lookup failed:',error);return;}
    courseCache=data||[];
    renderCourseDropdown('');
  }
  async function loadCourses(){
    const {data,error}=await supabaseClient.from('courses').select('id,course_code,course_title,credit_units,level,semester').order('course_code');
    if(error){$('#courseList').innerHTML='<p class="notice error">Could not load the course list: '+escapeHtml(error.message)+'</p>';return;}
    const byCode=new Map((data||[]).map(c=>[String(c.course_code||'').trim().toUpperCase(),c]));
    const knownCodes=new Set();
    const groupsHtml=COURSE_GROUPS.map(group=>{
      const rows=group.codes.map(code=>byCode.get(code.toUpperCase())).filter(Boolean);
      rows.forEach(c=>knownCodes.add(String(c.course_code).toUpperCase()));
      return '<section class="course-group"><div class="course-group-heading"><h3>'+escapeHtml(group.title)+'</h3><span>'+rows.length+' courses</span></div><div class="course-table-wrap"><table class="course-table"><thead><tr><th>Course code</th><th>Course title</th><th>Credit units</th></tr></thead><tbody>'+rows.map(c=>'<tr><td><strong>'+escapeHtml(c.course_code)+'</strong></td><td>'+escapeHtml(c.course_title)+'</td><td>'+escapeHtml(c.credit_units)+'</td></tr>').join('')+'</tbody></table></div>'+(rows.length?'':'<p class="course-empty">No courses in this group yet.</p>')+'</section>';
    }).join('');
    const extra=(data||[]).filter(c=>!knownCodes.has(String(c.course_code||'').toUpperCase()));
    const extraHtml=extra.length?'<section class="course-group"><div class="course-group-heading"><h3>Other courses</h3><span>'+extra.length+' courses</span></div><div class="course-table-wrap"><table class="course-table"><thead><tr><th>Course code</th><th>Course title</th><th>Credit units</th></tr></thead><tbody>'+extra.map(c=>'<tr><td><strong>'+escapeHtml(c.course_code)+'</strong></td><td>'+escapeHtml(c.course_title)+'</td><td>'+escapeHtml(c.credit_units)+'</td></tr>').join('')+'</tbody></table></div></section>':'';
    $('#courseList').innerHTML='<div class="course-list-summary"><strong>'+((data||[]).length)+' courses in the departmental catalogue</strong><span>Only the administrator can manage this list.</span></div>'+groupsHtml+extraHtml;
  }
  async function addCourse(e){
    e.preventDefault();if(!isAdmin)return;
    const payload={course_code:$('#courseCode').value.trim().toUpperCase(),course_title:$('#courseTitle').value.trim(),credit_units:Number($('#courseUnits').value),created_by:currentUser.id};
    const {error}=await supabaseClient.from('courses').insert(payload);if(error){alert(error.message);return;}$('#courseForm').reset();$('#courseUnits').value='2';await loadCourses();await loadCourseLookup();
  }
  // Standard 4.0 grade scale used as the starting point. The administrator can adjust every value.
  const DEFAULT_GRADE_SCALE=[
    {grade:'A',min:70,point:4},
    {grade:'B',min:60,point:3},
    {grade:'C',min:50,point:2},
    {grade:'D',min:45,point:1},
    {grade:'E',min:40,point:0.5},
    {grade:'F',min:0,point:0}
  ];
  const MAX_GRADE_POINT=4;
  function renderGradeRuleRows(boundaries=[]){
    // Use the saved grade labels when they exist, so custom labels (e.g. A+, B-) are not lost on save.
    const rows=boundaries.length
      ?[...boundaries].sort((a,b)=>Number(b.min)-Number(a.min)).map(b=>({grade:String(b.grade||'').toUpperCase(),min:b.min,point:b.point}))
      :DEFAULT_GRADE_SCALE.map(item=>({...item}));
    $('#gradeRuleRows').innerHTML=rows.map(item=>{
      const grade=item.grade,isF=grade==='F';
      const minValue=isF?0:(item.min??''),pointValue=isF?0:(item.point??'');
      return '<div class="grade-rule-row"><input aria-label="Grade label" class="rule-grade" value="'+escapeHtml(grade)+'" maxlength="3" required><input aria-label="Minimum score for '+escapeHtml(grade)+'" class="rule-min" type="number" min="0" step="0.01" value="'+minValue+'" placeholder="Minimum"'+(isF?' readonly':' required')+'><input aria-label="Grade point for '+escapeHtml(grade)+'" class="rule-point" type="number" min="0" max="'+MAX_GRADE_POINT+'" step="0.01" value="'+pointValue+'" placeholder="Point (0.0–4.0)"'+(isF?' readonly':' required')+'></div>';
    }).join('');
  }
  async function loadGradeSettings(){
    renderGradeRuleRows();
    const {data,error}=await supabaseClient.from('grade_settings').select('id,assignment_max,exam_max,grade_boundaries').eq('id',1).maybeSingle();
    if(error){$('#gradeSettingsMessage').textContent='Grading settings table is not ready. Run the E.M.A.C.O.T.S result-entry migration SQL first.';$('#gradeSettingsMessage').className='notice error';$('#gradeConfigNotice').textContent='The department grading setup is not yet connected. Ask the administrator to finish the setup.';updateScorePreview();return;}
    gradeSettings=data||null;
    if(gradeSettings){$('#assignmentMaximum').value=gradeSettings.assignment_max;$('#examMaximum').value=gradeSettings.exam_max;renderGradeRuleRows(gradeSettings.grade_boundaries||[]);$('#gradeSettingsMessage').textContent='Department grading rules are active.';$('#gradeSettingsMessage').className='notice success';}
    updateScorePreview();
  }
  async function saveGradeSettings(e){
    e.preventDefault();if(!isAdmin)return;
    const assignmentMax=Number($('#assignmentMaximum').value),examMax=Number($('#examMaximum').value),totalMax=assignmentMax+examMax;
    const rows=[...$('#gradeRuleRows').querySelectorAll('.grade-rule-row')];
    const boundaries=rows.map(row=>({grade:row.querySelector('.rule-grade').value.trim().toUpperCase(),min:Number(row.querySelector('.rule-min').value),point:Number(row.querySelector('.rule-point').value)}));
    if(!(assignmentMax>0&&examMax>0)){return gradeSettingsMessage('Assignment and examination maximums must both be greater than zero.','error');}
    // results.score is constrained to 0–100 in the database, so the combined maximum cannot exceed 100.
    if(totalMax>100){return gradeSettingsMessage('The assignment and examination maximums together cannot exceed 100.','error');}
    if(boundaries.some(b=>!b.grade||!Number.isFinite(b.min)||!Number.isFinite(b.point)||b.min<0||b.min>totalMax||b.point<0)){return gradeSettingsMessage('Check every grade label, minimum score and grade point.','error');}
    if(boundaries.some(b=>b.point>MAX_GRADE_POINT)){return gradeSettingsMessage('Grade points must be on the 0.0 to 4.0 scale.','error');}
    if(new Set(boundaries.map(b=>b.grade)).size!==boundaries.length||new Set(boundaries.map(b=>b.min)).size!==boundaries.length){return gradeSettingsMessage('Grade labels and minimum scores must be unique.','error');}
    if(!boundaries.some(b=>b.min===0)){return gradeSettingsMessage('Include a grade boundary beginning at 0.','error');}
    boundaries.sort((a,b)=>b.min-a.min);
    const {error}=await supabaseClient.from('grade_settings').upsert({id:1,assignment_max:assignmentMax,exam_max:examMax,grade_boundaries:boundaries,updated_by:currentUser.id,updated_at:new Date().toISOString()});
    if(error)return gradeSettingsMessage(error.message,'error');
    gradeSettings={assignment_max:assignmentMax,exam_max:examMax,grade_boundaries:boundaries};
    gradeSettingsMessage('Grading rules saved. New results will use these rules.','success');updateScorePreview();
  }
  function gradeSettingsMessage(message,type=''){const el=$('#gradeSettingsMessage');el.textContent=message;el.className='notice '+type;}
  function renderCourseDropdown(query){
    const dropdown=$('#courseDropdown');if(!dropdown)return;
    const q=String(query||'').trim().toUpperCase();
    const matches=!q?[]:courseCache.filter(c=>String(c.course_code||'').toUpperCase().startsWith(q)||String(c.course_title||'').toUpperCase().includes(q)).slice(0,12);
    if(!q||!matches.length){dropdown.innerHTML=q?'<div class="course-dropdown-empty">No matching course. Check the code or ask the administrator to add it.</div>':'';dropdown.classList.toggle('hidden',!q);$('#lookupCourseCode').setAttribute('aria-expanded',String(Boolean(q&&matches.length)));return;}
    dropdown.innerHTML=matches.map((c,i)=>'<button type="button" class="course-option" role="option" aria-selected="false" data-course-id="'+escapeHtml(c.id)+'" data-index="'+i+'"><span class="course-option-main"><strong>'+escapeHtml(c.course_code)+'</strong><small>'+escapeHtml(c.course_title)+'</small></span><span class="course-option-units">'+escapeHtml(c.credit_units)+' units</span></button>').join('');
    dropdown.classList.remove('hidden');$('#lookupCourseCode').setAttribute('aria-expanded','true');
    dropdown.querySelectorAll('[data-course-id]').forEach(button=>button.addEventListener('click',()=>selectCourse(button.dataset.courseId)));
  }
  function selectCourse(id){
    const course=courseCache.find(c=>String(c.id)===String(id));if(!course)return;
    $('#lookupCourseCode').value=course.course_code;
    $('#matchedCourseId').value=course.id;
    const info=courseInfoFor(course.course_code);
    $('#matchedCourseTitle').textContent=course.course_title;$('#matchedCourseUnits').textContent=course.credit_units;
    $('#matchedCourseLevel').textContent=course.level||info.level||'—';$('#matchedCourseSemester').textContent=Number(course.semester||info.semester)===2?'Second':'First';
    $('#courseMatch').classList.remove('hidden');
    $('#courseDropdown').classList.add('hidden');$('#lookupCourseCode').setAttribute('aria-expanded','false');
    updateScorePreview();
  }
  function matchCourseCode(){
    const code=$('#lookupCourseCode').value.trim().toUpperCase();
    const course=courseCache.find(c=>String(c.course_code).toUpperCase()===code);
    if(course){selectCourse(course.id);return;}
    $('#matchedCourseId').value='';$('#courseMatch').classList.add('hidden');renderCourseDropdown(code);updateScorePreview();
  }
  function handleCourseSearchInput(){
    const input=$('#lookupCourseCode');const value=input.value.toUpperCase();if(input.value!==value)input.value=value;
    $('#matchedCourseId').value='';$('#courseMatch').classList.add('hidden');renderCourseDropdown(value);
    // If the typed text is already an exact catalogue code, select it immediately so Save is not left disabled.
    const exact=courseCache.find(c=>String(c.course_code).toUpperCase()===value.trim());
    if(exact)selectCourse(exact.id);
    updateScorePreview();
  }
  function handleCourseSearchKeys(e){
    const dropdown=$('#courseDropdown');const options=[...dropdown.querySelectorAll('[data-course-id]')];
    if(e.key==='ArrowDown'&&options.length){e.preventDefault();options[0].focus();}
    if(e.key==='Escape'){dropdown.classList.add('hidden');$('#lookupCourseCode').setAttribute('aria-expanded','false');}
  }
  function calculateGrade(total){
    if(!gradeSettings||!Array.isArray(gradeSettings.grade_boundaries))return null;
    const boundaries=[...gradeSettings.grade_boundaries].sort((a,b)=>Number(b.min)-Number(a.min));
    const boundary=boundaries.find(b=>total>=Number(b.min));
    return boundary?{grade:String(boundary.grade||''),point:Number(boundary.point)}:null;
  }
  function updateScorePreview(){
    const assignmentInput=$('#assignmentScore'),examInput=$('#examScore');
    const assignmentRaw=assignmentInput.value.trim(),examRaw=examInput.value.trim();
    const assignment=assignmentRaw===''?null:Number(assignmentRaw),exam=examRaw===''?null:Number(examRaw);
    const maxA=Number(gradeSettings?.assignment_max||0),maxE=Number(gradeSettings?.exam_max||0),totalMax=maxA+maxE;
    const hasAnyScore=assignment!==null||exam!==null;
    const assignmentValid=assignment===null||(Number.isFinite(assignment)&&assignment>=0&&(!maxA||assignment<=maxA));
    const examValid=exam===null||(Number.isFinite(exam)&&exam>=0&&(!maxE||exam<=maxE));
    const total=Number(assignment||0)+Number(exam||0);
    const scoresComplete=assignment!==null&&exam!==null;
    const scoresValid=Boolean(gradeSettings&&scoresComplete&&assignmentValid&&examValid);
    const calculated=scoresValid?calculateGrade(total):null;

    // Show a running total while typing; only calculate a grade when both scores are valid.
    $('#totalScorePreview').textContent=hasAnyScore&&assignmentValid&&examValid
      ?total.toFixed(2)+' / '+(totalMax||'—')
      :'— / '+(totalMax||'—');
    $('#gradePreview').textContent=calculated?.grade||'—';
    $('#pointPreview').textContent=calculated&&Number.isFinite(calculated.point)?calculated.point.toFixed(2):'—';

    assignmentInput.max=maxA||'';examInput.max=maxE||'';
    assignmentInput.placeholder=maxA?'Out of '+maxA:'Maximum not set';
    examInput.placeholder=maxE?'Out of '+maxE:'Maximum not set';
    assignmentInput.setCustomValidity(assignmentValid?'':'Enter an assignment score within the configured maximum.');
    examInput.setCustomValidity(examValid?'':'Enter an examination score within the configured maximum.');
    $('#saveManualResult').disabled=!gradeSettings||!$('#matchedCourseId').value||!calculated||!Number.isFinite(calculated.point);
    $('#gradeConfigNotice').textContent=gradeSettings
      ?'Assignment maximum: '+maxA+' · Examination maximum: '+maxE+' · Total: '+totalMax
      :'The administrator must configure the official grading rules before results can be submitted.';
  }
  async function saveManualResult(e){
    e.preventDefault();
    if(!currentUser)return;
    matchCourseCode();
    const course=courseCache.find(c=>c.id===$('#matchedCourseId').value);
    if(!course)return manualResultMessage('Enter a valid course code from the departmental catalogue.','error');
    if(!gradeSettings)return manualResultMessage('The administrator has not configured the department grading rules yet.','error');
    const assignment=Number($('#assignmentScore').value),exam=Number($('#examScore').value);
    if($('#assignmentScore').value===''||$('#examScore').value===''||assignment<0||assignment>Number(gradeSettings.assignment_max)||exam<0||exam>Number(gradeSettings.exam_max))return manualResultMessage('Enter scores within the configured maximum marks.','error');
    const total=assignment+exam,calculated=calculateGrade(total);
    if(!calculated)return manualResultMessage('The total score does not match a configured grade boundary. Contact the administrator.','error');
    const session=$('#manualSession').value.trim(),semester=Number($('#manualSemester').value);
    if(!session||![1,2].includes(semester))return manualResultMessage('Choose the academic session and semester.','error');
    const payload={user_id:currentUser.id,course_id:course.id,course_code:course.course_code,course_title:course.course_title,credit_units:Number(course.credit_units),academic_session:session,semester,assignment_score:assignment,exam_score:exam,total_score:total,score:total,grade:calculated.grade,grade_point:calculated.point,verification_status:'reviewed'};
    $('#saveManualResult').disabled=true;manualResultMessage('Saving your result…');
    const {error}=await supabaseClient.from('results').upsert(payload,{onConflict:'user_id,course_code,academic_session,semester'});
    if(error){$('#saveManualResult').disabled=false;return manualResultMessage(error.message,'error');}
    $('#manualResultForm').reset();$('#courseMatch').classList.add('hidden');$('#matchedCourseId').value='';$('#courseDropdown').classList.add('hidden');$('#lookupCourseCode').setAttribute('aria-expanded','false');$('#totalScorePreview').textContent='—';$('#gradePreview').textContent='—';$('#pointPreview').textContent='—';
    manualResultMessage('Result saved successfully. Your CGPA, semester GPA and charts have been refreshed.','success');updateScorePreview();await refreshData();
  }
  function manualResultMessage(message,type=''){const el=$('#manualResultMessage');el.textContent=message;el.className='notice '+type;}
  function navigate(page){
    if(page==='courses'&&!isAdmin){page='overview';}
    document.querySelectorAll('.page-section').forEach(el=>el.classList.add('hidden'));$('#page-'+page)?.classList.remove('hidden');
    document.querySelectorAll('.nav-link').forEach(el=>el.classList.toggle('active',el.dataset.page===page));
    $('#pageCrumb').textContent=({overview:'Overview',results:'My results',uploads:'Upload results',courses:'Course catalogue',account:'My account'})[page]||'Overview';
    $('#sidebar').classList.remove('open');window.scrollTo({top:0,behavior:'smooth'});
  }
  async function signOut(){await supabaseClient.auth.signOut();currentUser=null;}
  document.querySelectorAll('.nav-link').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.page)));
  document.addEventListener('click',e=>{const b=e.target.closest('[data-goto]');if(b)navigate(b.dataset.goto);});
  $('#accountShortcut').onclick=()=>navigate('account');$('#signOutBtn').onclick=signOut;$('#accountSignOut').onclick=signOut;$('#menuBtn').onclick=()=>{const open=$('#sidebar').classList.toggle('open');$('#menuBtn').setAttribute('aria-expanded',String(open));$('#menuBtn').setAttribute('aria-label',open?'Close navigation menu':'Open navigation menu');};
  $('#uploadForm').addEventListener('submit',handleUpload);$('#resultFile').addEventListener('change',e=>$('#fileLabel').textContent=e.target.files[0]?.name||'Choose a result document');
  $('#courseForm').addEventListener('submit',addCourse);
  $('#lookupCourseCode').addEventListener('input',handleCourseSearchInput);$('#lookupCourseCode').addEventListener('change',matchCourseCode);$('#lookupCourseCode').addEventListener('keydown',handleCourseSearchKeys);
  document.addEventListener('click',e=>{if(!e.target.closest('.course-search-wrap')){$('#courseDropdown')?.classList.add('hidden');$('#lookupCourseCode')?.setAttribute('aria-expanded','false');}});
  $('#assignmentScore').addEventListener('input',updateScorePreview);$('#examScore').addEventListener('input',updateScorePreview);
  $('#manualResultForm').addEventListener('submit',saveManualResult);
  $('#gradeSettingsForm').addEventListener('submit',saveGradeSettings);
  setAuthMode('login');init();
})();