// Client-side predictor: uses internal + external marks and outputs predicted percent and pass probability

const PASS_THRESHOLD = 40; // percent threshold to consider pass
const PREV_OVERRIDE_THRESHOLD = 15; // if previous-semester total < this, force 'Unlikely to pass'

// Grade calculation function
function calculateGrade(percentage) {
  if (percentage >= 90) return 'A';
  if (percentage >= 80) return 'B';
  if (percentage >= 70) return 'C';
  if (percentage >= 40) return 'D';
  return 'F';
}

function getPerformanceLevel(percentage) {
  if (percentage >= 90) return 'Excellent';
  if (percentage >= 75) return 'Good';
  if (percentage >= 50) return 'Average';
  return 'Poor';
}

// Validation functions
function validateForm() {
  const errors = [];
  
  // Get form values
  const prevInternal = parseFloat(document.getElementById('prevInternal').value) || 0;
  const prevExternal = parseFloat(document.getElementById('prevExternal').value) || 0;
  const attendance = parseFloat(document.getElementById('attendance').value) || 0;
  const study = parseFloat(document.getElementById('study').value) || 0;
  const name = document.getElementById('name').value.trim();
  const roll = document.getElementById('roll').value.trim();
  
  // Required fields validation
  if (!name) {
    errors.push('Name is required');
  }
  if (!roll) {
    errors.push('Roll No is required');
  }
  
  // Marks validation
  if (prevInternal > 320) {
    errors.push('Previous Semester Internal marks cannot exceed 320');
  }
  if (prevExternal > 480) {
    errors.push('Previous Semester External marks cannot exceed 480');
  }
  if (attendance > 100) {
    errors.push('Attendance percentage cannot exceed 100%');
  }
  if (study > 12) {
    errors.push('Study hours cannot exceed 12 per day');
  }
  if (study < 0) {
    errors.push('Study hours cannot be negative');
  }
  
  // Negative values validation
  if (prevInternal < 0) {
    errors.push('Previous Semester Internal marks cannot be negative');
  }
  if (prevExternal < 0) {
    errors.push('Previous Semester External marks cannot be negative');
  }
  if (attendance < 0) {
    errors.push('Attendance percentage cannot be negative');
  }
  
  return errors;
}

function showValidationErrors(errors) {
  // Remove existing error messages
  const existingErrors = document.querySelectorAll('.validation-error');
  existingErrors.forEach(error => error.remove());
  
  if (errors.length > 0) {
    // Create error message container
    const errorDiv = document.createElement('div');
    errorDiv.className = 'validation-error';
    errorDiv.style.cssText = `
      background: rgba(255, 107, 107, 0.1);
      border: 1px solid var(--danger-red);
      color: var(--danger-red);
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 16px;
      font-size: 14px;
    `;
    
    errorDiv.innerHTML = '<strong>Validation Errors:</strong><br>' + errors.join('<br>');
    
    // Insert error message at the top of the form
    const form = document.querySelector('form');
    form.insertBefore(errorDiv, form.firstChild);
    
    return false; // Validation failed
  }
  
  return true; // Validation passed
}

// Default training data (can be replaced by uploaded CSV)
// New schema (no per-sem internal/external): [prevInternal, prevExternal, attendance, study_hours, finalPercent]
const DEFAULT_TRAINING = [
  [210, 320, 85, 3, 80],
  [190, 280, 72, 2, 65],
  [260, 420, 92, 5, 93],
  [175, 250, 60, 1.5, 58],
  [220, 360, 80, 3.5, 75],
  [140, 200, 50, 1, 50],
  [250, 400, 88, 4, 86],
  [200, 320, 70, 2.5, 68],
  [230, 360, 78, 3, 73],
  [270, 430, 90, 4.5, 89],
  [300, 460, 95, 5.5, 96],
  [180, 300, 75, 2, 70],
  [160, 240, 65, 1.8, 61],
  [280, 450, 92, 5, 94],
  [120, 180, 45, 0.8, 43],
  [210, 340, 82, 3.2, 78],
  [240, 380, 88, 4, 85],
  [130, 210, 55, 1.2, 52],
  [170, 260, 70, 2.4, 66],
  [255, 410, 89, 4.2, 87],
  [290, 470, 97, 5.8, 98],
  [100, 150, 40, 0.6, 38],
  [220, 330, 80, 3.4, 77],
  [205, 310, 76, 2.9, 71],
  [195, 295, 74, 2.5, 69],
  [245, 390, 90, 4.1, 88],
  [150, 230, 60, 1.5, 57],
  [235, 370, 84, 3.6, 82],
  [180, 290, 68, 2.1, 63],
  [270, 435, 93, 4.7, 91],
  [155, 225, 58, 1.3, 55],
  [260, 420, 90, 4.8, 92],
  [145, 215, 52, 1.1, 49],
  [240, 375, 86, 3.9, 84],
  [230, 350, 82, 3.3, 79],
  [300, 480, 98, 6, 99],
  [165, 245, 63, 1.9, 60],
  [275, 440, 94, 5, 92],
  [125, 190, 48, 1, 46],
  [185, 310, 72, 2.2, 67],
  [255, 405, 87, 4.3, 86],
  [140, 205, 54, 1.2, 50],
  [215, 345, 81, 3.1, 76],
  [225, 355, 83, 3.5, 80],
  [190, 300, 71, 2.3, 64],
  [285, 460, 96, 5.6, 97],
  [170, 270, 69, 2, 62],
  [155, 220, 56, 1.4, 53],
  [245, 390, 89, 4.2, 88],
  [160, 250, 66, 2, 61],
  [205, 325, 75, 2.7, 70],
  [295, 475, 97, 5.9, 98],
  [135, 205, 53, 1, 48],
  [240, 365, 85, 3.8, 83],
  [170, 285, 67, 2.1, 61],
  [280, 445, 92, 4.9, 93],
  [145, 220, 59, 1.3, 54],
  [260, 415, 91, 4.4, 91],
  [210, 335, 78, 3, 74],
  [225, 360, 84, 3.7, 81]
];

let trainingData = DEFAULT_TRAINING.slice();

// Labels for the data fields (display only)
const FIELD_LABELS = [
  'Prev Sem Internal (out of 320)',
  'Prev Sem External (out of 480)',
  'Attendance (%)',
  'Study Hours / day',
  'Final Percent (target)'
];

function updateDataInfo(){
  const el = document.getElementById('dataInfo');
  if(!el) return;
  const total = trainingData.length;
  const fields = FIELD_LABELS.join(' · ');
  el.textContent = `Fields: ${fields} — Rows: ${total}`;
}

function normalizeSample(arr){
  // prevInternal scaled by 320, prevExternal by 480, attendance by 100, study by 10, final by 100
  return arr.map(r=>[r[0]/320, r[1]/480, r[2]/100, r[3]/10, r[4]/100]);
}

function createModel(){
  const input = tf.input({shape:[4]});
  let x = tf.layers.dense({units:32, activation:'relu'}).apply(input);
  x = tf.layers.dense({units:16, activation:'relu'}).apply(x);

  const outReg = tf.layers.dense({units:1, name:'final_percent'}).apply(x);
  const outProb = tf.layers.dense({units:1, activation:'sigmoid', name:'pass_prob'}).apply(x);

  const model = tf.model({inputs:input, outputs:[outReg, outProb]});
  model.compile({
    optimizer: tf.train.adam(0.01),
    loss: ['meanSquaredError','binaryCrossentropy'],
    lossWeights: [1, 0.5]
  });
  return model;
}

async function trainOnSample(model, epochs=120){
  const norm = normalizeSample(trainingData);
  const xs = tf.tensor2d(norm.map(r=>r.slice(0,4)));
  const ysReg = tf.tensor2d(norm.map(r=>[r[4]]));
  const ysProb = tf.tensor2d(norm.map(r=>[r[4]*100 >= PASS_THRESHOLD ? 1 : 0]));

  await model.fit(xs, [ysReg, ysProb], {
    epochs,
    shuffle:true,
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        const el = document.getElementById('trainStatus');
        if(el) el.textContent = `Epoch ${epoch+1} — loss ${Number(logs.loss).toFixed(4)}`;
      }
    }
  });

  xs.dispose(); ysReg.dispose(); ysProb.dispose();
}

// Parse a simple CSV into training format.
// Expected headers (case-insensitive): prevInternal, prevExternal, attendance, study_hours, finalPercent
function parseCSV(text){
  const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(l=>l.length>0);
  if(lines.length === 0) return [];
  const header = lines[0].split(',').map(h=>h.trim().toLowerCase().replace(/[^a-z0-9]/g,''));
  const mapIndex = (names)=>{
    for(const n of names){
      const idx = header.indexOf(n);
      if(idx !== -1) return idx;
    }
    return -1;
  };

  const idxPrevInt = mapIndex(['previnternal','previnternal','previntern','previnternals','prevint']);
  const idxPrevExt = mapIndex(['prevexternal','prevexternal','prevext']);
  const idxAtt = mapIndex(['attendance','att']);
  const idxStudy = mapIndex(['studyhours','study_hours','studyhoursperday','study']);
  const idxFinal = mapIndex(['finalpercent','final','final_percent','finalpercentages']);

  if([idxPrevInt, idxPrevExt, idxAtt, idxStudy, idxFinal].some(i=>i===-1)){
    return [];
  }

  const data = [];
  for(let i=1;i<lines.length;i++){
    const cols = lines[i].split(',').map(c=>c.trim().replace(/"/g,''));
    if(cols.length <= Math.max(idxPrevInt, idxPrevExt, idxAtt, idxStudy, idxFinal)) continue;
    const row = [
      Number(cols[idxPrevInt])||0,
      Number(cols[idxPrevExt])||0,
      Number(cols[idxAtt])||0,
      Number(cols[idxStudy])||0,
      Number(cols[idxFinal])||0
    ];
    data.push(row);
  }
  return data;
}

function loadTrainingFile(file){
  return new Promise((resolve,reject)=>{
    const fr = new FileReader();
    fr.onload = ()=>{
      const txt = fr.result;
      const parsed = parseCSV(txt);
      if(parsed.length === 0){
        reject(new Error('Failed to parse CSV — check headers and format'));
        return;
      }
      trainingData = parsed;
      updateDataInfo();
      resolve(parsed.length);
    };
    fr.onerror = ()=> reject(fr.error);
    fr.readAsText(file);
  });
}

function readFormInputs(){
  const prevInt = Number(document.getElementById('prevInternal').value) || 0;
  const prevExt = Number(document.getElementById('prevExternal').value) || 0;
  const att = Number(document.getElementById('attendance').value) || 0;
  const study = Number(document.getElementById('study').value) || 0;
  return [prevInt/320, prevExt/480, att/100, study/10];
}

function hasAnyInput(){
  const ids = ['prevInternal','prevExternal','attendance','study'];
  for(const id of ids){
    const el = document.getElementById(id);
    if(!el) continue;
    const v = String(el.value || '').trim();
    if(v !== '') return true;
  }
  return false;
}

function updateResultVisualization(pct, attendance, study, internal, external, grade, statusText) {
  const predBar = document.getElementById('barPred');
  const attBar = document.getElementById('barAttendance');
  const studyBar = document.getElementById('barStudy');
  const marksInternalBar = document.getElementById('marksBarInternal');
  const marksExternalBar = document.getElementById('marksBarExternal');
  const predValue = document.getElementById('barPredValue');
  const attValue = document.getElementById('barAttendanceValue');
  const studyValue = document.getElementById('barStudyValue');
  const internalValue = document.getElementById('marksInternalValue');
  const externalValue = document.getElementById('marksExternalValue');
  const marksPie = document.getElementById('marksPie');
  const marksPieLabel = document.getElementById('marksPieLabel');
  const highlight = document.getElementById('resultHighlightText');
  const miniPred = document.getElementById('predictionMini');
  const miniGrade = document.getElementById('gradeMini');
  const miniStatus = document.getElementById('statusMini');
  const miniLevel = document.getElementById('performanceLevelMini');

  const safePct = Math.min(100, Math.max(0, pct));
  const safeAttendance = Math.min(100, Math.max(0, attendance));
  const safeStudy = Math.min(100, Math.max(0, study * 10));
  const safeInternal = Math.min(100, Math.max(0, (internal / 320) * 100));
  const safeExternal = Math.min(100, Math.max(0, (external / 480) * 100));
  const totalMarks = internal + external;
  const pieInternal = totalMarks ? Math.round((internal / totalMarks) * 100) : 0;

  if(predBar) predBar.style.width = `${safePct}%`;
  if(attBar) attBar.style.width = `${safeAttendance}%`;
  if(studyBar) studyBar.style.width = `${safeStudy}%`;
  if(marksInternalBar) marksInternalBar.style.width = `${safeInternal}%`;
  if(marksExternalBar) marksExternalBar.style.width = `${safeExternal}%`;
  if(predValue) predValue.textContent = `${safePct.toFixed(1)}%`;
  if(attValue) attValue.textContent = `${safeAttendance.toFixed(0)}%`;
  if(studyValue) studyValue.textContent = `${study.toFixed(1)}h`;
  if(internalValue) internalValue.textContent = `${internal}`;
  if(externalValue) externalValue.textContent = `${external}`;
  if(marksPie) marksPie.style.background = `conic-gradient(var(--warning-orange) 0% ${pieInternal}%, var(--danger-red) ${pieInternal}% 100%)`;
  if(marksPieLabel) marksPieLabel.textContent = `${internal} / ${external}`;
  const performanceLevel = getPerformanceLevel(safePct);

  if(miniPred) miniPred.textContent = `${safePct.toFixed(1)}%`;
  if(miniGrade) miniGrade.textContent = grade;
  if(miniStatus) miniStatus.textContent = statusText;
  if(miniLevel) miniLevel.textContent = performanceLevel;
  if(highlight) highlight.textContent = statusText ? `${statusText} • Grade ${grade} • ${performanceLevel}` : 'Predict to see the result summary and performance chart.';
}

async function predict(model){
  const input = readFormInputs();
  // read raw previous-sem values to apply sanity override
  const prevIntRaw = Number(document.getElementById('prevInternal').value) || 0;
  const prevExtRaw = Number(document.getElementById('prevExternal').value) || 0;
  const prevTotalPercent = ((prevIntRaw + prevExtRaw) / 800) * 100; // out of 320+480=800
  const preds = model.predict(tf.tensor2d([input]));
  // preds is array: [regTensor, probTensor]
  const regTensor = Array.isArray(preds) ? preds[0] : preds;
  const probTensor = Array.isArray(preds) ? preds[1] : null;

  const regVal = (await regTensor.array())[0][0];
  const pct = Math.min(100, Math.max(0, regVal*100));
  const grade = calculateGrade(pct);
  const performanceLevel = getPerformanceLevel(pct);
  document.getElementById('prediction').textContent = `${pct.toFixed(1)} %`;
  document.getElementById('grade').textContent = grade;
  const perfEl = document.getElementById('performanceLevel');
  if (perfEl) perfEl.textContent = performanceLevel;

  let statusText = '';
  if(probTensor){
    const probVal = (await probTensor.array())[0][0];
    const passEl = document.getElementById('passStatus');
    if(passEl){
      if(prevTotalPercent > 0 && prevTotalPercent < PREV_OVERRIDE_THRESHOLD){
        statusText = 'Low prior score — review closely';
        passEl.style.color = '#ef4444';
      } else {
        if(probVal >= 0.75){
          statusText = 'Very likely to pass';
          passEl.style.color = '#16a34a';
        } else if(probVal >= 0.5){
          statusText = 'Likely to pass';
          passEl.style.color = '#16a34a';
        } else if(probVal >= 0.35){
          statusText = 'Borderline';
          passEl.style.color = '#f59e0b';
        } else {
          statusText = 'Unlikely to pass';
          passEl.style.color = '#ef4444';
        }
      }
      passEl.textContent = statusText;
    }
  } else {
    const passEl = document.getElementById('passStatus');
    if(passEl){
      if(prevTotalPercent > 0 && prevTotalPercent < PREV_OVERRIDE_THRESHOLD){
        statusText = 'Low prior score — review closely';
        passEl.style.color = '#ef4444';
      } else if(pct >= PASS_THRESHOLD){
        statusText = 'Likely to pass';
        passEl.style.color = '#16a34a';
      } else {
        statusText = 'Unlikely to pass';
        passEl.style.color = '#ef4444';
      }
      passEl.textContent = statusText;
    }
  }

  updateResultVisualization(
    pct,
    Number(document.getElementById('attendance').value) || 0,
    Number(document.getElementById('study').value) || 0,
    Number(document.getElementById('prevInternal').value) || 0,
    Number(document.getElementById('prevExternal').value) || 0,
    grade,
    statusText
  );

  if(Array.isArray(preds)) preds.forEach(t=>t.dispose());
}

// Wire UI
let globalModel = null;
document.addEventListener('DOMContentLoaded', ()=>{
  const trainBtn = document.getElementById('trainBtn');
  const predictBtn = document.getElementById('predictBtn');
  const uploadBtn = document.getElementById('uploadTrainBtn');
  const fileInput = document.getElementById('trainFile');
  const fileStatus = document.getElementById('trainStatus');

  trainBtn.addEventListener('click', async ()=>{
    const originalText = trainBtn.textContent;
    trainBtn.disabled = true;
    trainBtn.textContent = 'Training...';
    document.getElementById('trainStatus').textContent = 'Preparing model...';
    globalModel = createModel();
    await trainOnSample(globalModel, 200);
    document.getElementById('trainStatus').textContent = 'Training complete.';
    trainBtn.disabled = false;
    trainBtn.textContent = originalText;
  });

  // show field names / dataset info on load
  updateDataInfo();

  uploadBtn.addEventListener('click', async ()=>{
    const f = fileInput.files && fileInput.files[0];
    if(!f){
      fileStatus.textContent = 'No file selected.';
      return;
    }
    fileStatus.textContent = 'Loading file...';
    try{
      const rows = await loadTrainingFile(f);
      fileStatus.textContent = `Loaded ${rows} rows. Training...`;
      globalModel = createModel();
      await trainOnSample(globalModel, 180);
      fileStatus.textContent = `Trained on ${rows} rows.`;
    }catch(err){
      fileStatus.textContent = `Error: ${err.message}`;
    }
  });

  predictBtn.addEventListener('click', async ()=>{
    // require user to enter at least one input before predicting
    if(!hasAnyInput()){
      document.getElementById('trainStatus').textContent = 'Please enter input values before predicting.';
      return;
    }

    const validationErrors = validateForm();
    if (!showValidationErrors(validationErrors)) {
      return;
    }

    const originalText = predictBtn.textContent;
    predictBtn.disabled = true;
    predictBtn.textContent = 'Processing...';

    if(!globalModel){
      document.getElementById('trainStatus').textContent = 'Model not trained — training now (sample)...';
      globalModel = createModel();
      await trainOnSample(globalModel, 160);
      document.getElementById('trainStatus').textContent = 'Auto-trained model ready.';
    }
    await predict(globalModel);

    predictBtn.disabled = false;
    predictBtn.textContent = originalText;
  });
});

// Add real-time validation feedback
function addRealTimeValidation() {
  const inputs = ['prevInternal', 'prevExternal', 'attendance', 'study'];
  
  inputs.forEach(id => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener('input', function() {
        const value = parseFloat(this.value) || 0;
        let isValid = true;
        let errorMessage = '';
        
        switch(id) {
          case 'prevInternal':
            if (value > 320) {
              isValid = false;
              errorMessage = 'Max 320 marks';
            } else if (value < 0) {
              isValid = false;
              errorMessage = 'Cannot be negative';
            }
            break;
          case 'prevExternal':
            if (value > 480) {
              isValid = false;
              errorMessage = 'Max 480 marks';
            } else if (value < 0) {
              isValid = false;
              errorMessage = 'Cannot be negative';
            }
            break;
          case 'attendance':
            if (value > 100) {
              isValid = false;
              errorMessage = 'Max 100%';
            } else if (value < 0) {
              isValid = false;
              errorMessage = 'Cannot be negative';
            }
            break;
          case 'study':
            if (value > 12) {
              isValid = false;
              errorMessage = 'Max 12 hours';
            } else if (value < 0) {
              isValid = false;
              errorMessage = 'Cannot be negative';
            }
            break;
        }
        
        // Update input styling
        if (!isValid) {
          this.style.borderColor = 'var(--danger-red)';
          this.style.boxShadow = '0 0 0 2px rgba(255, 107, 107, 0.2)';
        } else {
          this.style.borderColor = '';
          this.style.boxShadow = '';
        }
        
        // Show/hide field-specific error
        let errorEl = this.parentNode.querySelector('.field-error');
        if (!isValid && errorMessage) {
          if (!errorEl) {
            errorEl = document.createElement('div');
            errorEl.className = 'field-error';
            errorEl.style.cssText = `
              color: var(--danger-red);
              font-size: 12px;
              margin-top: 4px;
              font-weight: 500;
            `;
            this.parentNode.appendChild(errorEl);
          }
          errorEl.textContent = errorMessage;
        } else if (errorEl) {
          errorEl.remove();
        }
      });
    }
  });
}

// Form validation and submission
function validateAndSubmit() {
  const errors = validateForm();
  if (showValidationErrors(errors)) {
    // Validation passed - show success message
    alert('Form submitted successfully! (Demo)');
  }
}



