#!/bin/bash
set -euo pipefail

JOB_DIR="$1"
if [ -z "${JOB_DIR}" ]; then
  echo "Usage: $0 <jobDir>"
  exit 2
fi

IMAGES_DIR="$JOB_DIR/images"
WORK_DIR="$JOB_DIR/workspace"
RESULT_DIR="$JOB_DIR/result"
mkdir -p "$WORK_DIR"
mkdir -p "$RESULT_DIR"

# Parameters
MAX_IMAGE_SIZE=2000

echo "Starting COLMAP + OpenMVS pipeline for job: $JOB_DIR"

# 1) COLMAP: feature extraction
echo "STEP:feature_extraction"
echo "Running COLMAP feature_extractor..."
colmap feature_extractor \
  --database_path "$WORK_DIR/database.db" \
  --image_path "$IMAGES_DIR"

# 2) COLMAP: exhaustive matching
echo "STEP:matching"
echo "Running COLMAP exhaustive_matcher..."
colmap exhaustive_matcher --database_path "$WORK_DIR/database.db"

# 3) COLMAP: mapping (sparse reconstruction)
echo "STEP:sparse_reconstruction"
echo "Running COLMAP mapper..."
mkdir -p "$WORK_DIR/sparse"
colmap mapper --database_path "$WORK_DIR/database.db" --image_path "$IMAGES_DIR" --output_path "$WORK_DIR/sparse"

# 4) COLMAP: prepare for dense reconstruction (image undistortion)
echo "STEP:undistort"
echo "Running COLMAP image_undistorter..."
mkdir -p "$WORK_DIR/dense"
colmap image_undistorter \
  --image_path "$IMAGES_DIR" \
  --input_path "$WORK_DIR/sparse/0" \
  --output_path "$WORK_DIR/dense" \
  --output_type COLMAP \
  --max_image_size ${MAX_IMAGE_SIZE}

# 5) COLMAP: dense stereo (PatchMatch)
echo "STEP:dense_stereo"
echo "Running COLMAP patch_match_stereo..."
colmap patch_match_stereo \
  --workspace_path "$WORK_DIR/dense" \
  --workspace_format COLMAP \
  --PatchMatchStereo.geom_consistency true

# 6) COLMAP: stereo fusion -> fused point cloud
echo "STEP:fusion"
echo "Running COLMAP stereo_fusion..."
colmap stereo_fusion \
  --workspace_path "$WORK_DIR/dense" \
  --workspace_format COLMAP \
  --input_type geometric \
  --output_path "$WORK_DIR/dense/fused.ply"

# 7) Convert COLMAP to OpenMVS
echo "STEP:colmap_to_openmvs"
echo "Converting COLMAP outputs to OpenMVS format..."
# InterfaceCOLMAP expects the undistorted files in dense/ and the sparse model path
if command -v InterfaceCOLMAP >/dev/null 2>&1; then
  InterfaceCOLMAP -i "$WORK_DIR/dense" -o "$WORK_DIR/scene.mvs"
else
  echo "InterfaceCOLMAP not found, attempting to use OpenMVS 'InterfaceCOLMAP' binary location"
  # try common locations (assuming make install put into /usr/local/bin)
  /usr/local/bin/InterfaceCOLMAP -i "$WORK_DIR/dense" -o "$WORK_DIR/scene.mvs"
fi

# 8) OpenMVS: densify point cloud
echo "STEP:densify"
echo "Running OpenMVS DensifyPointCloud..."
DensifyPointCloud "$WORK_DIR/scene.mvs" -w "$WORK_DIR" -o "$WORK_DIR/densified.mvs"

# 9) OpenMVS: reconstruct mesh
echo "STEP:reconstruct"
echo "Running OpenMVS ReconstructMesh..."
ReconstructMesh "$WORK_DIR/densified.mvs" -w "$WORK_DIR" -o "$WORK_DIR/mesh.mvs"

# 10) OpenMVS: refine mesh
echo "STEP:refine"
echo "Running OpenMVS RefineMesh..."
RefineMesh "$WORK_DIR/mesh.mvs" -w "$WORK_DIR" -o "$WORK_DIR/mesh_refined.mvs"

# 11) OpenMVS: texture mesh
echo "STEP:texture"
echo "Running OpenMVS TextureMesh..."
TextureMesh "$WORK_DIR/mesh_refined.mvs" -w "$WORK_DIR" -o "$WORK_DIR/textured.obj"

# 12) Convert OBJ + textures to GLB using obj2gltf then gltf-pipeline
echo "STEP:convert"
echo "Converting OBJ to GLB..."
OBJ="$WORK_DIR/textured.obj"
GLTF="$WORK_DIR/textured.gltf"
GLB="$RESULT_DIR/scene.glb"
obj2gltf -i "$OBJ" -o "$GLTF" || (echo "obj2gltf failed"; exit 1)

# Optimize/pack to binary GLB
echo "STEP:pack"
gltf-pipeline -i "$GLTF" -o "$GLB" -b || (echo "gltf-pipeline failed"; cp "$GLTF" "$RESULT_DIR/textured.gltf" )

echo "STEP:finished"
echo "Pipeline complete. Result at: $GLB"
exit 0
