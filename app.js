// App State
const state = {
  videoFiles: [],
  currentIndex: 0,
  history: [],
  historyIndex: -1,
  isPlaying: false,
  isMuted: true,
  directoryHandle: null,
  touchStartY: 0,
  touchEndY: 0,
  isTransitioning: false
};

// DOM Elements
const elements = {
  welcomeScreen: document.getElementById('welcomeScreen'),
  loadingScreen: document.getElementById('loadingScreen'),
  errorScreen: document.getElementById('errorScreen'),
  playerScreen: document.getElementById('playerScreen'),
  loadVideosBtn: document.getElementById('loadVideosBtn'),
  retryBtn: document.getElementById('retryBtn'),
  loadingStatus: document.getElementById('loadingStatus'),
  progressFill: document.getElementById('progressFill'),
  progressText: document.getElementById('progressText'),
  errorTitle: document.getElementById('errorTitle'),
  errorMessage: document.getElementById('errorMessage'),
  currentVideo: document.getElementById('currentVideo'),
  nextVideo: document.getElementById('nextVideo'),
  tapOverlay: document.getElementById('tapOverlay'),
  playPauseBtn: document.getElementById('playPauseBtn'),
  playIcon: document.getElementById('playIcon'),
  pauseIcon: document.getElementById('pauseIcon'),
  muteBtn: document.getElementById('muteBtn'),
  muteIcon: document.getElementById('muteIcon'),
  unmuteIcon: document.getElementById('unmuteIcon'),
  reloadBtn: document.getElementById('reloadBtn'),
  videoCount: document.getElementById('videoCount'),
  videoTitle: document.getElementById('videoTitle'),
  currentTime: document.getElementById('currentTime'),
  totalTime: document.getElementById('totalTime'),
  videoProgress: document.getElementById('videoProgress'),
  swipeIndicator: document.getElementById('swipeIndicator')
};

// Initialize App
function init() {
  // Check browser support
  if (!('showDirectoryPicker' in window)) {
    showError(
      'Browser Not Supported',
      'Your browser doesn\'t support the File System Access API. Please use Chrome or Edge for the best experience.'
    );
    return;
  }

  // Event Listeners
  elements.loadVideosBtn.addEventListener('click', loadVideos);
  elements.retryBtn.addEventListener('click', () => {
    hideError();
    showScreen('welcome');
  });
  elements.reloadBtn.addEventListener('click', loadVideos);
  elements.playPauseBtn.addEventListener('click', togglePlayPause);
  elements.muteBtn.addEventListener('click', toggleMute);
  elements.tapOverlay.addEventListener('click', togglePlayPause);

  // Video event listeners
  elements.currentVideo.addEventListener('timeupdate', updateProgress);
  elements.currentVideo.addEventListener('ended', playNextVideo);
  elements.currentVideo.addEventListener('loadedmetadata', () => {
    updateTotalTime();
  });

  // Touch events for swipe
  elements.playerScreen.addEventListener('touchstart', handleTouchStart, { passive: true });
  elements.playerScreen.addEventListener('touchmove', handleTouchMove, { passive: true });
  elements.playerScreen.addEventListener('touchend', handleTouchEnd);

  // Mouse wheel for desktop
  elements.playerScreen.addEventListener('wheel', handleWheel, { passive: false });

  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeyboard);
}

// Screen Management
function showScreen(screen) {
  elements.welcomeScreen.classList.add('hidden');
  elements.loadingScreen.classList.add('hidden');
  elements.errorScreen.classList.add('hidden');
  elements.playerScreen.classList.add('hidden');

  switch (screen) {
    case 'welcome':
      elements.welcomeScreen.classList.remove('hidden');
      break;
    case 'loading':
      elements.loadingScreen.classList.remove('hidden');
      break;
    case 'error':
      elements.errorScreen.classList.remove('hidden');
      break;
    case 'player':
      elements.playerScreen.classList.remove('hidden');
      break;
  }
}

function showError(title, message) {
  elements.errorTitle.textContent = title;
  elements.errorMessage.textContent = message;
  showScreen('error');
}

function hideError() {
  showScreen('welcome');
}

// Load Videos from Directory
async function loadVideos() {
  try {
    showScreen('loading');
    elements.loadingStatus.textContent = 'Selecting folder...';
    elements.progressFill.style.width = '0%';
    elements.progressText.textContent = '0%';

    // Request directory access
    const dirHandle = await window.showDirectoryPicker({
      mode: 'read',
      startIn: 'videos'
    });

    state.directoryHandle = dirHandle;
    elements.loadingStatus.textContent = 'Scanning videos...';

    const videoFiles = [];
    const videoExtensions = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'ogg'];
    let totalFiles = 0;
    let processedFiles = 0;

    // Count total files first
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file') {
        const ext = entry.name.split('.').pop().toLowerCase();
        if (videoExtensions.includes(ext)) {
          totalFiles++;
        }
      }
    }

    if (totalFiles === 0) {
      showError(
        'No Videos Found',
        'No video files found in the selected folder. Please select a folder containing video files (.mp4, .webm, .mov, etc.).'
      );
      return;
    }

    elements.loadingStatus.textContent = `Analyzing ${totalFiles} videos...`;

    // Process video files
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file') {
        const ext = entry.name.split('.').pop().toLowerCase();
        if (videoExtensions.includes(ext)) {
          try {
            const file = await entry.getFile();
            const duration = await getVideoDuration(file);

            // Only include videos <= 60 seconds
            if (duration <= 60) {
              videoFiles.push({
                name: entry.name,
                file: file,
                duration: duration,
                url: URL.createObjectURL(file)
              });
            }

            processedFiles++;
            const progress = Math.round((processedFiles / totalFiles) * 100);
            elements.progressFill.style.width = `${progress}%`;
            elements.progressText.textContent = `${progress}%`;
            elements.loadingStatus.textContent = `Analyzed ${processedFiles}/${totalFiles} videos`;
          } catch (err) {
            console.warn(`Failed to process ${entry.name}:`, err);
            processedFiles++;
          }
        }
      }
    }

    if (videoFiles.length === 0) {
      showError(
        'No Short Videos Found',
        `Found ${totalFiles} videos, but none are 60 seconds or less. Please add shorter videos to your folder.`
      );
      return;
    }

    // Shuffle videos for random playback
    state.videoFiles = shuffleArray(videoFiles);
    state.currentIndex = 0;
    state.history = [0];
    state.historyIndex = 0;

    // Start playing
    showScreen('player');
    await playVideoAtIndex(0);
    
    // Show swipe indicator briefly
    setTimeout(() => {
      elements.swipeIndicator.classList.remove('hidden');
      setTimeout(() => {
        elements.swipeIndicator.classList.add('hidden');
      }, 3000);
    }, 1000);

  } catch (err) {
    if (err.name === 'AbortError') {
      showScreen('welcome');
      return;
    }
    console.error('Error loading videos:', err);
    showError(
      'Failed to Load Videos',
      'An error occurred while loading your videos. Please try again.'
    );
  }
}

// Get video duration
function getVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;

    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };

    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error('Failed to load video metadata'));
    };

    video.src = URL.createObjectURL(file);
  });
}

// Shuffle array
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Play video at specific index
async function playVideoAtIndex(index) {
  if (index < 0 || index >= state.videoFiles.length) return;

  const video = state.videoFiles[index];
  elements.currentVideo.src = video.url;
  elements.currentVideo.muted = state.isMuted;
  elements.videoTitle.textContent = video.name;

  // Update counter
  elements.videoCount.textContent = `${index + 1}/${state.videoFiles.length}`;

  try {
    await elements.currentVideo.play();
    state.isPlaying = true;
    updatePlayPauseIcon();

    // Preload next video
    preloadNextVideo();
  } catch (err) {
    console.error('Error playing video:', err);
  }
}

// Preload next video
function preloadNextVideo() {
  const nextIndex = getNextRandomIndex();
  if (nextIndex !== -1) {
    const nextVideoData = state.videoFiles[nextIndex];
    elements.nextVideo.src = nextVideoData.url;
    elements.nextVideo.load();
  }
}

// Get next random index
function getNextRandomIndex() {
  if (state.videoFiles.length <= 1) return -1;

  let nextIndex;
  do {
    nextIndex = Math.floor(Math.random() * state.videoFiles.length);
  } while (nextIndex === state.currentIndex);

  return nextIndex;
}

// Play next video
async function playNextVideo() {
  if (state.isTransitioning) return;
  state.isTransitioning = true;

  const nextIndex = getNextRandomIndex();
  if (nextIndex === -1) {
    state.isTransitioning = false;
    return;
  }

  state.currentIndex = nextIndex;
  
  // Add to history if navigating forward
  if (state.historyIndex === state.history.length - 1) {
    state.history.push(nextIndex);
    state.historyIndex++;
    
    // Keep history limited to last 10 videos
    if (state.history.length > 10) {
      state.history.shift();
      state.historyIndex--;
    }
  } else {
    state.historyIndex++;
  }

  await playVideoAtIndex(nextIndex);
  state.isTransitioning = false;
}

// Play previous video
async function playPreviousVideo() {
  if (state.isTransitioning || state.historyIndex <= 0) return;
  state.isTransitioning = true;

  state.historyIndex--;
  const prevIndex = state.history[state.historyIndex];
  state.currentIndex = prevIndex;

  await playVideoAtIndex(prevIndex);
  state.isTransitioning = false;
}

// Toggle play/pause
function togglePlayPause() {
  if (state.isPlaying) {
    elements.currentVideo.pause();
    state.isPlaying = false;
  } else {
    elements.currentVideo.play();
    state.isPlaying = true;
  }
  updatePlayPauseIcon();
}

// Toggle mute
function toggleMute() {
  state.isMuted = !state.isMuted;
  elements.currentVideo.muted = state.isMuted;
  updateMuteIcon();
}

// Update UI icons
function updatePlayPauseIcon() {
  if (state.isPlaying) {
    elements.playIcon.classList.add('hidden');
    elements.pauseIcon.classList.remove('hidden');
  } else {
    elements.playIcon.classList.remove('hidden');
    elements.pauseIcon.classList.add('hidden');
  }
}

function updateMuteIcon() {
  if (state.isMuted) {
    elements.muteIcon.classList.remove('hidden');
    elements.unmuteIcon.classList.add('hidden');
  } else {
    elements.muteIcon.classList.add('hidden');
    elements.unmuteIcon.classList.remove('hidden');
  }
}

// Update progress bar
function updateProgress() {
  const video = elements.currentVideo;
  if (video.duration) {
    const progress = (video.currentTime / video.duration) * 100;
    elements.videoProgress.style.width = `${progress}%`;
    elements.currentTime.textContent = formatTime(video.currentTime);
  }
}

function updateTotalTime() {
  const video = elements.currentVideo;
  if (video.duration) {
    elements.totalTime.textContent = formatTime(video.duration);
  }
}

// Format time
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Touch event handlers
function handleTouchStart(e) {
  state.touchStartY = e.touches[0].clientY;
}

function handleTouchMove(e) {
  state.touchEndY = e.touches[0].clientY;
}

function handleTouchEnd(e) {
  const deltaY = state.touchStartY - state.touchEndY;
  const threshold = 50;

  if (Math.abs(deltaY) > threshold) {
    if (deltaY > 0) {
      // Swiped up - next video
      playNextVideo();
    } else {
      // Swiped down - previous video
      playPreviousVideo();
    }
  }

  state.touchStartY = 0;
  state.touchEndY = 0;
}

// Mouse wheel handler
function handleWheel(e) {
  e.preventDefault();
  
  const now = Date.now();
  if (!state.lastWheelTime) state.lastWheelTime = 0;
  
  // Debounce wheel events
  if (now - state.lastWheelTime < 500) return;
  state.lastWheelTime = now;

  if (e.deltaY > 0) {
    // Scrolled down - next video
    playNextVideo();
  } else if (e.deltaY < 0) {
    // Scrolled up - previous video
    playPreviousVideo();
  }
}

// Keyboard shortcuts
function handleKeyboard(e) {
  if (!elements.playerScreen.classList.contains('hidden')) {
    switch (e.key) {
      case ' ':
      case 'k':
        e.preventDefault();
        togglePlayPause();
        break;
      case 'ArrowUp':
        e.preventDefault();
        playPreviousVideo();
        break;
      case 'ArrowDown':
        e.preventDefault();
        playNextVideo();
        break;
      case 'm':
        e.preventDefault();
        toggleMute();
        break;
    }
  }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}