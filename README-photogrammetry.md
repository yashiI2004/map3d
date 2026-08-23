Photogrammetry server scaffold (COLMAP + OpenMVS) - local dev

This repository includes a minimal scaffold to run a photogrammetry job queue
locally using Docker Compose. The worker now includes a COLMAP + OpenMVS pipeline
script in `worker/process_job.sh` and the worker Dockerfile is scaffolded to build
and install the required native dependencies for the pipeline.

Quick start (dev):
1. Build and run the compose stack:
   docker-compose up --build

2. Upload images:
   POST http://localhost:3000/api/jobs
   form field: images (multipart file[])

   Response: { "jobId": "..." }

3. Check status:
   GET http://localhost:3000/api/jobs/<jobId>/status

4. Once finished, download result:
   GET http://localhost:3000/api/jobs/<jobId>/result

Notes:
- The scaffold uses Redis for job queue and MinIO for object storage. The worker
  now includes a real COLMAP/OpenMVS pipeline script and reports progress through
  job metadata.
- If the pipeline completes successfully, a GLB result should be available at
  `data/jobs/<jobId>/result/scene.glb` and via the API result endpoint.
- Next steps:
  * Enable MinIO/S3 upload for final artifacts and presigned download links.
  * Add GPU-enabled worker build instructions for COLMAP with CUDA support.
  * Add realtime job status push notifications instead of polling.

If you want, I can now:
- Add S3/MinIO upload for final artifacts and presigned-URL based downloads
- Integrate realtime job status push notifications instead of polling
- Add GPU-enabled worker build instructions for CUDA-accelerated COLMAP/OpenMVS

Which next step do you want me to implement next?
- Add S3/MinIO upload and presigned download links
- Add realtime job status push notifications
- Add GPU-enabled worker build instructions for CUDA-accelerated COLMAP/OpenMVS
