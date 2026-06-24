# THIAAAAA shared render runner — Linux image for a self-hosted GitHub Actions runner.
#
# Provides everything the render-gate consumers need (THIAAAAA-41 Stack Lab bake-off,
# THIAAAAA-43/54 Cashflow Compass, THIAAAAA-46 Vault Cases):
#   - Xvfb @ 1920x1080x24 virtual display
#   - ffmpeg (capture + assembly)
#   - headless Chromium for BOTH Playwright and Puppeteer
#   - Python venv with WhisperX (word-level alignment) + OpenVoice v2 (MIT) voice clone
#   - the GitHub Actions runner agent itself
#
# Build:   docker build -t thiaaaa-runner infra/runner
# Run:     see infra/runner/README.md (register.sh handles org registration with a token)
#
# No paid compute: this image runs on any free Linux box or in Docker on the always-on
# worker. Everything is CPU-only (no CUDA) so it needs no GPU. Per the sub-only guardrail.

# Ubuntu 22.04 → Python 3.10. The OpenVoice v2 / MeloTTS / WhisperX stack pins old
# numpy + av==11 that have prebuilt cp310 wheels but NO cp312 wheels — on 24.04's
# Python 3.12 they fall back to source builds that break (numpy's build hits the
# pkgutil.ImpImporter removed in 3.12; PyAV needs ffmpeg headers). 22.04 installs all of
# it from wheels. README lists 22.04 as a supported host, and labels.json stays accurate.
FROM ubuntu:22.04

ARG DEBIAN_FRONTEND=noninteractive
# Pin to a recent runner release. The agent self-updates on connect, so this only needs
# to be a valid recent tag at build time. Override with --build-arg RUNNER_VERSION=...
ARG RUNNER_VERSION=2.323.0
ARG NODE_MAJOR=22

ENV RUNNER_HOME=/home/runner \
    OPENVOICE_HOME=/opt/openvoice \
    VENV=/opt/venv \
    DISPLAY=:99 \
    PYTHONUNBUFFERED=1

# CPU throughput: default the BLAS/OpenMP/CTranslate2 thread pools to 4 so torch +
# WhisperX actually use all cores on the target hosts (GitHub-hosted = 4 vCPU,
# Oracle A1 = 4 OCPU) instead of running single-threaded. Override at `docker run`
# (e.g. -e OMP_NUM_THREADS=$(nproc)) for a host with a different core count.
# MALLOC_ARENA_MAX caps glibc arena fragmentation — meaningful headroom near the 8 GB floor.
ENV OMP_NUM_THREADS=4 \
    OPENBLAS_NUM_THREADS=4 \
    MKL_NUM_THREADS=4 \
    NUMEXPR_NUM_THREADS=4 \
    MALLOC_ARENA_MAX=2

# --- system packages -------------------------------------------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl wget git jq unzip sudo gnupg xz-utils \
      build-essential pkg-config \
      xvfb x11-utils x11-xserver-utils xauth \
      ffmpeg \
      libavformat-dev libavcodec-dev libavdevice-dev libavutil-dev \
      libavfilter-dev libswscale-dev libswresample-dev \
      python3 python3-venv python3-pip python3-dev \
      libsndfile1 \
      fonts-liberation fonts-noto-color-emoji fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

# --- Node (for Playwright + Puppeteer harnesses) ---------------------------
RUN curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable

# --- non-root runner user --------------------------------------------------
RUN useradd -m -s /bin/bash runner \
    && usermod -aG sudo runner \
    && echo "runner ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/runner \
    && mkdir -p ${OPENVOICE_HOME} ${VENV} \
    && chown -R runner:runner ${OPENVOICE_HOME} ${VENV}

# --- headless Chromium for both engines ------------------------------------
# Playwright pins+downloads its own Chromium build; `install-deps` pulls the OS libs
# (libnss3, libgbm1, libasound2t64, ...). Puppeteer downloads a matching Chrome build.
RUN npm install -g playwright@1.49.0 puppeteer@23.11.1 \
    && npx --yes playwright@1.49.0 install --with-deps chromium \
    && npx --yes puppeteer@23.11.1 browsers install chrome \
    && cp -r /root/.cache/ms-playwright /opt/ms-playwright || true
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright

# Pin build-time Cython < 3 for the whole ML install. The pinned PyAV (av==11, pulled by
# faster-whisper) source-builds in some resolutions, and its Cython sources don't compile
# under Cython 3 (noexcept strictness on av/logging.pyx). pip applies constraints to PEP517
# build-isolation envs too, so this makes any av source build use a compatible Cython.
RUN printf 'Cython<3\n' > /opt/pip-constraints.txt
ENV PIP_CONSTRAINT=/opt/pip-constraints.txt

# --- Python ML stack: WhisperX + OpenVoice v2 (CPU-only) -------------------
# torch CPU wheel keeps the image GPU-free and within the no-paid-compute guardrail.
RUN python3 -m venv ${VENV} \
    && ${VENV}/bin/pip install --no-cache-dir --upgrade pip wheel setuptools \
    && ${VENV}/bin/pip install --no-cache-dir \
         --extra-index-url https://download.pytorch.org/whl/cpu \
         torch==2.3.1 torchaudio==2.3.1 \
    && ${VENV}/bin/pip install --no-cache-dir whisperx==3.1.5

# OpenVoice v2 (MIT) + MeloTTS base speaker.
# Two fixes vs the original: (1) MeloTTS pins faster-whisper==0.9.0, which conflicts with
# whisperx 3.1.5 (needs 1.0.1) — reinstall 1.0.1 LAST so the WhisperX transcribe path works
# (MeloTTS only uses faster-whisper at train time, not for tts_to_file). (2) the old myshell
# S3 checkpoint bundle (checkpoints_v2_0417.zip) is now 404 — pull the converter + speaker
# embeddings from the official HF repo into ${OPENVOICE_HOME}/checkpoints_v2/ (the layout
# tts.py expects: checkpoints_v2/converter/* + checkpoints_v2/base_speakers/ses/*).
RUN ${VENV}/bin/pip install --no-cache-dir "git+https://github.com/myshell-ai/OpenVoice.git" \
    && ${VENV}/bin/pip install --no-cache-dir "git+https://github.com/myshell-ai/MeloTTS.git" \
    && ${VENV}/bin/python -m unidic download \
    && ${VENV}/bin/pip install --no-cache-dir faster-whisper==1.0.1 \
    && ${VENV}/bin/pip install --no-cache-dir "huggingface_hub>=0.23" \
    && ${VENV}/bin/python -c "from huggingface_hub import snapshot_download; snapshot_download('myshell-ai/OpenVoiceV2', local_dir='${OPENVOICE_HOME}/checkpoints_v2', allow_patterns=['converter/*','base_speakers/ses/*'])" \
    && chown -R runner:runner ${OPENVOICE_HOME} ${VENV}

# Late compatibility pins (kept here so the expensive ML layers stay cached):
#  - setuptools<81: 81 dropped bundled pkg_resources, but the old librosa/pyannote chain
#    (via whisperx) still `from pkg_resources import ...` at import time.
#  - huggingface_hub<0.26: 0.26 removed the `use_auth_token` kwarg that old MeloTTS still
#    passes to hf_hub_download at runtime (0.25.x keeps it; snapshot_download still present).
# Also bake the NLTK data MeloTTS's English g2p (g2p_en -> nltk.pos_tag) needs at runtime —
# the perceptron tagger + CMU dict — into a default-searched path so renders run offline.
RUN ${VENV}/bin/pip install --no-cache-dir "setuptools<81" "huggingface_hub<0.26" \
    && ${VENV}/bin/python -m nltk.downloader -d /usr/local/share/nltk_data \
         averaged_perceptron_tagger_eng averaged_perceptron_tagger cmudict punkt \
    && chown -R runner:runner ${VENV}

# The smoke runs from the checkout and does bare `import "playwright"` / require("puppeteer"),
# but they're installed globally (/usr/lib/node_modules). Node's module resolution (incl. ESM,
# which ignores NODE_PATH) walks up to `/node_modules` as its last stop — symlink it to the
# global dir so those imports resolve from any working directory (CI checkout or runner home).
RUN ln -s /usr/lib/node_modules /node_modules

ENV PATH=${VENV}/bin:${PATH}

# --- GitHub Actions runner agent -------------------------------------------
USER runner
WORKDIR ${RUNNER_HOME}
RUN set -eux; \
    arch="$(dpkg --print-architecture)"; \
    case "$arch" in \
      amd64) rfile="actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz" ;; \
      arm64) rfile="actions-runner-linux-arm64-${RUNNER_VERSION}.tar.gz" ;; \
      *) echo "unsupported arch: $arch" >&2; exit 1 ;; \
    esac; \
    curl -fsSL -o runner.tar.gz \
      "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${rfile}"; \
    tar xzf runner.tar.gz; \
    rm runner.tar.gz; \
    sudo ./bin/installdependencies.sh

COPY --chown=runner:runner register.sh start-runner.sh ${RUNNER_HOME}/
COPY --chown=runner:runner smoke ${RUNNER_HOME}/smoke/
RUN chmod +x ${RUNNER_HOME}/register.sh ${RUNNER_HOME}/start-runner.sh ${RUNNER_HOME}/smoke/*.sh

# start-runner.sh boots Xvfb @ 1920x1080x24 on :99, then registers (idempotent) and runs.
ENTRYPOINT ["/home/runner/start-runner.sh"]
