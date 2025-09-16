// Reddit Post Hider Extension - Improved Version
class RedditPostHider {
  constructor() {
    this.config = {
      TIMEOUTS: {
        INITIAL_LOAD: [500, 1500, 3000],
        NAVIGATION_DELAY: 500,
        MUTATION_DEBOUNCE: 200,
        MESSAGE_DISPLAY: 2000
      },
      STORAGE: {
        CLEANUP_DAYS: 7,
        OLD_POST_DAYS: 3
      },
      DOM: {
        MAX_TRAVERSAL_DEPTH: 10,
        MIN_POST_HEIGHT: 50,
        MIN_POST_WIDTH: 100,
        VALIDATION_MIN_HEIGHT: 10,
        VALIDATION_MIN_WIDTH: 50
      },
      VISUAL: {
        HIDDEN_OPACITY: 0.05,
        HOVER_OPACITY: 0.95,
        HOVER_SCALE: 0.98
      },
      DEBUG: false
    };
    
    this.hiddenPosts = new Map();
    this.blockedSubreddits = new Set();
    this.observer = null;
    this.isOverviewPage = false;
    this.processTimeout = null;
    this.init();
  }

  async init() {
    try {
      this.log('Reddit Post Hider initializing...');
      await Promise.all([
        this.loadHiddenPosts(),
        this.loadBlockedSubreddits()
      ]);
      this.checkPageType();
      this.log('Is overview page:', this.isOverviewPage, 'Path:', window.location.pathname);
      
      if (this.isOverviewPage) {
        this.setupObserver();
        this.config.TIMEOUTS.INITIAL_LOAD.forEach(delay => {
          setTimeout(() => this.processExistingPosts(), delay);
        });
      }
      this.setupNavigationListener();
      this.setupKeyboardShortcuts();
      this.setupStorageListener();
    } catch (error) {
      this.logError('Failed to initialize Reddit Post Hider:', error);
    }
  }

  log(...args) {
    if (this.config.DEBUG) {
      console.log('[Reddit Post Hider]', ...args);
    }
  }

  logError(...args) {
    console.error('[Reddit Post Hider]', ...args);
  }

  showUserMessage(message, isError = false) {
    const msg = document.createElement('div');
    msg.textContent = message;
    msg.style.cssText = `
      position: fixed !important;
      top: 20px !important;
      right: 20px !important;
      background: ${isError ? '#dc3545' : '#28a745'} !important;
      color: white !important;
      padding: 12px 16px !important;
      border-radius: 6px !important;
      font-size: 14px !important;
      z-index: 10000 !important;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    `;
    
    document.body.appendChild(msg);
    setTimeout(() => msg.remove(), this.config.TIMEOUTS.MESSAGE_DISPLAY);
  }

  checkPageType() {
    const path = window.location.pathname;
    this.isOverviewPage = (
      path === '/' || 
      path === '/hot' || 
      path === '/new' || 
      path === '/rising' || 
      path === '/top' || 
      path.startsWith('/r/popular') || 
      path.startsWith('/r/all') ||
      (path.startsWith('/r/') && !path.includes('/comments/'))
    );
  }

  setupNavigationListener() {
    try {
      let lastUrl = location.href;
      new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
          lastUrl = url;
          setTimeout(() => {
            this.checkPageType();
            if (this.isOverviewPage) {
              this.processExistingPosts();
            } else {
              this.cleanupPosts();
            }
          }, this.config.TIMEOUTS.NAVIGATION_DELAY);
        }
      }).observe(document, { subtree: true, childList: true });
    } catch (error) {
      this.logError('Failed to setup navigation listener:', error);
    }
  }

  setupObserver() {
    try {
      this.observer = new MutationObserver((mutations) => {
        if (this.isOverviewPage) {
          let shouldProcess = false;
          mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                if (this.isPostElement(node) || (node.querySelector && node.querySelector(this.getMainPostSelectors().join(', ')))) {
                  shouldProcess = true;
                }
              }
            });
          });
          
          if (shouldProcess) {
            clearTimeout(this.processTimeout);
            this.processTimeout = setTimeout(() => {
              this.processExistingPosts();
            }, this.config.TIMEOUTS.MUTATION_DEBOUNCE);
          }
        }
      });

      this.observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    } catch (error) {
      this.logError('Failed to setup mutation observer:', error);
    }
  }

  setupKeyboardShortcuts() {
    try {
      document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'h' && this.isOverviewPage) {
          e.preventDefault();
          this.toggleLastHoveredPost();
        }
        if (e.ctrlKey && e.shiftKey && e.key === 'H') {
          e.preventDefault();
          this.showQuickHelp();
        }
      });
    } catch (error) {
      this.logError('Failed to setup keyboard shortcuts:', error);
    }
  }

  toggleLastHoveredPost() {
    const hoveredPost = document.querySelector('.rph-hover, .rph-hidden:hover');
    if (hoveredPost) {
      const postId = this.getPostId(hoveredPost);
      if (postId) {
        if (this.hiddenPosts.has(postId)) {
          this.unhidePost(hoveredPost, postId);
          this.showUserMessage('Post unhidden');
        } else {
          this.hidePost(hoveredPost, postId);
          this.showUserMessage('Post hidden');
        }
      }
    }
  }

  showQuickHelp() {
    this.showUserMessage('Ctrl+H: Hide/unhide hovered post | Click: Hide/unhide post');
  }

  setupStorageListener() {
    try {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes.blockedSubreddits) {
          this.log('Blocked subreddits updated, reloading...');
          this.loadBlockedSubreddits().then(() => {
            if (this.isOverviewPage) {
              this.cleanupPosts();
              setTimeout(() => this.processExistingPosts(), 100);
            }
          });
        }
      });
    } catch (error) {
      this.logError('Failed to setup storage listener:', error);
    }
  }

  processExistingPosts() {
    if (!this.isOverviewPage) return;
    const posts = this.getAllPosts();
    this.log('Found', posts.length, 'existing posts to process');
    
    posts.forEach((post, index) => {
      if (!post.dataset.rphSetup && !post.dataset.rphBlocked) {
        this.log(`Processing post ${index + 1}:`, post);
        
        if (this.isPostFromBlockedSubreddit(post)) {
          const subreddit = this.getPostSubreddit(post);
          this.hideBlockedPost(post, subreddit);
        } else {
          this.setupPost(post);
        }
      }
    });
  }

  cleanupPosts() {
    const posts = document.querySelectorAll('[data-rph-setup="true"], [data-rph-blocked="true"]');
    posts.forEach(post => {
      this.removePostHandlers(post);
      post.style.opacity = '';
      post.style.cursor = '';
      post.style.display = '';
      post.classList.remove('rph-hidden', 'rph-hover');
      delete post.dataset.rphSetup;
      delete post.dataset.rphBlocked;
      delete post.dataset.rphBlockedSubreddit;
      const unhideBtn = post.querySelector('.rph-unhide-btn');
      if (unhideBtn) {
        unhideBtn.remove();
      }
    });
  }

  getMainPostSelectors() {
    return [
      // Most reliable selectors first
      '[data-testid="post-container"]',
      'shreddit-post',
      '.thing[data-fullname^="t3_"]',
      'div[id^="t3_"]',
      'article[id^="t3_"]'
    ];
  }

  getAllPosts() {
    if (!this.isOverviewPage) return [];
    
    try {
      const posts = new Set();
      
      this.findPostsBySelectors(posts);
      this.findPostsByVotingElements(posts);
      this.findPostsByCommentLinks(posts);
      
      const validPosts = Array.from(posts).filter(post => this.isValidPostContainer(post));
      this.log(`Found ${validPosts.length} valid posts out of ${posts.size} candidates`);
      return validPosts;
    } catch (error) {
      this.logError('Error in getAllPosts:', error);
      return [];
    }
  }

  findPostsBySelectors(posts) {
    const directPosts = document.querySelectorAll(this.getMainPostSelectors().join(', '));
    this.log('Direct posts found:', directPosts.length);
    directPosts.forEach(post => posts.add(post));
  }

  findPostsByVotingElements(posts) {
    const votingElements = document.querySelectorAll('[data-testid="vote-arrows"], [aria-label*="upvote"], [aria-label*="downvote"]');
    this.log('Voting elements found:', votingElements.length);
    votingElements.forEach(voting => {
      const postContainer = this.findPostContainer(voting);
      if (postContainer) posts.add(postContainer);
    });
  }

  findPostsByCommentLinks(posts) {
    const commentLinks = document.querySelectorAll('a[href*="/comments/"]');
    this.log('Comment links found:', commentLinks.length);
    commentLinks.forEach(link => {
      const postContainer = this.findPostContainer(link);
      if (postContainer) posts.add(postContainer);
    });
  }

  findPostContainer(element) {
    let current = element;
    let maxDepth = this.config.DOM.MAX_TRAVERSAL_DEPTH;
    
    while (current && current !== document.body && maxDepth > 0) {
      if (this.matchesPostSelector(current)) {
        return current;
      }
      
      if (this.looksLikePostContainer(current)) {
        return current;
      }
      
      current = current.parentElement;
      maxDepth--;
    }
    
    return null;
  }

  matchesPostSelector(element) {
    const selectors = this.getMainPostSelectors();
    return selectors.some(selector => {
      try {
        return element.matches && element.matches(selector);
      } catch (e) {
        return false;
      }
    });
  }

  looksLikePostContainer(element) {
    const hasVoting = element.querySelector('[data-testid="vote-arrows"], [aria-label*="upvote"], [aria-label*="downvote"]');
    const hasComments = element.querySelector('a[href*="/comments/"], [data-testid="comments-page-link"]');
    const hasTitle = element.querySelector('h1, h2, h3, [data-adclicklocation="title"]');
    const hasAuthor = element.querySelector('[data-testid="post_author_link"], [href*="/user/"], [href*="/u/"]');
    
    const score = [hasVoting, hasComments, hasTitle, hasAuthor].filter(Boolean).length;
    const isReasonableSize = element.offsetHeight > this.config.DOM.MIN_POST_HEIGHT && 
                            element.offsetWidth > this.config.DOM.MIN_POST_WIDTH;
    
    return score >= 2 && isReasonableSize;
  }

  isValidPostContainer(element) {
    if (!element || element.dataset.rphSetup) return false;
    
    const isReasonableSize = element.offsetHeight > this.config.DOM.VALIDATION_MIN_HEIGHT && 
                            element.offsetWidth > this.config.DOM.VALIDATION_MIN_WIDTH;
    
    const hasRedditContent = 
      element.querySelector('a[href*="/comments/"]') ||
      element.querySelector('[data-testid*="vote"]') ||
      element.querySelector('[data-testid*="post"]') ||
      element.querySelector('h1, h2, h3, h4, h5, h6') ||
      element.textContent.includes('comment') ||
      element.textContent.includes('vote') ||
      element.getAttribute('data-fullname') ||
      element.id?.startsWith('t3_');
    
    return isReasonableSize && hasRedditContent;
  }

  isPostElement(element) {
    return this.matchesPostSelector(element) && this.isValidPostContainer(element);
  }

  getPostId(post) {
    // Try multiple methods to get a unique post ID
    let id = null;
    
    // Method 1: data-fullname attribute
    id = post.getAttribute('data-fullname');
    if (id) return id;
    
    // Method 2: element ID
    if (post.id && post.id.startsWith('t3_')) {
      return post.id;
    }
    
    // Method 3: extract from comment links
    const commentLink = post.querySelector('a[href*="/comments/"]');
    if (commentLink) {
      const href = commentLink.getAttribute('href');
      const match = href.match(/\/comments\/([a-zA-Z0-9]+)/);
      if (match) {
        return 't3_' + match[1];
      }
    }
    
    // Method 4: Look in data attributes
    const dataAttrs = ['data-post-id', 'data-id', 'data-permalink'];
    for (const attr of dataAttrs) {
      const value = post.getAttribute(attr);
      if (value) {
        if (value.startsWith('t3_')) return value;
        if (/^[a-zA-Z0-9]{6,}$/.test(value)) return 't3_' + value;
      }
    }
    
    // Fallback: create hash from content
    const title = post.querySelector('h1, h2, h3, [data-adclicklocation="title"], [role="heading"]')?.textContent?.trim() || '';
    const author = post.querySelector('[data-testid="post_author_link"], [href*="/user/"], [href*="/u/"]')?.textContent?.trim() || '';
    
    if (title) {
      return 'hash_' + this.simpleHash(title + author);
    }
    
    return null;
  }

  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString();
  }

  setupPost(post) {
    if (!this.isOverviewPage || post.dataset.rphSetup) return;
    
    try {
      const postId = this.getPostId(post);
      if (!postId) {
        this.log('No post ID found for:', post);
        return;
      }

      this.log('Setting up post with ID:', postId);
      post.dataset.rphSetup = 'true';

      if (this.hiddenPosts.has(postId)) {
        this.applyHiddenState(post, postId);
        return;
      }

      this.attachPostEventHandlers(post, postId);
      this.stylePost(post);
      this.addMediaOverlay(post);
      
      this.log('Post setup complete for:', postId);
    } catch (error) {
      this.logError('Error setting up post:', error);
    }
  }

  attachPostEventHandlers(post, postId) {
    const mouseEnterHandler = (e) => {
      e.stopPropagation();
      this.handleMouseEnter(post, postId);
    };
    
    const mouseLeaveHandler = (e) => {
      e.stopPropagation();
      this.handleMouseLeave(post, postId);
    };
    
    const clickHandler = (e) => {
      this.handlePostClick(e, post, postId);
    };

    post.addEventListener('mouseenter', mouseEnterHandler);
    post.addEventListener('mouseleave', mouseLeaveHandler);
    post.addEventListener('click', clickHandler, true);

    post._rphHandlers = {
      mouseEnterHandler,
      mouseLeaveHandler,
      clickHandler
    };
  }

  stylePost(post) {
    post.style.cursor = 'pointer';
    post.style.transition = 'opacity 0.2s ease-in-out';
  }

  addMediaOverlay(post) {
    // Find media containers that might intercept clicks
    const mediaSelectors = [
      'iframe',
      'shreddit-embed',
      'shreddit-aspect-ratio',
      '[slot="post-media-container"]',
      '.embed-container',
      'video',
      '.video-container'
    ];
    
    const mediaElements = post.querySelectorAll(mediaSelectors.join(', '));
    
    mediaElements.forEach(media => {
      // Skip if already has overlay
      if (media.querySelector('.rph-click-overlay')) return;
      
      // Create transparent overlay
      const overlay = document.createElement('div');
      overlay.className = 'rph-click-overlay';
      overlay.style.cssText = `
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        z-index: 10 !important;
        background: transparent !important;
        cursor: pointer !important;
        pointer-events: auto !important;
      `;
      
      // Ensure the media container has relative positioning
      const computedStyle = window.getComputedStyle(media);
      if (computedStyle.position === 'static') {
        media.style.position = 'relative';
      }
      
      // Add click handler to overlay
      overlay.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Find the post container and trigger hide
        const postContainer = this.findPostContainer(overlay);
        if (postContainer && postContainer.dataset.rphSetup) {
          const postId = this.getPostId(postContainer);
          if (postId) {
            if (this.hiddenPosts.has(postId)) {
              this.unhidePost(postContainer, postId);
            } else {
              this.hidePost(postContainer, postId);
            }
          }
        }
      });
      
      media.appendChild(overlay);
    });
  }

  removePostHandlers(post) {
    if (post._rphHandlers) {
      post.removeEventListener('mouseenter', post._rphHandlers.mouseEnterHandler);
      post.removeEventListener('mouseleave', post._rphHandlers.mouseLeaveHandler);
      post.removeEventListener('click', post._rphHandlers.clickHandler, true);
      delete post._rphHandlers;
    }
    
    // Remove overlays
    const overlays = post.querySelectorAll('.rph-click-overlay');
    overlays.forEach(overlay => overlay.remove());
  }

  isInteractiveElement(element) {
    // Check if the clicked element should not trigger hide/unhide
    let current = element;
    let maxDepth = 5;
    
    while (current && maxDepth > 0) {
      // Skip if it's our overlay (shouldn't happen, but just in case)
      if (current.classList.contains('rph-click-overlay')) {
        return false;
      }
      
      // Skip if it's a button
      if (current.tagName === 'BUTTON') return true;
      
      // Skip if it's an input element
      if (current.tagName === 'INPUT') return true;
      
      // Skip voting elements
      if (current.getAttribute('data-testid') === 'vote-arrows' ||
          current.getAttribute('data-testid')?.includes('vote') ||
          current.getAttribute('aria-label')?.includes('vote')) {
        return true;
      }
      
      // Skip elements with specific interactive classes
      if (current.classList.contains('vote') || 
          current.classList.contains('arrow') ||
          current.classList.contains('score')) {
        return true;
      }
      
      // Skip specific Reddit interactive elements
      if (current.tagName === 'SHREDDIT-JOIN-BUTTON' ||
          current.tagName === 'SHREDDIT-POST-OVERFLOW-MENU' ||
          current.getAttribute('data-testid') === 'credit-bar-join-button') {
        return true;
      }
      
      current = current.parentElement;
      maxDepth--;
    }
    
    return false;
  }

  isCommentsButton(element) {
    // Check if the clicked element is a comments button
    let current = element;
    let maxDepth = 5;
    
    while (current && maxDepth > 0) {
      // Check for comments button indicators
      if (current.tagName === 'A') {
        const href = current.getAttribute('href') || '';
        
        // Check if this is a comments link
        if (href.includes('/comments/')) {
          // Additional checks to ensure it's a comments button, not just any link to comments
          const dataLocation = current.getAttribute('data-post-click-location');
          const name = current.getAttribute('name');
          const hasCommentIcon = current.querySelector('svg.icon-comment, [icon-name="comment-outline"]');
          const hasCommentText = current.textContent?.toLowerCase().includes('comment') || 
                                 current.querySelector('faceplate-screen-reader-content')?.textContent?.toLowerCase().includes('comment');
          
          // Must be specifically marked as a comments button or have comment-related attributes/content
          if (dataLocation === 'comments-button' || 
              name === 'comments-action-button' ||
              hasCommentIcon ||
              hasCommentText) {
            console.log('Detected comments button:', current);
            return true;
          }
        }
      }
      
      // Check for old Reddit comments button classes
      if (current.classList.contains('comments') || 
          current.classList.contains('bylink') ||
          (current.classList.contains('flat-list') && current.querySelector('a[href*="/comments/"]'))) {
        return true;
      }
      
      current = current.parentElement;
      maxDepth--;
    }
    
    return false;
  }

  handleMouseEnter(post, postId) {
    this.log('Mouse enter for post:', postId);
    if (this.hiddenPosts.has(postId)) {
      this.showUnhideButton(post, postId);
    } else {
      post.classList.add('rph-hover');
      post.style.opacity = this.config.VISUAL.HOVER_OPACITY;
      post.style.transform = `scale(${this.config.VISUAL.HOVER_SCALE})`;
    }
  }

  handleMouseLeave(post, postId) {
    this.log('Mouse leave for post:', postId);
    if (this.hiddenPosts.has(postId)) {
      this.hideUnhideButton(post);
    } else {
      post.classList.remove('rph-hover');
      post.style.opacity = '';
      post.style.transform = '';
    }
  }

  handlePostClick(e, post, postId) {
    if (this.isInteractiveElement(e.target)) {
      this.log('Clicked on interactive element, ignoring:', e.target);
      return;
    }

    if (this.isCommentsButton(e.target)) {
      this.log('Clicked on comments button, allowing navigation:', e.target);
      return;
    }

    if (this.shouldAllowNavigation(e, post)) {
      this.log('Allowing navigation');
      return;
    }

    this.log('Handling post click for:', postId);
    e.preventDefault();
    e.stopPropagation();

    try {
      if (this.hiddenPosts.has(postId)) {
        this.unhidePost(post, postId);
      } else {
        this.hidePost(post, postId);
      }
    } catch (error) {
      this.logError('Error handling post click:', error);
    }
  }

  shouldAllowNavigation(e, post) {
    // Very restrictive navigation allowance - only for specific external/non-post navigation
    let current = e.target;
    let maxDepth = 3;
    
    while (current && current !== post && maxDepth > 0) {
      // Skip our own overlay elements
      if (current.classList.contains('rph-click-overlay')) {
        return false;
      }
      
      // 1. External links with target="_blank" or external URLs
      if (current.tagName === 'A') {
        const href = current.getAttribute('href') || '';
        
        // Allow external links
        if (href.startsWith('http') && current.hasAttribute('target')) {
          return true;
        }
        
        // Allow subreddit navigation (but not post navigation)
        if (href.match(/^\/r\/[^\/]+\/?$/) && !href.includes('/comments/')) {
          return true;
        }
        
        // Allow user profile links
        if (href.includes('/user/') || href.includes('/u/')) {
          return true;
        }
        
        // Allow comments links if they are comments buttons (handled by isCommentsButton)
        // This is redundant since we check isCommentsButton first, but keeping for clarity
        if (href.includes('/comments/') && this.isCommentsButton(current)) {
          return true;
        }
      }
      
      // 2. Interactive UI elements that should navigate
      if (current.tagName === 'SHREDDIT-JOIN-BUTTON' || 
          current.getAttribute('data-testid') === 'subreddit-name') {
        return true;
      }
      
      current = current.parentElement;
      maxDepth--;
    }
    
    return false;
  }

  hidePost(post, postId) {
    try {
      this.log('Hiding post:', postId);
      post.classList.add('rph-hidden');
      post.classList.remove('rph-hover');
      post.style.opacity = this.config.VISUAL.HIDDEN_OPACITY;
      post.style.transform = '';
      
      const hideData = {
        id: postId,
        timestamp: Date.now()
      };
      
      this.hiddenPosts.set(postId, hideData);
      this.saveHiddenPosts();
      this.showUserMessage('Post hidden');
    } catch (error) {
      this.logError('Error hiding post:', error);
      this.showUserMessage('Error hiding post', true);
    }
  }

  unhidePost(post, postId) {
    try {
      this.log('Unhiding post:', postId);
      post.classList.remove('rph-hidden');
      post.style.opacity = '';
      
      this.hiddenPosts.delete(postId);
      this.saveHiddenPosts();
      
      const unhideBtn = post.querySelector('.rph-unhide-btn');
      if (unhideBtn) {
        unhideBtn.remove();
      }
      this.showUserMessage('Post unhidden');
    } catch (error) {
      this.logError('Error unhiding post:', error);
      this.showUserMessage('Error unhiding post', true);
    }
  }

  applyHiddenState(post, postId) {
    post.classList.add('rph-hidden');
    post.style.opacity = this.config.VISUAL.HIDDEN_OPACITY;
  }

  showUnhideButton(post, postId) {
    if (post.querySelector('.rph-unhide-btn')) return;

    const btn = document.createElement('div');
    btn.className = 'rph-unhide-btn';
    btn.textContent = 'UNHIDE POST';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.unhidePost(post, postId);
    });

    post.style.position = 'relative';
    post.appendChild(btn);
  }

  hideUnhideButton(post) {
    const btn = post.querySelector('.rph-unhide-btn');
    if (btn) {
      btn.remove();
    }
  }

  async loadHiddenPosts() {
    try {
      const result = await chrome.storage.local.get(['hiddenPosts']);
      const stored = result.hiddenPosts || {};
      const cleanupThreshold = Date.now() - (this.config.STORAGE.CLEANUP_DAYS * 24 * 60 * 60 * 1000);

      Object.entries(stored).forEach(([id, data]) => {
        if (data.timestamp > cleanupThreshold) {
          this.hiddenPosts.set(id, data);
        }
      });
      
      this.log('Loaded', this.hiddenPosts.size, 'hidden posts');
    } catch (error) {
      this.logError('Failed to load hidden posts:', error);
    }
  }

  async loadBlockedSubreddits() {
    try {
      const result = await chrome.storage.local.get(['blockedSubreddits']);
      const blocked = result.blockedSubreddits || [];
      this.blockedSubreddits = new Set(blocked.map(name => name.toLowerCase()));
      
      this.log('Loaded', this.blockedSubreddits.size, 'blocked subreddits');
    } catch (error) {
      this.logError('Failed to load blocked subreddits:', error);
    }
  }

  async saveHiddenPosts() {
    try {
      const postsObj = {};
      this.hiddenPosts.forEach((data, id) => {
        postsObj[id] = data;
      });
      await chrome.storage.local.set({ hiddenPosts: postsObj });
      this.log('Saved', Object.keys(postsObj).length, 'hidden posts');
    } catch (error) {
      this.logError('Failed to save hidden posts:', error);
    }
  }

  getPostSubreddit(post) {
    try {
      const subredditSelectors = [
        'a[data-testid="subreddit-name"]',
        'a[href*="/r/"]',
        '[data-subreddit-name]',
        '.subreddit'
      ];

      for (const selector of subredditSelectors) {
        const element = post.querySelector(selector);
        if (element) {
          let subredditName = '';
          
          if (element.dataset.subredditName) {
            subredditName = element.dataset.subredditName;
          } else if (element.textContent) {
            subredditName = element.textContent.trim();
          } else if (element.href) {
            const match = element.href.match(/\/r\/([^\/\?#]+)/);
            if (match) subredditName = match[1];
          }

          if (subredditName) {
            return subredditName.toLowerCase()
              .replace(/^r\//, '')
              .replace(/^\/r\//, '')
              .trim();
          }
        }
      }

      const currentUrl = window.location.pathname;
      const urlMatch = currentUrl.match(/\/r\/([^\/\?#]+)/);
      if (urlMatch) {
        return urlMatch[1].toLowerCase();
      }

      return null;
    } catch (error) {
      this.logError('Error getting post subreddit:', error);
      return null;
    }
  }

  isPostFromBlockedSubreddit(post) {
    if (this.blockedSubreddits.size === 0) return false;
    
    const subreddit = this.getPostSubreddit(post);
    if (!subreddit) return false;
    
    const isBlocked = this.blockedSubreddits.has(subreddit);
    if (isBlocked) {
      this.log('Post from blocked subreddit detected:', subreddit);
    }
    return isBlocked;
  }

  hideBlockedPost(post, subreddit) {
    try {
      post.style.display = 'none';
      post.setAttribute('data-rph-blocked', 'true');
      post.setAttribute('data-rph-blocked-subreddit', subreddit);
      this.log('Hidden post from blocked subreddit:', subreddit);
    } catch (error) {
      this.logError('Error hiding blocked post:', error);
    }
  }
}

// Initialize when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new RedditPostHider();
  });
} else {
  new RedditPostHider();
}