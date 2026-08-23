FROM node:18-bullseye

ARG DEBIAN_FRONTEND=noninteractive

# Install build tools and dependencies for COLMAP and OpenMVS
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake git wget unzip python3 python3-pip ca-certificates \
    libboost-all-dev libeigen3-dev libopencv-dev libcairo2-dev libfreeimage-dev \
    libgflags-dev libgoogle-glog-dev libatlas-base-dev libsuitesparse-dev \
    libgtk-3-dev libpng-dev libjpeg-dev libtiff-dev libglu1-mesa-dev libusb-1.0-0-dev \
    libxi-dev libxmu-dev libblas-dev liblapack-dev liblapacke-dev libceres-dev \
    pkg-config curl && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /opt

# Build COLMAP from source
RUN git clone --depth 1 https://github.com/colmap/colmap.git && \
    mkdir -p colmap/build && cd colmap/build && \
    cmake .. -DCMAKE_BUILD_TYPE=Release && \
    make -j$(nproc) && make install && ldconfig

# Build OpenMVS from source
RUN git clone --depth 1 https://github.com/cdcseacave/openMVS.git && \
    mkdir -p openMVS/build && cd openMVS/build && \
    cmake .. -DCMAKE_BUILD_TYPE=Release && \
    make -j$(nproc) && make install && ldconfig

# Install global npm tools for mesh conversion
RUN npm install -g obj2gltf gltf-pipeline@3.0.0

# App setup
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY src ./src
COPY process_job.sh ./process_job.sh
RUN chmod +x ./process_job.sh

CMD ["npm", "start"]
