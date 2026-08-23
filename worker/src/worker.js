const Queue = require('bull');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';
const jobQueue = new Queue('photogram', REDIS_URL);

console.log('Worker started, waiting for jobs...');

jobQueue.process(async (job, done) => {
  const { jobId, jobDir } = job.data;
  console.log('Processing job', jobId, jobDir);

  const metaPath = path.join(jobDir, 'meta.json');
  function writeMeta(metaUpdates) {
    try {
      const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
      const updated = { ...meta, ...metaUpdates };
      // maintain logs array
      if (metaUpdates.log) {
        updated.logs = updated.logs || [];
        updated.logs.push({ time: Date.now(), message: metaUpdates.log });
      }
      fs.writeFileSync(metaPath, JSON.stringify(updated, null, 2));
    } catch (e) {
      console.error('writeMeta error', e);
    }
  }

  try {
    // update meta
    writeMeta({ status: 'processing', progress: 0, stage: 'starting', log: 'Job started' });

    // Call a shell script that runs COLMAP/OpenMVS
    const script = path.join(__dirname, '..', 'process_job.sh');

    await runScriptWithProgress(script, [jobDir], (stage) => {
      // simple mapping of stages to progress percentage
      const map = {
        feature_extraction: 5,
        matching: 15,
        sparse_reconstruction: 25,
        undistort: 35,
        dense_stereo: 55,
        fusion: 65,
        colmap_to_openmvs: 70,
        densify: 78,
        reconstruct: 86,
        refine: 92,
        texture: 96,
        convert: 98,
        pack: 99,
        finished: 100,
      };
      const p = map[stage] || 50;
      job.progress(p);
      writeMeta({ progress: p, stage, log: `Stage: ${stage}` });
    });

    // ensure result dir exists and verify GLB generation
    const resultDir = path.join(jobDir, 'result');
    fs.mkdirSync(resultDir, { recursive: true });
    const generated = path.join(resultDir, 'scene.glb');
    if (!fs.existsSync(generated)) {
      // if the script emitted a GLB in the workspace, copy it into result
      const alt = path.join(jobDir, 'workspace', 'scene.glb');
      if (fs.existsSync(alt)) {
        fs.copyFileSync(alt, generated);
      } else {
        throw new Error('result_not_found: expected scene.glb in result directory');
      }
    }

    writeMeta({ status: 'finished', progress: 100, stage: 'finished', result: { glb: '/api/jobs/' + jobId + '/result' }, log: 'Job finished' });

    console.log('Job finished', jobId);
    done();
  } catch (err) {
    console.error('Job failed', jobId, err);
    writeMeta({ status: 'failed', log: String(err) });
    done(err);
  }
});

function runScriptWithProgress(scriptPath, args, onStage) {
  return new Promise((resolve, reject) => {
    const proc = spawn('sh', [scriptPath, ...args]);

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      process.stdout.write(text);
      // look for STEP:stage markers
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      lines.forEach((line) => {
        if (line.startsWith('STEP:')) {
          const stage = line.substring(5).trim();
          try { onStage(stage); } catch (e) { console.error(e); }
        } else {
          // also write general logs
          // append to meta
          try {
            const metaPath = path.join(args[0], 'meta.json');
            const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
            meta.logs = meta.logs || [];
            meta.logs.push({ time: Date.now(), message: line });
            fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
          } catch (e) { }
        }
      });
    });

    proc.stderr.on('data', (data) => { process.stderr.write(data.toString()); });

    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error('script_failed: ' + code));
    });
  });
}
