// Popup functionality for Reddit Post Hider - Enhanced Version
document.addEventListener('DOMContentLoaded', async function() {
  const config = {
    STORAGE: {
      CLEANUP_DAYS: 7,
      OLD_POST_DAYS: 3
    },
    ANIMATION: {
      FADE_DURATION: 300,
      MESSAGE_DISPLAY: 2500
    }
  };

  const elements = {
    hiddenCount: document.getElementById('hiddenCount'),
    storageUsed: document.getElementById('storageUsed'),
    clearAllBtn: document.getElementById('clearAllBtn'),
    clearOldBtn: document.getElementById('clearOldBtn'),
    subredditInput: document.getElementById('subredditInput'),
    addSubredditBtn: document.getElementById('addSubredditBtn'),
    blockedList: document.getElementById('blockedList')
  };

  let isLoading = false;
  let blockedSubreddits = new Set();

  async function updateStats() {
    if (isLoading) return;
    
    try {
      isLoading = true;
      elements.hiddenCount.textContent = '...';
      elements.storageUsed.textContent = '...';
      
      const result = await chrome.storage.local.get(['hiddenPosts']);
      const hiddenPosts = result.hiddenPosts || {};
      const count = Object.keys(hiddenPosts).length;
      
      const storageSize = new Blob([JSON.stringify(hiddenPosts)]).size;
      const storageSizeKB = (storageSize / 1024).toFixed(1);
      
      elements.hiddenCount.textContent = count;
      elements.storageUsed.textContent = `${storageSizeKB} KB`;
      
      updateButtonStates(count);
    } catch (error) {
      console.error('Failed to update stats:', error);
      elements.hiddenCount.textContent = 'Error';
      elements.storageUsed.textContent = 'Error';
      showMessage('Failed to load statistics', true);
    } finally {
      isLoading = false;
    }
  }

  async function loadBlockedSubreddits() {
    try {
      const result = await chrome.storage.local.get(['blockedSubreddits']);
      const blocked = result.blockedSubreddits || [];
      blockedSubreddits = new Set(blocked);
      renderBlockedList();
    } catch (error) {
      console.error('Failed to load blocked subreddits:', error);
      showMessage('Failed to load blocked subreddits', true);
    }
  }

  async function saveBlockedSubreddits() {
    try {
      await chrome.storage.local.set({ 
        blockedSubreddits: Array.from(blockedSubreddits) 
      });
    } catch (error) {
      console.error('Failed to save blocked subreddits:', error);
      showMessage('Failed to save changes', true);
    }
  }

  function normalizeSubredditName(name) {
    return name.toLowerCase()
      .replace(/^\/r\//, '')
      .replace(/^r\//, '')
      .replace(/\/$/, '')
      .trim();
  }

  function validateSubredditName(name) {
    const normalized = normalizeSubredditName(name);
    if (!normalized) return { valid: false, error: 'Subreddit name cannot be empty' };
    if (normalized.length > 21) return { valid: false, error: 'Subreddit name too long' };
    if (!/^[a-zA-Z0-9_]+$/.test(normalized)) return { valid: false, error: 'Invalid characters in subreddit name' };
    if (blockedSubreddits.has(normalized)) return { valid: false, error: 'Subreddit already blocked' };
    return { valid: true, normalized };
  }

  function renderBlockedList() {
    if (blockedSubreddits.size === 0) {
      elements.blockedList.innerHTML = '<div class="empty-state">No blocked subreddits</div>';
      return;
    }

    const sortedSubreddits = Array.from(blockedSubreddits).sort();
    elements.blockedList.innerHTML = sortedSubreddits.map(subreddit => `
      <div class="blocked-item">
        <span class="subreddit-name">r/${subreddit}</span>
        <button class="remove-btn" data-subreddit="${subreddit}" title="Remove ${subreddit}">×</button>
      </div>
    `).join('');

    elements.blockedList.querySelectorAll('.remove-btn').forEach(btn => {
      btn.addEventListener('click', handleRemoveSubreddit);
    });
  }

  async function handleAddSubreddit() {
    const input = elements.subredditInput.value;
    const validation = validateSubredditName(input);
    
    if (!validation.valid) {
      showMessage(validation.error, true);
      return;
    }

    try {
      blockedSubreddits.add(validation.normalized);
      await saveBlockedSubreddits();
      renderBlockedList();
      elements.subredditInput.value = '';
      
      await refreshRedditTab();
      showMessage(`r/${validation.normalized} blocked`, false);
    } catch (error) {
      console.error('Error adding subreddit:', error);
      showMessage('Failed to block subreddit', true);
    }
  }

  async function handleRemoveSubreddit(e) {
    const subreddit = e.target.dataset.subreddit;
    
    try {
      blockedSubreddits.delete(subreddit);
      await saveBlockedSubreddits();
      renderBlockedList();
      
      await refreshRedditTab();
      showMessage(`r/${subreddit} unblocked`, false);
    } catch (error) {
      console.error('Error removing subreddit:', error);
      showMessage('Failed to unblock subreddit', true);
    }
  }

  function updateButtonStates(count) {
    const hasHiddenPosts = count > 0;
    elements.clearAllBtn.disabled = !hasHiddenPosts;
    elements.clearOldBtn.disabled = !hasHiddenPosts;
    
    if (!hasHiddenPosts) {
      elements.clearAllBtn.style.opacity = '0.5';
      elements.clearOldBtn.style.opacity = '0.5';
    } else {
      elements.clearAllBtn.style.opacity = '1';
      elements.clearOldBtn.style.opacity = '1';
    }
  }

  elements.clearAllBtn.addEventListener('click', async function() {
    if (elements.clearAllBtn.disabled) return;
    
    const confirmed = confirm('Are you sure you want to clear all hidden posts? This action cannot be undone.');
    if (!confirmed) return;
    
    try {
      setButtonLoading(elements.clearAllBtn, true);
      
      await chrome.storage.local.remove(['hiddenPosts']);
      await updateStats();
      await refreshRedditTab();
      
      showMessage('All hidden posts cleared!', false);
    } catch (error) {
      console.error('Error clearing all posts:', error);
      showMessage('Failed to clear posts', true);
    } finally {
      setButtonLoading(elements.clearAllBtn, false);
    }
  });

  elements.clearOldBtn.addEventListener('click', async function() {
    if (elements.clearOldBtn.disabled) return;
    
    try {
      setButtonLoading(elements.clearOldBtn, true);
      
      const result = await chrome.storage.local.get(['hiddenPosts']);
      const hiddenPosts = result.hiddenPosts || {};
      const cutoffDate = Date.now() - (config.STORAGE.OLD_POST_DAYS * 24 * 60 * 60 * 1000);
      
      const filteredPosts = {};
      let removedCount = 0;
      
      Object.entries(hiddenPosts).forEach(([id, data]) => {
        if (data.timestamp > cutoffDate) {
          filteredPosts[id] = data;
        } else {
          removedCount++;
        }
      });
      
      if (removedCount > 0) {
        await chrome.storage.local.set({ hiddenPosts: filteredPosts });
        await updateStats();
        await refreshRedditTab();
        
        showMessage(`Removed ${removedCount} old post${removedCount > 1 ? 's' : ''}`, false);
      } else {
        showMessage('No old posts to remove', false);
      }
    } catch (error) {
      console.error('Error clearing old posts:', error);
      showMessage('Failed to clear old posts', true);
    } finally {
      setButtonLoading(elements.clearOldBtn, false);
    }
  });

  async function refreshRedditTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab.url && tab.url.includes('reddit.com')) {
        await chrome.tabs.reload(tab.id);
      }
    } catch (error) {
      console.warn('Could not refresh Reddit tab:', error);
    }
  }

  function setButtonLoading(button, loading) {
    if (loading) {
      button.disabled = true;
      button.textContent = 'Processing...';
      button.style.opacity = '0.7';
    } else {
      button.disabled = false;
      button.textContent = button === elements.clearAllBtn ? 'Clear All Hidden Posts' : 'Clear Posts Older Than 3 Days';
      button.style.opacity = '1';
    }
  }

  function showMessage(text, isError = false) {
    const existingMsg = document.querySelector('.rph-popup-message');
    if (existingMsg) {
      existingMsg.remove();
    }
    
    const msg = document.createElement('div');
    msg.className = 'rph-popup-message';
    msg.textContent = text;
    msg.style.cssText = `
      position: fixed;
      top: 15px;
      left: 50%;
      transform: translateX(-50%) translateY(-20px);
      background: ${isError ? '#dc3545' : '#28a745'};
      color: white;
      padding: 10px 16px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      opacity: 0;
      transition: all ${config.ANIMATION.FADE_DURATION}ms ease;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    
    document.body.appendChild(msg);
    
    requestAnimationFrame(() => {
      msg.style.opacity = '1';
      msg.style.transform = 'translateX(-50%) translateY(0)';
    });
    
    setTimeout(() => {
      if (msg.parentNode) {
        msg.style.opacity = '0';
        msg.style.transform = 'translateX(-50%) translateY(-20px)';
        setTimeout(() => msg.remove(), config.ANIMATION.FADE_DURATION);
      }
    }, config.ANIMATION.MESSAGE_DISPLAY);
  }

  function addKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'r' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        updateStats();
      }
      if (e.key === 'Escape') {
        window.close();
      }
      if (e.key === 'Enter' && e.target === elements.subredditInput) {
        e.preventDefault();
        handleAddSubreddit();
      }
    });
  }

  function setupEventListeners() {
    elements.addSubredditBtn.addEventListener('click', handleAddSubreddit);
    
    elements.subredditInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddSubreddit();
      }
    });

    elements.subredditInput.addEventListener('input', (e) => {
      const isEmpty = !e.target.value.trim();
      elements.addSubredditBtn.disabled = isEmpty;
      elements.addSubredditBtn.style.opacity = isEmpty ? '0.5' : '1';
    });
  }

  setupEventListeners();
  addKeyboardShortcuts();
  
  await Promise.all([
    updateStats(),
    loadBlockedSubreddits()
  ]);
});