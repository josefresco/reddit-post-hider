# Reddit Post Hider

A browser extension that allows you to hide Reddit posts by clicking on them, with persistent storage, keyboard shortcuts, and enhanced user experience.

## Features

- **Click to Hide**: Simply click on any Reddit post to hide it
- **Subreddit Blocking**: Block entire subreddits from appearing in your feed
- **Persistent Storage**: Hidden posts and blocked subreddits remain saved across browser sessions
- **Keyboard Shortcuts**: Use Ctrl+H to hide/unhide the hovered post, Ctrl+Shift+H for help
- **Enhanced UX**: Smooth animations, visual feedback, and hover effects
- **Smart Detection**: Works with both new and old Reddit layouts

## Installation

1. Download or clone this repository
2. Open Chrome/Edge and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension folder
5. The Reddit Post Hider extension should now appear in your extensions list

## Usage

### Hiding Individual Posts
1. Navigate to any Reddit page (home, r/all, r/popular, or specific subreddits)
2. Click on any post you want to hide - it will fade out and be hidden
3. To unhide a post, hover over the hidden post and click the "UNHIDE POST" button that appears
4. Hidden posts are automatically saved and will remain hidden on future visits

### Blocking Subreddits
1. Click the extension icon in your browser toolbar to open the popup
2. Use the subreddit blocking feature to add subreddits you never want to see
3. Posts from blocked subreddits are completely hidden from your feed
4. Manage your blocked subreddits list through the extension popup

### Keyboard Shortcuts
- **Ctrl+H**: Hide or unhide the post you're currently hovering over
- **Ctrl+Shift+H**: Show quick help message

## Files

- `manifest.json` - Extension configuration and permissions
- `content.js` - Main content script that handles post hiding functionality
- `popup.html` - Extension popup interface
- `popup.js` - Popup functionality and settings management
- `styles.css` - Styling for the extension interface and animations

## Permissions

- `storage` - To save hidden posts persistently
- `activeTab` - To interact with Reddit pages
- `*://*.reddit.com/*` - To run on all Reddit domains

## Version

Current version: 2.0

## Browser Compatibility

This extension uses Manifest V3 and is compatible with:
- Chrome 88+
- Edge 88+
- Other Chromium-based browsers

## License

This project is open source. Feel free to contribute or modify as needed.