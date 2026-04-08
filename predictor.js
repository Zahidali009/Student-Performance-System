// Client-side predictor: uses internal + external marks and outputs predicted percent and pass probability

const PASS_THRESHOLD = 40; // percent threshold to consider pass
const PREV_OVERRIDE_THRESHOLD = 15; // if previous-semester total < this, force 'Unlikely to pass'

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
  [270, 430, 90, 4.5, 89]
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
  document.getElementById('prediction').textContent = `${pct.toFixed(1)} %`;

  if(probTensor){
    const probVal = (await probTensor.array())[0][0];
    const passEl = document.getElementById('passStatus');
    if(passEl){
      // If previous-semester total is very low, override model optimism
      if(prevTotalPercent > 0 && prevTotalPercent < PREV_OVERRIDE_THRESHOLD){
        passEl.textContent = 'Unlikely to fail';
        passEl.style.color = '#ef4444';
      } else {
        let verdict = '';
        if(probVal >= 0.75){
          verdict = 'Very likely to pass';
          passEl.style.color = '#16a34a';
        } else if(probVal >= 0.5){
          verdict = 'Likely to pass';
          passEl.style.color = '#16a34a';
        } else if(probVal >= 0.35){
          verdict = 'Borderline';
          passEl.style.color = '#f59e0b';
        } else {
          verdict = 'Unlikely to fail';
          passEl.style.color = '#ef4444';
        }
        passEl.textContent = verdict;
      }
    }
  } else {
    // fallback: use percent prediction
    const passEl = document.getElementById('passStatus');
    if(passEl){
      if(prevTotalPercent > 0 && prevTotalPercent < PREV_OVERRIDE_THRESHOLD){
        passEl.textContent = 'Unlikely to fail';
        passEl.style.color = '#ef4444';
      } else if(pct >= PASS_THRESHOLD){
        passEl.textContent = 'Likely to pass';
        passEl.style.color = '#16a34a';
      } else {
        passEl.textContent = 'Unlikely to pass';
        passEl.style.color = '#ef4444';
      }
    }
  }

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
    trainBtn.disabled = true;
    document.getElementById('trainStatus').textContent = 'Preparing model...';
    globalModel = createModel();
    await trainOnSample(globalModel, 200);
    document.getElementById('trainStatus').textContent = 'Training complete.';
    trainBtn.disabled = false;
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

    if(!globalModel){
      document.getElementById('trainStatus').textContent = 'Model not trained — training now (sample)...';
      globalModel = createModel();
      await trainOnSample(globalModel, 160);
      document.getElementById('trainStatus').textContent = 'Auto-trained model ready.';
    }
    await predict(globalModel);
  });
});
