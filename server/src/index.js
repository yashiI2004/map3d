const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const Queue = require('bull');
const Redis = require('ioredis');
const cors = require('cors');

const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';
const PORT = process.env.PORT || 3000;

const redis = new Redis(REDIS_URL);
const jobQueue = new Queue('photogram', REDIS_URL);

const app = express();
app.use(cors());

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const JOBS_DIR = path.resolve(__dirname, '..', '..', 'data', 'jobs');
if (!fs.existsSync(JOBS_DIR)) fs.mkdirSync(JOBS_DIR, { recursive: true });

app.post('/api/jobs', upload.array('images', 200), async (req, res) => {
  try {
    const files = req.files || [];
    const jobId = uuidv4();
    const jobDir = path.join(JOBS_DIR, jobId);
    const imgDir = path.join(jobDir, 'images');
    fs.mkdirSync(imgDir, { recursive: true });

    files.forEach((f, i) => {
      const ext = (f.originalname && path.extname(f.originalname)) || '.jpg';
      const filename = `img_${i}${ext}`;
      fs.writeFileSync(path.join(imgDir, filename), f.buffer);
    });

    // create metadata
    const meta = { createdAt: Date.now(), status: 'queued' };
    fs.writeFileSync(path.join(jobDir, 'meta.json'), JSON.stringify(meta, null, 2));

    // enqueue job with custom id so we can query by it
    await jobQueue.add({ jobId, jobDir }, { jobId });

    res.json({ jobId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'upload_failed' });
  }
});

app.get('/api/jobs/:id/status', async (req, res) => {
  const id = req.params.id;
  const jobDir = path.join(JOBS_DIR, id);
  const metaPath = path.join(jobDir, 'meta.json');
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      // normalize response
      const response = {
        status: meta.status || 'unknown',
        progress: meta.progress || 0,
        stage: meta.stage || null,
        logs: meta.logs || [],
        result: meta.result || null,
      };
      return res.json(response);
    } catch (e) {
      return res.status(500).json({ error: 'meta_read_error' });
    }
  }
  // if no meta, check Bull job state
  const job = await jobQueue.getJob(id);
  if (!job) return res.status(404).json({ error: 'not_found' });
  const state = await job.getState();
  const progress = (await job.progress()) || 0;
  res.json({ status: state, progress });
});

app.get('/api/jobs/:id/result', (req, res) => {
  const id = req.params.id;
  const jobDir = path.join(JOBS_DIR, id);
  const resultPath = path.join(jobDir, 'result', 'scene.glb');
  if (fs.existsSync(resultPath)) {
    res.sendFile(resultPath);
  } else {
    res.status(404).json({ error: 'result_not_ready' });
  }
});

app.listen(PORT, () => {
  console.log('API listening on', PORT);
});
